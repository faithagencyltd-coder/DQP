// Notifications dans l'application (§25) : cloche avec compteur, liste, lecture, préférences.
// Les notifications sont produites par la base ; le contrôle quotidien (échéances, retards,
// stocks, budget, quota IA, abonnement) est relancé à l'ouverture, sans doublon.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDateTime } from '../lib/labels';
import { useAuth, useOrg } from '../lib/session';
import { supabase } from '../lib/supabase';
import { cx, Spinner } from '../ui';

export interface NotificationRow { id: string; org_id: string | null; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

export const NOTIFICATION_KINDS: Record<string, string> = {
  equipe: 'Équipe : invitations et nouveaux collaborateurs',
  devis: 'Devis envoyé, accepté ou refusé',
  facture_echeance: 'Facture proche de l’échéance ou échue',
  paiement: 'Paiement enregistré',
  tache_retard: 'Tâche en retard',
  budget: 'Dépassement de budget',
  stock: 'Stock insuffisant',
  abonnement: 'Abonnement : échéance, activation, refus de règlement',
  quota_ia: 'Quota IA atteint',
  echec: 'Échec d’une opération importante',
  support: 'Réponses de l’assistance',
};

export function useNotifications() {
  const { session } = useAuth();
  const { org } = useOrg();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['notifications', uid, org?.id],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase.from('notifications').select('id, org_id, kind, title, body, link, created_at, read_at').order('created_at', { ascending: false }).limit(50);
      q = org ? q.or(`org_id.eq.${org.id},org_id.is.null`) : q.is('org_id', null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

const refreshed = new Set<string>();

export function NotificationBell({ dark }: { dark?: boolean }) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const nav = useNavigate();
  const list = useNotifications();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const rows = list.data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  // Contrôle quotidien (échéances, retards, stocks…), relancé à chaque ouverture de l'application :
  // il est idempotent côté base (clés d'unicité), sans doublon.
  useEffect(() => {
    if (!org || refreshed.has(org.id)) return;
    refreshed.add(org.id);
    supabase.rpc('refresh_notifications', { p_org: org.id }).then(({ error }) => {
      if (error) refreshed.delete(org.id);
      else void qc.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [org, qc]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const openOne = async (n: NotificationRow) => {
    setOpen(false);
    if (!n.read_at) await markRead([n.id]);
    if (n.link) nav(n.link);
  };

  return (
    <div className="relative" ref={box}>
      <button type="button" aria-label={`Notifications${unread ? ` (${unread} non lue${unread > 1 ? 's' : ''})` : ''}`} onClick={() => { if (!open) void list.refetch(); setOpen(!open); }}
        className={cx('relative rounded-lg p-2', dark ? 'text-white/80 hover:bg-white/10' : 'text-ink-2 hover:bg-navy-50')}>
        <Bell size={20} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-signal-500 px-1 text-center text-[10.5px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="anim-in absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <b className="text-[14px] text-navy-900">Notifications</b>
            <div className="flex gap-1">
              {unread > 0 && <button type="button" className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-ink-2 hover:bg-navy-50" onClick={() => markRead(rows.filter((n) => !n.read_at).map((n) => n.id))}><CheckCheck size={14} />Tout lu</button>}
              <button type="button" aria-label="Préférences de notification" className="rounded p-1 text-ink-2 hover:bg-navy-50" onClick={() => { setOpen(false); nav('/app/parametres?onglet=notifications'); }}><Settings2 size={15} /></button>
            </div>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {!rows.length && <li className="px-4 py-6 text-center text-[13px] text-muted">Aucune notification.</li>}
            {rows.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openOne(n)} className={cx('block w-full border-b border-line-2 px-4 py-2.5 text-left hover:bg-navy-50/60', !n.read_at && 'bg-signal-50/40')}>
                  <span className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal-500" />}
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-navy-900">{n.title}</span>
                      {n.body && <span className="block text-[12.5px] text-ink-2">{n.body}</span>}
                      <span className="block text-[11px] text-muted">{fmtDateTime(n.created_at)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function NotificationPrefs() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const uid = session?.user.id;
  const prefs = useQuery({
    queryKey: ['notification-prefs', uid], enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_prefs').select('kind, in_app, email');
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.kind as string, p as { kind: string; in_app: boolean; email: boolean }]));
    },
  });
  const set = async (kind: string, patch: { in_app?: boolean; email?: boolean }) => {
    const cur = prefs.data?.get(kind) ?? { kind, in_app: true, email: false };
    await supabase.from('notification_prefs').upsert({ user_id: uid, kind, in_app: patch.in_app ?? cur.in_app, email: patch.email ?? cur.email }, { onConflict: 'user_id,kind' });
    void qc.invalidateQueries({ queryKey: ['notification-prefs'] });
  };
  if (prefs.isLoading) return <Spinner />;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13.5px]">
          <thead className="bg-navy-50 text-left text-[11.5px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Événement</th><th className="px-3 py-2 text-center">Dans l’application</th><th className="px-3 py-2 text-center">Par e-mail</th></tr></thead>
          <tbody>
            {Object.entries(NOTIFICATION_KINDS).map(([k, label]) => {
              const p = prefs.data?.get(k);
              return (
                <tr key={k} className="border-t border-line-2">
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`${label} : dans l’application`} checked={p?.in_app ?? true} onChange={(e) => set(k, { in_app: e.target.checked })} /></td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" aria-label={`${label} : par e-mail`} checked={p?.email ?? false} onChange={(e) => set(k, { email: e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">Les notifications dans l’application sont actives. L’envoi par e-mail (et par SMS ou WhatsApp) est <b>à venir</b> : votre choix est enregistré et s’appliquera dès qu’un service d’envoi sera branché ; aucun message n’est envoyé pour l’instant. Chaque notification n’est visible que par vous, selon vos droits sur le module concerné.</p>
    </div>
  );
}
