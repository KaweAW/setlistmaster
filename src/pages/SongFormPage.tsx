import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatBytes, formatDuration, parseDuration } from '../core/format';
import { newId } from '../core/ids';
import { collectTags } from '../core/songFilter';
import { normalizeTags } from '../core/tags';
import { formatTuningNotes } from '../core/tuning';
import type { Instrument, Part, Performer, Song, Tuning } from '../core/types';
import { ConvertDialog } from '../components/ConvertDialog';
import { PerformerBadge } from '../components/PerformerBadge';
import { TuningForm } from '../components/TuningForm';
import { Button, buttonClass, Field, FieldGroup, inputClass, PageTitle, textareaClass } from '../components/ui';
import { useCanEdit } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { partId } from '../data/instruments';
import { useQuery } from '../hooks/useQuery';
import { useT, type MessageKey } from '../i18n';

const KEY_SUGGESTIONS = ['C', 'Cm', 'C#', 'C#m', 'D', 'Dm', 'Eb', 'Ebm', 'E', 'Em', 'F', 'Fm', 'F#', 'F#m', 'G', 'Gm', 'Ab', 'Abm', 'A', 'Am', 'Bb', 'Bbm', 'B', 'Bm'];
const NEW_TUNING = '__new__';

interface PdfInfo {
  id: string;
  name: string;
  size: number;
  /** Undefined = the plain text's PDF. */
  instrumentId?: string | undefined;
}

/** A PDF chosen in the form, saved with the song. */
interface PendingPdf {
  key: string;
  file: File;
  instrumentId?: string | undefined;
}

export default function SongFormPage() {
  const { songId } = useParams();
  const t = useT();
  const { store, band } = useData();
  const canEdit = useCanEdit(band.id);

  const { data, loading } = useQuery(async () => {
    const [song, performers, tunings, songs, instruments, parts] = await Promise.all([
      songId ? store.songs.get(songId) : Promise.resolve(undefined),
      store.performers.listBy('bandId', band.id),
      store.tunings.listBy('bandId', band.id),
      store.songs.listBy('bandId', band.id),
      store.instruments.listBy('bandId', band.id),
      songId ? store.parts.listBy('songId', songId) : Promise.resolve([]),
    ]);
    const files = song ? await store.files.listBySong(song.id) : [];
    const pdfs: PdfInfo[] = files.map((f) => ({ id: f.id, name: f.name, size: f.size, instrumentId: f.instrumentId }));
    instruments.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return { song, performers, tunings, instruments, parts, knownTags: collectTags(songs), pdfs };
  }, [store, band.id, songId]);

  if (!canEdit) {
    // Viewers read only: a typed address must not open the form either.
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p role="status" className="text-soft">{t('readonly.message')}</p>
        <Link to="/library" className={`${buttonClass('secondary')} mt-4`}>{t('common.back')}</Link>
      </main>
    );
  }
  if (loading || !data) return <p className="p-6 text-soft">{t('app.loading')}</p>;
  if (songId && !data.song) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-soft">{t('song.notFound')}</p>
        <Link to="/library" className={`${buttonClass('secondary')} mt-4`}>{t('common.back')}</Link>
      </main>
    );
  }

  return (
    <SongForm
      key={songId ?? 'new'}
      initial={data.song}
      performers={data.performers}
      tunings={data.tunings}
      instruments={data.instruments}
      initialParts={data.parts}
      knownTags={data.knownTags}
      initialPdfs={data.pdfs}
    />
  );
}

type Errors = Partial<Record<'title' | 'duration' | 'tempo', MessageKey>>;

function SongForm({
  initial,
  performers,
  tunings,
  instruments,
  initialParts,
  knownTags,
  initialPdfs,
}: {
  initial: Song | undefined;
  performers: Performer[];
  tunings: Tuning[];
  instruments: Instrument[];
  initialParts: Part[];
  knownTags: string[];
  initialPdfs: PdfInfo[];
}) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { store, band } = useData();
  // After saving or cancelling, return to where the form was opened from (the song page, the library…).
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/library'));

  const [tuningList, setTuningList] = useState(tunings);
  const standardId = tuningList.find((x) => x.isStandard)?.id ?? tuningList[0]?.id ?? '';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [artist, setArtist] = useState(initial?.artist ?? '');
  const [key, setKey] = useState(initial?.key ?? '');
  const [capo, setCapo] = useState(initial?.capo ?? 0);
  const [tuningId, setTuningId] = useState(initial?.tuningId ?? standardId);
  const [tempo, setTempo] = useState(initial?.tempo ? String(initial.tempo) : '');
  const [duration, setDuration] = useState(initial?.durationSec ? formatDuration(initial.durationSec) : '');
  const [performerIds, setPerformerIds] = useState<string[]>(initial?.defaultPerformerIds ?? []);
  const [chordpro, setChordpro] = useState(initial?.chordpro ?? '');
  const [instrumentIds, setInstrumentIds] = useState<string[]>(initial?.instrumentIds ?? []);
  const [partTexts, setPartTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialParts.map((p) => [p.instrumentId, p.chordpro])),
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const [newTuningOpen, setNewTuningOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [keptPdfs, setKeptPdfs] = useState<PdfInfo[]>(initialPdfs);
  const [newPdfs, setNewPdfs] = useState<PendingPdf[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function addTag() {
    const next = normalizeTags([...tags, tagInput]);
    setTags(next);
    setTagInput('');
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  function togglePerformer(id: string) {
    setPerformerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleInstrument(id: string) {
    setInstrumentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function addPdfs(files: FileList | null, instrumentId: string | undefined) {
    if (!files) return;
    setNewPdfs((list) => [...list, ...Array.from(files).map((file) => ({ key: newId(), file, instrumentId }))]);
  }

  async function createTuning(values: { name: string; notes: string }) {
    const created = await store.tunings.create({ bandId: band.id, isStandard: false, ...values });
    setTuningList((list) => [...list, created]);
    setTuningId(created.id);
    setNewTuningOpen(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!title.trim()) next.title = 'validation.required';
    const parsedDuration = parseDuration(duration);
    if (!parsedDuration.valid) next.duration = 'validation.duration';
    const tempoText = tempo.trim();
    const tempoValue = tempoText ? Number(tempoText) : undefined;
    if (tempoValue !== undefined && (!Number.isInteger(tempoValue) || tempoValue < 20 || tempoValue > 400)) {
      next.tempo = 'validation.tempo';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setMessage(null);
    try {
      const data = {
        bandId: band.id,
        title: title.trim(),
        artist: artist.trim(),
        key: key.trim() || undefined,
        capo,
        tempo: tempoValue,
        durationSec: parsedDuration.seconds,
        tuningId,
        defaultPerformerIds: performerIds,
        instrumentIds,
        chordpro,
        pdfBlobId: undefined, // PDFs now belong to the song through the file itself (`songId`), several per part
        notes,
        tags: normalizeTags([...tags, tagInput]),
      };
      const saved = initial ? await store.songs.update(initial.id, data) : await store.songs.create(data);
      // PDFs: the ones you removed (and those of instruments you unticked) go; the new ones are stored for this song.
      const ticked = new Set(instrumentIds);
      const stays = (instrumentId: string | undefined) => instrumentId === undefined || ticked.has(instrumentId);
      for (const f of initialPdfs) {
        if (!keptPdfs.some((k) => k.id === f.id) || !stays(f.instrumentId)) await store.files.remove(f.id);
      }
      for (const pending of newPdfs.filter((x) => stays(x.instrumentId))) {
        await store.files.put({
          id: pending.key, bandId: band.id, songId: saved.id, instrumentId: pending.instrumentId,
          name: pending.file.name, mimeType: pending.file.type || 'application/pdf', size: pending.file.size,
          data: await pending.file.arrayBuffer(), createdAt: Date.now(),
        });
      }
      // One part per ticked instrument (its id is derived, so it is the same on every device); unticked ones go away.
      for (const instrument of instruments) {
        const id = await partId(band.id, saved.id, instrument.id);
        const existing = initialParts.find((p) => p.instrumentId === instrument.id);
        if (instrumentIds.includes(instrument.id)) {
          const text = partTexts[instrument.id] ?? '';
          if (existing) await store.parts.update(existing.id, { chordpro: text });
          else if (await store.parts.has(id)) {
            const now = Date.now(); // the part was removed before: bring the same record back
            await store.parts.put({ id, bandId: band.id, songId: saved.id, instrumentId: instrument.id, chordpro: text, notes: '', createdAt: now, updatedAt: now });
          }
          else await store.parts.create({ id, bandId: band.id, songId: saved.id, instrumentId: instrument.id, chordpro: text, notes: '' });
        } else if (existing) {
          await store.parts.remove(existing.id);
        }
      }
      goBack();
    } catch {
      setMessage(t('song.saveError'));
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    const used = await store.items.listBy('songId', initial.id);
    if (used.length > 0) {
      setMessage(t('song.deleteBlocked', { n: used.length }));
      return;
    }
    if (!window.confirm(t('common.deleteConfirm', { name: initial.title }))) return;
    for (const f of await store.files.listBySong(initial.id)) await store.files.remove(f.id);
    await store.songs.remove(initial.id);
    navigate('/library');
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link to="/library" className="mb-3 inline-flex h-11 items-center text-sm font-semibold text-io">
        ← {t('library.title')}
      </Link>
      <div className="mb-5">
        <PageTitle>{initial ? t('song.edit') : t('song.new')}</PageTitle>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('field.title')} error={errors.title && t(errors.title)}>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t('field.artist')}>
            <input className={inputClass} value={artist} onChange={(e) => setArtist(e.target.value)} autoComplete="off" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={t('field.key')}>
            <input className={inputClass} list="key-suggestions" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
            <datalist id="key-suggestions">
              {KEY_SUGGESTIONS.map((k) => (<option key={k} value={k} />))}
            </datalist>
          </Field>
          <Field label={t('field.capo')}>
            <select className={inputClass} value={capo} onChange={(e) => setCapo(Number(e.target.value))}>
              {Array.from({ length: 13 }, (_, n) => (
                <option key={n} value={n}>{n === 0 ? t('capo.none') : n}</option>
              ))}
            </select>
          </Field>
          <Field label={t('field.tempo')} error={errors.tempo && t(errors.tempo)}>
            <input className={inputClass} inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value)} />
          </Field>
          <Field label={t('field.duration')} error={errors.duration && t(errors.duration)}>
            <input className={inputClass} inputMode="numeric" placeholder="3:45" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          <Field label={t('field.tuning')}>
            <select
              className={inputClass}
              value={tuningId}
              onChange={(e) => (e.target.value === NEW_TUNING ? setNewTuningOpen(true) : setTuningId(e.target.value))}
            >
              {tuningList.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.isStandard || !x.notes ? x.name : `${x.name} — ${formatTuningNotes(x.notes)}`}
                </option>
              ))}
              <option value={NEW_TUNING}>{t('tuning.addNew')}</option>
            </select>
          </Field>
          {newTuningOpen && (
            <TuningForm title={t('tuning.newTitle')} onSubmit={createTuning} onCancel={() => setNewTuningOpen(false)} />
          )}
        </div>

        <FieldGroup legend={t('field.performers')}>
          <div className="flex flex-wrap gap-2">
            {performers.map((p) => {
              const on = performerIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePerformer(p.id)}
                  className={`flex h-11 items-center gap-2 rounded-full border px-3 text-base font-semibold ${
                    on ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink'
                  }`}
                >
                  <PerformerBadge performer={p} size={22} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </FieldGroup>

        <Field label={t('field.chordpro')} hint={t('field.chordpro.hint')}>
          <textarea
            className={`${textareaClass} font-mono text-[15px]`}
            rows={10}
            spellCheck={false}
            value={chordpro}
            onChange={(e) => setChordpro(e.target.value)}
          />
        </Field>
        <div className="-mt-3">
          <Button variant="secondary" onClick={() => setConvertOpen(true)}>{t('convert.open')}</Button>
        </div>

        {instruments.length > 0 && (
          <FieldGroup legend={t('field.instruments')}>
            <p className="mb-2 text-sm text-soft">{t('field.instruments.hint')}</p>
            <div className="flex flex-wrap gap-2">
              {instruments.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={instrumentIds.includes(i.id)}
                  onClick={() => toggleInstrument(i.id)}
                  className={`h-11 rounded-full border px-4 text-base font-semibold ${
                    instrumentIds.includes(i.id) ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink'
                  }`}
                >
                  {i.name}
                </button>
              ))}
            </div>
            {instruments.filter((i) => instrumentIds.includes(i.id)).map((i) => (
              <div key={i.id} className="mt-3 space-y-2">
                <Field label={t('part.chordpro', { name: i.name })}>
                  <textarea
                    className={`${textareaClass} font-mono text-[15px]`}
                    rows={8}
                    spellCheck={false}
                    value={partTexts[i.id] ?? ''}
                    onChange={(e) => setPartTexts((x) => ({ ...x, [i.id]: e.target.value }))}
                  />
                </Field>
                <PdfScope instrumentId={i.id} label={i.name} kept={keptPdfs} added={newPdfs} setKept={setKeptPdfs} setAdded={setNewPdfs} onAdd={addPdfs} />
              </div>
            ))}
          </FieldGroup>
        )}

        <FieldGroup legend={t('field.pdf')}>
          <PdfScope instrumentId={undefined} kept={keptPdfs} added={newPdfs} setKept={setKeptPdfs} setAdded={setNewPdfs} onAdd={addPdfs} />
        </FieldGroup>

        <FieldGroup legend={t('field.tags')}>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-2">
            {tags.map((tag) => (
              <span key={tag} className="flex h-9 items-center gap-1 rounded-full bg-line/60 pl-3 text-sm">
                {tag}
                <button
                  type="button"
                  aria-label={`${t('common.remove')} ${tag}`}
                  className="h-9 w-9 text-soft"
                  onClick={() => setTags(tags.filter((x) => x !== tag))}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="h-9 min-w-[10rem] flex-1 bg-transparent px-1 text-base focus:outline-none"
              list="tag-suggestions"
              placeholder={t('field.tags.add')}
              aria-label={t('field.tags')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => tagInput.trim() && addTag()}
            />
            <datalist id="tag-suggestions">
              {knownTags.filter((k) => !tags.includes(k)).map((k) => (<option key={k} value={k} />))}
            </datalist>
          </div>
        </FieldGroup>

        <Field label={t('field.notes')}>
          <textarea className={textareaClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {message && <p role="alert" className="rounded-md border border-lei/40 bg-lei/5 p-3 text-sm font-semibold text-lei">{message}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
          <Button variant="secondary" onClick={goBack}>{t('common.cancel')}</Button>
          {initial && (
            <Button variant="danger" className="ml-auto" onClick={() => void onDelete()}>{t('common.delete')}</Button>
          )}
        </div>
      </form>
      {convertOpen && (
        <ConvertDialog
          existing={chordpro}
          onApply={(text) => {
            setChordpro(text);
            setConvertOpen(false);
          }}
          onClose={() => setConvertOpen(false)}
        />
      )}
    </main>
  );
}

/** The PDFs of one part (the plain text when `instrumentId` is undefined): the list, "remove", and a picker that takes several files. */
function PdfScope({
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
