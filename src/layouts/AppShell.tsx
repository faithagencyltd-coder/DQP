import { ChevronDown, LifeBuoy, LogOut, Menu as MenuIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useOrg } from '../lib/session';
import { ROLE_LABEL, fmtDate } from '../lib/labels';
import { Badge, cx, Menu } from '../ui';
import { Logo, LogoMark } from '../ui/Logo';
import { GROUP_LABEL, NAV, type NavItem } from './nav';
import { NotificationBell } from './Notifications';

function useVisibleNav(): NavItem[] {
  const { can } = useOrg();
  const { isPlatformAdmin } = useAuth();
  return NAV.filter((n) => (n.adminOnly ? isPlatformAdmin : !n.module || can(n.module, 'consulter') || !!n.soon));
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const items = useVisibleNav();
  const groups = ['pilotage', 'etudes', 'gestion', 'compte'] as const;
  return (
    <nav className="space-y-5" aria-label="Menu principal">
      {groups.map((g) => (
        <div key={g}>
          <div className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40">{GROUP_LABEL[g]}</div>
          {items.filter((i) => i.group === g).map((i) => (
            <NavLink
              key={i.path}
              to={i.path}
              end={i.path === '/app'}
              onClick={onNavigate}
              className={({ isActive }) => cx(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
              )}
            >
              {({ isActive }) => (
                <>
                  <i.icon size={17} className={isActive ? 'text-signal-400' : 'text-white/50 group-hover:text-white/80'} />
                  <span className="flex-1 truncate">{i.label}</span>
                  {i.soon && <span className="rounded bg-white/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-white/50">bientôt</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function OrgSwitcher() {
  const { memberships, org, role, switchOrg } = useOrg();
  const navigate = useNavigate();
  if (!org) return null;
  return (
    <Menu
      trigger={(toggle) => (
        <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5 text-left ring-1 ring-white/10 hover:bg-white/10">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal-500 text-[13px] font-bold text-white">{org.name.slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">{org.name}</span>
            <span className="block truncate text-[11px] text-white/50">{role ? ROLE_LABEL[role] : ''}</span>
          </span>
          <ChevronDown size={15} className="text-white/50" />
        </button>
      )}
      items={[
        ...memberships.map((m) => ({ label: <span className="flex items-center justify-between gap-3"><span className="truncate">{m.organizations.name}</span>{m.org_id === org.id && <Badge tone="ok">active</Badge>}</span>, onClick: () => switchOrg(m.org_id) })),
        { label: '+ Créer une autre entreprise', onClick: () => navigate('/app/bienvenue?nouvelle=1') },
      ]}
    />
  );
}

function SubscriptionBanner() {
  const { org, active } = useOrg();
  const navigate = useNavigate();
  if (!org) return null;
  const days = Math.ceil((new Date(org.plan_ends_at).getTime() - Date.now()) / 86400000);
  if (active && days > 7) return null;
  return (
    <div className={cx('no-print flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px] font-medium sm:px-6', active ? 'bg-warn-50 text-warn-600' : 'bg-bad-50 text-bad-600')}>
      <span>
        {active
          ? `${org.plan_status === 'essai' ? 'Période d’essai' : 'Abonnement'} : ${days} jour(s) restant(s) (échéance le ${fmtDate(org.plan_ends_at)}).`
          : org.plan_status === 'suspendu' ? `Accès suspendu${org.suspended_reason ? ` : ${org.suspended_reason}` : ''}. Vos données restent consultables.`
          : 'Abonnement échu : vos données restent consultables, les nouvelles opérations sont bloquées.'}
      </span>
      <button className="font-semibold underline" onClick={() => navigate('/app/abonnement')}>Voir l’abonnement</button>
    </div>
  );
}

export function AppShell() {
  const { profile, signOut, session } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || session?.user.email;

  return (
    <div className="flex h-full">
      {/* Barre latérale (ordinateur et tablette) */}
      <aside className="no-print hidden w-[264px] shrink-0 flex-col bg-navy-900 lg:flex">
        <div className="px-5 pb-4 pt-5"><Logo dark /></div>
        <div className="px-3 pb-3"><OrgSwitcher /></div>
        <div className="flex-1 overflow-y-auto px-3 pb-4"><NavList /></div>
        <div className="border-t border-white/10 px-4 py-3">
          <div className="truncate text-[12.5px] font-semibold text-white">{name}</div>
          <button onClick={() => void signOut()} className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-white/60 hover:text-white">
            <LogOut size={14} /> Se déconnecter
          </button>
        </div>
      </aside>

      {/* Menu mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
          <div className="anim-in absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col bg-navy-900">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <Logo dark size={28} />
              <button aria-label="Fermer le menu" className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            <div className="px-3 pb-3"><OrgSwitcher /></div>
            <div className="flex-1 overflow-y-auto px-3 pb-4"><NavList onNavigate={() => setOpen(false)} /></div>
            <button onClick={() => void signOut()} className="flex items-center gap-2 border-t border-white/10 px-5 py-4 text-[14px] text-white/70">
              <LogOut size={16} /> Se déconnecter
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 items-center gap-3 border-b border-line bg-white px-3 lg:hidden">
          <button aria-label="Ouvrir le menu" className="rounded-lg p-2 text-ink hover:bg-navy-50" onClick={() => setOpen(true)}><MenuIcon size={22} /></button>
          <LogoMark size={28} />
          <span className="truncate text-[14px] font-bold text-navy-900">PLANORA <span className="text-signal-500">BTP</span></span>
          <span className="ml-auto"><NotificationBell /></span>
        </header>
        <header className="no-print hidden h-12 shrink-0 items-center justify-end gap-1 border-b border-line bg-white px-6 lg:flex">
          <NavLink to="/app/assistance" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-navy-50"><LifeBuoy size={16} />Assistance</NavLink>
          <NotificationBell />
        </header>
        <SubscriptionBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
