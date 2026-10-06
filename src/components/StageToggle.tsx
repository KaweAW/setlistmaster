import { useT } from '../i18n';
import { useUiStore } from '../state/uiStore';

const Spotlight = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" />
  </svg>
);

/** Switches stage mode on or off: a deliberate tap, in the part of the screen where it cannot be hit by accident. */
export function StageToggle() {
  const t = useT();
  const stage = useUiStore((s) => s.stageMode);
  const setStage = useUiStore((s) => s.setStageMode);
  return (
    <button
      type="button"
      aria-pressed={stage}
      onClick={() => setStage(!stage)}
      className={`inline-flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
        stage ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink'
      }`}
    >
      <Spotlight />
      {stage ? t('stage.exit') : t('stage.toggle')}
    </button>
  );
}
