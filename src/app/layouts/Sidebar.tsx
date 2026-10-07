import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cx, Tooltip } from '../ds/primitives';
import { useStore } from '../stores/app-store';
import { SETTINGS_ITEM, SIDEBAR, type NavItem } from './nav';

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-[var(--topbar)] shrink-0 items-center gap-2.5 border-b border-line-2 px-4">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <defs>
          <linearGradient id="dq-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5297ff" />
            <stop offset="1" stopColor="#2dd4ef" />
          </linearGradient>
        </defs>
        <path d="M16 2 28 9v14l-12 7-12-7V9z" fill="url(#dq-logo)" opacity=".18" />
        <path d="M16 2 28 9v14l-12 7-12-7V9z" fill="none" stroke="url(#dq-logo)" strokeWidth="2" />
        <path d="M16 9v14M10 12.5l6 3.5 6-3.5" fill="none" stroke="url(#dq-logo)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {!collapsed && (
        <div className="leading-none">
          <div className="text-[17px] font-extrabold tracking-[0.06em] text-fg">DQP</div>
          <div className="mt-0.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted">Analyse · Métré · DQE</div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, badges }: { collapsed: boolean; onToggle: () => void; badges: Partial<Record<string, number>> }) {
  const s = useStore();
  const item = (it: NavItem) => {
    const active = s.view === it.view || (it.view === 'dashboard' && s.view === 'overview' && !s.project);
    const disabled = it.needsProject && !s.project;
    const badge = badges[it.view];
    const btn = (
      <button
        key={it.view}
        onClick={() => s.go(it.view)}
        aria-current={active ? 'page' : undefined}
        aria-label={it.label}
        className={cx(
          'group relative flex h-[34px] w-full items-center gap-3 rounded-[7px] text-left text-[12.8px] transition-colors duration-150',
          collapsed ? 'justify-center px-0' : 'px-2.5',
          active ? 'bg-brand-soft text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
          disabled && 'opacity-45',
        )}
      >
        {active && <span className="anim-fade absolute left-[-8px] top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-gradient-to-b from-brand-2 to-cyan" />}
        <it.icon size={17} className={cx('shrink-0 transition-colors', active ? 'text-brand-2' : 'text-muted group-hover:text-fg-2')} />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
        {!collapsed && it.phase && <span className="rounded-full border border-line px-1.5 text-[9.5px] font-semibold text-faint">{it.phase.replace('Phase ', 'P')}</span>}
        {!!badge && (
          <span className={cx('rounded-full bg-[var(--bad)] text-center text-[10px] font-bold leading-[16px] text-white', collapsed ? 'absolute right-1.5 top-1 h-4 min-w-4 px-1' : 'h-4 min-w-4 px-1')}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
    const tip = collapsed ? `${it.label}${it.phase ? ` — ${it.phase}` : ''}${disabled ? ' (ouvrez un projet)' : ''}` : disabled ? 'Ouvrez un projet' : it.phase ? `Moteur prévu en ${it.phase}` : '';
    return tip ? <Tooltip key={it.view} label={tip} side="right">{btn}</Tooltip> : btn;
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line-2 bg-[linear-gradient(180deg,#0a1322,#070d18)] transition-[width] duration-200 ease-ds" style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar)' }}>
      <Logo collapsed={collapsed} />
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2" aria-label="Modules">
        {SIDEBAR.map((g) => (
          <div key={g.group} className="mb-1.5">
            {!collapsed ? (
              <div className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{g.group}</div>
            ) : (
              <div className="mx-3 my-2 h-px bg-line-2" />
            )}
            <div className="space-y-0.5">{g.items.map(item)}</div>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-line-2 px-2 py-2">
        {item(SETTINGS_ITEM)}
        <Tooltip label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'} side="right">
          <button onClick={onToggle} className={cx('flex h-[30px] w-full items-center gap-3 rounded-[7px] text-[12px] text-muted transition-colors hover:bg-hover hover:text-fg', collapsed ? 'justify-center' : 'px-2.5')}>
            {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Réduire</>}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
