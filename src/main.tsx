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
});
usePwaStore.setState({ applyUpdate: () => void updateServiceWorker(true) });
