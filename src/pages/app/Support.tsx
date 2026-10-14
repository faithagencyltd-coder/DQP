// Assistance (§24.2) : l'entreprise ouvre une demande, échange avec l'équipe PLANORA BTP,
// la marque résolue ou close. L'administration de la plateforme traite toutes les demandes.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rpc, useAction } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { fmtDateTime } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Textarea, useToast } from '../../ui';

export interface Ticket { id: string; org_id: string; reference: string; subject: string; category: string; priority: string; status: 'ouvert' | 'en_cours' | 'resolu' | 'ferme'; created_by: string | null; created_at: string; updated_at: string; organizations?: { name: string } | null }
interface Message { id: string; ticket_id: string; author: string | null; from_platform: boolean; body: string; created_at: string }

export const TICKET_STATUS: Record<Ticket['status'], { label: string; tone: 'bad' | 'warn' | 'ok' | 'grey' }> = {
  ouvert: { label: 'Ouverte', tone: 'bad' }, en_cours: { label: 'Prise en charge', tone: 'warn' }, resolu: { label: 'Résolue', tone: 'ok' }, ferme: { label: 'Close', tone: 'grey' },
};
export const TICKET_CATEGORY: Record<string, string> = { question: 'Question', incident: 'Incident technique', abonnement: 'Abonnement et paiement', donnees: 'Données et exports', suggestion: 'Suggestion' };
const PRIORITY: Record<string, string> = { normale: 'Normale', haute: 'Haute', bloquante: 'Bloquante' };

export function useTickets(orgId?: string) {
  return useQuery({
    queryKey: ['support_tickets', orgId ?? 'tous'],
    queryFn: async () => {
      let q = supabase.from('support_tickets').select('*, organizations(name)').order('updated_at', { ascending: false }).limit(500);
      if (orgId) q = q.eq('org_id', orgId);
      const { data, error } = await q;
      if (error) throw new Error(errorMessage(error));
      return (data ?? []) as Ticket[];
    },
  });
}

export function SupportPage() {
  const { org } = useOrg();
  const [sp, setSp] = useSearchParams();
  const tickets = useTickets(org?.id);
  const [create, setCreate] = useState(false);
  const open = (tickets.data ?? []).find((t) => t.id === sp.get('demande'));
  return (
    <>
      <PageHeader title="Assistance PLANORA BTP" subtitle="Posez une question, signalez un incident ou une difficulté d’abonnement ; l’équipe vous répond ici."
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreate(true)}>Nouvelle demande</Button>} />
      <Notice tone="navy" className="mb-4">L’équipe de la plateforme lit votre message, pas le contenu de vos dossiers. Si un fichier est nécessaire pour comprendre le problème, décrivez-le ou joignez un export sans données sensibles.</Notice>
      <Card bodyClass="p-0">
        {tickets.isLoading ? <Spinner /> : (
          <DataTable rows={tickets.data ?? []} onRowClick={(t) => setSp({ demande: t.id })}
            empty={<EmptyState icon={<LifeBuoy size={22} />} title="Aucune demande">Vos demandes d’assistance et leurs réponses apparaîtront ici.</EmptyState>}
            columns={[
              { key: 'ref', label: 'Réf.', render: (t) => <span className="tabular text-muted">{t.reference}</span> },
              { key: 'subject', label: 'Objet', render: (t) => <b className="text-navy-900">{t.subject}</b> },
              { key: 'cat', label: 'Catégorie', render: (t) => TICKET_CATEGORY[t.category], hideOnMobile: true },
              { key: 'upd', label: 'Dernière activité', render: (t) => fmtDateTime(t.updated_at), hideOnMobile: true },
              { key: 'status', label: 'Statut', render: (t) => <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge> },
            ]} />
        )}
      </Card>
      {create && <NewTicket onClose={() => setCreate(false)} onCreated={(id) => setSp({ demande: id })} />}
      {open && <TicketThread ticket={open} onClose={() => setSp({})} />}
    </>
  );
}

function NewTicket({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { org } = useOrg();
  const [v, setV] = useState({ subject: '', category: 'question', priority: 'normale', body: '' });
  const save = useAction(() => rpc<string>('open_ticket', { p_org: org!.id, p_subject: v.subject, p_category: v.category, p_priority: v.priority, p_body: v.body }), { success: 'Demande envoyée à l’assistance.', invalidate: [['support_tickets']] });
  return (
    <Modal title="Nouvelle demande d’assistance" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={v.subject.trim().length < 3 || !v.body.trim()} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: (id) => { onClose(); onCreated(id); } })}>Envoyer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Objet" required className="sm:col-span-2"><Input value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
        <Field label="Catégorie"><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{Object.entries(TICKET_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Urgence"><Select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Message" required className="sm:col-span-2"><Textarea rows={5} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} placeholder="Ce que vous faisiez, ce qui s’est passé, le message d’erreur éventuel." /></Field>
      </div>
    </Modal>
  );
}

export function TicketThread({ ticket, onClose, admin }: { ticket: Ticket; onClose: () => void; admin?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const messages = useQuery({
    queryKey: ['support_messages', ticket.id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('support_messages').select('*').eq('ticket_id', ticket.id).order('created_at');
      if (error) throw new Error(errorMessage(error));
      return (data ?? []) as Message[];
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['support_messages', ticket.id] }); void qc.invalidateQueries({ queryKey: ['support_tickets'] }); };
  const send = useAction(() => rpc('post_ticket_message', { p_ticket: ticket.id, p_body: body }), {});
  const status = useAction((s: string) => rpc('set_ticket_status', { p_ticket: ticket.id, p_status: s }), { success: 'Statut mis à jour.', invalidate: [['support_tickets']] });
  const closed = ticket.status === 'ferme';
  return (
    <Modal size="lg" title={`${ticket.reference} — ${ticket.subject}`} onClose={onClose} footer={<>
      {admin && ticket.status === 'ouvert' && <Button onClick={() => status.mutate('en_cours')}>Prendre en charge</Button>}
      {!closed && ticket.status !== 'resolu' && <Button onClick={() => status.mutate('resolu', { onSuccess: onClose })}>Marquer résolue</Button>}
      {!closed && <Button variant="ghost" onClick={() => status.mutate('ferme', { onSuccess: onClose })}>Clore</Button>}
      {ticket.status === 'resolu' && !admin && <Button variant="ghost" onClick={() => status.mutate('ouvert')}>Rouvrir</Button>}
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        <Badge tone={TICKET_STATUS[ticket.status].tone}>{TICKET_STATUS[ticket.status].label}</Badge>
        <span>{TICKET_CATEGORY[ticket.category]} · urgence {PRIORITY[ticket.priority].toLowerCase()}</span>
        {admin && ticket.organizations && <span>· {ticket.organizations.name}</span>}
      </div>
      <div className="grid max-h-[50vh] gap-2 overflow-y-auto rounded-lg bg-navy-50/50 p-3">
        {messages.isLoading ? <Spinner /> : (messages.data ?? []).map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-[13.5px] ${m.from_platform ? 'justify-self-start bg-navy-900 text-white' : 'justify-self-end bg-white shadow-sm'}`}>
            <span className={`mb-0.5 block text-[11px] ${m.from_platform ? 'text-white/70' : 'text-muted'}`}>{m.from_platform ? 'Assistance PLANORA BTP' : 'Entreprise'} · {fmtDateTime(m.created_at)}</span>
            <span className="whitespace-pre-wrap">{m.body}</span>
          </div>
        ))}
      </div>
      {!closed ? (
        <div className="mt-3 flex items-end gap-2">
          <Field label="Votre message" className="flex-1"><Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <Button variant="primary" icon={<Send size={15} />} disabled={!body.trim()} loading={send.isPending} onClick={() => send.mutate(undefined, { onSuccess: () => { setBody(''); refresh(); }, onError: (e) => toast('bad', errorMessage(e)) })}>Envoyer</Button>
        </div>
      ) : <p className="mt-3 text-[13px] text-muted">Demande close : ouvrez une nouvelle demande si besoin.</p>}
    </Modal>
  );
}
