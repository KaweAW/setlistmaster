import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** 16px text avoids the iOS zoom-on-focus; h-11 = 44px touch target. */
export const inputClass =
  'h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-soft/60 focus:border-io focus:outline-none focus:ring-2 focus:ring-io/30';
export const textareaClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-soft/60 focus:border-io focus:outline-none focus:ring-2 focus:ring-io/30';

type Variant = 'primary' | 'secondary' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/90',
  secondary: 'border border-line bg-surface text-ink hover:bg-paper',
  danger: 'border border-lei/40 bg-surface text-lei hover:bg-lei/5',
};

export function buttonClass(variant: Variant = 'primary'): string {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-io disabled:opacity-50 ${variants[variant]}`;
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
}

/** Label wrapping a single control (so tapping the label focuses it). */
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-soft">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-semibold text-lei">{error}</span>}
    </label>
  );
}

/** Group of controls (chips, files) with a legend. */
export function FieldGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-ink">{legend}</legend>
      {children}
    </fieldset>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide">{children}</h1>
  );
}
