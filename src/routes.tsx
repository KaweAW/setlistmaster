import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import BandPage from './pages/BandPage';
import BandsPage from './pages/BandsPage';
import LibraryPage from './pages/LibraryPage';
import HomePage from './pages/HomePage';
import JoinPage from './pages/JoinPage';
import SettingsPage from './pages/SettingsPage';
import SetlistPage from './pages/SetlistPage';
import SetlistPrintPage from './pages/SetlistPrintPage';
import SongFormPage from './pages/SongFormPage';

// The song page brings in the chord parser, so it loads on demand.
const SongPage = lazy(() => import('./pages/SongPage'));
const song = (
  <Suspense fallback={<p className="p-6 text-soft">…</p>}>
    <SongPage />
  </Suspense>
);

/** Routes grow per phase: Home (setlists), Library, Song, Settings. */
export default function AppRoutes() {
  return (
    <Routes>
      {/* The song page uses the whole screen: no navigation bar between the player and the music. */}
      <Route path="/song/:songId" element={song} />
      <Route path="/setlist/:setlistId/song/:itemId" element={song} />
      {/* The PDF preview has no app navigation: it must print as clean pages. */}
      <Route path="/setlist/:setlistId/print" element={<SetlistPrintPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/setlist/:setlistId" element={<SetlistPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/new" element={<SongFormPage />} />
        <Route path="/library/:songId" element={<SongFormPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/bands" element={<BandsPage />} />
        <Route path="/bands/:bandId" element={<BandPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
