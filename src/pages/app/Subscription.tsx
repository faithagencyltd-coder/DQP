import { useQuery } from '@tanstack/react-query';
import { Check, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { rpc, useAction, useRows } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { MODULE_LABEL, fmtDate, fmtDateTime, fmtSize } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Module, Plan } from '../../lib/types';
import { formatMoney } from '../../engine/money';
import { Badge, Button, Card, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Textarea, cx } from '../../ui';
import { Allowed } from '../../ui/guard';

interface Request { id: string; plan_id: string; period: string; amount: number; currency: string; status: string; created_at: string; handled_at: string | null; admin_note: string | null; payment_method: string | null }

const STATUS = { essai: ['Essai', 'warn'], actif: ['Actif', 'ok'], expire: ['Expiré', 'bad'], suspendu: ['Suspendu', 'bad'], annule: ['Annulé', 'grey'] } as const;
const REQ = { en_attente: ['En attente', 'warn'], traitee: ['Activée', 'ok'], refusee: ['Refusée', 'bad'], annulee: ['Annulée', 'grey'] } as const;

function Usage({ label, used, max, fmt = String }: { label: string; used: number; max: number | null; fmt?: (n: number) => string }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]"><span className="text-ink-2">{label}</span><span className="tabular font-semibold">{fmt(used)} {max ? `/ ${fmt(max)}` : '· illimité'}</span></div>
      {max ? <div className="h-2 rounded-full bg-line-2"><div className={cx('h-2 rounded-full', pct >= 90 ? 'bg-bad-600' : pct >= 70 ? 'bg-warn-600' : 'bg-navy-700')} style={{ width: `${pct}%` }} /></div> : null}
    </div>
  );
}

export function SubscriptionPage() {
  const { org, plan, active } = useOrg();
  const plans = useQuery({ queryKey: ['plans'], queryFn: async () => ((await supabase.from('subscription_plans').select('*').eq('active', true).order('sort')).data ?? []) as Plan[] });
  const usage = useQuery({ queryKey: ['usage', org?.id], enabled: !!org, queryFn: async () => ((await supabase.rpc('org_usage', { p_org: org!.id })).data?.[0] ?? null) as { users: number; projects: number; documents: number; storage_bytes: number } | null });
  const requests = useRows<Request>('billing_requests', org?.id, { order: ['created_at', false] });
  const [choice, setChoice] = useState<Plan | null>(null);
  const cancel = useAction((id: string) => rpc('cancel_subscription_request', { p_request: id }), { success: 'Demande annulée.', invalidate: [['billing_requests']] });
  if (!org || !plan) return <Spinner />;
  const st = STATUS[org.plan_status];
  const pending = (requests.data ?? []).find((r) => r.status === 'en_attente');
  return (
    <>
      <PageHeader title="Abonnement" subtitle="Votre offre, son utilisation et l’historique de vos demandes." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Offre actuelle">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[22px] font-bold text-navy-900">{plan.name}</span><Badge tone={st[1]}>{st[0]}</Badge>{org.plan_period && <Badge>{org.plan_period === 'an' ? 'annuel' : 'mensuel'}</Badge>}</div>
          <p className="mt-2 text-[13.5px] text-ink-2">{active ? 'Échéance le' : 'Échu depuis le'} <b>{fmtDate(org.plan_ends_at)}</b>.</p>
          {!active && <Notice tone="warn" className="mt-3">Vos données restent consultables et exportables. Les nouvelles opérations reprendront dès l’activation d’une offre. Aucune donnée n’est supprimée.</Notice>}
          <div className="mt-4 flex flex-wrap gap-1.5">{plan.modules.map((m) => <Badge key={m} tone="navy">{MODULE_LABEL[m as Module] ?? m}</Badge>)}</div>
        </Card>
        <Card title="Utilisation">
          {usage.isLoading ? <Spinner /> : usage.data ? (
            <div className="space-y-3">
              <Usage label="Utilisateurs" used={usage.data.users} max={plan.max_users} />
              <Usage label="Projets actifs" used={usage.data.projects} max={plan.max_projects} />
              <Usage label="Documents" used={usage.data.documents} max={plan.max_documents} />
              <Usage label="Stockage" used={usage.data.storage_bytes} max={plan.max_storage_mb * 1048576} fmt={fmtSize} />
              <p className="text-[12px] text-muted">Quota IA : {plan.ai_quota_month ? `${plan.ai_quota_month} requêtes / mois` : 'non inclus'} (l’assistant IA arrive en phase 4).</p>
            </div>
          ) : <p className="text-muted">Indisponible.</p>}
        </Card>
      </div>
      <h2 className="mb-3 mt-6 text-[17px] font-bold text-navy-900">Changer d’offre</h2>
      <Notice tone="navy" className="mb-4" title="Paiement en ligne : à venir">
        Le paiement par Mobile Money ou carte sera intégré avec un prestataire autorisé au Bénin et en Côte d’Ivoire. En attendant, envoyez une demande :
        l’équipe PLANORA BTP vous contacte pour le règlement et active l’offre après réception. Aucun paiement n’est considéré comme confirmé par l’application.
      </Notice>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(plans.data ?? []).map((p) => (
          <div key={p.id} className={cx('flex flex-col rounded-xl border bg-white p-4 shadow-card', p.id === plan.id ? 'border-signal-500 ring-2 ring-signal-100' : 'border-line')}>
            <div className="flex items-center justify-between"><b className="text-navy-900">{p.name}</b>{p.id === plan.id && <Badge tone="signal">actuelle</Badge>}</div>
            <div className="mt-2 text-[20px] font-extrabold text-navy-900">{p.price_month ? formatMoney(p.price_month, p.currency) : 'Gratuit'}</div>
            <div className="text-[12px] text-muted">{p.price_month ? `/ mois · ${formatMoney(p.price_year, p.currency)} / an` : `essai de ${p.trial_days} jours`}</div>
            <ul className="mt-3 flex-1 space-y-1 text-[12.5px] text-ink-2">
              <li>{p.max_users ? `${p.max_users} utilisateur(s)` : 'Utilisateurs illimités'}</li>
              <li>{p.max_projects ? `${p.max_projects} projets actifs` : 'Projets illimités'}</li>
              <li>{p.max_storage_mb >= 1000 ? `${p.max_storage_mb / 1000} Go` : `${p.max_storage_mb} Mo`} de stockage</li>
              {(['factures', 'achats', 'plans', 'planning'] as Module[]).map((m) => <li key={m} className="flex items-center gap-1">{p.modules.includes(m) ? <Check size={13} className="text-ok-600" /> : <X size={13} className="text-faint" />}{MODULE_LABEL[m]}</li>)}
            </ul>
            {p.price_month > 0 && <Allowed module="abonnement" action="modifier"><Button className="mt-3" variant={p.id === plan.id ? 'secondary' : 'primary'} disabled={!!pending} onClick={() => setChoice(p)}>{p.id === plan.id ? 'Renouveler' : 'Choisir'}</Button></Allowed>}
          </div>
        ))}
      </div>
      <Card title="Historique des demandes" className="mt-6" bodyClass="p-0">
        {(requests.data ?? []).length === 0 ? <p className="p-4 text-[13.5px] text-muted">Aucune demande.</p> : (requests.data ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line-2 px-4 py-3 text-[13.5px] last:border-0">
            <span className="flex-1">{fmtDateTime(r.created_at)} · <b>{(plans.data ?? []).find((p) => p.id === r.plan_id)?.name ?? r.plan_id}</b> {r.period === 'an' ? 'annuel' : 'mensuel'} · {formatMoney(r.amount, r.currency)}{r.admin_note ? ` — ${r.admin_note}` : ''}</span>
            <Badge tone={REQ[r.status as keyof typeof REQ]?.[1]}>{REQ[r.status as keyof typeof REQ]?.[0]}</Badge>
            {r.status === 'en_attente' && <Allowed module="abonnement" action="modifier"><Button size="sm" onClick={() => cancel.mutate(r.id)}>Annuler</Button></Allowed>}
          </div>
        ))}
      </Card>
      {choice && <RequestDialog plan={choice} onClose={() => setChoice(null)} />}
    </>
  );
}

function RequestDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const { org } = useOrg();
  const [period, setPeriod] = useState<'mois' | 'an'>('an');
  const [method, setMethod] = useState('mobile_money');
  const [phone, setPhone] = useState(org?.phone ?? '');
  const [note, setNote] = useState('');
  const send = useAction(() => rpc('request_subscription', { p_org: org!.id, p_plan: plan.id, p_period: period, p_method: method, p_phone: phone || null, p_note: note || null }), { success: 'Demande envoyée : l’équipe PLANORA BTP vous contacte pour le règlement.', invalidate: [['billing_requests']] });
  const amount = period === 'an' ? plan.price_year : plan.price_month;
  return (
    <Modal title={`Demander l’offre ${plan.name}`} onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={send.isPending} onClick={() => send.mutate(undefined, { onSuccess: onClose })}>Envoyer la demande</Button></>}>
      <div className="grid gap-3">
        <Field label="Durée"><Select value={period} onChange={(e) => setPeriod(e.target.value as 'mois' | 'an')}><option value="an">Annuel — {formatMoney(plan.price_year, plan.currency)}</option><option value="mois">Mensuel — {formatMoney(plan.price_month, plan.currency)}</option></Select></Field>
        <Field label="Moyen de règlement souhaité"><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="mobile_money">Mobile Money</option><option value="virement">Virement bancaire</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="autre">Autre</option></Select></Field>
        <Field label="Téléphone de contact"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Message"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Notice tone="navy"><span className="flex items-center gap-2"><Smartphone size={15} /> Montant : <b>{formatMoney(amount, plan.currency)}</b>. L’offre est activée après réception du règlement.</span></Notice>
      </div>
    </Modal>
  );
}
