import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Profile, Role } from './types';

export interface TeamMember { user_id: string; role: Role; created_at: string; profile: Profile | null }

export function useTeam(orgId: string | undefined) {
  return useQuery({
    queryKey: ['team', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('user_id, role, created_at').eq('org_id', orgId!);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.user_id);
      const { data: profiles } = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
      return (data ?? []).map((m) => ({ ...m, profile: byId.get(m.user_id) ?? null })) as TeamMember[];
    },
  });
}

export const personName = (p: Profile | null | undefined) => (p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email : 'Utilisateur');
