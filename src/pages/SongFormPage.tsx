import { Select } from '../components/Select';
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatDuration, parseDuration } from '../core/format';
import { newId } from '../core/ids';
import { collectTags } from '../core/songFilter';
import { normalizeTags } from '../core/tags';
import { elementAtReadingLine } from '../lib/readingLine';
import { isStandardStrings, nameForStrings, standardStrings, stringsKey, tuningStrings } from '../core/tuning';
import type { Instrument, Part, Performer, Song, Tuning } from '../core/types';
import { PartsEditor, TEXT_PART, type PdfInfo, type PendingPdf } from '../components/PartsEditor';
import { PerformerBadge } from '../components/PerformerBadge';
import { DurationSlider, KeyPicker, TempoTools } from '../components/SongFormParts';
import { TuningPicker } from '../components/TuningPicker';
import { Button, buttonClass, Field, FieldGroup, inputClass, PageTitle, textareaClass } from '../components/ui';
import { useCanEdit } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { addAttachment, removeAttachment, songAttachments } from '../data/attachments';
import { partId } from '../data/instruments';
import { useQuery } from '../hooks/useQuery';
import { useT, type MessageKey } from '../i18n';

const card = 'space-y-4 rounded-xl border border-line bg-surface p-4 shadow-sm scroll-mt-28 sm:p-5';

const NAV_ICONS = {
  basics: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  charts: 'M4 5h16M4 10h16M4 15h10M4 20h7',
  more: 'M20 12 12 20l-9-9V4h7l10 8ZM7.5 8.5h.01',
} as const;

/** A card of the form: an icon and a title on a coloured band, then its fields. `id` is what the step bar scrolls to. */
function FormCard({ id, icon, title, children }: { id: string; icon: keyof typeof NAV_ICONS; title: string; children: ReactNode }) {
  return (
    <section id={id} data-form-section className={card}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-io/12 text-io">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={NAV_ICONS[icon]} /></svg>
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Sticky step bar: where you are in the form (it follows the scroll), a tap goes there, and a bar shows how much is filled in. */
function FormSteps({ steps, progress }: { steps: { id: string; label: string }[]; progress: number }) {
  const t = useT();
  const [current, setCurrent] = useState(steps[0]!.id);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const nodes = [...document.querySelectorAll<HTMLElement>('[data-form-section]')];
      if (nodes.length === 0 || nodes[0]!.getBoundingClientRect().height === 0) return;
      const found = elementAtReadingLine(nodes, 0.3);
      if (found) setCurrent(found.id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return (
    <nav aria-label={t('form.steps')} className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line bg-paper/90 px-4 pt-2 backdrop-blur">
      <div className="flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none]">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={current === s.id ? 'step' : undefined}
            onClick={() => document.getElementById(s.id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors ${current === s.id ? 'bg-ink text-paper' : 'bg-surface text-ink ring-1 ring-line'}`}
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${current === s.id ? 'bg-paper/20' : 'bg-line/70'}`}>{i + 1}</span>
            {s.label}
          </button>
        ))}
      </div>
      <div role="progressbar" aria-label={t('form.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="-mx-4 h-[3px] bg-line/60">
        <div className="h-full origin-left bg-gradient-to-r from-lei via-coro to-io transition-transform duration-500 ease-out" style={{ transform: `scaleX(${progress})` }} />
      </div>
    </nav>
  );
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
    const attachments = song ? await songAttachments(store, song.id) : [];
    const pdfs: PdfInfo[] = attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, instrumentId: a.instrumentId }));
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

  const standardId = tunings.find((x) => x.isStandard)?.id ?? tunings[0]?.id ?? '';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [artist, setArtist] = useState(initial?.artist ?? '');
  const [key, setKey] = useState(initial?.key ?? '');
  const [capo, setCapo] = useState(initial?.capo ?? 0);
  // The tuning is picked string by string. Until it is touched the song keeps its stored tuning (even one that is free text).
  const initialTuning = tunings.find((x) => x.id === initial?.tuningId);
  const [strings, setStrings] = useState<string[]>(() => (initialTuning && !initialTuning.isStandard ? tuningStrings(initialTuning.notes) : null) ?? standardStrings());
  const [tuningTouched, setTuningTouched] = useState(false);
  const tuningId = initial?.tuningId ?? standardId;
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

  const [keptPdfs, setKeptPdfs] = useState<PdfInfo[]>(initialPdfs);
  const [newPdfs, setNewPdfs] = useState<PendingPdf[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Dirty: the form as it was when it opened, against now. Progress: how much of the usual is filled in.
  const snapshot = JSON.stringify([title, artist, key, capo, tuningTouched ? strings : tuningId, tempo, duration, performerIds, chordpro, instrumentIds, partTexts, notes, tags, tagInput, keptPdfs.map((f) => f.id), newPdfs.map((f) => f.key)]);
  const [opened] = useState(snapshot);
  const dirty = snapshot !== opened;
  const progress =
    [title.trim(), artist.trim(), key.trim(), tempo.trim(), duration.trim(), performerIds.length > 0 || '', chordpro.trim() || keptPdfs.length > 0 || newPdfs.length > 0 || '']
      .filter(Boolean).length / 7;

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

  const tick = (id: string) => setInstrumentIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  const untick = (id: string) => setInstrumentIds((ids) => ids.filter((x) => x !== id));
  const textOf = (part: string) => (part === TEXT_PART ? chordpro : (partTexts[part] ?? ''));
  const setText = (part: string, text: string) => (part === TEXT_PART ? setChordpro(text) : setPartTexts((x) => ({ ...x, [part]: text })));
  const hasContent = (instrumentId: string) =>
    (partTexts[instrumentId] ?? '').trim() !== '' ||
    keptPdfs.some((f) => f.instrumentId === instrumentId) || newPdfs.some((f) => f.instrumentId === instrumentId);

  function addPdfs(files: FileList | null, instrumentId: string | undefined) {
    if (!files) return;
    setNewPdfs((list) => [...list, ...Array.from(files).map((file) => ({ key: newId(), file, instrumentId }))]);
  }

  /** The stored tuning that matches the strings picked; a new one is created the first time a combination is used. */
  async function tuningFor(picked: readonly string[]): Promise<string> {
    if (isStandardStrings(picked)) return standardId;
    const list = await store.tunings.listBy('bandId', band.id);
    const same = list.find((x) => !x.isStandard && (tuningStrings(x.notes) ? stringsKey(tuningStrings(x.notes)!) === stringsKey(picked) : false));
    if (same) return same.id;
    return (await store.tunings.create({ bandId: band.id, isStandard: false, name: nameForStrings(picked), notes: picked.join(' ') })).id;
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
    if (Object.keys(next).length > 0) {
      // Take the person to the first field that needs a look, and shake it once.
      requestAnimationFrame(() => {
        const bad = document.querySelector<HTMLElement>('[data-error]');
        if (!bad) return;
        bad.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        bad.classList.remove('field-shake');
        void bad.offsetWidth;
        bad.classList.add('field-shake');
        bad.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true });
      });
      return;
    }

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
        tuningId: tuningTouched ? await tuningFor(strings) : tuningId,
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
        if (!keptPdfs.some((k) => k.id === f.id) || !stays(f.instrumentId)) await removeAttachment(store, f.id);
      }
      for (const pending of newPdfs.filter((x) => stays(x.instrumentId))) {
        await addAttachment(store, {
          id: pending.key, bandId: band.id, songId: saved.id, instrumentId: pending.instrumentId,
          name: pending.file.name, mimeType: pending.file.type || 'application/pdf', data: await pending.file.arrayBuffer(),
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
    for (const a of await songAttachments(store, initial.id)) await removeAttachment(store, a.id);
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

      <FormSteps
        progress={progress}
        steps={[
          { id: 'form-basics', label: t('song.section.basics') },
          { id: 'form-charts', label: t('part.section') },
          { id: 'form-more', label: t('song.section.more') },
        ]}
      />

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormCard id="form-basics" icon="basics" title={t('song.section.basics')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('field.title')} error={errors.title && t(errors.title)}>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t('field.artist')}>
            <input className={inputClass} value={artist} onChange={(e) => setArtist(e.target.value)} autoComplete="off" />
          </Field>
        </div>

        <div className="space-y-2">
          <Field label={t('field.key')} className="max-w-[10rem]">
            <input className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
          </Field>
          <KeyPicker value={key} onChange={setKey} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label={t('field.tempo')} error={errors.tempo && t(errors.tempo)}>
              <input className={inputClass} inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value)} />
            </Field>
            <TempoTools tempo={tempo} onTempo={setTempo} />
          </div>
          <div>
            <Field label={t('field.duration')} error={errors.duration && t(errors.duration)}>
              <input className={inputClass} inputMode="numeric" placeholder="3:45" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
            <DurationSlider value={duration} onChange={setDuration} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('field.capo')}>
            <Select
              label={t('field.capo')}
              value={String(capo)}
              onChange={(v) => setCapo(Number(v))}
              options={Array.from({ length: 13 }, (_, n) => ({ value: String(n), label: n === 0 ? t('capo.none') : String(n) }))}
            />
          </Field>
        </div>
        <FieldGroup legend={t('field.tuning')}>
          <TuningPicker strings={strings} onChange={(next) => { setStrings(next); setTuningTouched(true); }} />
        </FieldGroup>

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
                  style={on ? { background: p.color, borderColor: p.color } : { borderColor: `${p.color}88` }}
                  className={`flex h-11 items-center gap-2 rounded-full border-2 px-3 text-base font-semibold transition-all duration-200 active:scale-95 ${on ? 'scale-[1.04] text-white shadow-md' : 'bg-surface text-ink'}`}
                >
                  <span className={on ? 'rounded-full ring-2 ring-white/70' : ''}><PerformerBadge performer={p} size={22} /></span>
                  {p.name}
                </button>
              );
            })}
          </div>
        </FieldGroup>
        </FormCard>

        <FormCard id="form-charts" icon="charts" title={t('part.section')}>
          <PartsEditor
            songKey={key}
            instruments={instruments}
            ticked={instrumentIds}
            onTick={tick}
            onUntick={untick}
            textOf={textOf}
            setText={setText}
            hasContent={hasContent}
            pdfs={{ kept: keptPdfs, added: newPdfs, setKept: setKeptPdfs, setAdded: setNewPdfs, onAdd: addPdfs }}
          />
        </FormCard>

        <FormCard id="form-more" icon="more" title={t('song.section.more')}>
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
              placeholder={t('field.tags.add')}
              aria-label={t('field.tags')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => tagInput.trim() && addTag()}
            />
          </div>
          {knownTags.filter((k) => !tags.includes(k)).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-soft">{t('tags.suggested')}</span>
              {knownTags.filter((k) => !tags.includes(k)).slice(0, 14).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTags(normalizeTags([...tags, k]))}
                  className="h-8 rounded-full border border-dashed border-line bg-surface px-3 text-sm text-soft transition-all hover:border-io/60 hover:text-ink active:scale-95"
                >
                  + {k}
                </button>
              ))}
            </div>
          )}
        </FieldGroup>

        <Field label={t('field.notes')}>
          <textarea className={textareaClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        </FormCard>

        {message && <p role="alert" className="rounded-md border border-lei/40 bg-lei/5 p-3 text-sm font-semibold text-lei">{message}</p>}

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
          <Button variant="secondary" onClick={goBack}>{t('common.cancel')}</Button>
          <span role="status" className={`flex items-center gap-2 text-sm font-semibold transition-colors ${dirty ? 'text-lei' : 'text-soft'}`}>
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full transition-colors ${dirty ? 'dirty-dot bg-lei' : 'bg-line'}`} />
            {dirty ? t('form.dirty') : t('form.clean')}
          </span>
          {initial && (
            <Button variant="danger" className="ml-auto" onClick={() => void onDelete()}>{t('common.delete')}</Button>
          )}
        </div>
      </form>
    </main>
  );
}
