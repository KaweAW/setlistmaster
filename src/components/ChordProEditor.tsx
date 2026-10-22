import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { accidentalsForKey, diatonicChords } from '../core/chords';
import { isChordLine, isRealChord, looksLikeChordsOverWords } from '../core/chordsOverWords';
import { chartDiagrams } from '../core/diagrams';
import { fingeringOfLine } from '../core/fingerings';
import { DiagramStrip } from './ChordDiagrams';
import { TAB_TEMPLATES, chartStats, insertChord, insertSection, guessSections, parseChordPro, structureSections, type InsertableKind } from '../core/chordpro';
import { useT, type MessageKey } from '../i18n';
import { ChordChart } from './ChordChart';
import { Segmented } from './Segmented';
import { Select } from './Select';

/**
 * The text coloured, drawn behind a see-through textarea: {directives} and fingering lines in violet, [chords] and the chords
 * of a "chords above the words" line in the chord colour. Every character keeps its place, so the two layers line up.
 */
function highlight(source: string): ReactNode[] {
  return source.split('\n').flatMap((line, n) => {
    const out: ReactNode[] = n > 0 ? ['\n'] : [];
    if (fingeringOfLine(line)) {
      out.push(<span key={n} className="font-semibold text-coro">{line}</span>);
    } else if (isChordLine(line)) {
      out.push(...line.split(/(\S+)/).map((piece, i) => (isRealChord(piece) ? <span key={`${n}-${i}`} className="font-bold text-chord">{piece}</span> : piece)));
    } else {
      out.push(...line.split(/(\{[^}\n]*\}|\[[^\]\n]*\])/g).map((piece, i) => {
        if (piece.startsWith('{') && piece.endsWith('}')) return <span key={`${n}-${i}`} className="font-semibold text-coro">{piece}</span>;
        if (piece.startsWith('[') && piece.endsWith(']')) return <span key={`${n}-${i}`} className="font-bold text-chord">{piece}</span>;
        return piece;
      }));
    }
    return out;
  });
}

const SECTIONS: { id: string; kind: InsertableKind; label: MessageKey; body?: string }[] = [
  { id: 'intro', kind: 'intro', label: 'chart.intro' },
  { id: 'verse', kind: 'verse', label: 'chart.verse' },
  { id: 'prechorus', kind: 'prechorus', label: 'chart.prechorus' },
  { id: 'chorus', kind: 'chorus', label: 'chart.chorus' },
  { id: 'bridge', kind: 'bridge', label: 'chart.bridge' },
  { id: 'instrumental', kind: 'instrumental', label: 'chart.instrumental' },
  { id: 'outro', kind: 'outro', label: 'chart.outro' },
  { id: 'tab', kind: 'tab', label: 'chart.tabGuitar', body: TAB_TEMPLATES.guitar },
  { id: 'tabbass', kind: 'tab', label: 'chart.tabBass', body: TAB_TEMPLATES.bass },
];

/**
 * A ChordPro editor: coloured marks, one-tap sections and chords of the song's key, a counter, and the sheet itself
 * next to it (below a "Write / Preview" switch on a phone). The preview is the very same ChordChart the song page uses.
 */
export function ChordProEditor({
  label, hint, value, onChange, songKey, minRows = 10, extra, areaRef,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (text: string) => void;
  songKey: string;
  minRows?: number;
  /** Extra buttons (note, convert) in the toolbar. */
  extra?: ReactNode;
  /** So the page can read the cursor (the sticky-note panel inserts there). */
  areaRef?: RefObject<HTMLTextAreaElement>;
}) {
  const t = useT();
  const id = useId();
  const own = useRef<HTMLTextAreaElement>(null);
  const area = areaRef ?? own;
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [split, setSplit] = useState<{ before: string; count: number; guessed?: boolean } | null>(null);
  const chart = useMemo(() => parseChordPro(value), [value]);
  const stats = chartStats(value);
  const diagrams = useMemo(() => chartDiagrams(value, chart, (c) => c, false), [value, chart]);
  // Lines are never wrapped: chords written above the words must stay over their syllable. The box scrolls sideways instead.
  const longest = useMemo(() => Math.max(20, ...value.split('\n').map((l) => l.replace(/\t/g, '    ').length)), [value]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  function load(text: string) {
    setSplit(null);
    if (!detect(text)) onChange(text);
  }
  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return setNotice(t('editor.pasteEmpty'));
      setNotice(null);
      load(text);
    } catch {
      setNotice(t('editor.pasteDenied'));
      area.current?.focus();
    }
  }
  const chords = diatonicChords(songKey);

  // The textarea grows with its text, so the coloured copy behind it lines up exactly and there is no inner scrollbar.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, view, area]);

  function apply(r: { text: string; cursor: number }) {
    onChange(r.text);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(r.cursor, r.cursor);
    });
  }
  /**
   * Splits the text into sections (by its titles, or by a guess) and applies it. Chords written above the words stay where
   * they are, as in Cifra: the sheet reads that layout as it is, and musicians edit it more easily than [inline] chords.
   * (The "Convert" button still turns it into ChordPro for whoever wants it.)
   */
  function detect(text: string) {
    let r = structureSections(text);
    const guessed = r.count === 0;
    if (guessed) r = guessSections(text);
    if (r.count === 0) return false;
    setSplit({ before: text, count: r.count, guessed });
    onChange(r.text);
    return true;
  }
  const at = () => area.current?.selectionStart ?? value.length;
  const chip = 'h-9 shrink-0 rounded-md border border-line bg-surface px-3 text-sm font-semibold transition-transform hover:border-io/60 active:scale-95';

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-semibold text-ink">{label}</label>
        <Segmented
          className="lg:hidden"
          label={t('editor.view')}
          value={view}
          onChange={setView}
          options={[{ value: 'write', label: t('editor.write') }, { value: 'preview', label: t('editor.preview') }]}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        <div className={`min-w-0 ${view === 'preview' ? 'hidden lg:block' : ''}`}>
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="toolbar" aria-label={t('editor.insert')}>
            <Select
              variant="dashed"
              label={t('editor.addSection')}
              placeholder={t('editor.addSection')}
              value=""
              options={SECTIONS.map((x) => ({ value: x.id, label: t(x.label) }))}
              onChange={(kind) => {
                const x = SECTIONS.find((y) => y.id === kind);
                if (x) apply(insertSection(value, at(), x.kind, x.body ? t('chart.tab') : t(x.label), x.body));
              }}
              className="shrink-0"
            />
            <button type="button" className={chip} title={t('editor.detectHint')} aria-describedby={`${id}-hint`} onClick={() => { if (!detect(value)) setSplit({ before: value, count: 0 }); }}>
              {t('editor.detect')}
            </button>
            <span id={`${id}-hint`} className="sr-only">{t('editor.detectHint')}</span>
            <button type="button" className={chip} onClick={() => void pasteFromClipboard()}>{t('editor.paste')}</button>
            <button type="button" className={chip} onClick={() => fileInput.current?.click()}>{t('editor.openTxt')}</button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.pro,.cho,.chopro,.crd,text/plain"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void file.text().then(load);
              }}
            />
            {extra}
          </div>
          {chords.length > 0 && (
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label={t('editor.chords')}>
              {chords.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-9 min-w-[2.75rem] shrink-0 rounded-md bg-chord/10 px-2.5 text-sm font-bold text-chord transition-transform active:scale-95"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply(insertChord(value, area.current?.selectionStart ?? value.length, area.current?.selectionEnd ?? value.length, c))}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {notice && (
            <div role="status" className="mb-2 flex items-center justify-between gap-2 rounded-md bg-lei/10 px-3 py-2 text-sm text-ink">
              <span>{notice}</span>
              <button type="button" aria-label={t('controls.dismiss')} className="px-1 text-soft" onClick={() => setNotice(null)}>×</button>
            </div>
          )}
          {split && (
            <div role="status" className="mb-2 flex items-center justify-between gap-2 rounded-md bg-io/10 px-3 py-2 text-sm text-ink">
              <span>
                {split.count === 0 ? t('editor.detectNone') : split.guessed ? t('editor.detectedGuess', { n: split.count }) : t('editor.detected', { n: split.count })}
              </span>
              <span className="flex gap-2">
                {split.count > 0 && (
                  <button type="button" className="font-semibold text-io underline" onClick={() => { onChange(split.before); setSplit(null); }}>{t('editor.undo')}</button>
                )}
                <button type="button" aria-label={t('controls.dismiss')} className="px-1 text-soft" onClick={() => setSplit(null)}>×</button>
              </span>
            </div>
          )}
          <div className="editor-box relative overflow-x-auto rounded-md border border-line bg-surface focus-within:border-io focus-within:ring-2 focus-within:ring-io/30">
            <div className="relative min-w-full" style={{ width: `calc(${longest + 2}ch + 1.5rem)` }}>
            <pre aria-hidden className="editor-text pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre">{highlight(value)}{'\n'}</pre>
            <textarea
              id={id}
              ref={area}
              rows={minRows}
              spellCheck={false}
              value={value}
              onChange={(e) => { setSplit(null); onChange(e.target.value); }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.split('\n').length < 4) return;
                const chordy = looksLikeChordsOverWords(pasted);
                if (!chordy && structureSections(pasted).count < 2) return;
                e.preventDefault();
                const el = e.currentTarget;
                const a = el.selectionStart, b = el.selectionEnd;
                const merged = value.slice(0, a) + pasted + value.slice(b);
                if (!detect(merged)) onChange(merged);
              }}
              wrap="off"
              autoCapitalize="off"
              autoComplete="off"
              className="editor-text relative block w-full resize-none overflow-hidden whitespace-pre bg-transparent text-transparent caret-ink focus:outline-none"
            />
            </div>
          </div>
          <div className="mt-1 flex items-start justify-between gap-3 text-xs text-soft">
            <span>{hint}</span>
            <span className="shrink-0 tabular-nums">{t('editor.stats', { lines: stats.lines, chords: stats.chords })}</span>
          </div>
          {(diagrams.entries.length > 0 || diagrams.bad.length > 0) && (
            <div className="mt-2 space-y-1.5 text-xs" aria-live="polite">
              {diagrams.bad.length > 0 && (
                <p className="font-semibold text-lei">
                  {t('editor.badFingering', { list: diagrams.bad.map((b) => `${b.name} ${b.text} (${b.count})`).join('; ') })}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label={t('editor.chordsUsed')}>
                <span className="mr-1 text-soft">{t('editor.fingerings', { n: diagrams.writtenCount })} ·</span>
                {diagrams.entries.map((e) => (
                  <span
                    key={e.name}
                    role="listitem"
                    title={e.frets ? undefined : t('editor.noDiagram')}
                    className={`rounded-full px-2 py-0.5 font-mono font-bold ${e.frets ? 'bg-chord/10 text-chord' : 'bg-lei/10 text-lei'}`}
                  >
                    {e.name}
                  </span>
                ))}
              </div>
              {diagrams.writtenCount === 0 && <p className="text-soft">{t('editor.fingeringHint')}</p>}
            </div>
          )}
        </div>

        <div className={`min-w-0 ${view === 'write' ? 'hidden lg:block' : ''}`}>
          <div className="rounded-xl border border-line bg-paper/70 p-4 lg:sticky lg:top-16 lg:max-h-[75vh] lg:overflow-y-auto">
            {value.trim() === '' ? (
              <p className="py-8 text-center text-sm text-soft">{t('editor.previewEmpty')}</p>
            ) : (
              <>
                <DiagramStrip entries={diagrams.entries} className="mb-3 border-b border-dashed border-line pb-3" />
                <ChordChart chart={chart} semitones={0} accidentals={accidentalsForKey(songKey)} fontSize={16} focus={false} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
