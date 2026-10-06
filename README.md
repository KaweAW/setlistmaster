# Scaletta

Personal, local-first PWA to manage live setlists and songs for a band (iPhone, iPad, Mac).
Stack: React 18 + TypeScript + Vite, Tailwind, Zustand, Dexie (IndexedDB), Zod, Vitest.

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # Vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint (also enforces the core/ and data/ boundaries)
pnpm build        # production build in dist/
```

On first run the app creates a local band and seeds the "Scaletta live" setlist
(titles and artists only, no lyrics or chords). Data lives in IndexedDB (`scaletta` database).
To start over: browser devtools > Application > IndexedDB > delete `scaletta`.

## Layout

- `src/core/` – pure domain logic (types, Zod schemas, ordering). No React, no browser APIs.
- `src/data/` – `repository.ts` (abstract interfaces) and `dexie/` (the only code that touches Dexie).
- `src/i18n/`, `src/state/`, `src/pages/`, `src/components/` – UI.

## Offline, install and backup

- The app is a PWA: after the first visit online it is cached in full (service worker) and works in airplane mode.
  Settings > "Data and offline" shows whether that has happened. New versions wait for a tap on "Reload"; they never
  replace the app on their own.
- iPhone/iPad: open the site in Safari > Share > Add to Home Screen. Mac: Safari > File > Add to Dock (or Chrome's install button).
- Settings > Backup saves one JSON file with everything (songs, setlists, PDFs) and restores it. Keep a copy outside the device.

## Publishing

Any static host with HTTPS works (Cloudflare Pages or Vercel): build command `pnpm build`,
output directory `dist`. HTTPS is required for the PWA features added in phase 5.
The site must be served over HTTPS and every unknown path must return `index.html` (single-page app):
`public/_redirects` does it on Cloudflare Pages and Netlify, `vercel.json` on Vercel.

## Sharing and sync (optional, phase 6)

The app is local-first: everything works offline and on one device with no account. Sharing a band is an add-on that
needs a free [Supabase](https://supabase.com) project. Without the two variables below the sharing section just says
it is not set up.

1. Create a Supabase project. In **SQL editor**, run `supabase/migrations/0001_cloud.sql` once.
2. **Authentication > Providers**: keep Email on. (Optional: turn off "Confirm email" if the band prefers no confirmation step.)
   **Authentication > URL configuration**: set Site URL to the address of the published app.
3. Copy the project URL and the `anon` key (Project settings > API) into `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (see `.env.example`; on the host, set them as environment variables and redeploy).
4. In the app: Settings > Sharing and sync > create an account > "Share this band". Then "Invite": by link (anyone with
   it can join, one use, 7 days) or for one email address (only that address can accept). Send the link by any chat or by email.

Roles: **creator** (founder: the only one who invites, changes roles, removes members and revokes invitations),
**editor** (changes songs and setlists), **viewer** (reads and plays; editing buttons are hidden).

What syncs: songs (with chords and notes), setlists, blocks, entries, singers and tunings. **PDFs do not sync yet**: they stay on
the device where they were added. Edits are saved locally first and sent when there is a connection; if two people edit the
same song, the later edit wins (per record). Run `pnpm test` to check the database rules too: they are tested on a real
Postgres (PGlite), including that a viewer or a stranger cannot write or read anything.
