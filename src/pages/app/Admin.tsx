// Administration de PLANORA BTP (§24) : entreprises, abonnements, demandes, offres.
// L'administration ne voit pas le contenu métier des entreprises (règles RLS).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import { rpc, useAction } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { COUNTRIES, MODULE_LABEL, fmtDate, fmtDateTime } from '../../lib/labels';
import { useAuth } from '../../lib/session';
import type { Module, Organization, Plan } from '../../lib/types';
import { formatMoney, parseNumber } from '../../engine/money';
import { Badge, Button, Card, Checkbox, DataTable, Field, Input, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Stat, Tabs, Textarea, useToast } from '../../ui';

interface Req { id: string; org_id: string; plan_id: string; period: string; amount: number; currency: string; payment_method: string | null; contact_phone: string | null; note: string | null; status: string; created_at: string }

export function AdminPage() {
  const { isPlatformAdmin, adminLoading, session } = useAuth();
  const [tab, setTab] = useState<'entreprises' | 'demandes' | 'offres'>('entreprises');
  const overview = useQuery({ queryKey: ['admin-overview'], enabled: isPlatformAdmin, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_overview');
    if (error) throw error;
    return data[0] as { accounts: number; organizations: number; active_subscriptions: number; expired: number; trials: number; storage_mb: number };
  } });
  if (!session || adminLoading) return <Spinner />;
  if (!isPlatformAdmin) return <Navigate to="/app" replace />;
  const o = overview.data;
  return (
    <>
      <PageHeader title="Administration PLANORA BTP" subtitle="Réservé à l’équipe de la plateforme. Le contenu des entreprises n’est pas accessible depuis cet espace." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Comptes" value={o?.accounts ?? '…'} />
        <Stat label="Entreprises" value={o?.organizations ?? '…'} />
        <Stat label="Abonnements actifs" value={o?.active_subscriptions ?? '…'} tone="ok" />
        <Stat label="Essais en cours" value={o?.trials ?? '…'} tone="warn" />
        <Stat label="Stockage utilisé" value={o ? `${String(o.storage_mb).replace('.', ',')} Mo` : '…'} hint={o ? `${o.expired} abonnement(s) échu(s)` : undefined} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'entreprises', label: 'Entreprises' }, { id: 'demandes', label: 'Demandes d’abonnement' }, { id: 'offres', label: 'Offres' }]} />
      {tab === 'entreprises' && <Orgs />}
      {tab === 'demandes' && <Requests />}
      {tab === 'offres' && <Plans />}
      <Notice tone="navy" className="mt-4" title="Non disponible dans cette version">Revenus encaissés en ligne, paiements échoués, consommation IA, incidents et demandes d’assistance : avec les modules Paiement, Assistant IA et Support.</Notice>
    </>
  );
}

function Orgs() {
  const orgs = useQuery({ queryKey: ['admin-orgs'], queryFn: async () => ((await supabase.from('organizations').select('*').order('created_at', { ascending: false })).data ?? []) as Organization[] });
  const members = useQuery({ queryKey: ['admin-members'], queryFn: async () => ((await supabase.from('members').select('org_id')).data ?? []) as { org_id: string }[] });
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Organization | null>(null);
  const count = (id: string) => (members.data ?? []).filter((m) => m.org_id === id).length;
  const list = (orgs.data ?? []).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card bodyClass="p-0">
      <div className="border-b border-line-2 p-3"><SearchInput value={q} onChange={setQ} placeholder="Nom de l’entreprise…" className="sm:max-w-sm" /></div>
      {orgs.isLoading ? <Spinner /> : (
        <DataTable rows={list} onRowClick={setEdit} columns={[
          { key: 'name', label: 'Entreprise', sort: (o) => o.name, render: (o) => <div><b className="text-navy-900">{o.name}</b><div className="text-[12px] text-muted">{[o.city, COUNTRIES[o.country]].filter(Boolean).join(', ')} · créée le {fmtDate(o.created_at)}</div></div> },
          { key: 'members', label: 'Membres', align: 'right', render: (o) => count(o.id) },
          { key: 'plan', label: 'Offre', render: (o) => o.plan_id },
          { key: 'status', label: 'Statut', render: (o) => <Badge tone={o.plan_status === 'actif' ? 'ok' : o.plan_status === 'essai' ? 'warn' : 'bad'}>{o.plan_status}</Badge> },
          { key: 'end', label: 'Échéance', sort: (o) => o.plan_ends_at, render: (o) => <span className={new Date(o.plan_ends_at) < new Date() ? 'text-bad-600' : ''}>{fmtDate(o.plan_ends_at)}</span> },
        ]} />
      )}
      {edit && <SubscriptionDialog org={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function SubscriptionDialog({ org, onClose }: { org: Organization; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ plan: org.plan_id, status: org.plan_status, period: org.plan_period ?? 'mois', end: org.plan_ends_at.slice(0, 10), reason: org.suspended_reason ?? '' });
  const save = useAction(() => rpc('admin_set_subscription', { p_org: org.id, p_plan: f.plan, p_status: f.status, p_period: f.period, p_ends_at: new Date(f.end + 'T23:59:59').toISOString(), p_reason: f.reason || null }), { success: 'Abonnement mis à jour.' });
  return (
    <Modal title={`Abonnement — ${org.name}`} onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-orgs'] }); onClose(); } })}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Offre"><Select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{['decouverte', 'artisan', 'pro', 'entreprise'].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Organization['plan_status'] })}>{['essai', 'actif', 'expire', 'suspendu', 'annule'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Périodicité"><Select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as 'mois' | 'an' })}><option value="mois">mensuelle</option><option value="an">annuelle</option></Select></Field>
        <Field label="Échéance"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        {f.status === 'suspendu' && <Field label="Motif de la suspension" className="sm:col-span-2"><Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>}
      </div>
      <p className="mt-3 text-[12px] text-muted">Changer d’offre ne supprime aucune donnée. L’opération est inscrite au journal de l’entreprise.</p>
    </Modal>
  );
}

function Requests() {
  const qc = useQueryClient();
  const toast = useToast();
  const reqs = useQuery({ queryKey: ['admin-requests'], queryFn: async () => ((await supabase.from('billing_requests').select('*').order('created_at', { ascending: false })).data ?? []) as Req[] });
  const orgs = useQuery({ queryKey: ['admin-orgs'], queryFn: async () => ((await supabase.from('organizations').select('*')).data ?? []) as Organization[] });
  const [handling, setHandling] = useState<{ r: Req; accept: boolean } | null>(null);
  const [note, setNote] = useState('');
  const name = (id: string) => (orgs.data ?? []).find((o) => o.id === id)?.name ?? id;
  const run = async () => {
    const { error } = await supabase.rpc('admin_handle_request', { p_request: handling!.r.id, p_accept: handling!.accept, p_note: note || null });
    if (error) return toast('bad', errorMessage(error));
    toast('ok', handling!.accept ? 'Offre activée.' : 'Demande refusée.');
    setHandling(null);
    setNote('');
    qc.invalidateQueries({ queryKey: ['admin-requests'] });
    qc.invalidateQueries({ queryKey: ['admin-orgs'] });
  };
  return (
    <Card bodyClass="p-0">
      {reqs.isLoading ? <Spinner /> : (reqs.data ?? []).length === 0 ? <p className="p-4 text-muted">Aucune demande.</p> : (reqs.data ?? []).map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line-2 px-4 py-3 text-[13.5px] last:border-0">
          <div className="min-w-0 flex-1">
            <b>{name(r.org_id)}</b> · {r.plan_id} {r.period === 'an' ? 'annuel' : 'mensuel'} · {formatMoney(r.amount, r.currency)}
            <div className="text-[12px] text-muted">{fmtDateTime(r.created_at)} · {r.payment_method ?? '—'} · {r.contact_phone ?? ''}{r.note ? ` · « ${r.note} »` : ''}</div>
          </div>
          <Badge tone={r.status === 'en_attente' ? 'warn' : r.status === 'traitee' ? 'ok' : 'grey'}>{r.status}</Badge>
          {r.status === 'en_attente' && <><Button size="sm" variant="primary" onClick={() => setHandling({ r, accept: true })}>Règlement reçu : activer</Button><Button size="sm" onClick={() => setHandling({ r, accept: false })}>Refuser</Button></>}
        </div>
      ))}
      {handling && (
        <Modal title={handling.accept ? 'Activer l’offre' : 'Refuser la demande'} onClose={() => setHandling(null)} footer={<><Button onClick={() => setHandling(null)}>Annuler</Button><Button variant="primary" onClick={() => void run()}>Confirmer</Button></>}>
          <p className="text-[13.5px]">{handling.accept ? `Confirmez-vous avoir reçu ${formatMoney(handling.r.amount, handling.r.currency)} de ${name(handling.r.org_id)} ? L’offre sera activée pour ${handling.r.period === 'an' ? 'un an' : 'un mois'}.` : 'Indiquez le motif du refus.'}</p>
          <Field label="Note (référence du paiement, motif…)" className="mt-3"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}
    </Card>
  );
}

const ALL_MODULES: Module[] = ['clients', 'projets', 'documents', 'prix', 'metres', 'dqe', 'devis', 'factures', 'depenses', 'achats', 'stocks', 'planning', 'plans', 'rapports'];

function Plans() {
  const qc = useQueryClient();
  const toast = useToast();
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: async () => ((await supabase.from('subscription_plans').select('*').order('sort')).data ?? []) as Plan[] });
  const [edit, setEdit] = useState<Plan | null>(null);
  const save = async () => {
    const p = edit!;
    const { error, count } = await supabase.from('subscription_plans').update({ name: p.name, description: p.description, price_month: p.price_month, price_year: p.price_year, max_users: p.max_users, max_projects: p.max_projects, max_documents: p.max_documents, max_storage_mb: p.max_storage_mb, ai_quota_month: p.ai_quota_month, modules: p.modules, trial_days: p.trial_days, active: p.active }, { count: 'exact' }).eq('id', p.id);
    if (error || !count) return toast('bad', errorMessage(error ?? 'Refusé'));
    toast('ok', 'Offre enregistrée. Les entreprises abonnées gardent toutes leurs données.');
    setEdit(null);
    qc.invalidateQueries({ queryKey: ['admin-plans'] });
    qc.invalidateQueries({ queryKey: ['plans'] });
  };
  const num = (v: string) => (v.trim() === '' ? null : parseNumber(v));
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(plans.data ?? []).map((p) => (
        <Card key={p.id} title={<span className="flex items-center gap-2">{p.name} {!p.active && <Badge>inactive</Badge>}</span>} actions={<Button size="sm" onClick={() => setEdit(p)}>Modifier</Button>}>
          <p className="text-[13px] text-ink-2">{formatMoney(p.price_month, p.currency)} / mois · {formatMoney(p.price_year, p.currency)} / an · {p.max_users ?? '∞'} utilisateurs · {p.max_projects ?? '∞'} projets · {p.max_storage_mb} Mo · IA {p.ai_quota_month}/mois{p.trial_days ? ` · essai ${p.trial_days} j` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1">{p.modules.map((m) => <Badge key={m} tone="navy">{MODULE_LABEL[m as Module] ?? m}</Badge>)}</div>
        </Card>
      ))}
      {edit && (
        <Modal title={`Offre ${edit.id}`} onClose={() => setEdit(null)} size="lg" footer={<><Button onClick={() => setEdit(null)}>Annuler</Button><Button variant="primary" onClick={() => void save()}>Enregistrer</Button></>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nom"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Prix mensuel"><Input defaultValue={edit.price_month} onBlur={(e) => setEdit({ ...edit, price_month: num(e.target.value) ?? 0 })} /></Field>
            <Field label="Prix annuel"><Input defaultValue={edit.price_year} onBlur={(e) => setEdit({ ...edit, price_year: num(e.target.value) ?? 0 })} /></Field>
            <Field label="Description" className="sm:col-span-3"><Textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Utilisateurs max" hint="vide = illimité"><Input defaultValue={edit.max_users ?? ''} onBlur={(e) => setEdit({ ...edit, max_users: num(e.target.value) })} /></Field>
            <Field label="Projets actifs max" hint="vide = illimité"><Input defaultValue={edit.max_projects ?? ''} onBlur={(e) => setEdit({ ...edit, max_projects: num(e.target.value) })} /></Field>
            <Field label="Documents max" hint="vide = illimité"><Input defaultValue={edit.max_documents ?? ''} onBlur={(e) => setEdit({ ...edit, max_documents: num(e.target.value) })} /></Field>
            <Field label="Stockage (Mo)"><Input defaultValue={edit.max_storage_mb} onBlur={(e) => setEdit({ ...edit, max_storage_mb: num(e.target.value) ?? 100 })} /></Field>
            <Field label="Quota IA / mois"><Input defaultValue={edit.ai_quota_month} onBlur={(e) => setEdit({ ...edit, ai_quota_month: num(e.target.value) ?? 0 })} /></Field>
            <Field label="Jours d’essai"><Input defaultValue={edit.trial_days} onBlur={(e) => setEdit({ ...edit, trial_days: num(e.target.value) ?? 0 })} /></Field>
            <div className="sm:col-span-3">
              <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Modules inclus</div>
              <div className="grid gap-1.5 sm:grid-cols-3">{ALL_MODULES.map((m) => <Checkbox key={m} label={MODULE_LABEL[m]} checked={edit.modules.includes(m)} onChange={(v) => setEdit({ ...edit, modules: v ? [...edit.modules, m] : edit.modules.filter((x) => x !== m) })} />)}</div>
            </div>
            <div className="sm:col-span-3"><Checkbox label="Offre proposée aux clients" checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
