import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

/**
 * Bottom sheet on phones, centred dialog from sm up. Closes on Escape, on the ✕ or on a tap on the backdrop.
 * The title and the optional `footer` stay put; only the content between them scrolls, so the dialog never grows
 * past the visible screen (`dvh` follows the phone's collapsing toolbars).
 */
export function Modal({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Pinned under the scrolling content (primary actions). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Rendered on <body>: inside a transformed ancestor (the swipeable home) `fixed` is relative to that ancestor, so the
  // backdrop would cover only part of the screen and a tap outside it would not reach it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-chrome/60 motion-safe:animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(92dvh,46rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-paper shadow-xl motion-safe:animate-sheet-in sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-mr-2 -mt-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-soft transition-colors hover:bg-line/50 active:bg-line"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && (
          <div
            className="border-t border-line bg-paper px-5 pt-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
