import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import { CloudProvider } from './cloud/CloudProvider';
import { DataProvider } from './data/DataProvider';
import { usePwaStore } from './state/pwaStore';
import { useUiStore } from './state/uiStore';

// The backup reminder counts from the first use.
if (useUiStore.getState().firstSeenAt === null) useUiStore.setState({ firstSeenAt: Date.now() });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DataProvider>
        <CloudProvider>
          <App />
        </CloudProvider>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Service worker: offline cache. A new version only takes over when the user asks for it (see NoticeBar).
const updateServiceWorker = registerSW({
  onNeedRefresh: () => usePwaStore.setState({ needRefresh: true }),
  onOfflineReady: () => usePwaStore.setState({ offlineReady: true }),
  // A home-screen app that stays in the background is not reloaded, so the browser may not look for a new version for days:
  // look when the app comes back to the foreground and once an hour while it is open.
  onRegisteredSW: (_url, registration) => {
    if (!registration) return;
    const check = () => { if (navigator.onLine) void registration.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 60 * 60 * 1000);
  },
});
usePwaStore.setState({ applyUpdate: () => void updateServiceWorker(true) });
