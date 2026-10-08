# Technical decisions

A record of the choices made while building Scaletta, by phase, and why. Each phase ends with what was verified
and what still has to be tried by hand on real devices.

## The short version

- **Local-first.** IndexedDB (through Dexie) is the source of truth; the app is fully usable offline and with no account.
  Sharing through Supabase is optional and layered on top: writes go to an outbox and are replayed, reads come from a
  cursor-based pull, conflicts are resolved last-write-wins per record (Phase 6).
- **A thin, abstract data layer.** The UI only talks to a repository interface (enforced by an ESLint rule), so storage and
  sync can change without touching components (Phase 0).
- **Pure core.** Setlist edits, pagination, chord parsing and transposition are pure functions in `core/`, covered by unit
  tests; undo/redo is snapshot based (Phases 2–4).
- **Security in the database.** Every record carries a `bandId`, and Postgres row-level security decides who can read or
  write; the policies are tested against an in-memory Postgres (PGlite) (Phases 6, 14).
- **Honest about limits.** Each phase lists what automated tests cannot prove (real devices, Safari, Supabase project) so
  that nobody has to guess what was checked.

## Phase 0

- **Package manager**: pnpm.
- **TypeScript 6**: typescript-eslint does not support TS 7 yet, so `typescript` is pinned to 6.
- **Zod as the single source of types**: the domain types are `z.infer` of the schemas in `core/schemas.ts`.
  The repository validates on write and on read.
- **Abstract repository** (`data/repository.ts`): the UI never imports Dexie (ESLint rule).
  In phase 6 the implementation in `data/index.ts` can be swapped.
- **Soft delete**: `remove()` sets `deletedAt`; reads exclude deleted records.
- **`bandId` on every record** except `Band`, including `Block` and `SetlistItem`, for Supabase RLS policies.
- **`setlistId` on `SetlistItem` too** (an addition to the original data model): a whole setlist can be read with one indexed query.
  It must stay consistent with the block.
- **Timestamps** in epoch milliseconds (numbers); IDs from `crypto.randomUUID()`.
- **Dexie schema v1**: indexes on `bandId`, `setlistId`, `blockId`, `songId`. `deletedAt` is not indexed
  (`undefined` values cannot be indexed); it is filtered in memory. Versions are added, never edited.
- **Transitions**: `transitionText` is plain text, with `**bold**` for titles (see `core/emphasis.ts`).
  An ambiguity in the original paper setlist ("hard stop or → direct segue") became type `segue`, the rest stays in the text.
- **Seed tunings**: "Standard", "D-G-C-F-A-D", "Drop D" (D A D G B E), "D B D G B E".
  Names are editable by the user. In the seed the tuning belongs to the song (`song.tuningId`), not to the item.
- **Durations, keys, tempo**: empty in the seed. Totals on the home screen ignore songs without a duration.
- **i18n**: a typed dictionary with no dependencies (`i18n/`), flat keys; Italian and English.
- **Fonts**: bundled locally with `@fontsource` (Oswald, Source Sans 3, with Cyrillic subsets), so they work
  offline and render "Спокойная ночь".
- **Dependencies beyond the initial stack**: `@fontsource/oswald`, `@fontsource/source-sans-3` (local fonts),
  `fake-indexeddb` (repository tests), ESLint + `typescript-eslint` + `eslint-plugin-react-hooks`, Prettier.
- **UI state**: Zustand with `persist` (only language and theme in localStorage). Edit mode is never restored:
  the app always opens in the safe view.

## Phase 1

- **Race-proof bootstrap**: StrictMode runs effects twice in development and, in phase 0, could create two bands with
  two seeds. `bootstrap()` now shares a single run; if several bands exist, the oldest is used.
  (Duplicate bands left in IndexedDB by phase 0 are harmless, and can be cleaned by deleting the `scaletta` database.)
- **DataProvider**: opens the store, runs the bootstrap and provides `store` and `band` to the pages (`useData()`).
  It accepts an injected store, used by the UI tests.
- **Attached PDFs**: Dexie table `files` (schema v2), content stored as an `ArrayBuffer` (more reliable than Blobs
  on Safari/iOS). Hard delete, not soft: they are binary data that will move to separate storage later.
- **Protected deletes**: a song used in a setlist, and a tuning or singer in use, cannot be deleted (a message
  explains why). This is lifted once songs can be removed from setlists (phase 2).
- **Tuning created on the fly** from the song form: saved at once, even if you then cancel the song.
- **Search**: ignores case, accents and curly/straight apostrophes; every word must appear in the title or
  artist (`core/songFilter.ts`).
- **Duration** entered as `m:ss`; `0:00` and other formats are rejected.
- **Backing-vocal badge**: the "rounded square" shape is tied to the ∞ symbol (no `shape` field in the model).
- **Navigation**: bottom bar on phones, dark side bar from `md` up. Tapping a library song opens the edit form for now;
  in phase 4 it opens the song page.
- **Dev dependencies added**: `jsdom` and `@testing-library/react` for UI tests.

## Phase 2

- **Every edit is a pure function** `setlist → setlist` (`core/setlistOps.ts`): add/rename/move/delete blocks and
  songs, edit an entry. Undo/redo are snapshots (`core/history.ts`, at most 100 steps) and saving is the difference
  between two snapshots (`diffTree`), written to IndexedDB at once and in order (autosave, no "Save" button).
  Undo and redo use the same path, also to restore a deleted block.
- **`Repository.put()`**: writes a complete record as it is (validated, timestamps untouched). Used by undo/redo,
  duplication and, later, import and sync.
- **Undo is per editing session**: entering Edit mode resets the history.
- **One undo step per gesture**: a drag works on a draft and becomes a single step on release; an entry's dialog, the
  title and other text boxes apply on confirm or when leaving the field.
- **Drag & drop** (dnd-kit): a dedicated handle (no accidental touches), touch, mouse and keyboard. Songs only compete
  with songs (and with the drop zone of empty blocks), blocks only with blocks. Dropping outside the list cancels the move.
- **Computed legend** (`core/legend.ts`): ♭ only if at least one entry has an effective non-standard tuning (the
  night's override, otherwise the song's); only the singers in use, in band order; ↳ and ■ only if present. Entries with
  a missing song are ignored, as in the view.
- **Tuning format** (`TuningChip`, `core/tuning.ts`): an amber pill with uppercase notes separated by small amber dots,
  with typographic sharps and flats (`D ● G ● C ● F ● A ● D`), identical in the setlist, library and settings, whatever
  the text typed (`D-G-C-F-A-D`, `D A D G B E`, `eb ab…`). The stored text does not change; if it is not a list of notes
  it is shown as it is. Menus use the plain version (`D G C F A D`).
- **Duration totals**: ignore songs without a duration and, if any are missing, show "(partial)".
- **Deleting a setlist** deletes (softly) its blocks and entries in cascade, so its songs can be deleted again.
- **Duplicating** copies setlist, blocks and entries with new IDs, keeping the order; the title becomes "… (copy)".
- **New setlist**: opens straight in Edit mode, with an empty first block.
- **Tapping a song in the clean view**: opens the song edit form for now; in phase 4 it opens the song page.
- **Not covered by automated tests**: dragging with the pointer (jsdom cannot simulate it reliably). The move logic
  is covered by the `setlistOps` tests. To try by hand on iPhone, iPad and Mac.
- Removed `editMode` from the UI store: Edit mode is local state of the setlist page.

## Phase 3

- **The PDF is the browser's print**: an "Export PDF" button (clean view only) → page `/setlist/:id/print`, without the
  navigation bar, with an A4 preview and "Print / Save as PDF" (`window.print()`). `@page { size: A4; margin: 0 }`,
  `print-color-adjust: exact`. The page title becomes the suggested file name ("Title date").
- **Real pages, as in the original design mock-up** (`print.css`): each page is an A4 `div` with the 6 mm dark strip and the 1.2 mm
  gradient, and `break-after: page`. In the mock-up blocks were assigned to the two pages by hand; here the split is
  automatic (`core/paginate.ts`, pure and tested):
  1. a block that fits in the remaining space stays there;
  2. otherwise, if it fits whole on a new page, it goes there (breaks fall between blocks, as in the mock-up);
  3. only a block taller than a page is split, between songs (a song and its transition are never separated), and each
     continuation repeats the heading with "cont.".
- **Measure before paginating**: heights are measured in an off-screen copy with the same fonts and width (175 mm),
  after the fonts have loaded (`document.fonts.ready`). A 2 mm safety margin at the bottom of each page.
  The measuring copy is `display: none` in print: invisible but tall, it used to add a blank page (found by trying the real PDF).
- **"Mobile" rules only in `@media screen`**: on a narrow screen the A4 pages are scaled to fit (`transform`), not
  reflowed, so preview and print look the same and paginate the same. No `max-width` in print.
- **One graphic source**: header, block title and song row (`PosterHeader`, `PosterBlockHeading`, `PosterRow` in
  `setlistParts.tsx`) are used by the on-screen view, the preview and the PDF. The legend comes from the same pure function.
- **Tuning in the PDF**: uses the format chosen in phase 2 (amber pill with dotted notes), not the mock-up's rectangle,
  for consistency with the app.
- **Verification**: besides the tests (`paginate`, preview in jsdom), the real PDF was generated with headless Chromium and
  checked page by page as images: 2 A4 pages for the example setlist, and 4 for a test with a 27-song block. jsdom has no
  layout engine, so this check is not automated in the project. To retry on Safari/iPad.

## Phase 4

- **Song page outside the navigation bar**: `/song/:id` (from the library) and `/setlist/:id/song/:entry` (from a setlist
  row). It uses the whole screen; from a setlist it shows the position ("3 of 22"), the notes and **the night's** tuning,
  the transition to the next song and a "Next: …" button. From the library a tap opens the song page; "Edit" goes to the
  form, which returns to where it was opened from on save.
- **ChordSheetJS only to read ChordPro** (`core/chordpro.ts`): sections, comments, tabs, abbreviations (`{soc}`), chords
  with a bass note. The parser throws on half-written text (`[Am` without a closing bracket): the editor lets you type
  like that, so reading never throws and an unreadable line is shown as plain text (line by line).
- **Chord detection, transposition and the converter are our own** (`core/chords.ts`, `core/chordsOverWords.ts`), not
  ChordSheetJS's, for two reasons found by trying the library: its "chords over words" converter mistakes words for chords
  (solfège: "La la la" became `[La][undefined]`, a real risk with Italian lyrics) and its transposition always uses sharps.
  Our recognition only accepts notes A–G with known qualities: "Bad", "Face", "Do/Re/Mi" are not chords. Dedicated tests.
- **Sharps or flats by key**: after transposing, the natural spelling of the new key is chosen (G +1 in D♭ major gives A♭,
  in E major G♯); with no key it is deduced from the first chord. At zero semitones the chords are not rewritten.
- **Capo**: the song's key is that of the chords as written, i.e. of the positions with the capo saved on the song. Moving
  the capo changes the shown positions (not the sound); transposing changes the sound. Applied to the chords:
  `transposition − (capo − saved capo)`. The transposition is not saved: it resets when the song changes.
- **Text size and scroll speed** are remembered between songs (persisted UI state).
- **Auto-scroll**: `requestAnimationFrame` accumulating fractional pixels (iOS rounds offsets and low speeds would stall),
  stops by itself at the bottom, 10 levels from ~6 to ~124 px/s (`core/autoscroll.ts`).
- **Swipe** (`swipeDirection`): needs a horizontal gesture of at least 70 px and clearly more horizontal than vertical, so
  scrolling the page does not change song; two-finger gestures (zoom) are ignored. In PDF mode swipe is off (use ‹ › and
  the keyboard arrows; on Mac: ← → previous/next song, space starts/stops scrolling). Chord rows wrap instead of
  scrolling sideways, so no horizontal gesture conflicts.
- **PDF with pdf.js** (`react-pdf`): pages in vertical scroll scaled to the width, with no text layer or annotations.
  The worker is bundled with the app (not from a CDN) to work offline. The PDF loads from a `blob:` URL: pdf.js transfers
  buffers to the worker and, under StrictMode, would leave an empty copy.
- **`react-pdf` 10, not 11, and `pdfjs-dist` pinned to 5.4.296**: 11 uses `React.use`, which only exists in React 19 (the
  project is on React 18) and broke when opening a PDF, which the tests could not see because the viewer is
  replaced in jsdom. `pdfjs-dist` is an explicit dependency, at the version `react-pdf` requires, because with pnpm it is
  not reachable from `react-pdf` for the worker import.
- **Packages loaded on demand**: the song page (with ChordSheetJS, ~99 KB gzipped), the PDF viewer (~124 KB) and the pdf.js
  worker (~1 MB) do not weigh on app start; phase 5 caches all of them for offline use.
- **A defect found only in a real browser** (and covered by a regression test): in recent Chrome `window.scrollTo()`
  returns a Promise; `useEffect(() => window.scrollTo(0, 0))` handed it to React as a cleanup function and the page went
  blank when the song changed. Effects now always have a braced body.
- **Converter in the song form** ("Convert chords over words…"): paste the text, see the resulting ChordPro at once, and
  replace the text or append to it. Section labels ("Verse 1", "[Chorus]", "Strofa", "Ritornello"…) become comments;
  chord-only lines (intros, solos) become `[Am] [F] …`; brackets in lyrics are protected.
- **Verification**: besides the tests, tried in Chromium (phone 390×844): form with an attached PDF, transposition,
  auto-scroll starting and stopping, PDF drawn by pdf.js, swipe with real touches in both directions, no horizontal
  scrolling and no console errors. To try on Safari/iPhone/iPad.
- **Not included**: non-embedded standard fonts in PDFs (pdf.js substitutes them), per-song remembered transposition.

## Phase 5

- **PWA with `vite-plugin-pwa`** (Workbox, `generateSW`): manifest (standalone, theme `#1B2038`, 192/512 and "maskable"
  icons, `apple-touch-icon`), and a cache of everything needed on the first visit, including on-demand packages (song
  page, PDF viewer) and the pdf.js worker. Any route opened offline gets the app (`navigateFallback`). `workbox-window`
  is an explicit dependency because `virtual:pwa-register` requires it and with pnpm it is not reachable otherwise.
- **"On request" updates** (`registerType: 'prompt'`): a new version waits for the user to tap "Reload"; it never replaces
  the app by itself, so it does not change under a live show. Not shown in stage mode. *The notice is tested; the real
  switch between two service worker versions is not.*
- **Icons**: drawn in the poster's style (dark background, gradient strip, three rows with the badges) and rendered to PNG;
  the "maskable" version is full-bleed because the system applies its own mask.
- **iOS**: `apple-mobile-web-app-capable` and title; the status bar is left at the default (with `black-translucent` the
  white clock text would vanish on light pages).
- **Persistent storage** (`lib/storagePersistence.ts`): at start `navigator.storage.persist()` is called; if it is not
  granted (or not supported) a notice explains that the browser may delete the data and suggests adding the app to the
  Home Screen and making backups. Settings shows the status and the space used, and lets you ask again.
- **Backup** (`core/backup.ts`): a single JSON `{format, version, exportedAt, data}` with all live records (not the
  soft-deleted ones) and the PDFs in base64. On import every record goes through the same Zod schemas as real data; a
  non-JSON file, one of another format, from a newer version or damaged is refused with a message, touching nothing.
  Version 1: future files must stay readable.
- **Atomic restore** (`BulkStore.replaceAll`): the file is validated *first*, then replaced in a single Dexie
  transaction, so an error leaves the data as it was. Restore **replaces everything**: a summary is shown (songs,
  setlists, PDFs, date), confirmation is asked and "Save current data first" is offered. Then the app reloads.
- **Saving the file** (`lib/saveFile.ts`): on touch devices with file sharing (iPhone/iPad) the share sheet opens
  ("Save to Files"), because a plain download inside an installed iOS app is unreliable; elsewhere it is a download. If
  sharing is refused it falls back to a download; if the user cancels, it does not count as a backup.
- **Backup reminder**: after 14 days from the last backup (or from first use, if there never was one) a notice appears
  with "Back up" and "Later" (snoozes 3 days). Pure logic in `backupReminderDue`.
- **Delete all data**: two confirmations, then the app restarts from the example setlist.
- **Dark theme and stage mode**: colors are "semantic" CSS variables (`paper`, `ink`, `soft`, `line`, `surface`, `io`,
  `lei`, `chord`) that change with the `dark` class; bars and strip (`chrome`) stay dark in both themes. The PDF print
  preview forces light colors (`.force-light`). The class is applied by a script in `index.html` before the first paint
  (no light flash).
- **Stage mode** (persistent setting, even after a restart): always dark, 28 px text (its own size, separate from the
  everyday one), edit and export buttons hidden, no notices, screen always on, and no navigation bar on the setlist. It
  is switched on and off from the song page, the setlist and Settings; Home, library and Settings keep the bar, so there
  is always a way out.
- **Screen always on** (`useWakeLock`): Screen Wake Lock in stage mode and while auto-scroll runs; it resumes when the app
  returns to the foreground (the browser releases it when the page is hidden). If the browser refuses or does not support
  it, the song page says so ("The screen may turn off"), instead of leaving the surprise for the stage.
- **Defects found only by trying in a real browser**: the "hidden" navigation bar using the `hidden` attribute stayed
  visible because Tailwind's `flex` class overrides the attribute (a class is used now); headings uppercased by CSS make
  `innerText` uppercase (only a problem of the test script).
- **Verification**: besides the tests, in Chromium (390×844) with the server **really stopped**: the app reopens offline
  (also on a deep route), the song page, the PDF viewer and its worker (never loaded before) come from the cache, and
  backup, delete-all and restore from file work with no network; installability with no errors
  (`Page.getInstallabilityErrors`), no failed requests or console errors.
  *To do by hand:* installing on iPhone/iPad, real airplane mode, real Wake Lock (headless Chromium refuses it), the iOS
  share sheet, `storage.persist()` on Safari.
- **Deployment additions**: `public/_redirects` (Cloudflare Pages, Netlify), so every unknown route returns
  `index.html`. (A `vercel.json` with the same rewrite was removed later: the app is hosted on Netlify.)

## Phase 6 — Sharing and sync (Supabase)

- **Still local-first**: data always lives on the device (Dexie); the cloud is an optional add-on. Without
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` the app is identical to phase 5 and the sharing section says so. The
  Supabase library loads **only when needed** (a separate chunk, ~55 KB gzipped), so it does not weigh on people who do
  not share.
- **Roles** (chosen by the project owner): `creator` (the only one who invites, changes roles, removes members and revokes
  invitations; cannot leave), `editor`, `viewer`. Invitations **by link and by email**: the link is single-use, expires
  after 7 days and can be revoked; if tied to an address, only that address can accept it. The same `/join/:token` page
  serves both; "Send by email" opens the mail client with the link already in the text (no sending service to configure).
- **The server does not trust the client**: tables are read-only (RLS) and only for members; every write goes through
  `security definer` functions that check role and band (a viewer cannot write, a stranger cannot read). 19 tests on a
  real Postgres (PGlite) verify it.
- **A single `records` table** (band, kind, id, JSON, `updated_at`, `deleted_at`, `seq`): every kind of data syncs the
  same way and adding one needs no migration. `seq` (a server-side sequence number) is the cursor for "give me what is new".
- **Sync**: every local edit is written at once and queued (`outbox`, the latest version per record); the engine sends the
  queue in batches of 100 and reads news in batches of 500. Both directions are idempotent: a failure halfway just means
  "try again". **Last write wins, per record** (`updatedAt`); deletes are soft and travel like other records, so they do
  not come back. Damaged records received from the cloud are discarded (same Zod schemas as local data) and an id belonging
  to another band is never moved.
- **When it syncs**: at start, shortly after each edit (800 ms, so several edits travel together), when the network returns
  and when the app comes back to the foreground, and live through Supabase Realtime while open. Offline nothing bad
  happens: the queue waits.
- **Revoked access**: if the server answers "not authorized", the state becomes "revoked", a notice appears and the copy
  stays on the device as a local band (you can "keep a copy" or "leave").
- **Viewers**: the edit buttons on Home, Library, Setlist, Song and the Singers/Tunings sections of Settings are hidden, the
  new-song form and the setlist edit mode do not open even from a typed address, and the engine sends nothing. (This is
  only convenience: the real guard is the database, which refuses a viewer's writes.)
- **More than one band on a device**: after accepting an invitation the band joins the device next to the local one;
  "Bands on this device" in Settings chooses which one to show (`activeBandId`). Songs added to the library in a later
  release now have an id derived from the band (no longer fixed), so two bands on one device do not collide, and two devices
  of the same band produce the same id (no duplicates after syncing).
- **Not synced**: appearance settings, scroll speed and text sizes (personal
  to each device, on purpose).
- **Verification**: engine tests with two "devices" (sharing, joining, conflicts, offline, revocation, live, damaged
  records), UI tests with a fake server (share, invite, join, revoked link or link for another email, read-only viewer),
  and in real Chromium the build with a fake Supabase URL: the library loads on demand, sign-in with no network shows "No
  connection" and the invitation page asks to sign in. *To do by hand (needs a real Supabase project):* sign-up and email
  confirmation, sharing the band, inviting from an iPhone and accepting on a Mac, simultaneous edits, airplane mode and back
  online, removing a member.

## Phase 7 — Instrument parts

- **The plain text is always there.** A song keeps its `chordpro` field exactly as before and it is the "Text" tab; instruments
  only *add* charts. A band that never ticks an instrument sees no difference (no tab bar at all).
- **Data model**: `instrument` (band-scoped, `name`, `order`) and `part` (`songId`, `instrumentId`, `chordpro`, `notes`), plus
  `song.instrumentIds` (which instruments the song has). Both are new sync kinds, Dexie v4 and backup version 2 (a version 1
  file still loads: the new arrays default to empty).
- **Derived ids.** A part's id comes from band + song + instrument (`partId`), and the three default instruments (lead guitar,
  rhythm guitar, bass) get ids derived from band + a fixed key, like the library songs. Two devices that create the same part
  or the same default therefore write the *same* record (last write wins) instead of making duplicates, and a deleted default
  stays deleted. Their names are seeded in the language of the app at that moment, and are ordinary editable data afterwards.
- **Editable list.** Settings → Instruments adds, renames and deletes instruments (suggestions: piano, keyboards, drums…).
  Deleting one used by a song is refused, like singers and tunings. Unticking an instrument on a song and saving removes its part.
- **"The instrument I play"** is kept on the account when the band is synced and the person is signed in
  (`members.instrument_id`, set with `set_my_instrument`, read with `my_instrument`; viewers can set it too, it is their own
  preference, not band data), so it follows them across devices. It is mirrored in the local UI store per band, which is also the
  only copy for a local band or when offline; a choice made offline is pushed the next time the band opens. A song opens on the
  tab of that instrument when the song has it, otherwise on Text.
- **Migration** `0002_instruments.sql` widens the `records.kind` check and adds the member column and the two functions. The
  PGlite test harness now applies every migration in order.

### Phase 7b — PDFs per part, and the phone layout

- **Several PDFs per part.** A PDF is now tied to its song and, optionally, to an instrument (`songId`, `instrumentId` on the
  stored file; none = the plain text). `song.pdfBlobId` is no longer written (it stays in the schema so old data and other
  devices still parse). Dexie v5 indexes files by song and tags the existing ones from the songs that pointed at them; a backup
  from before (version 1 or 2) is tagged the same way when it is read. Backups are now version 3.
- **Form**: the text and each ticked instrument have their own list with "Add PDF" (several files at once) and "Remove".
  Unticking an instrument removes its part text *and* its PDFs on save, like singers and tunings that cannot linger unseen.
- **Song page**: one PDF opens directly; with more than one, a select under the toggle chooses (remembered per part while the
  page is open). Chords/PDF mode is per part too. An instrument with only PDFs and no chart text still gets its entry.
- **Phone layout**: singers, Stage mode and the part selector share one line, and the part choice is a select ("Only text" plus
  the instruments) instead of a tab bar, so the chart starts higher. Facts, tuning and the chords/PDF switch stay above it.
- **PDFs sync in phase 8** (below).

## Phase 8 — PDFs in the cloud (Supabase Storage)

- **Two things travel, separately.** The *description* of a PDF is a new synced record kind, `attachment` (song, optional
  instrument, name, size…), with soft delete, last-write-wins and realtime like everything else. The *bytes* go to a private
  Storage bucket, `pdfs`, as one object per PDF at `<band id>/<attachment id>`; the id never changes, so an object is never
  renamed. Locally the bytes stay in `files`, which is now only the byte store (`uploaded` marks what the cloud already has).
- **Order inside a sync round**: send records, read records, then move bytes: upload the PDFs the cloud lacks (not for
  viewers), then download the ones this device lacks. So a bandmate's description may show up before its bytes; the song
  page then says "has not reached this device yet" with a "Download now" button, and the next round fetches it. Prefetching on
  every sync is deliberate: a chart must open on stage with no signal.
- **Removal**: removing a PDF soft-deletes its attachment and deletes its bytes locally; when that record is sent, the object is
  deleted from Storage (best effort; an orphan object is harmless and only takes space). Receiving a removal deletes the bytes.
- **Rules** (migration `0003`, same as the data): any member reads; only the creator and editors add, replace or delete;
  viewers and strangers get nothing; a path whose first folder is not a band id is refused. The bucket is private, PDF-only
  and 25 MB per file (above that the upload is refused and the band's sync shows an error). Tested on PGlite with a stub of
  the `storage` schema: the stub only has the two tables and RLS the policies need, so the real behaviour of the Storage API
  (upload with `upsert`, download, signed-in header) is **to try by hand** on a real project.
- **Upgrade of existing data**: Dexie v6 creates an attachment (same id as the file) for every PDF that belongs to a song
  and, if its band is already synced, queues it. Backups are now version 4 and carry the attachments; an older backup gets
  them made from its PDFs when it is read.
- **Known limits**: no progress bar for big files; a PDF is uploaded whole (no resume); two devices that both add a PDF while
  offline simply end up with both (distinct ids), which is what you want.

## Phase 9 — The song form, part by part

- **One part on screen at a time.** With text, several instruments and several PDFs per part, the form had become a long
  scroll where "Add PDF" sank below every open editor. It is now three cards: *The song* (title, key, tuning, singers),
  *Charts* and *Tags and notes*. In *Charts* a tab bar has "Text" (always there) and one tab per instrument of the song; each
  tab holds its own text editor, "convert chords over words", its PDFs and (for instruments) "Remove this part".
- **Adding an instrument** is a select next to the tabs (only instruments the song does not have yet); it opens the new tab.
  Removing a part that has text or PDFs asks first; nothing is deleted before "Save", as before.
- **Tabs** for lead and bass are plain ChordPro: `{start_of_tab}` … `{end_of_tab}` was already rendered in monospace.
- The save bar sticks to the bottom of the screen, so saving never needs a scroll.

## Phase 10 — Sticky notes in the text

- **A note is a ChordPro directive**, `{note: text}` or `{note_pink: text}` (yellow, pink, green, blue, orange). It lives in the
  song's text, so it syncs, backs up, prints and transposes with nothing new in the data model; a viewer sees it, an editor
  can still change it as plain text. Unknown directives were already ignored, so older copies of the app just do not show it.
- **Writing one**: "Add note" in the Charts card opens a small panel (colour, text up to 160 characters). The note goes on its
  own line above the line the cursor is on, and the cursor ends after it. Braces and line breaks are stripped from the text.
- **Look**: paper in a pastel colour with a strip of tape, a folded corner, a light shadow and a slight tilt that alternates;
  handwriting-style font where the device has one (Bradley Hand, Segoe Print…) and a cursive fallback. No web font on purpose:
  the app must work offline. Text stays dark on the coloured paper in the dark theme and in stage mode.
- Notes are per part: each tab has its own text, so a bass note stays on the bass chart.
- "Bookmarks for rehearsal" are these notes: a marker where something must be remembered. A jump list may come later.

## Phase 11 — Stage view and sober motion

- **Stage**: in stage mode chords become bold chips, sections get more space and the line height grows. The "next song" button
  moved from the end of the text to the fixed bottom bar (bigger on stage), so it is always one tap away without scrolling.
- **Changes from bandmates** flash: `SyncStore.onRemoteApplied` reports the ids written by a sync, `dataRevision.flash` keeps them
  for 4 s, and `RemoteFlash` plays a soft amber wash once over the library, home and setlist rows. Only remote writes flash, never
  your own edits.
- **Motion**: the "⋯" menu slides open, dragged setlist items settle with a short drop animation. Everything is disabled for
  people who prefer reduced motion (`motion-safe` / `prefers-reduced-motion`).

## Phase 12 — Metronome and reserve blocks

- **Metronome**: a "♩ tempo" button next to the part selector opens a small panel under the header. It starts at the song's tempo
  (100 if none), has −/+ 1 BPM, tap tempo (last 6 taps, a pause over 2 s restarts) and four beat lights; the first beat of each
  bar is higher. Clicks are scheduled on the Web Audio clock with a short look-ahead, so scrolling never makes it stagger. The
  BPM set here is not saved to the song; edit the song to change its tempo.
- **Reserve block**: `reserve` flag on a setlist block (default false, so old data and old backups need no migration; it syncs
  with the block). It is meant for encores and spare songs: dashed, muted card in the editor, a "Reserve" tag on the printed
  sheet, and its songs are left out of the song count and total duration.
- Bookmarks for rehearsal stay the sticky notes (phase 10).

## Phase 13 — Personal and band tabs on the home

- **Two kinds of band, shown as two tabs** on top of the setlists: "Personal" (the device's own band while it is only on this
  device) and the shared band (created here and shared, or joined with an invitation). Data is still per band: sharing a band
  shares all of its songs and setlists. A single setlist cannot be private inside a shared band.
- Personal = the oldest band of the device that is not shared. If every band is shared, the home creates an empty personal one
  (with the default instruments), so there is always a way back. With several shared bands the Band
  tab shows the active one with a ▾ and opens a small menu (slides open) to choose another.
- **Swipe** on the home (finger moves left): Personal → Band; once on Band, one more swipe opens the band menu; swiping right
  closes the menu or goes back to Personal. Tabs are hidden on a copy of the app without cloud settings and no shared band.
- Colours: teal (`io`) for Personal, violet (`coro`) for Band, on the site's neutral surfaces; icons (lock / people) carry the
  meaning too, not colour alone.
- Pure rule in `core/bandTabs.ts` (`groupBands`).
- **Bands of my account** (`CloudApi.myBands`): on sign-in the device adds every band the person belongs to and does not hold yet
  (made elsewhere, or added to the account), linked for reading, and learns the role. No invitation is needed for one's own bands.
- **Drag, not just swipe**: on a phone the home follows the finger. `useSwipeDrag` writes CSS variables (`--cx`, `--co`, `--drag`) on
  the page while the finger moves; the highlight under the tabs is positioned by `clamp(0, idx + drag, 1)`, so it moves 1:1 with the
  finger and settles on release. On a deliberate swipe the old content keeps sliding out and the new band's content comes in from
  the other side (`band-in-left/right`). Reduced motion removes the movement.

## Phase 14 — Bands page and safe deletion
- Settings no longer lists bands: it has one card linking to **Bands and account** (`/bands`). That page is the login (when signed
  out), then create a band, join with an invitation link or code, and the bands in three groups: **owned** (creator), **joined**
  (editor / viewer) and **only on this device**.
- `/bands/:bandId`: rename and notes (creator, or anyone for a local band), sync state, members and invitations, and a danger zone.
  Long notes are clamped to three lines and open in a popup (read for everyone, edit for the creator).
- **Deleting a shared band** (creator only) removes the setlists, songs, PDFs and members for everyone. The dialog shows the counts,
  offers a backup download, and enables the button only when the exact band name is typed. Members are not emailed (no mail
  server); the `notices` table gets one row per member and their app shows a banner until dismissed. On their device the band becomes
  a normal local copy. "Keep a copy here" lets the creator keep a local copy too. Members use **Leave** instead.
- Migration `0004_band_management.sql`: `bands.notes`, `update_band`, `delete_band`, `notices`, `dismiss_notice`.
- Duplicate "Personal" bands are prevented by a single-flight, database-checked `ensurePersonalBand`.

## Phase 15 — Drop-downs and a livelier home
- **`Select`** (`components/Select.tsx`) replaces all 15 native `<select>`. A combobox button opens a listbox in a portal: a popover that
  grows out of the field on desktop (flips upward near the bottom edge), a bottom sheet on phones (`max-width: 639px`). Arrows, Home/End,
  PageUp/Down, type-ahead, Enter/Space, Esc and Tab behave as in a native select; Esc does not close a dialog around it. More than 8
  options adds a search box. Options settle in with a short stagger and the tick pops in. Tests pick with `choose(label, value)`.
- **Home motion** is driven by CSS variables written by `hooks/useHomeMotion` (no React re-render while moving): `--sy/--sp` for the
  collapsing sticky title, the wave parallax and the floating button; an IntersectionObserver for the staggered entrance (`data-in`) and
  the card crossing the middle of the screen (`data-active`); pointer glow and a 2° tilt on `[data-fx]` cards (mouse only);
  a magnetic floating button (`useMagnetic`); pale colour washes behind the app that follow the mouse (`AmbientBackground`).
- **Cards, not rows**: a coloured edge (teal upcoming, pink today, grey past), singers as small badges, a **next gig** card with the
  countdown (`core/countdown.ts`), an animated empty state, a shimmering skeleton while loading, a press effect on cards.
- **Floating "New setlist"** is portalled to `body` (the swipe wrapper has a transform, which would break `position: fixed`).
- **Reduced motion** (`prefers-reduced-motion`) turns every hook off: no variables, no observers, nothing hidden before it enters.
- Not done: manual reordering of setlists (the home is ordered by date); a list-reflow animation (FLIP) when archiving or duplicating.

## Phase 16 — The song page and the song form
- **Song page**: the title folds and a reading bar fills (`--sp`, `--rd` from `useScrollProgress`); the facts are chips (the key chip
  opens the transposer, the tempo chip the metronome), singers show their names; the Chords / PDF switch is a sliding `Segmented`.
- **Sections** (`chartSections`): each label starts a section drawn with a coloured rule (verse teal, chorus violet, bridge pink).
  The one at reading height stays sharp and the others fade (IntersectionObserver, off with reduced motion); with three or more
  labelled sections the header shows jump chips that follow the reading. In stage mode the rule is thicker.
- **Bottom bar**: while you scroll down (or the page scrolls by itself) it sinks into a pill (play, speed, a way back) and returns
  on a scroll up or at the end of the song, where "next" is. The display controls got sliders (text size, speed).
- **Moving along a setlist** slides the new song in from its side (`state/songSlide`). A setlist card on the home flies its title
  to the setlist page with the View Transitions API (`lib/viewTransition`), where the browser has it.
- **PDF**: a pill with zoom (60–300%), fit and "page / pages".
- **Form**: a sticky step bar (follows the scroll, shows how much is filled in), cards with an icon, a key grid (writes the same text
  as the input), tap-tempo and a listening button next to the tempo, a duration slider, singers as colour chips, tags used before
  as chips, and a "Unsaved changes" light by the save button. Failed saves scroll to the first bad field, focus it and shake it.
- **ChordPro editor** (`ChordProEditor`): marks are coloured by a copy of the text drawn behind a see-through textarea (which grows
  with its text so the two always line up), buttons insert a section or a chord of the key (`diatonicChords`), a counter, and the
  sheet itself beside it (below a Write / Preview switch on a phone).
- Not done: a thumbnail of a PDF's first page and an upload progress bar (the files never leave the device while choosing).

## Phase 17 — Song editor fixes

- Sections are added from one dropdown (Intro, Verse, Pre-Chorus, Chorus, Bridge, Instrumental Break, Outro, Tab). `sectionOf` tests pre-chorus before chorus, since "prechorus" contains "chorus".
- `structureSections` turns heading lines (`[Verse 1]`, `Chorus:`, `**Bridge**`, `{comment: Solo}`, Italian names too) into `{start_of_x: Label}` blocks. It runs on a multi-line paste with at least two headings (with an Undo banner) and from a "Detect sections" button.
- Mobile: the editor grid uses `minmax(0,1fr)` so long content cannot widen the page; the display-controls panel has a close button, toggles from the key chip, and closes on an outside tap or a manual scroll.

## Phase 18 — Song library, tuning by strings

- **Reading line** (`lib/readingLine`): the block "being read" is the last one above a line a little over a third down the window. Near the end of the page the line slides to the bottom edge and it never slides before the page has been scrolled, so the first block of a short page and the last blocks of any page both light up. Used by the chord sheet and by the form's step bar.
- **Tuning** is chosen per song, one box per string (lowest on the left), from twelve notes; "+ String" adds low B and then low F♯. It always starts from standard. On save the notes are matched to a stored tuning (any spelling) or a new one is created with a known name ("Drop D") or its notes. A song keeps its stored tuning, even a free-text one, until its strings are touched. The tunings section of Settings and `TuningForm` are gone.
- **Library**: rows with a key disc, tempo/duration, compact tuning pill and singers; staggered entry (`useHomeMotion`), hover bar and press effect; letter groups with sticky headings and an A–Z rail on phones; search with highlighted matches; filters as chips (dark when on, with a count and a clear button); long-press or right-click opens a menu (open, edit, delete). Not done: adding a song to a setlist from the menu, a reorder animation when filtering.

## Phase 19 — Sections guessed without titles

- "Detect sections" first looks for headings (`structureSections`). With none, `guessSections` splits the text on blank lines: stanzas that come back (70% of their lines shared) are the chorus, the others verses; a short first stanza is the intro, a short last one the outro, a short one in between a bridge. The result is announced as a guess, can be undone, and the button's tooltip (and the banner) advise pasting the lyrics with titles.

## Phase 20 — One paste, chords and sections

- "Detect sections" and a multi-line paste now do both jobs: text with chords written above the words (`looksLikeChordsOverWords`: bare chord lines and no `[chord]` yet) is first turned into ChordPro, then split into sections by its titles (or guessed). Existing `{…}` lines pass through the converter untouched, so a song that was split earlier but never got its chords placed can be fixed by pressing the button. "Verso/Versi" are recognised as verse titles. The Convert dialog also splits sections now.

## Phase 21 — Chords stand out, tabs, no page-flight animation

- Text with chords above the words is converted when it is **read** (`parseChordPro`), so chords are always drawn as chords (bold, coloured, over their syllable) even in songs saved before the converter existed.
- **Tabs**: runs of three or more ASCII tab lines are drawn by `TabBlock` wherever they are (inside any section, or in a `{start_of_tab}`): one strip per staff, scrolling sideways instead of wrapping, fret numbers bold and coloured, dashes faded, bar lines and playing marks (h p b / ~) highlighted, an arrow when there is more to the right. The section menu offers "Tab (guitar)" and "Tab (bass)" with a blank staff of six or four strings. Lead and bass parts therefore read as tab rather than as lyrics.
- The View Transition fly-in (library → song, home → setlist) is removed: the browser froze the screen until the new page had loaded. `lib/viewTransition` is gone.
- **Band menu** (Home tabs): the opening animation capped the list at `max-height: 8rem`, so from the fourth band on it was cut off. The menu now grows from the tab, its rows come in one after the other, it scrolls past ~22rem and keeps "Manage bands" pinned at the bottom.

## Phase 22 — Copy a setlist to another band

- The setlist card menu has **Copy to…**: a dialog lists the personal space and every other band the person can edit (viewer bands are left out). `copySetlistToBand` writes a new setlist (same title, not archived) in the target with fresh ids and leaves the source untouched.
- What the setlist refers to is **reused when the target has it, created when it does not**: songs by title + artist, performers and instruments by name, tunings by their notes (standard maps to the target's standard). A new song brings lyrics/chords, notes, tags and the parts of its instruments. **PDFs are not copied** (their bytes live per band); the dialog says so. Copying twice makes two setlists but no duplicate songs.
- It works in both directions between personal and shared bands; shared targets sync through the normal outbox since every record is written through the repositories.

- **Dialogs on `<body>`**: `Modal` is portaled to `document.body`. Inside the swipeable home (a transformed ancestor) its `fixed` backdrop was positioned relative to that ancestor, so it dimmed only part of the screen and a tap outside did not close it. The copy dialog also got an explicit Close button.
- **Dialog layout**: `Modal` is a column capped at `min(92dvh, 46rem)`: title with a ✕ and an optional pinned `footer`, only the middle scrolls (no more overflowing the top, equal room above and below on phones and desktop).
- **Song picker**: every song is a toggle (`role="switch"`): a tap adds it to the block, a second tap removes it, so a song can no longer be added twice by accident (Undo covers a slip). A round check/plus with a small pop animation shows the state, "In setlist" marks songs living in another block, the footer counts the songs in the block and holds "New song" and "Done"; the search stays on top and "New song" starts from what was typed.

## Phase 23 — One tuning format, songs copied across bands

- **One format**: a tuning is its strings written as notes separated by spaces ("D A D G B E", ♯/♭ signs) and named after what it is (`nameForStrings`: Standard, Drop D, Half/Whole step down, otherwise the notes). `normalizeTunings` runs at start-up for every band on the device: it reads tunings typed any way ("EADGBE", "D-G-C-F-A-D"; `parseTuningNotes` now also understands notes with no separators), rewrites them in the canonical form, merges those with the same strings (a "custom" standard included) and repoints the songs and setlist items that used a duplicate. A setlist override equal to the song's own tuning is dropped. Free text that is not a list of notes is left alone. This is what made the library and the setlist disagree: the same tuning existed several times, and a setlist override silently shadowed what was set on the song.
- `tuningIdFor` is the single way to get the stored tuning for a set of strings (song form and setlist). The setlist's "Tuning for this setlist" is now the same string picker as the song's; changing it back to the song's own strings removes the override, and a button resets it.
- **Songs across bands/accounts**: the library menu (and a ⋯ button on every row) has "Copy to…": the song goes into the personal space or any band the person can edit, as that band's own copy (lyrics, chords, notes, tags, parts; not PDFs). A song with the same title and artist is left as it is. Since shared bands sync, this is also how a single song reaches another account. Setlist and song copies share one `copier`.

## Phase 24 — Long press in the library

- The row is `select-none`, `draggable={false}` and `-webkit-touch-callout: none`, so the phone's own long-press on a link (preview, drag, text selection) no longer competes with the song menu and stalls the page for a few seconds.
- The release of the finger that opened the menu used to land on the backdrop (closing the menu at once) or on an item under the finger: for 450 ms after it opens, clicks on the menu are swallowed.
- **Song peek** (replaces the dropdown menu): a long press (or right click) opens `SongPeek`, like holding a chat on a phone: blurred backdrop, the song as a card (title, artist, key/capo/duration/tempo, tuning pill, singers and the first lines of the lyrics fading out), and under it Open / Edit / Copy to… / Delete. A tap outside or Esc puts it away; the first 450 ms of clicks are swallowed so the release of the opening finger does nothing. A finger that moves more than 10 px is scrolling, not holding.
- **Long-press feel**: the hold threshold is 380 ms and, after 90 ms, the row sinks (`data-pressing`) so the wait already shows something happening; the peek's lyrics are parsed a frame after the card springs up; on phones the backdrop is a plain dim (blur only from `sm`), since blurring a whole screen while animating is costly on mobile GPUs. Measured with a 6× CPU slowdown the card is up ~540 ms after the touch, with two ~100 ms tasks.
