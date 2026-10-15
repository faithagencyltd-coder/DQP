// Accès aux données : requêtes et mutations avec mise en cache (TanStack Query).
// Chaque appel passe par la base, qui vérifie l'appartenance et les permissions.

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from './supabase';
import { errorMessage } from './errors';
import { useToast } from '../ui';

type Filter = (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function useRows<T>(table: string, orgId: string | undefined, opts: { select?: string; order?: [string, boolean?]; filter?: Filter; key?: unknown[]; enabled?: boolean; limit?: number } = {}) {
  return useQuery({
    // Les colonnes demandées font partie de la clé : deux lectures partielles différentes de la même
    // table ne doivent jamais partager le même cache.
    queryKey: [table, orgId, ...(opts.key ?? []), opts.select ?? '*', opts.limit ?? null, opts.order?.join(':') ?? null],
    enabled: !!orgId && opts.enabled !== false,
    queryFn: async () => {
      let q = supabase.from(table).select(opts.select ?? '*').eq('org_id', orgId!);
      if (opts.filter) q = opts.filter(q);
      if (opts.order) q = q.order(opts.order[0], { ascending: opts.order[1] ?? true });
      const { data, error } = await q.limit(opts.limit ?? 5000);
      if (error) throw new Error(errorMessage(error));
      return (data ?? []) as T[];
    },
  });
}

export function useRow<T>(table: string, id: string | undefined, select = '*') {
  return useQuery({
    queryKey: [table, 'row', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select(select).eq('id', id!).maybeSingle();
      if (error) throw new Error(errorMessage(error));
      return data as T | null;
    },
  });
}

export async function insertRow<T>(table: string, values: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.from(table).insert(values).select().single();
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

/** Insertion groupée (une seule requête, tout ou rien). */
export async function insertRows<T>(table: string, values: Record<string, unknown>[]): Promise<T[]> {
  if (!values.length) return [];
  const { data, error } = await supabase.from(table).insert(values).select();
  if (error) throw new Error(errorMessage(error));
  return (data ?? []) as T[];
}

export async function updateRow<T>(table: string, id: string, values: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.from(table).update(values).eq('id', id).select().maybeSingle();
  if (error) throw new Error(errorMessage(error));
  if (!data) throw new Error('Modification refusée : droits insuffisants ou élément introuvable.');
  return data as T;
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(errorMessage(error));
  if (!count) throw new Error('Suppression refusée : droits insuffisants ou élément introuvable.');
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

/** Mutation avec message de réussite / d'erreur et rafraîchissement des listes concernées. */
export function useAction<A, R>(fn: (a: A) => Promise<R>, opts: { success?: string | ((r: R) => string); invalidate?: QueryKey[] } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      if (opts.success) toast('ok', typeof opts.success === 'function' ? opts.success(r) : opts.success);
    },
    onError: (e) => toast('bad', errorMessage(e)),
  });
}
