import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '../i18n';

export type Theme = 'light' | 'dark';

/** UI-only state. Domain data lives in IndexedDB behind the repository, never here. */
interface UiState {
  language: Language;
  theme: Theme;
  /** The band shown (a device can hold more than one: its own and the ones it joined). null = the oldest. */
  activeBandId: string | null;
  /**
   * Stage mode: dark screen, larger text, screen kept awake, editing buttons hidden. Remembered across reloads
   * on purpose: if the app restarts mid-gig it must come back the way it was.
   */
  stageMode: boolean;
  /** Chord sheet text size in px (normal and stage mode keep their own), and auto-scroll speed level (1–10). */
  songFontSize: number;
  stageFontSize: number;
  scrollLevel: number;
  /** Backup bookkeeping (see backupReminderDue). */
  lastBackupAt: number | null;
  firstSeenAt: number | null;
  backupSnoozedUntil: number | null;
  /** The instrument I play (a song opens on its part). Mirrored on the account when signed in; this is the offline copy. */
  myInstruments: Record<string, string>;
  setMyInstrument: (bandId: string, instrumentId: string | null) => void;
  setActiveBandId: (id: string | null) => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setStageMode: (on: boolean) => void;
  setSongFontSize: (size: number) => void;
  setStageFontSize: (size: number) => void;
  setScrollLevel: (level: number) => void;
  markBackupDone: () => void;
  snoozeBackup: (until: number) => void;
}

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 56;
const clampSize = (size: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));

/** English until the person picks another language in Settings (the choice is then remembered). */
const defaultLanguage = (): Language => 'en';

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: defaultLanguage(),
      theme: 'light',
      activeBandId: null,
      stageMode: false,
      songFontSize: 20,
      stageFontSize: 28,
      scrollLevel: 3,
      lastBackupAt: null,
      firstSeenAt: null,
      backupSnoozedUntil: null,
      myInstruments: {},
      setMyInstrument: (bandId, instrumentId) =>
        set((s) => {
          const next = { ...s.myInstruments };
          if (instrumentId) next[bandId] = instrumentId;
          else delete next[bandId];
          return { myInstruments: next };
        }),
      setActiveBandId: (activeBandId) => set({ activeBandId }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setStageMode: (stageMode) => set({ stageMode }),
      setSongFontSize: (size) => set({ songFontSize: clampSize(size) }),
      setStageFontSize: (size) => set({ stageFontSize: clampSize(size) }),
      setScrollLevel: (level) => set({ scrollLevel: Math.min(10, Math.max(1, level)) }),
      markBackupDone: () => set({ lastBackupAt: Date.now(), backupSnoozedUntil: null }),
      snoozeBackup: (until) => set({ backupSnoozedUntil: until }),
    }),
    {
      name: 'scaletta-ui',
      partialize: (s) => ({
        language: s.language,
        theme: s.theme,
        activeBandId: s.activeBandId,
        myInstruments: s.myInstruments,
        stageMode: s.stageMode,
        songFontSize: s.songFontSize,
        stageFontSize: s.stageFontSize,
        scrollLevel: s.scrollLevel,
        lastBackupAt: s.lastBackupAt,
        firstSeenAt: s.firstSeenAt,
        backupSnoozedUntil: s.backupSnoozedUntil,
      }),
    },
  ),
);

/** The dark colours apply with the dark theme and always in stage mode. */
export const useIsDark = () => useUiStore((s) => s.theme === 'dark' || s.stageMode);
