import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { groupBands } from '../core/bandTabs';
import { useCloud } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { ensurePersonalBand } from '../data/bands';
import { useQuery } from '../hooks/useQuery';
import { useT } from '../i18n';
import { rememberSlide } from '../state/bandSlide';
import { useUiStore } from '../state/uiStore';

const Lock = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const People = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.7 3 2.4 3 5.2" />
  </svg>
);

/** What the home asks of the tabs: what a swipe would do (see useSwipeDrag), and to do it. */
export interface BandTabsHandle {
  allow: (direction: 'next' | 'previous') => 'follow' | 'trigger' | null;
  swipe: (direction: 'next' | 'previous') => void;
}

/**
 * "Personal | Band" tabs on top of the home. Personal is a band that lives only on this device; Band is a shared one.
 * With several shared bands the Band tab opens a small menu to choose between them. The highlight under the tabs follows
 * the finger while the home is dragged (CSS variables set by useSwipeDrag), and settles on release.
 */
export function BandTabs({ handleRef }: { handleRef?: MutableRefObject<BandTabsHandle | null> }) {
  const t = useT();
  const navigate = useNavigate();
  const { store, band } = useData();
  const cloud = useCloud();
  const setActive = useUiStore((s) => s.setActiveBandId);
  const language = useUiStore((s) => s.language);
  const bands = useQuery(() => store.bands.listAll(), [store, cloud.linked]);
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Signed out (the session is read from the device, so this also holds offline): shared bands are out of sight.
  const signedOut = cloud.configured && cloud.user === null;
  const { personal, shared } = groupBands(bands.data ?? [], cloud.linked, signedOut);
  const onShared = shared.some((b) => b.id === band.id);
  const hasSharedChoice = shared.length > 1;
  const both = !!personal && shared.length > 0;
  const index = onShared ? 1 : 0;

  // The personal space must always exist, even when the first band was shared: make an empty one.
  useEffect(() => {
    if (!cloud.configured || !bands.data || personal) return;
    void ensurePersonalBand(store, t('tabs.personal'), language).then((made) => made && bands.reload());
  }, [cloud.configured, bands, personal, store, t, language]);

  // Signing out while a shared band is open: go back to the personal space.
  useEffect(() => {
    if (signedOut && cloud.linked.has(band.id) && personal) setActive(personal.id);
  }, [signedOut, cloud.linked, band.id, personal, setActive]);

  const goShared = () => {
    if (onShared) return setMenu(hasSharedChoice ? !menu : false);
    const target = shared[0];
    if (target) { rememberSlide('right'); setActive(target.id); }
    else navigate('/bands'); // nothing shared yet: the bands page explains how to share or join
  };
  const goPersonal = () => { setMenu(false); if (personal && band.id !== personal.id) { rememberSlide('left'); setActive(personal.id); } };

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      allow: (direction) => {
        if (direction === 'next') return !onShared ? (shared.length > 0 ? 'follow' : null) : hasSharedChoice ? 'trigger' : null;
        return menu ? 'trigger' : onShared && personal ? 'follow' : null;
      },
      swipe: (direction) => {
        if (direction === 'next') {
          if (!onShared) goShared();
          else if (hasSharedChoice) setMenu(true);
        } else if (menu) setMenu(false);
        else if (onShared && personal) goPersonal();
      },
    };
    return () => { handleRef.current = null; };
  });

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  // Nothing to tell apart on a device that cannot share and has no shared band.
  if (!cloud.configured && shared.length === 0) return null;

  const tab = 'relative z-10 flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors';
  return (
    <div ref={wrap} className="relative mb-4">
      <div role="tablist" aria-label={t('tabs.label')} className="relative flex rounded-lg bg-line/40 p-1">
        {both && (
          <span
            aria-hidden
            className="swipe-pill absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md border border-line bg-surface shadow-sm"
            style={{ '--idx': index } as React.CSSProperties}
          />
        )}
        {personal && (
          <button
            type="button"
            role="tab"
            aria-selected={band.id === personal.id}
            onClick={goPersonal}
            className={`${tab} ${band.id === personal.id ? 'text-io' : 'text-soft'}`}
          >
            <Lock /> {t('tabs.personal')}
          </button>
        )}
        {(shared.length > 0 || cloud.configured) && (
          <button
            type="button"
            role="tab"
            aria-selected={onShared}
            aria-haspopup={hasSharedChoice ? 'menu' : undefined}
            aria-expanded={hasSharedChoice ? menu : undefined}
            onClick={goShared}
            className={`${tab} ${onShared ? 'text-coro' : 'text-soft'}`}
          >
            <People />
            <span className="truncate">{onShared ? band.name : shared[0]?.name ?? t('tabs.band')}</span>
            {hasSharedChoice && <span aria-hidden className={`transition-transform ${menu ? 'rotate-180' : ''}`}>▾</span>}
          </button>
        )}
      </div>

      {menu && (
        <ul role="menu" className="band-menu absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-line bg-surface p-1 shadow-lg">
          {shared.map((b, i) => (
            <li key={b.id} role="none" style={{ '--i': i } as CSSProperties}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={b.id === band.id}
                onClick={() => { setMenu(false); if (b.id !== band.id) { rememberSlide('right'); setActive(b.id); } }}
                className="flex h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm font-semibold hover:bg-line/40"
              >
                <span className="truncate">{b.name}</span>
                {b.id === band.id && <span aria-hidden className="text-coro">✓</span>}
              </button>
            </li>
          ))}
          <li role="none" style={{ '--i': shared.length } as CSSProperties} className="sticky bottom-0 border-t border-line bg-surface pt-1">
            <button type="button" role="menuitem" onClick={() => { setMenu(false); navigate('/bands'); }} className="flex h-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-io hover:bg-line/40">
              {t('bands.manage')} →
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
