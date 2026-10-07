import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { accidentalsForKey, diatonicChords } from '../core/chords';
import { chartStats, insertChord, insertSection, parseChordPro, structureSections, type InsertableKind } from '../core/chordpro';
import { useT, type MessageKey } from '../i18n';
import { ChordChart } from './ChordChart';
import { Segmented } from './Segmented';
import { Select } from './Select';

/** The text with its ChordPro marks coloured: {directives} in violet, [chords] in the chord colour. Drawn behind a see-through textarea. */
function highlight(source: string): ReactNode[] {
  return source.split(/(\{[^}\n]*\}|\[[^\]\n]*\])/g).map((piece, i) => {
    if (piece.startsWith('{') && piece.endsWith('}')) return <span key={i} className="font-semibold text-coro">{piece}</span>;
    if (piece.startsWith('[') && piece.endsWith(']')) return <span key={i} className="font-bold text-chord">{piece}</span>;
    return piece;
  });
}

const SECTIONS: { kind: InsertableKind; label: MessageKey }[] = [
  { kind: 'intro', label: 'chart.intro' },
  { kind: 'verse', label: 'chart.verse' },
  { kind: 'prechorus', label: 'chart.prechorus' },
  { kind: 'chorus', label: 'chart.chorus' },
  { kind: 'bridge', label: 'chart.bridge' },
  { kind: 'instrumental', label: 'chart.instrumental' },
  { kind: 'outro', label: 'chart.outro' },
  { kind: 'tab', label: 'chart.tab' },
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
  const [split, setSplit] = useState<{ before: string; count: number } | null>(null);
  const chart = useMemo(() => parseChordPro(value), [value]);
  const stats = chartStats(value);
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
  function detect(text: string) {
    const r = structureSections(text);
    if (r.count === 0) return false;
    setSplit({ before: text, count: r.count });
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
              options={SECTIONS.map((x) => ({ value: x.kind, label: t(x.label) }))}
              onChange={(kind) => {
                const x = SECTIONS.find((y) => y.kind === kind);
                if (x) apply(insertSection(value, at(), x.kind, t(x.label)));
              }}
              className="shrink-0"
            />
            <button type="button" className={chip} onClick={() => { if (!detect(value)) setSplit({ before: value, count: 0 }); }}>
              {t('editor.detect')}
            </button>
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
          {split && (
            <div role="status" className="mb-2 flex items-center justify-between gap-2 rounded-md bg-io/10 px-3 py-2 text-sm text-ink">
              <span>{split.count > 0 ? t('editor.detected', { n: split.count }) : t('editor.detectNone')}</span>
              <span className="flex gap-2">
                {split.count > 0 && (
                  <button type="button" className="font-semibold text-io underline" onClick={() => { onChange(split.before); setSplit(null); }}>{t('editor.undo')}</button>
                )}
                <button type="button" aria-label={t('controls.dismiss')} className="px-1 text-soft" onClick={() => setSplit(null)}>×</button>
              </span>
            </div>
          )}
          <div className="editor-box relative rounded-md border border-line bg-surface focus-within:border-io focus-within:ring-2 focus-within:ring-io/30">
            <pre aria-hidden className="editor-text pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words">{highlight(value)}{'\n'}</pre>
            <textarea
              id={id}
              ref={area}
              rows={minRows}
              spellCheck={false}
              value={value}
              onChange={(e) => { setSplit(null); onChange(e.target.value); }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.split('\n').length < 4 || structureSections(pasted).count < 2) return;
                e.preventDefault();
                const el = e.currentTarget;
                const a = el.selectionStart, b = el.selectionEnd;
                const merged = value.slice(0, a) + pasted + value.slice(b);
                if (!detect(merged)) onChange(merged);
              }}
              className="editor-text relative block w-full resize-none overflow-hidden bg-transparent text-transparent caret-ink focus:outline-none"
            />
          </div>
          <div className="mt-1 flex items-start justify-between gap-3 text-xs text-soft">
            <span>{hint}</span>
            <span className="shrink-0 tabular-nums">{t('editor.stats', { lines: stats.lines, chords: stats.chords })}</span>
          </div>
        </div>

        <div className={`min-w-0 ${view === 'write' ? 'hidden lg:block' : ''}`}>
          <div className="rounded-xl border border-line bg-paper/70 p-4 lg:sticky lg:top-16 lg:max-h-[75vh] lg:overflow-y-auto">
            {value.trim() === '' ? (
              <p className="py-8 text-center text-sm text-soft">{t('editor.previewEmpty')}</p>
            ) : (
              <ChordChart chart={chart} semitones={0} accidentals={accidentalsForKey(songKey)} fontSize={16} focus={false} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
