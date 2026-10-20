// Composants d'interface PLANORA BTP. Simples, accessibles, cohérents (§2.3).

import { AlertTriangle, Check, ChevronDown, ChevronUp, Info, Loader2, Search, X } from 'lucide-react';
import {
  cloneElement, createContext, forwardRef, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

export const cx = (...c: unknown[]) => c.filter((x): x is string => typeof x === 'string' && x !== '').join(' ');

// ------------------------------------------------------------------ boutons
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'navy';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-signal-500 text-white hover:bg-signal-600 shadow-sm',
  navy: 'bg-navy-900 text-white hover:bg-navy-800 shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-navy-50 hover:border-navy-100',
  ghost: 'text-ink-2 hover:bg-navy-50',
  danger: 'bg-white text-bad-600 border border-line hover:bg-bad-50 hover:border-bad-600/30',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-[14px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-navy-50 disabled:opacity-40', className)} {...rest}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ champs
export function Field({ label, hint, error, children, className, required }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; required?: boolean }) {
  const id = useId();
  const described = error || hint ? `${id}-aide` : undefined;
  // Le libellé est relié au champ (htmlFor / id) ; l'aide est annoncée par aria-describedby.
  const child = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? id, 'aria-describedby': described })
    : children;
  return (
    <div className={className}>
      <label htmlFor={isValidElement(children) ? (children.props as { id?: string }).id ?? id : undefined}
        className={cx('mb-1.5 block text-[13px] font-semibold text-ink-2', required && "after:ml-0.5 after:text-signal-600 after:content-['*']")}>
        {label}
      </label>
      {child}
      {error ? <span id={described} className="mt-1 block text-[12px] text-bad-600">{error}</span> : hint ? <span id={described} className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input', className)} rows={3} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input', className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-start gap-2 text-[13.5px]', disabled && 'cursor-not-allowed opacity-60')}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-signal-500)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Rechercher…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input className="input pl-9" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

// ------------------------------------------------------------------ mise en page
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <div className="mb-1.5 text-[13px]">{back}</div>}
        <h1 className="truncate text-[22px] font-bold tracking-tight text-navy-900 sm:text-[24px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClass, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('rounded-xl border border-line bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-[15px] font-bold text-navy-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-4 sm:p-5', bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'navy', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'navy' | 'signal' | 'ok' | 'warn' | 'bad'; icon?: ReactNode }) {
  const tones = { navy: 'bg-navy-50 text-navy-700', signal: 'bg-signal-50 text-signal-600', ok: 'bg-ok-50 text-ok-600', warn: 'bg-warn-50 text-warn-600', bad: 'bg-bad-50 text-bad-600' };
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-muted">{label}</span>
        {icon && <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>}
      </div>
      <div className="tabular mt-2 text-[22px] font-bold text-navy-900">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}

type Tone = 'grey' | 'navy' | 'signal' | 'ok' | 'warn' | 'bad';
const TONES: Record<Tone, string> = {
  grey: 'bg-line-2 text-ink-2',
  navy: 'bg-navy-100 text-navy-700',
  signal: 'bg-signal-100 text-signal-700',
  ok: 'bg-ok-50 text-ok-600 ring-1 ring-ok-600/15',
  warn: 'bg-warn-50 text-warn-600 ring-1 ring-warn-600/15',
  bad: 'bg-bad-50 text-bad-600 ring-1 ring-bad-600/15',
};
export function Badge({ tone = 'grey', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold', TONES[tone], className)}>{children}</span>;
}

export function Notice({ tone = 'navy', title, children, className }: { tone?: 'navy' | 'warn' | 'bad' | 'ok'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const st = { navy: 'border-navy-100 bg-navy-50 text-navy-800', warn: 'border-warn-600/20 bg-warn-50 text-warn-600', bad: 'border-bad-600/20 bg-bad-50 text-bad-600', ok: 'border-ok-600/20 bg-ok-50 text-ok-600' };
  const Icon = tone === 'ok' ? Check : tone === 'navy' ? Info : AlertTriangle;
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-[13.5px]', st[tone], className)} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'text-ink-2')}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 text-navy-700">{icon}</div>}
      <div className="text-[15px] font-bold text-navy-900">{title}</div>
      {children && <p className="mt-1 max-w-md text-[13.5px] text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13.5px] text-muted" role="status">
      <Loader2 size={18} className="animate-spin" /> {label}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { id: T; label: ReactNode; hidden?: boolean }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1">
      {items.filter((t) => !t.hidden).map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-semibold transition-colors',
            value === t.id ? 'border-signal-500 text-navy-900' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ fenêtres
let openModals = 0;

export function Modal({ title, children, footer, onClose, wide, size }: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean; size?: 'md' | 'lg' | 'xl' }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // L'arrière-plan devient inactif (clavier, souris, lecteurs d'écran) tant qu'une fenêtre est ouverte.
    const root = document.getElementById('root');
    openModals++;
    root?.setAttribute('inert', '');
    return () => {
      openModals--;
      if (!openModals) root?.removeAttribute('inert');
    };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => {
      window.removeEventListener('keydown', k);
      prev?.focus?.();
    };
  }, [onClose]);
  const w = size === 'xl' ? 'sm:max-w-5xl' : size === 'lg' || wide ? 'sm:max-w-3xl' : 'sm:max-w-lg';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/45 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} className={cx('anim-in flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl', w)}>
        <div className="flex items-center justify-between border-b border-line-2 px-5 py-4">
          <h2 id={id} className="text-[16px] font-bold text-navy-900">{title}</h2>
          <IconButton label="Fermer" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-2 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation avant une action irréversible (§2.3). */
export function Confirm({ title, children, confirmLabel = 'Confirmer', danger, onConfirm, onClose, typeToConfirm }: {
  title: ReactNode; children: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void; typeToConfirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const ok = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!ok} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } catch { /* erreur déjà signalée par l'action ; la fenêtre reste ouverte */ } finally { setBusy(false); } }}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[14px] text-ink-2">{children}</div>
      {typeToConfirm && (
        <Field label={<>Pour confirmer, saisissez « {typeToConfirm} »</>} className="mt-4">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ notifications
interface Toast { id: number; tone: 'ok' | 'bad' | 'navy'; text: string }
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-3), { id, tone, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), tone === 'bad' ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(<div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={cx('anim-in pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-[13.5px] font-medium shadow-pop', t.tone === 'bad' ? 'bg-bad-600 text-white' : t.tone === 'ok' ? 'bg-navy-900 text-white' : 'bg-white text-ink ring-1 ring-line')}>
            {t.tone === 'ok' ? <Check size={17} className="mt-px shrink-0 text-signal-400" /> : t.tone === 'bad' ? <AlertTriangle size={17} className="mt-px shrink-0" /> : <Info size={17} className="mt-px shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>, document.body)}
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ tableau filtrable et triable
export interface Column<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number | null;
  className?: string;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
}

export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, empty, pageSize = 25, initialSort }: {
  rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; empty?: ReactNode; pageSize?: number; initialSort?: { key: string; dir: 1 | -1 };
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    return [...rows].sort((a, b) => {
      const x = col.sort!(a), y = col.sort!(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sort.dir;
    });
  }, [rows, sort, columns]);
  useEffect(() => setPage(0), [rows.length]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  if (!rows.length) return <>{empty}</>;
  const [first, ...rest] = columns;
  return (
    <div>
      {/* Téléphone : une fiche par ligne (colonnes secondaires masquées). */}
      <ul className="divide-y divide-line-2 sm:hidden">
        {view.map((r) => (
          <li key={r.id} onClick={() => onRowClick?.(r)} className={cx('px-4 py-3', onRowClick && 'cursor-pointer active:bg-navy-50')}>
            <div className="text-[14px]">{first.render(r)}</div>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
              {rest.filter((c) => !c.hideOnMobile).map((c) => (c.label ? (
                <div key={c.key} className="contents"><dt className="text-muted">{c.label}</dt><dd className="m-0 min-w-0 text-right">{c.render(r)}</dd></div>
              ) : <div key={c.key} className="col-span-2 flex justify-end" onClick={(e) => e.stopPropagation()}>{c.render(r)}</div>))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-navy-50/60 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.key} className={cx('whitespace-nowrap px-3 py-2.5', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.sort ? (
                    <button className="inline-flex items-center gap-1 uppercase hover:text-ink" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                      {c.label}
                      {sort?.key === c.key && (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} onClick={() => onRowClick?.(r)} className={cx('border-b border-line-2 last:border-0', onRowClick && 'cursor-pointer hover:bg-navy-50/50')}>
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-3 py-2.5 align-middle', c.align === 'right' && 'tabular text-right', c.align === 'center' && 'text-center', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line-2 px-3 py-2.5 text-[13px] text-muted">
          <span>{sorted.length} élément(s) · page {page + 1} / {pages}</span>
          <div className="flex gap-1">
            <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>
            <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Suivant</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ menu déroulant
export function Menu({ trigger, items }: { trigger: (toggle: () => void) => ReactNode; items: ({ label: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | null)[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div className="anim-in absolute right-0 z-30 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-pop" role="menu">
          {items.filter(Boolean).map((it, i) => (
            <button
              key={i}
              role="menuitem"
              disabled={it!.disabled}
              onClick={() => { setOpen(false); it!.onClick(); }}
              className={cx('block w-full px-4 py-2 text-left text-[13.5px] hover:bg-navy-50 disabled:opacity-40', it!.danger ? 'text-bad-600' : 'text-ink')}
            >
              {it!.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-[180px_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 text-ink">{v ?? <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
