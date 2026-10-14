// Session (compte connecté) et entreprise active, avec les permissions de l'utilisateur.
// L'interface s'en sert pour adapter les menus et les boutons ; la base de données reste
// l'arbitre : chaque opération est vérifiée côté serveur (RLS).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Action, Membership, Module, Organization, Plan, Profile, Role } from './types';

interface AuthState {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  isPlatformAdmin: boolean;
  adminLoading: boolean;
  refreshProfile: () => void;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  const profile = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).single();
      if (error) throw error;
      return data as Profile;
    },
  });
  const admin = useQuery({
    queryKey: ['is-platform-admin', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.rpc('is_platform_admin');
      return data === true;
    },
  });

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
    try { localStorage.removeItem('planora.org'); } catch { /* stockage indisponible */ }
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    session, loading, profile: profile.data ?? null, isPlatformAdmin: admin.data === true, adminLoading: !!uid && admin.isLoading,
    refreshProfile: () => void profile.refetch(), signOut,
  }), [session, loading, profile, admin.data, admin.isLoading, uid, signOut]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// ------------------------------------------------------------------ entreprise active
interface OrgState {
  memberships: Membership[];
  loading: boolean;
  org: Organization | null;
  role: Role | null;
  plan: Plan | null;
  /** Abonnement en cours de validité (sinon : lecture seule). */
  active: boolean;
  switchOrg: (id: string) => void;
  can: (module: Module, action: Action) => boolean;
  /** Raison pour laquelle l'action est impossible (pour l'afficher), ou null. */
  denyReason: (module: Module, action: Action) => string | null;
  refresh: () => void;
}

const OrgCtx = createContext<OrgState>(null as unknown as OrgState);
export const useOrg = () => useContext(OrgCtx);

const ALWAYS_ALLOWED_MODULES = ['equipe', 'entreprise', 'abonnement'];

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [selected, setSelected] = useState<string | null>(() => {
    try { return localStorage.getItem('planora.org'); } catch { return null; }
  });

  const memberships = useQuery({
    queryKey: ['memberships', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('org_id, user_id, role, organizations(*)').eq('user_id', uid!);
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });
  const list = memberships.data ?? [];
  const current = list.find((m) => m.org_id === selected) ?? list[0] ?? null;
  const orgId = current?.org_id;

  const perms = useQuery({
    queryKey: ['role-permissions', orgId, current?.role],
    enabled: !!orgId && !!current && current.role !== 'proprietaire',
    queryFn: async () => {
      const { data, error } = await supabase.from('role_permissions').select('module, actions').eq('org_id', orgId!).eq('role', current!.role);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.module as string, r.actions as string[]]));
    },
  });
  const plan = useQuery({
    queryKey: ['plan', current?.organizations.plan_id],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase.from('subscription_plans').select('*').eq('id', current!.organizations.plan_id).single();
      if (error) throw error;
      return data as Plan;
    },
  });

  const org = current?.organizations ?? null;
  const active = !!org && ['essai', 'actif'].includes(org.plan_status) && new Date(org.plan_ends_at) > new Date();

  const denyReason = useCallback((module: Module, action: Action): string | null => {
    if (!current || !org) return 'Aucune entreprise sélectionnée.';
    const roleOk = current.role === 'proprietaire' || (perms.data?.get(module) ?? []).includes(action);
    if (!roleOk) return 'Votre rôle ne permet pas cette action. Demandez à l’administrateur de votre entreprise.';
    if (action === 'consulter' || action === 'exporter' || module === 'abonnement') return null;
    if (!active) return org.plan_status === 'suspendu' ? 'Accès suspendu : contactez PLANORA BTP.' : 'Abonnement échu : vos données restent consultables, renouvelez l’abonnement pour continuer.';
    if (!ALWAYS_ALLOWED_MODULES.includes(module) && plan.data && !plan.data.modules.includes(module)) return `Module non inclus dans l’offre ${plan.data.name}.`;
    return null;
  }, [current, org, perms.data, active, plan.data]);

  const value = useMemo<OrgState>(() => ({
    memberships: list,
    loading: memberships.isLoading || (!!current && current.role !== 'proprietaire' && perms.isLoading),
    org, role: current?.role ?? null, plan: plan.data ?? null, active,
    switchOrg: (id) => {
      setSelected(id);
      try { localStorage.setItem('planora.org', id); } catch { /* stockage indisponible */ }
    },
    can: (m, a) => denyReason(m, a) === null,
    denyReason,
    refresh: () => void memberships.refetch(),
  }), [list, memberships, current, perms.isLoading, org, plan.data, active, denyReason]);

  return <OrgCtx.Provider value={value}>{children}</OrgCtx.Provider>;
}
