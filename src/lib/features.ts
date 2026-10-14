// Fonctions IA ouvertes ou non par l'administration de PLANORA BTP (désactivées par défaut).
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type FeatureKey = 'rendu_plan_ia' | 'assistant_ia' | 'lecture_plan_ia';
export interface Feature { key: FeatureKey; label: string; enabled: boolean; updated_at: string; updated_by: string | null }

export function useFeatures() {
  const q = useQuery({
    queryKey: ['platform-features'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_features').select('*').order('key');
      if (error) throw error;
      return (data ?? []) as Feature[];
    },
    staleTime: 60_000,
  });
  const enabled = (k: FeatureKey) => !!q.data?.find((f) => f.key === k)?.enabled;
  return { ...q, enabled };
}
