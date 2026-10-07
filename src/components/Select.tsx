import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { inputClass } from './ui';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** Accessible name; also the title of the sheet on phones. */
  label: string;
  /** Shown when `value` matches no option (e.g. an "add…" menu that never keeps a value). */
  placeholder?: string;
  className?: string;
  /** `dashed` is the quiet "+ add" look. */
  variant?: 'field' | 'compact' | 'dashed';
  /** A search box appears above this many options. */
  searchAbove?: number;
}

const SHEET_QUERY = '(max-width: 639px)';
const CLOSE_MS = 140;

const variantClass = {
  field: inputClass,
  compact: 'h-11 rounded-md border border-line bg-surface px-2 text-sm font-semibold text-ink',
  dashed: 'h-11 rounded-md border border-dashed border-line bg-surface px-2 text-sm font-semibold text-soft',
} as const;

function useSheet() {
  const [sheet, setSheet] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(SHEET_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(SHEET_QUERY);
    if (!mq) return;
    const on = () => setSheet(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return sheet;
}

/**
 * A drop-down that looks like the rest of the app instead of the system one: the list grows out of the field on desktop
 * and rises as a sheet on phones. Keyboard (arrows, Home/End, type to jump, Enter, Esc) and screen readers work as for a
 * native select; long lists get a search box.
 */
export function Select({ value, options, onChange, label, placeholder, className = '', variant = 'field', searchAbove = 8 }: Props) {
  const t = useT();
  const id = useId();
  const sheet = useSheet();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const typed = useRef({ text: '', at: 0 });

  const searchable = options.length > searchAbove;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const selected = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el || sheet) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    const width = Math.max(r.width, 200);
    setBox({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      maxHeight: Math.max(160, Math.min(up ? above : below, 340)),
    });
  }, [sheet]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  function show() {
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setClosing(false);
    setOpen(true);
  }
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = useCallback((refocus: boolean) => {
    setClosing(true);
    clearTimeout(timer.current);
    timer.current = +setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
    if (refocus) trigger.current?.focus();
  }, []);
  function pick(o: SelectOption) {
    hide(true);
    if (o.value !== value) onChange(o.value);
  }

  // Focus moves into the list so the arrow keys and Escape belong to it; the active row scrolls into view.
  useEffect(() => {
    if (!open) return;
    (searchable ? field.current : panel.current)?.focus({ preventScroll: true });
  }, [open, searchable]);
  useEffect(() => {
    if (open) panel.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  function onKey(e: React.KeyboardEvent) {
    const last = shown.length - 1;
    const move = (n: number) => { e.preventDefault(); setActive(Math.max(0, Math.min(last, n))); };
    switch (e.key) {
      case 'ArrowDown': return move(active + 1);
      case 'ArrowUp': return move(active - 1);
      case 'Home': return move(0);
      case 'End': return move(last);
      case 'PageDown': return move(active + 6);
      case 'PageUp': return move(active - 6);
      case 'Enter': {
        e.preventDefault();
        const o = shown[active];
        if (o) pick(o);
        return;
      }
      case ' ': {
        if (searchable) return; // a space belongs to the search box
        e.preventDefault();
        const o = shown[active];
        if (o) pick(o);
        return;
      }
      case 'Escape':
        e.preventDefault();
        e.nativeEvent.stopPropagation(); // a dialog around the field must not close with it
        hide(true);
        return;
      case 'Tab':
        hide(false);
        return;
    }
    if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at > 700 ? '' : typed.current.text) + e.key.toLowerCase(), at: now };
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  }

  const listId = `${id}-list`;
  const list = (
    <div
      ref={panel}
      tabIndex={-1}
      onKeyDown={onKey}
      className={
        sheet
          ? `fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl bg-paper shadow-xl outline-none ${closing ? 'select-sheet-out' : 'motion-safe:animate-sheet-in'}`
          : `fixed z-[70] overflow-hidden rounded-xl border border-line bg-surface shadow-xl outline-none ${closing ? 'select-pop-out' : 'select-pop-in'}`
      }
      style={
        sheet
          ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }
          : box
            ? { left: box.left, width: box.width, ...(box.top !== undefined ? { top: box.top } : { bottom: box.bottom }), transformOrigin: box.top !== undefined ? 'top' : 'bottom' }
            : { visibility: 'hidden' }
      }
    >
      {sheet && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" aria-hidden />}
      {sheet && <p className="px-5 pb-1 pt-3 font-display text-lg font-bold uppercase tracking-wide">{label}</p>}
      {searchable && (
        <div className="border-b border-line p-2">
          <input
            ref={field}
            type="search"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
            aria-label={t('select.search')}
            placeholder={t('select.search')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            className="h-10 w-full rounded-md border border-line bg-paper px-3 text-base text-ink focus:border-io focus:outline-none focus:ring-2 focus:ring-io/30"
          />
        </div>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        aria-activedescendant={!searchable && shown[active] ? `${id}-${active}` : undefined}
        className="overflow-y-auto py-1"
        style={{ maxHeight: sheet ? '55vh' : box ? Math.max(120, box.maxHeight - (searchable ? 56 : 0)) : undefined }}
      >
        {shown.length === 0 && <li className="px-4 py-3 text-sm text-soft">{t('select.none')}</li>}
        {shown.map((o, i) => {
          const isSel = o.value === value;
          return (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={isSel}
              data-index={i}
              data-value={o.value}
              onMouseMove={() => active !== i && setActive(i)}
              onClick={() => pick(o)}
              style={{ animationDelay: `${Math.min(i, 8) * 18}ms` }}
              className={`select-opt flex cursor-pointer items-center gap-2 px-4 text-base transition-colors ${sheet ? 'min-h-[52px]' : 'min-h-[40px] py-1.5'} ${
                i === active ? 'bg-io/10' : ''
              } ${isSel ? 'font-semibold text-io' : 'text-ink'}`}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {isSel && (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 select-check">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open && !closing}
        aria-controls={open ? listId : undefined}
        onClick={() => (open && !closing ? hide(false) : show())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
        className={`group flex items-center justify-between gap-2 text-left transition-colors hover:border-io/60 focus:border-io focus:outline-none focus:ring-2 focus:ring-io/30 ${variantClass[variant]} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-soft'}`}>{selected ? selected.label : (placeholder ?? '')}</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 text-soft transition-transform duration-200 ${open && !closing ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 z-[65] ${sheet ? `bg-chrome/50 ${closing ? 'select-fade-out' : 'motion-safe:animate-fade-in'}` : ''}`}
              onClick={() => hide(false)}
              aria-hidden
            />
            {list}
          </>,
          document.body,
        )}
    </>
  );
}
