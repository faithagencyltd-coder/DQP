// DQP Design System — composants de base.
// Règles : jetons uniquement (pas de couleur en dur), états hover/focus/active/disabled
// sur tout élément interactif, animations courtes et désactivées si l'utilisateur le demande.

import { Loader2 } from 'lucide-react';
import {
  cloneElement, forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactElement, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'xs' | 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white border-transparent shadow-[0_4px_14px_rgba(47,124,246,.32)] hover:bg-brand-2',
  secondary: 'bg-surface-2 text-fg-2 border-line hover:bg-hover hover:text-fg hover:border-line-strong',
  ghost: 'bg-transparent text-fg-2 border-transparent hover:bg-hover hover:text-fg',
  danger: 'bg-transparent text-[#ff8a8a] border-line hover:bg-[var(--bad-bg)] hover:border-[rgba(240,75,75,.45)]',
  success: 'bg-[var(--ok-bg)] text-[#4ade80] border-[rgba(34,197,94,.3)]',
};
const SIZE: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11.5px] gap-1 rounded-[5px]',
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[6px]',
  md: 'h-8 px-3.5 text-[13px] gap-2 rounded-[7px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center border font-medium whitespace-nowrap select-none',
        'transition-[background,border-color,color,transform,box-shadow] duration-150 ease-ds active:translate-y-px',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="spin" /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string; active?: boolean }>(function IconButton(
  { label, active, className, size = 'md', ...rest },
  ref,
) {
  const dim = size === 'xs' ? 'h-6 w-6' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        aria-label={label}
        className={cx(
          'inline-flex items-center justify-center rounded-[7px] text-muted transition-colors duration-150',
          'hover:bg-hover hover:text-fg active:translate-y-px disabled:opacity-40 disabled:pointer-events-none',
          active && 'bg-brand-soft text-brand-2',
          dim,
          className,
        )}
        {...rest}
      />
    </Tooltip>
  );
});

// ---------------------------------------------------------------- Kbd

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line bg-bg-2 px-1 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------- Tooltip

type Side = 'top' | 'bottom' | 'right' | 'left';

/** Info-bulle accessible, rendue dans un portail pour ne jamais être coupée. */
export function Tooltip({ label, side = 'top', children, delay = 350, disabled }: { label: ReactNode; side?: Side; children: ReactElement; delay?: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = useRef<HTMLElement | null>(null);

  const show = (el: HTMLElement) => {
    if (disabled || !label) return;
    target.current = el;
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const p = side === 'top' ? { x: r.left + r.width / 2, y: r.top - 6 }
        : side === 'bottom' ? { x: r.left + r.width / 2, y: r.bottom + 6 }
        : side === 'right' ? { x: r.right + 8, y: r.top + r.height / 2 }
        : { x: r.left - 8, y: r.top + r.height / 2 };
      setPos(p);
      setOpen(true);
    }, delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const transform = side === 'top' ? 'translate(-50%,-100%)' : side === 'bottom' ? 'translate(-50%,0)' : side === 'right' ? 'translate(0,-50%)' : 'translate(-100%,-50%)';
  const child = children as ReactElement<Record<string, unknown>>;
  return (
    <>
      {cloneElement(child, {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { show(e.currentTarget); (child.props.onMouseEnter as ((e: unknown) => void) | undefined)?.(e); },
        onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { hide(); (child.props.onMouseLeave as ((e: unknown) => void) | undefined)?.(e); },
        onFocus: (e: React.FocusEvent<HTMLElement>) => { show(e.currentTarget); (child.props.onFocus as ((e: unknown) => void) | undefined)?.(e); },
        onBlur: (e: React.FocusEvent<HTMLElement>) => { hide(); (child.props.onBlur as ((e: unknown) => void) | undefined)?.(e); },
        onMouseDown: (e: React.MouseEvent<HTMLElement>) => { hide(); (child.props.onMouseDown as ((e: unknown) => void) | undefined)?.(e); },
      })}
      {open && pos &&
        createPortal(
          <div
            role="tooltip"
            className="anim-fade pointer-events-none fixed z-[200] max-w-[320px] rounded-[6px] border border-line bg-[#0b1426] px-2 py-1 text-[11.5px] text-fg shadow-ds-2"
            style={{ left: pos.x, top: pos.y, transform }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------- Popover / Menu

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onOutside();
    window.addEventListener('mousedown', h);
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('mousedown', h);
      window.removeEventListener('keydown', k);
    };
  }, [ref, onOutside, active]);
}

/** Panneau flottant ancré à un point (déclencheur ou clic droit), recadré dans la fenêtre. */
export function Floating({ x, y, onClose, children, align = 'left', width }: { x: number; y: number; onClose: () => void; children: ReactNode; align?: 'left' | 'right'; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState({ x, y });
  useOutside(ref, onClose, true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = align === 'right' ? x - r.width : x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 8) nx = window.innerWidth - r.width - 8;
    if (ny + r.height > window.innerHeight - 8) ny = Math.max(8, y - r.height);
    setP({ x: Math.max(8, nx), y: ny });
  }, [x, y, align]);
  return createPortal(
    <div ref={ref} className="anim-pop fixed z-[150] rounded-[9px] border border-line bg-surface-2 p-1 shadow-ds-3" style={{ left: p.x, top: p.y, width }}>
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  hint?: string;
}

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [active, setActive] = useState(() => items.findIndex((i) => !i.separator && !i.disabled));
  const usable = items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const pos = usable.indexOf(active);
        const next = e.key === 'ArrowDown' ? usable[(pos + 1) % usable.length] : usable[(pos - 1 + usable.length) % usable.length];
        setActive(next);
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        items[active].onSelect?.();
        onClose();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <div role="menu" className="min-w-[200px]">
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-line-2" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => { it.onSelect?.(); onClose(); }}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] transition-colors duration-100',
              it.danger ? 'text-[#ff8a8a]' : 'text-fg-2',
              active === i && (it.danger ? 'bg-[var(--bad-bg)]' : 'bg-hover text-fg'),
              'disabled:opacity-40',
            )}
          >
            <span className="flex w-4 justify-center text-muted">{it.icon}</span>
            <span className="flex-1">
              {it.label}
              {it.hint && <span className="block text-[11px] text-muted">{it.hint}</span>}
            </span>
            {it.shortcut && <Kbd>{it.shortcut}</Kbd>}
          </button>
        ),
      )}
    </div>
  );
}

/** Menu déroulant attaché à un déclencheur. */
export function Dropdown({ trigger, items, align = 'left', children, width }: { trigger: (open: boolean, toggle: (e: React.MouseEvent) => void) => ReactNode; items?: MenuItem[]; align?: 'left' | 'right'; children?: (close: () => void) => ReactNode; width?: number }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setAt(null), []);
  const toggle = (e: React.MouseEvent) => {
    if (at) return close();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAt({ x: align === 'right' ? r.right : r.left, y: r.bottom + 6 });
  };
  return (
    <>
      {trigger(!!at, toggle)}
      {at && (
        <Floating x={at.x} y={at.y} onClose={close} align={align} width={width}>
          {items ? <MenuList items={items} onClose={close} /> : children?.(close)}
        </Floating>
      )}
    </>
  );
}

/** Menu contextuel (clic droit). */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const open = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, items });
  };
  const node = state ? (
    <Floating x={state.x} y={state.y} onClose={() => setState(null)}>
      <MenuList items={state.items} onClose={() => setState(null)} />
    </Floating>
  ) : null;
  return { open, node };
}

// ---------------------------------------------------------------- Drawer

export function Drawer({ open, onClose, title, children, width = 420, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div className="anim-fade absolute inset-0 bg-[rgba(2,6,14,.5)]" onClick={onClose} />
      <aside className="anim-slide-left absolute right-0 top-0 flex h-full flex-col border-l border-line bg-surface shadow-ds-3" style={{ width: `min(${width}px, 94vw)` }}>
        <header className="flex items-center gap-2 border-b border-line-2 px-4 py-3 text-[14px] font-semibold text-fg">
          <div className="flex-1">{title}</div>
          <IconButton label="Fermer (Échap)" size="sm" onClick={onClose}>✕</IconButton>
        </header>
        <div className="flex-1 overflow-auto p-4">{children}</div>
        {footer && <footer className="border-t border-line-2 px-4 py-3">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Tabs

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  hint?: string;
}

/** Onglets avec indicateur animé qui glisse sous l'onglet actif. */
export function Tabs<T extends string>({ items, value, onChange, size = 'md', className }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items.length]);
  return (
    <div ref={wrap} role="tablist" className={cx('relative flex items-center gap-0.5 overflow-x-auto', className)}>
      {items.map((t) => {
        const btn = (
          <button
            key={t.id}
            data-tab={t.id}
            role="tab"
            aria-selected={value === t.id}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={cx(
              'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium transition-colors duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3 text-[12.5px]',
              value === t.id ? 'text-fg' : 'text-muted hover:text-fg-2 hover:bg-hover/60',
              t.disabled && 'opacity-45',
            )}
          >
            {t.icon}
            {t.label}
            {t.badge}
          </button>
        );
        return t.hint ? <Tooltip key={t.id} label={t.hint} side="bottom">{btn}</Tooltip> : btn;
      })}
      {ind && (
        <span
          className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-gradient-to-r from-brand to-cyan transition-all duration-200 ease-ds"
          style={{ left: ind.left + 6, width: Math.max(0, ind.width - 12) }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Progress

export function ProgressBar({ value, tone = 'brand', className, indeterminate }: { value?: number; tone?: 'brand' | 'ok' | 'warn' | 'bad'; className?: string; indeterminate?: boolean }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'linear-gradient(90deg, var(--brand), var(--cyan))';
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-300 ease-ds', indeterminate && 'pulse')}
        style={{ width: `${indeterminate ? 100 : Math.max(0, Math.min(100, value ?? 0))}%`, background: color }}
      />
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="spin text-brand-2" />;
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx('skeleton h-3', className)} style={style} />;
}

/** Valeur numérique animée (compteur), sans animation si l'utilisateur le demande. */
export function useCountUp(target: number, duration = 700): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from.current === target) {
      from.current = target;
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (target - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

/** Anneau de progression (confiance globale, avancement). */
export function Ring({ value, size = 76, stroke = 7, label, sub, segments }: { value: number; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode; segments?: { value: number; color: string }[] }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = useCountUp(value);
  let offset = 0;
  const segs = segments?.filter((s) => s.value > 0) ?? [];
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {segs.length
          ? segs.map((sg, i) => {
              const len = (sg.value / total) * c;
              const el = (
                <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={sg.color} strokeWidth={stroke}
                  strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} strokeLinecap="butt"
                  style={{ transition: 'stroke-dasharray 600ms var(--ease), stroke-dashoffset 600ms var(--ease)' }} />
              );
              offset += len;
              return el;
            })
          : (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#dq-ring)" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} style={{ transition: 'stroke-dashoffset 700ms var(--ease)' }} />
          )}
        <defs>
          <linearGradient id="dq-ring" x1="0" x2="1">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="1" stopColor="var(--cyan)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        <span className="text-[17px] font-bold text-fg tabular-nums">{label ?? `${Math.round(shown)} %`}</span>
        {sub && <span className="text-[10px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Stepper

export type StepState = 'done' | 'current' | 'verify' | 'todo' | 'unavailable';

const STEP_STYLE: Record<StepState, { ring: string; text: string; label: string }> = {
  done: { ring: 'bg-[var(--ok-bg)] border-[var(--ok)] text-[#4ade80]', text: 'text-fg-2', label: 'Terminé' },
  current: { ring: 'bg-brand-soft border-brand-2 text-brand-2 shadow-[0_0_0_4px_rgba(47,124,246,.15)]', text: 'text-fg', label: 'En cours' },
  verify: { ring: 'bg-[var(--warn-bg)] border-[var(--warn)] text-[#fbbf24]', text: 'text-fg-2', label: 'À vérifier' },
  todo: { ring: 'bg-surface-2 border-line text-muted', text: 'text-muted', label: 'À faire' },
  unavailable: { ring: 'bg-transparent border-dashed border-line text-faint', text: 'text-faint', label: 'Non disponible' },
};

export function Stepper({ steps, onSelect }: { steps: { id: string; label: string; state: StepState; detail?: string; icon?: ReactNode }[]; onSelect?: (id: string) => void }) {
  return (
    <ol className="flex w-full items-start">
      {steps.map((st, i) => {
        const s = STEP_STYLE[st.state];
        return (
          <li key={st.id} className="flex min-w-0 flex-1 items-start">
            <Tooltip label={<><b>{st.label}</b> — {s.label}{st.detail ? <><br />{st.detail}</> : null}</>} side="bottom">
              <button onClick={() => onSelect?.(st.id)} className="group flex min-w-0 flex-col items-center gap-1.5 px-1" disabled={st.state === 'unavailable'}>
                <span className={cx('flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition-transform duration-150 group-hover:scale-110', s.ring)}>
                  {st.state === 'done' ? '✓' : st.state === 'verify' ? '!' : st.icon ?? i + 1}
                </span>
                <span className={cx('max-w-full truncate text-[10.5px] font-semibold uppercase tracking-wide', s.text)}>{st.label}</span>
              </button>
            </Tooltip>
            {i < steps.length - 1 && (
              <span className={cx('mt-[13px] h-[2px] flex-1 rounded-full', st.state === 'done' ? 'bg-[var(--ok)]/60' : 'bg-line')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- Card / Section

export function Card({ title, actions, children, className, bodyClass, icon }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; icon?: ReactNode }) {
  return (
    <section className={cx('flex min-h-0 flex-col overflow-hidden rounded-[11px] border border-line-2 bg-surface shadow-[var(--shadow-1)]', className)}>
      {title && (
        <header className="flex items-center gap-2 border-b border-line-2 px-3.5 py-2.5">
          {icon && <span className="text-brand-2">{icon}</span>}
          <h3 className="m-0 flex-1 truncate text-[12.5px] font-semibold text-fg">{title}</h3>
          {actions}
        </header>
      )}
      <div className={cx('min-h-0 flex-1', bodyClass ?? 'p-3.5')}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="anim-rise flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-2">{icon}</div>}
      <h3 className="m-0 text-[15px] font-semibold text-fg">{title}</h3>
      {children && <div className="max-w-md text-[12.5px] text-muted">{children}</div>}
      {action && <div className="mt-2 flex gap-2">{action}</div>}
    </div>
  );
}

/** Mention « Disponible prochainement / En attente du moteur » : jamais de faux résultat. */
export function Pending({ title, phase, children, icon, compact }: { title: string; phase: string; children?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx(compact ? "py-4" : "min-h-[220px]", "flex h-full flex-col items-center justify-center gap-2 rounded-[11px] border border-dashed border-line bg-[repeating-linear-gradient(135deg,transparent_0,transparent_12px,rgba(255,255,255,.015)_12px,rgba(255,255,255,.015)_24px)] p-6 text-center")}>
      {icon && <div className="text-faint">{icon}</div>}
      <div className="text-[14px] font-semibold text-fg-2">{title}</div>
      <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-brand-2">En attente du moteur — {phase}</span>
      {children && <div className="max-w-md text-[12px] text-muted">{children}</div>}
    </div>
  );
}
