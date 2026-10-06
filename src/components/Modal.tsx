import { useEffect, type ReactNode } from 'react';

/** Bottom sheet on phones, centred dialog from sm up. Closes on Escape or a tap on the backdrop. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-chrome/60 motion-safe:animate-fade-in sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-paper p-5 shadow-xl motion-safe:animate-sheet-in sm:max-w-lg sm:rounded-2xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 font-display text-2xl font-bold uppercase leading-none tracking-wide">{title}</h2>
        {children}
      </div>
    </div>
  );
}
