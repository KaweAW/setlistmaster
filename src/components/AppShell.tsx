import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import { useT, type MessageKey } from '../i18n';
import { useUiStore } from '../state/uiStore';
import { NoticeBar } from './NoticeBar';

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);

const LINKS: { to: string; key: MessageKey; end?: boolean; icon: ReactNode }[] = [
  { to: '/', key: 'nav.setlists', end: true, icon: icon(<path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" />) },
  { to: '/library', key: 'nav.library', icon: icon(<><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>) },
  { to: '/settings', key: 'nav.settings', icon: icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>) },
];

/** Phone: bottom navigation. md and up: dark side bar with the pink-violet-teal strip, as in the prototype. */
export default function AppShell() {
  const t = useT();
  const stage = useUiStore((s) => s.stageMode);
  const { pathname } = useLocation();
  // On stage, the setlist on the music stand has no navigation bar to hit by accident (it keeps its own
  // back and exit buttons). The other screens keep it, so there is always a way back to the settings.
  const onSetlist = useMatch('/setlist/:setlistId') !== null; // a hook: always called, never inside a condition
  const hideNav = stage && onSetlist;
  return (
    <div className={`min-h-screen ${hideNav ? '' : 'md:pl-56'}`}>
      <aside className={`fixed inset-y-0 left-0 hidden w-56 flex-col bg-chrome text-white ${hideNav ? '' : 'md:flex'}`}>
        <span aria-hidden className="absolute inset-y-0 right-0 w-[5px] bg-gradient-to-b from-lei via-coro to-io" />
        <div className="px-6 pb-6 pt-8 font-display text-3xl font-bold uppercase leading-none tracking-wide">
          {t('app.name')}
        </div>
        <nav className="flex flex-col gap-1 px-3 pr-4">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded-md px-3 text-base font-semibold ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {l.icon}
              {t(l.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="pb-24 md:pb-10">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 empty:hidden">
          <NoticeBar />
        </div>
        {/* A short fade when the screen changes. Keyed by path: the page underneath starts fresh, as it did before. */}
        <div key={pathname} className="motion-safe:animate-rise-in">
          <Outlet />
        </div>
      </div>

      {/* A class, not the `hidden` attribute: Tailwind's display utilities override the attribute. */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-10 bg-chrome text-white md:hidden ${hideNav ? 'hidden' : 'flex'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                isActive ? 'text-white' : 'text-white/55'
              }`
            }
          >
            {l.icon}
            {t(l.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
