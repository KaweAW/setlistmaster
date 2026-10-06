# Decisioni tecniche

## Fase 0

- **Package manager**: pnpm.
- **TypeScript 6**: typescript-eslint non supporta ancora TS 7, quindi `typescript` è fissato alla 6.
- **Zod come fonte dei tipi**: i tipi di dominio sono `z.infer` degli schemi in `core/schemas.ts`.
  Il repository valida in scrittura e in lettura.
- **Repository astratto** (`data/repository.ts`): la UI non importa mai Dexie (regola ESLint).
  Alla fase 6 si sostituisce l'implementazione in `data/index.ts`.
- **Cancellazione logica**: `remove()` imposta `deletedAt`; le letture escludono i record cancellati.
- **`bandId` su tutti i record** tranne `Band`, compresi `Block` e `SetlistItem`, per le policy RLS di Supabase.
- **`setlistId` anche su `SetlistItem`** (non previsto dal brief): permette di leggere tutta una scaletta
  con una sola query indicizzata. Va tenuto coerente con il blocco.
- **Timestamp** in millisecondi epoch (numeri); ID con `crypto.randomUUID()`.
- **Dexie schema v1**: indici su `bandId`, `setlistId`, `blockId`, `songId`. `deletedAt` non è indicizzato
  (i valori `undefined` non sono indicizzabili); si filtra in memoria. Le versioni si aggiungono, non si modificano.
- **Transizioni**: `transitionText` è testo semplice, con `**grassetto**` per i titoli (vedi `core/emphasis.ts`).
  Ambiguità del prototipo ("Stop netto oppure → attacco") → tipo `segue`, il resto nel testo.
- **Accordature del seed**: "Standard", "D-G-C-F-A-D", "Drop D" (D A D G B E), "D B D G B E".
  I nomi sono modificabili dall'utente. Nel seed l'accordatura è sul brano (`song.tuningId`), non sull'item.
- **Durate, tonalità, tempo**: vuoti nel seed. I totali in Home ignoreranno i brani senza durata.
- **i18n**: dizionario tipizzato senza dipendenze (`i18n/`), chiavi piatte; italiano e inglese.
- **Font**: inclusi localmente con `@fontsource` (Oswald, Source Sans 3, con sottoinsiemi cirillici),
  così funzionano offline e rendono "Спокойная ночь".
- **Dipendenze oltre l'elenco del brief**: `@fontsource/oswald`, `@fontsource/source-sans-3` (font locali),
  `fake-indexeddb` (test del repository), ESLint + `typescript-eslint` + `eslint-plugin-react-hooks`, Prettier.
- **Stato UI**: Zustand con `persist` (solo lingua e tema in localStorage). La modalità Modifica non viene
  mai ripristinata: l'app si apre sempre in vista sicura.

## Fase 1

- **Bootstrap a prova di concorrenza**: StrictMode esegue gli effetti due volte in sviluppo e, in Fase 0, poteva creare
  due band con due seed. Ora `bootstrap()` condivide una sola esecuzione; se esistono più band si usa la più vecchia.
  (Se in IndexedDB hai band duplicate della Fase 0 sono innocue, ma puoi ripulire cancellando il database `scaletta`.)
- **DataProvider**: apre lo store, esegue il bootstrap e fornisce `store` e `band` alle pagine (`useData()`).
  Accetta uno store iniettato, usato dai test di interfaccia.
- **PDF allegati**: tabella Dexie `files` (schema v2), contenuto salvato come `ArrayBuffer` (più affidabile dei Blob
  su Safari/iOS). Eliminazione fisica, non logica: sono dati binari che alla fase 6 andranno su uno storage separato.
- **Eliminazioni protette**: un brano usato in una scaletta, e una accordatura o un cantante in uso, non si possono
  eliminare (messaggio che spiega perché). Si potrà sbloccare in Fase 2, quando si potranno togliere i brani dalle scalette.
- **Accordatura creata al volo** dal form brano: viene salvata subito, anche se poi annulli il brano.
- **Ricerca**: senza distinzione di maiuscole, accenti e apostrofi curvi/dritti; tutte le parole devono comparire
  in titolo o artista (`core/songFilter.ts`).
- **Durata** inserita come `m:ss`; `0:00` e formati diversi sono rifiutati.
- **Badge del coro**: la forma "quadrato arrotondato" è legata al simbolo ∞ (nessun campo `shape` nel modello).
- **Navigazione**: barra in basso su telefono, barra laterale scura da `md` in su. Il tocco su un brano della libreria
  apre per ora il form di modifica; in Fase 4 aprirà la pagina brano.
- **Dipendenze di sviluppo aggiunte**: `jsdom` e `@testing-library/react` per i test di interfaccia.

## Fase 2

- **Ogni modifica è una funzione pura** `scaletta → scaletta` (`core/setlistOps.ts`): aggiungi/rinomina/sposta/elimina
  blocchi e brani, modifica una voce. Annulla/ripeti sono istantanee (`core/history.ts`, massimo 100 passi) e il
  salvataggio è la differenza tra due istantanee (`diffTree`), scritta subito in IndexedDB e in ordine
  (autosave, nessun tasto "Salva"). Annulla e ripeti usano lo stesso percorso, anche per ripristinare un blocco eliminato.
- **`Repository.put()`**: scrive un record completo così com'è (validato, senza toccare i timestamp). Serve ad
  annulla/ripeti, alla duplicazione e, più avanti, a importazione e sincronizzazione.
- **Annulla vale per la sessione di modifica**: entrando in Modifica la cronologia riparte da zero.
- **Un solo passo di annulla per gesto**: il trascinamento lavora su una bozza e diventa un unico passo al rilascio;
  il dialog di una voce, il titolo e le altre caselle di testo si applicano alla conferma o all'uscita dal campo.
- **Drag & drop** (dnd-kit): maniglia dedicata (nessun tocco accidentale), tocco, mouse e tastiera. I brani competono
  solo con i brani (e con la zona di rilascio dei blocchi vuoti), i blocchi solo con i blocchi. Rilasciare fuori
  dalla lista annulla lo spostamento.
- **Legenda calcolata** (`core/legend.ts`): ♭ solo se almeno una voce ha un'accordatura effettiva non standard
  (override della serata, altrimenti quella del brano); solo i cantanti usati, nell'ordine della band; ↳ e ■ solo se
  presenti. Le voci con brano mancante sono ignorate, come nella vista.
- **Formato dell'accordatura** (`TuningChip`, `core/tuning.ts`): pillola ambra con le note maiuscole separate da
  piccoli punti ambra, diesis e bemolle tipografici (`D ● G ● C ● F ● A ● D`), uguale in scaletta, libreria e
  impostazioni, qualunque sia il testo inserito (`D-G-C-F-A-D`, `D A D G B E`, `eb ab…`). Il testo salvato non cambia;
  se non è un elenco di note viene mostrato com'è. Nei menu si usa la versione semplice (`D G C F A D`).
- **Totali di durata**: ignorano i brani senza durata e, se ne mancano, mostrano "(parziale)".
- **Eliminare una scaletta** elimina in cascata (logicamente) blocchi e voci, così i suoi brani tornano eliminabili.
- **Duplicare** copia scaletta, blocchi e voci con nuovi ID, mantenendo l'ordine; il titolo diventa "… (copia)".
- **Nuova scaletta**: si apre già in Modifica, con un primo blocco vuoto.
- **Tocco su un brano in vista pulita**: apre per ora il form di modifica del brano; in Fase 4 aprirà la pagina brano.
- **Non coperto da test automatici**: il trascinamento con il puntatore (jsdom non lo simula in modo affidabile).
  La logica degli spostamenti è invece coperta dai test su `setlistOps`. Da provare a mano su iPhone, iPad e Mac.
- Rimossa dallo store UI la voce `editMode`: la modalità Modifica è uno stato locale della pagina scaletta.

## Fase 3

- **Il PDF è la stampa del browser**: pulsante "Esporta PDF" (solo nella vista pulita) → pagina `/setlist/:id/print`,
  senza barra di navigazione, con l'anteprima A4 e "Stampa / Salva come PDF" (`window.print()`). `@page { size: A4; margin: 0 }`,
  `print-color-adjust: exact`. Il titolo della pagina diventa il nome file proposto ("Titolo data").
- **Pagine vere, come nel prototipo** (`print.css`): ogni pagina è un `div` A4 con la striscia scura da 6 mm e il
  gradiente da 1,2 mm, e `break-after: page`. Nel prototipo i blocchi erano assegnati a mano alle due pagine; qui la
  suddivisione è automatica (`core/paginate.ts`, pura e testata):
  1. un blocco che entra nello spazio rimasto resta lì;
  2. altrimenti, se entra intero in una pagina nuova, ci va (le interruzioni cadono tra i blocchi, come nel prototipo);
  3. solo un blocco più alto di una pagina si spezza, tra un brano e l'altro (un brano e la sua transizione non si
     separano), e ogni continuazione ripete il titolo con "segue" / "cont.".
- **Misura prima di impaginare**: le altezze si misurano in una copia fuori schermo con gli stessi font e la stessa larghezza
  (175 mm), dopo il caricamento dei font (`document.fonts.ready`). Margine di sicurezza di 2 mm in fondo a ogni pagina.
  La copia di misura è `display: none` in stampa: invisibile ma alta, aggiungeva una pagina bianca (trovato provando il PDF vero).
- **Regole "mobile" solo in `@media screen`**: sullo schermo stretto le pagine A4 vengono scalate per entrare (`transform`),
  non riformattate, quindi anteprima e stampa hanno lo stesso aspetto e la stessa paginazione. Nessun `max-width` in stampa.
- **Una sola fonte grafica**: intestazione, titolo del blocco e riga del brano (`PosterHeader`, `PosterBlockHeading`,
  `PosterRow` in `setlistParts.tsx`) sono usati dalla vista a schermo, dall'anteprima e dal PDF. Legenda calcolata dalla stessa
  funzione pura.
- **Accordatura nel PDF**: usa il formato scelto in Fase 2 (pillola ambra con le note separate da puntini), non il
  rettangolo del prototipo, per coerenza con l'app.
- **Verifica**: oltre ai test (`paginate`, anteprima in jsdom), ho generato il PDF vero con un Chromium headless e controllato
  le pagine come immagini: 2 pagine A4 per la scaletta del prototipo, e 4 per una prova con un blocco di 27 brani. jsdom non ha
  un motore di layout, quindi questo controllo non è automatizzato nel progetto. Da riprovare su Safari/iPad.

## Fase 4

- **Pagina brano fuori dalla barra di navigazione**: `/song/:id` (dalla libreria) e `/setlist/:id/song/:voce` (da una riga di
  scaletta). Usa tutto lo schermo; dalla scaletta mostra la posizione ("3 di 22"), le note e l'accordatura **della serata**,
  la transizione verso il brano dopo e il pulsante "Prossimo: …". Dalla libreria un tocco apre la pagina brano; "Modifica"
  porta al form, che al salvataggio torna da dove era stato aperto.
- **ChordSheetJS solo per leggere il ChordPro** (`core/chordpro.ts`): sezioni, commenti, tablature, abbreviazioni (`{soc}`),
  accordi con basso. Il parser lancia eccezioni su testo a metà (`[Am` senza chiusura): l'editor permette di scrivere così,
  quindi la lettura non lancia mai e una riga illeggibile viene mostrata come testo semplice (riga per riga).
- **Rilevamento accordi, trasposizione e convertitore sono nostri** (`core/chords.ts`, `core/chordsOverWords.ts`), non quelli
  di ChordSheetJS, per due motivi trovati provando la libreria: il suo convertitore "accordi sopra le parole" scambia parole
  per accordi (solfeggio: "La la la" diventava `[La][undefined]`, un rischio concreto con testi italiani) e la sua
  trasposizione usa sempre i diesis. Il nostro riconoscimento accetta solo note A–G con qualità note: "Bad", "Face", "Do/Re/Mi"
  non sono accordi. Test dedicati.
- **Diesis o bemolli secondo la tonalità**: dopo la trasposizione si sceglie l'ortografia naturale della nuova tonalità
  (G +1 in Re♭ maggiore dà A♭, in Mi maggiore G♯); senza tonalità si deduce dal primo accordo. A zero semitoni gli accordi non
  vengono riscritti.
- **Capotasto**: la tonalità del brano è quella degli accordi come scritti, cioè delle posizioni con il capotasto salvato sul brano.
  Spostare il capotasto cambia le posizioni mostrate (non il suono); trasporre cambia il suono. Applicato agli accordi: `trasposizione
  − (capotasto − capotasto salvato)`. La trasposizione non viene salvata: si azzera quando si cambia brano.
- **Dimensione del testo e velocità di scroll** si ricordano tra un brano e l'altro (stato UI persistito).
- **Scroll automatico**: `requestAnimationFrame` con accumulo dei pixel frazionari (iOS arrotonda gli offset e le velocità basse si
  fermerebbero), si ferma da solo in fondo, 10 livelli da ~6 a ~124 px/s (`core/autoscroll.ts`).
- **Swipe** (`swipeDirection`): serve un gesto orizzontale di almeno 70 px e nettamente più orizzontale che verticale, quindi
  scorrere la pagina non cambia brano; i gesti a due dita (zoom) sono ignorati. In modalità PDF lo swipe è disattivato (lì si
  usano ‹ › e le frecce della tastiera; su Mac: ← → brano precedente/successivo, spazio avvia/ferma lo scroll). Le righe con
  accordi vanno a capo invece di scorrere di lato, così nessun gesto orizzontale entra in conflitto.
- **PDF con pdf.js** (`react-pdf`): pagine in scorrimento verticale scalate alla larghezza, senza livello di testo né annotazioni.
  Il worker è incluso nell'app (non da CDN) per funzionare offline. Il PDF si carica da un URL `blob:`: pdf.js trasferisce i buffer
  al worker e con StrictMode lascerebbe una copia vuota.
- **`react-pdf` 10, non 11, e `pdfjs-dist` 5.4.296 fissata**: la 11 usa `React.use`, che esiste solo in React 19 (il progetto è
  React 18 come da brief) e andava in crisi aprendo un PDF, cosa che i test non potevano vedere perché in jsdom il lettore è
  sostituito. `pdfjs-dist` è una dipendenza esplicita, con la versione richiesta da `react-pdf`, perché con pnpm non è raggiungibile
  da `react-pdf` per l'import del worker.
- **Pacchetti caricati su richiesta**: la pagina brano (con ChordSheetJS, ~99 KB compressi), il lettore PDF (~124 KB) e il worker
  di pdf.js (~1 MB) non pesano sull'avvio dell'app; la Fase 5 li metterà tutti in cache per l'uso offline.
- **Difetto trovato solo in un browser vero** (e coperto da un test di regressione): nelle versioni recenti di Chrome
  `window.scrollTo()` restituisce una Promise; `useEffect(() => window.scrollTo(0, 0))` la restituiva a React come funzione di
  pulizia e al cambio di brano la pagina diventava bianca. Gli effetti ora hanno sempre il corpo tra graffe.
- **Convertitore nel form brano** ("Converti accordi sopra le parole…"): incolla il testo, mostra subito il ChordPro risultante e
  permette di sostituire il testo o aggiungere in fondo. Le etichette di sezione ("Verse 1", "[Chorus]", "Strofa", "Ritornello"…)
  diventano commenti; le righe di soli accordi (intro, assoli) diventano `[Am] [F] …`; parentesi nei testi vengono protette.
- **Verifica**: oltre ai test, provato in Chromium (telefono 390×844): form con PDF allegato, trasposizione, scroll automatico che
  parte e si ferma, PDF disegnato da pdf.js, swipe con tocchi reali nelle due direzioni, nessuno scorrimento orizzontale e nessun
  errore in console. Da provare su Safari/iPhone/iPad (vedi sotto).
- **Non incluso**: font standard non incorporati nei PDF (pdf.js li sostituisce), modalità palco e schermo sempre acceso
  (Fase 5), tema scuro (Fase 5), trasposizione memorizzata per brano.

## Fase 5

- **PWA con `vite-plugin-pwa`** (Workbox, `generateSW`): manifest (standalone, tema `#1B2038`, icone 192/512 e "maskable", `apple-touch-icon`),
  e cache di tutto il necessario alla prima visita, compresi i pacchetti caricati su richiesta (pagina brano, lettore PDF) e il worker
  di pdf.js. Qualunque rotta aperta offline riceve l'app (`navigateFallback`). `workbox-window` è una dipendenza esplicita perché
  `virtual:pwa-register` la richiede e con pnpm non è raggiungibile altrimenti.
- **Aggiornamenti "su richiesta"** (`registerType: 'prompt'`): una nuova versione aspetta che l'utente tocchi "Ricarica"; non sostituisce mai
  l'app da sola, per non cambiarla sotto un concerto. Non si mostra in modalità palco. *L'avviso è testato, il passaggio reale tra due versioni
  del service worker no.*
- **Icone**: disegnate nello stile della locandina (fondo scuro, striscia sfumata, tre righe con i badge) e rese in PNG; la versione
  "maskable" è a tutta pagina perché il sistema applica la sua maschera.
- **iOS**: `apple-mobile-web-app-capable` e titolo; barra di stato lasciata al valore predefinito (con `black-translucent` il testo bianco
  dell'orologio sparirebbe sulle pagine chiare).
- **Archiviazione persistente** (`lib/storagePersistence.ts`): all'avvio si chiama `navigator.storage.persist()`; se non viene concessa (o non
  è supportata) un avviso spiega che il browser potrebbe cancellare i dati e suggerisce di aggiungere l'app alla Home e fare backup. In
  Impostazioni si vede lo stato, lo spazio usato e si può richiedere di nuovo.
- **Backup** (`core/backup.ts`): un solo JSON `{format, version, exportedAt, data}` con tutti i record vivi (non quelli cancellati logicamente)
  e i PDF in base64. In importazione ogni record passa dagli stessi schemi Zod dei dati veri; un file non JSON, di un altro formato, di una
  versione più recente o danneggiato viene rifiutato con un messaggio, senza toccare nulla. Versione 1: i file futuri dovranno restare leggibili.
- **Ripristino atomico** (`BulkStore.replaceAll`): il file si valida *prima*, poi la sostituzione avviene in una sola transazione Dexie, quindi un
  errore lascia i dati com'erano. Il ripristino **sostituisce tutto**: si mostra un riepilogo (brani, scalette, PDF, data), si chiede conferma e
  si offre "Salva prima i dati attuali". Poi l'app si ricarica.
- **Salvataggio del file** (`lib/saveFile.ts`): su dispositivi touch con la condivisione di file (iPhone/iPad) si apre il foglio di condivisione
  ("Salva su File"), perché un normale download dentro un'app installata su iOS non è affidabile; altrove è un download. Se la condivisione viene
  rifiutata si ripiega sul download; se l'utente annulla, non conta come backup.
- **Promemoria del backup**: dopo 14 giorni dall'ultimo backup (o dal primo uso, se non ce n'è mai stato) compare un avviso con "Fai backup" e "Più tardi"
  (rinvio di 3 giorni). Logica pura in `backupReminderDue`.
- **Cancella tutti i dati**: due conferme, poi l'app riparte dalla scaletta di esempio.
- **Tema scuro e modalità palco**: i colori sono variabili CSS "semantiche" (`paper`, `ink`, `soft`, `line`, `surface`, `io`, `lei`, `chord`) che
  cambiano con la classe `dark`; barre e striscia (`chrome`) restano scure in entrambi i temi. L'anteprima di stampa del PDF forza i colori chiari
  (`.force-light`). La classe si applica con uno script in `index.html` prima del primo disegno (niente lampo chiaro).
- **Modalità palco** (impostazione persistente, anche dopo un riavvio): sempre scura, testo a 28 px (dimensione propria, separata da quella
  di tutti i giorni), pulsanti di modifica e di esportazione nascosti, nessun avviso, schermo sempre acceso, e sulla scaletta niente barra di
  navigazione. Si accende e si spegne dalla pagina brano, dalla scaletta e dalle Impostazioni; la Home, la libreria e le Impostazioni
  mantengono la barra, così c'è sempre una via d'uscita.
- **Schermo sempre acceso** (`useWakeLock`): Screen Wake Lock in modalità palco e mentre lo scroll automatico è in corso; si riprende quando l'app
  torna in primo piano (il browser lo rilascia quando la pagina è nascosta). Se il browser lo rifiuta o non lo supporta, la pagina brano lo dice
  ("Lo schermo potrebbe spegnersi"), invece di lasciare la sorpresa sul palco.
- **Difetti trovati solo provando in un browser vero**: la barra di navigazione "nascosta" con l'attributo `hidden` restava visibile perché la
  classe `flex` di Tailwind prevale sull'attributo (ora si usa la classe); i titoli in maiuscolo via CSS rendono `innerText` in maiuscolo
  (solo un problema dello script di prova).
- **Verifica**: oltre ai test, in Chromium (390×844) con il server **fermato davvero**: l'app si riapre offline (anche su una rotta profonda), la
  pagina brano, il lettore PDF e il suo worker (mai caricati prima) arrivano dalla cache, e il backup, la cancellazione e il ripristino da
  file funzionano senza rete; installabilità senza errori (`Page.getInstallabilityErrors`), nessuna richiesta fallita né errore in console.
  *Da fare a mano:* installazione su iPhone/iPad, modalità aereo reale, Wake Lock reale (il Chromium senza schermo lo rifiuta), foglio di
  condivisione di iOS, `storage.persist()` su Safari.
- **Aggiunte al deploy**: `public/_redirects` (Cloudflare Pages, Netlify) e `vercel.json`, perché ogni rotta sconosciuta restituisca `index.html`.

## Fase 6 — Condivisione e sincronizzazione (Supabase)

- **Resta local-first**: i dati vivono sempre nel dispositivo (Dexie); il cloud è un'aggiunta facoltativa. Senza `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY` l'app è identica alla Fase 5 e la sezione "Condivisione" lo dice. La libreria Supabase si carica **solo se serve**
  (chunk separato, ~55 kB gzip), quindi non appesantisce chi non condivide.
- **Ruoli** (scelti da Kawe): `creator` (unico a invitare, cambiare ruoli, rimuovere membri, revocare inviti; non può uscire), `editor`,
  `viewer`. Inviti **sia per link sia per email**: il link è monouso, scade dopo 7 giorni, si può revocare; se è legato a un indirizzo, solo
  quell'indirizzo lo accetta. La stessa pagina `/join/:token` funziona per entrambi; "Invia per email" apre il client di posta con il link già
  nel testo (nessun servizio di invio da configurare).
- **Il server non si fida del client**: le tabelle sono in sola lettura (RLS) e solo per i membri; ogni scrittura passa da funzioni
  `security definer` che controllano ruolo e banda (un viewer non scrive, un estraneo non legge). 19 test su un Postgres vero (PGlite) lo verificano.
- **Un'unica tabella `records`** (banda, tipo, id, JSON, `updated_at`, `deleted_at`, `seq`): ogni tipo di dato si sincronizza allo stesso modo e
  aggiungerne uno non richiede migrazioni. `seq` (numero progressivo del server) fa da cursore per "dammi quello che è nuovo".
- **Sincronizzazione**: ogni modifica locale si scrive subito e finisce in una coda (`outbox`, l'ultima versione per record); il motore invia la coda a
  blocchi di 100 e legge le novità a blocchi di 500. Entrambe le direzioni sono idempotenti: un errore a metà significa solo "riprova". **Ultima scrittura
  vince, per record** (`updatedAt`); le eliminazioni sono "morbide" e viaggiano come gli altri record, così non risorgono. I record danneggiati
  ricevuti dal cloud vengono scartati (stessi schemi Zod dei dati locali) e un id appartenente a un'altra banda non viene mai spostato.
- **Quando si sincronizza**: all'avvio, poco dopo ogni modifica (800 ms, così più modifiche viaggiano insieme), al ritorno della rete e quando l'app
  torna in primo piano, e in tempo reale con Supabase Realtime mentre è aperta. Offline non succede nulla di male: la coda aspetta.
- **Accesso revocato**: se il server risponde "non autorizzato", lo stato diventa "revocato", compare l'avviso e la copia resta sul dispositivo
  come band locale (si può "tenere una copia" o "uscire").
- **Viewer**: i pulsanti di modifica di Home, Libreria, Scaletta e Brano sono nascosti e il motore non invia nulla. Limite noto: le sezioni
  Cantanti/Accordature delle Impostazioni non sono ancora bloccate (le modifiche resterebbero solo locali).
- **Più band sullo stesso dispositivo**: dopo aver accettato un invito la band entra nel dispositivo accanto a quella locale; "Band su questo
  dispositivo" nelle Impostazioni permette di scegliere quale mostrare (`activeBandId`). I brani aggiunti alla libreria in una versione successiva hanno
  ora un id derivato dalla band (non più fisso) così due band sullo stesso dispositivo non si scontrano, e due dispositivi della stessa band
  producono lo stesso id (nessun duplicato dopo la sincronizzazione).
- **Non sincronizzati (ancora)**: i PDF (andranno in Supabase Storage), le impostazioni di aspetto, i cursori di scroll e le dimensioni del testo
  (personali per dispositivo, di proposito).
- **Verifica**: test del motore con due "dispositivi" (condivisione, entrata, conflitti, offline, revoca, tempo reale, record danneggiati), test
  dell'interfaccia con un server finto (condividere, invitare, entrare, link revocato o per un'altra email, viewer in sola lettura), e in Chromium vero
  la build con un URL Supabase finto: la libreria si carica al bisogno, il login senza rete mostra "Nessuna connessione" e la pagina d'invito chiede
  l'accesso. *Da fare a mano (serve un progetto Supabase vero):* registrazione e conferma email, condividere la band, invitare da iPhone e accettare
  dal Mac, modifica contemporanea, aereo e ritorno online, revoca di un membro.
