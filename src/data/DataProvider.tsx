import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Band } from '../core/types';
import { useT } from '../i18n';
import { useUiStore } from '../state/uiStore';
import { useStorageStore } from '../state/storageStore';
import { bootstrap } from './bootstrap';
import { store as defaultStore } from './index';
import type { DataStore } from './repository';

interface DataContextValue {
  store: DataStore;
  band: Band;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Opens the store, runs first-run setup, and only then renders the app. */
export function DataProvider({
  store = defaultStore,
  children,
}: {
  store?: DataStore;
  children: ReactNode;
}) {
  const t = useT();
  const activeBandId = useUiStore((s) => s.activeBandId);
  const [state, setState] = useState<{ band?: Band; failed?: boolean }>({});

  useEffect(() => {
    let cancelled = false;
    bootstrap(store, undefined, activeBandId)
      .then((band) => {
        if (!cancelled) setState({ band });
        void useStorageStore.getState().check(); // ask the browser to keep our data (see NoticeBar)
      })
      .catch(() => {
        if (!cancelled) setState({ failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [store, activeBandId]);

  if (state.failed) return <p className="p-6 text-lei">{t('app.error')}</p>;
  if (!state.band) return <p className="p-6 text-soft">{t('app.loading')}</p>;
  return <DataContext.Provider value={{ store, band: state.band }}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside <DataProvider>');
  return value;
}
