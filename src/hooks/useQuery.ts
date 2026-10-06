import { useEffect, useState } from 'react';
import { useDataRevision } from '../state/dataRevision';

interface QueryState<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
}

/** Tiny async loader: runs `fn` when `deps` change; `reload()` refetches without flashing the old data away. */
export function useQuery<T>(fn: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<QueryState<T>>({ loading: true });
  const [revision, setRevision] = useState(0);
  const remoteRevision = useDataRevision((s) => s.revision); // changes that arrived from the cloud

  useEffect(() => {
    let cancelled = false;
    fn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ error, loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision, remoteRevision]);

  return { ...state, reload: () => setRevision((r) => r + 1) };
}
