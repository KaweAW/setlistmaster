import { Select } from './Select';
import { useRef, useState } from 'react';
import { insertNote, NOTE_COLORS, type NoteColor } from '../core/chordpro';
import { formatBytes } from '../core/format';
import type { Instrument } from '../core/types';
import { useT } from '../i18n';
import { ConvertDialog } from './ConvertDialog';
import { Button, buttonClass, Field, inputClass, textareaClass } from './ui';

export interface PdfInfo {
  id: string;
  name: string;
  size: number;
  /** Undefined = the plain text's PDF. */
  instrumentId?: string | undefined;
}

/** A PDF chosen in the form, saved with the song. */
export interface PendingPdf {
  key: string;
  file: File;
  instrumentId?: string | undefined;
}

export const TEXT_PART = 'text';

export interface PdfState {
  kept: PdfInfo[];
  added: PendingPdf[];
  setKept: (list: PdfInfo[]) => void;
  setAdded: (list: PendingPdf[]) => void;
  onAdd: (files: FileList | null, instrumentId: string | undefined) => void;
}

/**
 * The charts of a song, one tab per part: the plain text (always there) and one for each instrument the song has.
 * Each tab holds its own text (ChordPro, with chords or tabs) and its own PDFs, so the form stays one screen tall.
 */
export function PartsEditor({
  instruments, ticked, onTick, onUntick, textOf, setText, pdfs, hasContent,
}: {
  instruments: Instrument[];
  ticked: string[];
  onTick: (id: string) => void;
  onUntick: (id: string) => void;
  textOf: (part: string) => string;
  setText: (part: string, text: string) => void;
  pdfs: PdfState;
  /** Does this instrument already have text or PDFs (ask before throwing them away)? */
  hasContent: (instrumentId: string) => boolean;
}) {
  const t = useT();
  const [active, setActive] = useState<string>(TEXT_PART);
  const [convertOpen, setConvertOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteColor, setNoteColor] = useState<NoteColor>('yellow');
  const [noteText, setNoteText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const shown = instruments.filter((i) => ticked.includes(i.id));
  const addable = instruments.filter((i) => !ticked.includes(i.id));
  const current = shown.find((i) => i.id === active);
  const part = current ? current.id : TEXT_PART; // an instrument that was removed falls back to the text

  /** Puts the note on its own line above the line the cursor is on, and leaves the cursor after it. */
  function addNote() {
    if (!noteText.trim()) return;
    const el = area.current;
    const { text, cursor } = insertNote(textOf(part), el?.selectionStart ?? textOf(part).length, noteColor, noteText);
    setText(part, text);
    setNoteText('');
    setNoteOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  }

  function add(id: string) {
    onTick(id);
    setActive(id);
  }

  function remove(instrument: Instrument) {
    if (hasContent(instrument.id) && !window.confirm(t('part.removeConfirm', { name: instrument.name }))) return;
    onUntick(instrument.id);
    setActive(TEXT_PART);
  }

  const tab = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={part === id}
      onClick={() => setActive(id)}
      className={`h-11 shrink-0 rounded-md px-4 text-sm font-semibold ${part === id ? 'bg-ink text-paper' : 'border border-line bg-surface text-ink'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label={t('part.tabs')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">
          {tab(TEXT_PART, t('part.textTab'))}
          {shown.map((i) => tab(i.id, i.name))}
        </div>
        {addable.length > 0 && (
          <Select
            label={t('part.addInstrument')}
            variant="dashed"
            className="w-40 shrink-0"
            value=""
            placeholder={`+ ${t('part.addInstrument')}`}
            onChange={(v) => v && add(v)}
            options={addable.map((i) => ({ value: i.id, label: i.name }))}
          />
        )}
      </div>

      <div role="tabpanel" className="space-y-3">
        <Field label={current ? t('part.chordpro', { name: current.name }) : t('field.chordpro')}>
          <textarea
            className={`${textareaClass} font-mono text-[15px]`}
            rows={part === TEXT_PART ? 12 : 10}
            spellCheck={false}
            ref={area}
            value={textOf(part)}
            onChange={(e) => setText(part, e.target.value)}
          />
        </Field>
        <p className="-mt-2 text-xs text-soft">{current ? t('part.hint') : t('field.chordpro.hint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setNoteOpen((o) => !o)} aria-expanded={noteOpen}>{t('note.add')}</Button>
          <Button variant="secondary" onClick={() => setConvertOpen(true)}>{t('convert.open')}</Button>
        </div>
        {noteOpen && (
          <div className="space-y-3 rounded-md border border-line bg-paper p-3">
            <p className="text-xs text-soft">{t('note.hint')}</p>
            <div role="radiogroup" aria-label={t('note.color')} className="flex gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={noteColor === c}
                  aria-label={t(`note.color.${c}`)}
                  onClick={() => setNoteColor(c)}
                  className={`sticky-note--${c} h-9 w-9 rounded-sm border border-black/10 shadow-sm ${noteColor === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''}`}
                  style={{ background: 'var(--note-bg)' }}
                />
              ))}
            </div>
            <Field label={t('note.text')}>
              <input
                className={inputClass}
                value={noteText}
                maxLength={160}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNote();
                  }
                }}
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={addNote} disabled={!noteText.trim()}>{t('note.insert')}</Button>
              <Button variant="secondary" onClick={() => setNoteOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}
        <PdfScope instrumentId={current?.id} {...(current ? { label: current.name } : {})} {...pdfs} />
        {current && (
          <div className="border-t border-line pt-3">
            <Button variant="danger" onClick={() => remove(current)}>{t('part.remove', { name: current.name })}</Button>
          </div>
        )}
      </div>

      {convertOpen && (
        <ConvertDialog
          existing={textOf(part)}
          onApply={(text) => {
            setText(part, text);
            setConvertOpen(false);
          }}
          onClose={() => setConvertOpen(false)}
        />
      )}
    </div>
  );
}

/** The PDFs of one part (the plain text when `instrumentId` is undefined): the list, "remove", and a picker that takes several files. */
export function PdfScope({
  instrumentId, label, kept, added, setKept, setAdded, onAdd,
}: {
  instrumentId: string | undefined;
  label?: string;
  kept: PdfInfo[];
  added: PendingPdf[];
  setKept: (list: PdfInfo[]) => void;
  setAdded: (list: PendingPdf[]) => void;
  onAdd: (files: FileList | null, instrumentId: string | undefined) => void;
}) {
  const t = useT();
  const mine = [
    ...kept.filter((f) => f.instrumentId === instrumentId).map((f) => ({ id: f.id, name: f.name, size: f.size, existing: true })),
    ...added.filter((f) => f.instrumentId === instrumentId).map((f) => ({ id: f.key, name: f.file.name, size: f.file.size, existing: false })),
  ];
  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-semibold">{t('pdf.of', { name: label })}</p>}
      {mine.length === 0 && <p className="text-sm text-soft">{t('pdf.none')}</p>}
      <ul className="space-y-1">
        {mine.map((f) => (
          <li key={f.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-soft">{f.name} · {formatBytes(f.size)}</span>
            <Button
              variant="secondary"
              aria-label={`${t('common.remove')} ${f.name}`}
              onClick={() => (f.existing ? setKept(kept.filter((k) => k.id !== f.id)) : setAdded(added.filter((a) => a.key !== f.id)))}
            >
              {t('common.remove')}
            </Button>
          </li>
        ))}
      </ul>
      <label className={`${buttonClass('secondary')} cursor-pointer focus-within:ring-2 focus-within:ring-io`}>
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          aria-label={label ? t('pdf.addFor', { name: label }) : t('pdf.addText')}
          onChange={(e) => {
            onAdd(e.target.files, instrumentId);
            e.target.value = '';
          }}
        />
        {t('pdf.add')}
      </label>
    </div>
  );
}
