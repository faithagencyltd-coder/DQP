// Facturation et encaissements (§16) : factures depuis un devis (acompte, situation, solde),
// factures simples, avoirs, émission numérotée et figée, paiements partiels, relances.

import { useQueryClient } from '@tanstack/react-query';
import { BellRing, CircleDollarSign, Copy, Download, FileMinus, Plus, Receipt, Send, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { computeDoc, newLine, newLot, renumberLots, type DocBody, type DocLine } from '../../engine/dqe';
import {
  acompteBody, avoirBody, balance, dueState, finaleBody, INVOICE_KIND_LABEL, invoicedOnQuote, situationBody, type InvoiceKind,
} from '../../engine/finance';
import { formatMoney, parseNumber } from '../../engine/money';
import { deleteRow, insertRow, rpc, updateRow, useAction, useRow, useRows } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { INVOICE_STATUS, PAYMENT_METHODS, fmtDate, fmtDateTime, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, Invoice, InvoiceReminder, Payment, Project, Quote } from '../../lib/types';
import { Badge, Button, Card, Confirm, DataTable, EmptyState, Field, Input, KeyValue, Modal, Notice, PageHeader, Select, Spinner, Stat, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';
import { LotRows, Num } from './QuoteEditor';

const DUE_LABEL = {
  a_echeance: { label: 'Échéance proche', tone: 'warn' as const },
  echue: { label: 'Échue', tone: 'bad' as const },
};

export function InvoicesPage() {
  const { org } = useOrg();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('');
  const [due, setDue] = useState('');
  const [projectFilter, setProjectFilter] = useState(params.get('projet') ?? '');
  const [creating, setCreating] = useState(!!params.get('devis'));
  const rows = useRows<Invoice>('invoices', org?.id, { select: 'id, reference, title, kind, status, client_id, project_id, quote_id, issue_date, due_date, net_ht, total_ttc, amount_paid, created_at', order: ['created_at', false] });
  const contacts = useRows<Contact>('contacts', org?.id, { select: 'id, name' });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const cname = useMemo(() => new Map((contacts.data ?? []).map((c) => [c.id, c.name])), [contacts.data]);
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const cur = org?.currency ?? 'XOF';
  const now = today();
  const all = rows.data ?? [];
  const list = all.filter((i) => (!status || i.status === status) && (!projectFilter || i.project_id === projectFilter) && (!due || dueState(i, now, org?.reminder_before_days ?? 7).state === due));
  const valid = all.filter((i) => i.status !== 'brouillon' && i.status !== 'annulee');
  const overdue = valid.filter((i) => dueState(i, now).state === 'echue');
  return (
    <>
      <PageHeader title="Facturation et encaissements" subtitle="Factures d’acompte, de situation et de solde depuis vos devis, avoirs, paiements partiels et relances."
        actions={<Allowed module="factures" action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouvelle facture</Button></Allowed>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Facturé (TTC, factures émises)" value={formatMoney(valid.reduce((s, i) => s + i.total_ttc, 0), cur)} />
        <Stat label="Encaissé" tone="ok" value={formatMoney(valid.filter((i) => i.kind !== 'avoir').reduce((s, i) => s + i.amount_paid, 0), cur)} />
        <Stat label="Reste à encaisser" tone="warn" value={formatMoney(valid.reduce((s, i) => s + balance(i), 0), cur)} />
        <Stat label="Factures échues" tone="bad" value={overdue.length} hint={formatMoney(overdue.reduce((s, i) => s + balance(i), 0), cur)} />
      </div>
      <Card bodyClass="p-0">
        <div className="flex flex-col gap-2 border-b border-line-2 p-3 sm:flex-row">
          <Select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-52"><option value="">Tous les statuts</option>{Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <Select aria-label="Échéance" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-52"><option value="">Toutes les échéances</option><option value="a_echeance">Échéance proche</option><option value="echue">Échues</option></Select>
          <Select aria-label="Projet" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="sm:w-72"><option value="">Tous les projets</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select>
        </div>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={list} onRowClick={(i) => nav(`/app/factures/${i.id}`)}
            empty={<EmptyState icon={<Receipt size={22} />} title="Aucune facture">Créez une facture d’acompte, de situation ou de solde à partir d’un devis accepté, ou une facture simple.</EmptyState>}
            columns={[
              { key: 'ref', label: 'Numéro', sort: (i) => i.reference ?? '', render: (i) => <span className="tabular text-muted">{i.reference ?? 'Brouillon'}</span> },
              { key: 'title', label: 'Facture', render: (i) => <span><b className="text-navy-900">{i.title}</b><span className="block text-[12px] text-muted">{INVOICE_KIND_LABEL[i.kind]}</span></span> },
              { key: 'client', label: 'Client', render: (i) => cname.get(i.client_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'project', label: 'Projet', render: (i) => pname.get(i.project_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'due', label: 'Échéance', sort: (i) => i.due_date ?? '', render: (i) => {
                const d = dueState(i, now, org?.reminder_before_days ?? 7);
                return <span>{fmtDate(i.due_date)}{(d.state === 'echue' || d.state === 'a_echeance') && <Badge className="ml-1" tone={DUE_LABEL[d.state].tone}>{d.state === 'echue' ? `${d.days} j de retard` : `dans ${d.days} j`}</Badge>}</span>;
              } },
              { key: 'ttc', label: 'TTC', align: 'right', sort: (i) => i.total_ttc, render: (i) => <span className="tabular">{formatMoney(i.total_ttc, cur)}</span> },
              { key: 'rest', label: 'Reste', align: 'right', render: (i) => <span className="tabular font-semibold">{i.status === 'brouillon' ? '—' : formatMoney(balance(i), cur)}</span>, hideOnMobile: true },
              { key: 'status', label: 'Statut', render: (i) => <Badge tone={INVOICE_STATUS[i.status]?.tone}>{INVOICE_STATUS[i.status]?.label}</Badge> },
            ]} />
        )}
      </Card>
      {creating && <NewInvoice projectId={projectFilter} quoteId={params.get('devis') ?? ''} invoices={all} onClose={() => setCreating(false)} />}
    </>
  );
}

type Source = 'devis' | 'vierge' | 'avoir';

function NewInvoice({ projectId, quoteId: initialQuote, invoices, onClose }: { projectId: string; quoteId: string; invoices: Invoice[]; onClose: () => void }) {
  const { org } = useOrg();
  const nav = useNavigate();
  const quotes = useRows<Quote>('quotes', org?.id, { select: 'id, reference, title, kind, status, project_id, client_id, total_ht, total_ttc, settings, payment_terms, locked', filter: (q) => q.eq('kind', 'devis'), key: ['devis-factures'] });
  const contacts = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind, archived_at', order: ['name'] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, client_id, archived_at' });
  const [source, setSource] = useState<Source>('devis');
  const [quoteId, setQuoteId] = useState(initialQuote);
  const [kind, setKind] = useState<InvoiceKind>('acompte');
  const [pct, setPct] = useState('30');
  const [title, setTitle] = useState('');
  const [cid, setCid] = useState('');
  const [pid, setPid] = useState(projectId);
  const [invId, setInvId] = useState('');
  const eligible = (quotes.data ?? []).filter((q) => q.status === 'accepte' || q.locked);
  const quote = eligible.find((q) => q.id === quoteId);
  const already = quote ? invoicedOnQuote(quote.id, invoices) : 0;
  const situations = quote ? invoices.filter((i) => i.quote_id === quote.id && i.kind === 'situation' && i.status !== 'brouillon' && i.status !== 'annulee').length : 0;
  const emitted = invoices.filter((i) => i.kind !== 'avoir' && i.status !== 'brouillon' && i.status !== 'annulee');

  const create = useAction(async () => {
    const { supabase } = await import('../../lib/supabase');
    const cur = org!.currency;
    if (source === 'devis') {
      if (!quote) throw new Error('Choisissez un devis accepté ou validé.');
      const { data, error } = await supabase.from('quotes').select('body, settings, total_ht').eq('id', quote.id).single();
      if (error) throw new Error(errorMessage(error));
      const qNet = computeDoc(data.body as DocBody, data.settings as Quote['settings']).netHT;
      const p = parseNumber(pct) ?? 0;
      const prev = invoices.filter((i) => i.quote_id === quote.id && i.kind !== 'avoir' && i.status !== 'brouillon' && i.status !== 'annulee');
      const body = kind === 'acompte' ? acompteBody(quote.reference, qNet, p, cur)
        : kind === 'situation' ? situationBody(quote.reference, qNet, p, already, cur, situations + 1)
          : finaleBody(data.body as DocBody, prev.map((i) => ({ reference: i.reference ?? '', net_ht: i.net_ht })));
      const settings = kind === 'finale' ? data.settings : { ...(data.settings as Quote['settings']), discountPct: 0 };
      return insertRow<Invoice>('invoices', {
        org_id: org!.id, kind, quote_id: quote.id, project_id: quote.project_id, client_id: quote.client_id,
        title: title.trim() || `${INVOICE_KIND_LABEL[kind]} — ${quote.title}`, body, settings, payment_terms: quote.payment_terms ?? org!.payment_terms,
      });
    }
    if (source === 'avoir') {
      const { data, error } = await supabase.from('invoices').select('*').eq('id', invId).single();
      if (error) throw new Error(errorMessage(error));
      const src = data as Invoice;
      return insertRow<Invoice>('invoices', {
        org_id: org!.id, kind: 'avoir', credit_for: src.id, quote_id: src.quote_id, project_id: src.project_id, client_id: src.client_id,
        title: title.trim() || `Avoir sur ${src.reference}`, body: avoirBody(src.body, src.reference ?? ''), settings: src.settings,
      });
    }
    return insertRow<Invoice>('invoices', {
      org_id: org!.id, kind: 'simple', project_id: pid || null, client_id: cid || null, title: title.trim() || 'Facture',
      body: { lots: [{ ...newLot('Prestations', 0), lines: [newLine()] }] }, settings: { currency: cur, taxes: org!.default_taxes, discountPct: 0 }, payment_terms: org!.payment_terms,
    });
  }, { success: 'Brouillon de facture créé.', invalidate: [['invoices']] });

  const valid = source === 'devis' ? !!quote && (kind === 'finale' || (parseNumber(pct) ?? 0) > 0) : source === 'avoir' ? !!invId : !!cid;
  return (
    <Modal title="Nouvelle facture" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (i) => nav(`/app/factures/${i.id}`) })}>Créer le brouillon</Button></>}>
      <div className="grid gap-4">
        <Field label="Origine">
          <Select value={source} onChange={(e) => setSource(e.target.value as Source)}>
            <option value="devis">À partir d’un devis accepté (acompte, situation, solde)</option>
            <option value="vierge">Facture simple (saisie libre)</option>
            <option value="avoir">Avoir sur une facture émise</option>
          </Select>
        </Field>
        {source === 'devis' && <>
          <Field label="Devis" hint="Devis accepté par le client ou version validée.">
            <Select value={quoteId} onChange={(e) => setQuoteId(e.target.value)}><option value="">— Choisir —</option>{eligible.map((q) => <option key={q.id} value={q.id}>{q.reference} · {q.title} · {formatMoney(q.total_ttc, q.settings?.currency)}</option>)}</Select>
          </Field>
          {quote && <Notice tone="navy">Déjà facturé sur ce devis : <b>{formatMoney(already, org?.currency)} HT</b> (factures émises, hors avoirs).</Notice>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type de facture">
              <Select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind)}>
                <option value="acompte">Acompte (% du devis)</option>
                <option value="situation">Situation (avancement cumulé)</option>
                <option value="finale">Finale (solde du devis)</option>
              </Select>
            </Field>
            {kind !== 'finale' && <Field label={kind === 'acompte' ? 'Pourcentage d’acompte (%)' : 'Avancement cumulé (%)'}><Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>}
          </div>
          {kind === 'finale' && <p className="text-[12.5px] text-muted">Reprend toutes les lignes du devis et déduit les factures déjà émises : le montant restant correspond au solde.</p>}
        </>}
        {source === 'vierge' && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client" required><Select value={cid} onChange={(e) => setCid(e.target.value)}><option value="">— Choisir —</option>{(contacts.data ?? []).filter((c) => c.kind === 'client' && !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Projet"><Select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">— Aucun —</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
        </div>}
        {source === 'avoir' && <Field label="Facture à corriger"><Select value={invId} onChange={(e) => setInvId(e.target.value)}><option value="">— Choisir —</option>{emitted.map((i) => <option key={i.id} value={i.id}>{i.reference} · {i.title}</option>)}</Select></Field>}
        <Field label="Titre (facultatif)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Repris automatiquement si vide" /></Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ fiche facture
export function InvoiceEditor() {
  const { id } = useParams();
  const { org, can } = useOrg();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const row = useRow<Invoice>('invoices', id);
  const contacts = useRows<Contact>('contacts', org?.id, { order: ['name'] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, location, city, client_id, archived_at' });
  const payments = useRows<Payment>('payments', org?.id, { filter: (q) => q.eq('invoice_id', id), order: ['paid_on'], key: [id] });
  const reminders = useRows<InvoiceReminder>('invoice_reminders', org?.id, { filter: (q) => q.eq('invoice_id', id), order: ['sent_at', false], key: [id] });
  const [doc, setDoc] = useState<Invoice | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<null | 'issue' | 'pay' | 'remind' | 'cancel' | 'delete'>(null);
  const creditFor = useRow<Invoice>('invoices', doc?.credit_for ?? undefined, 'id, reference');

  useEffect(() => { if (row.data && (!doc || doc.id !== row.data.id || (!dirty && row.data.updated_at !== doc.updated_at))) setDoc(row.data); }, [row.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = !!doc && doc.status === 'brouillon' && can('factures', 'modifier');
  const result = useMemo(() => (doc ? computeDoc(doc.body, doc.settings) : null), [doc]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = async (d: Invoice) => {
    setSaving(true);
    try {
      const saved = await updateRow<Invoice>('invoices', d.id, { title: d.title, client_id: d.client_id, project_id: d.project_id, issue_date: d.issue_date, due_date: d.due_date, payment_terms: d.payment_terms, notes: d.notes, body: d.body, settings: d.settings });
      setDoc((c) => (c ? { ...c, updated_at: saved.updated_at, total_ttc: saved.total_ttc, net_ht: saved.net_ht, total_ht: saved.total_ht, incomplete_lines: saved.incomplete_lines } : c));
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast('bad', `Sauvegarde impossible : ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };
  const change = (patch: Partial<Invoice>) => {
    if (!doc || !editable) return;
    const next = { ...doc, ...patch };
    setDoc(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), 1000);
  };
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty && doc) await persist(doc);
  };
  const refresh = () => { void row.refetch(); void payments.refetch(); void reminders.refetch(); void qc.invalidateQueries({ queryKey: ['invoices'] }); };

  const issue = useAction(async () => { await flush(); return rpc<string>('issue_invoice', { p_invoice: id }); }, { success: (ref) => `Facture émise : ${ref}.`, invalidate: [['invoices']] });
  const removePayment = useAction((pid: string) => deleteRow('payments', pid), { success: 'Paiement supprimé.', invalidate: [['payments'], ['invoices']] });
  const remove = useAction(() => deleteRow('invoices', id!), { success: 'Brouillon supprimé.', invalidate: [['invoices']] });

  if (row.isLoading || !doc || !result) return row.isLoading || row.data ? <Spinner /> : <Notice tone="bad">Facture introuvable ou accès non autorisé.</Notice>;
  const cur = doc.settings.currency;
  const client = (contacts.data ?? []).find((c) => c.id === doc.client_id);
  const project = (projects.data ?? []).find((p) => p.id === doc.project_id);
  const setBody = (body: DocBody) => change({ body });
  const setLine = (lotId: string, lineId: string, patch: Partial<DocLine>) => setBody({ lots: doc.body.lots.map((l) => (l.id !== lotId ? l : { ...l, lines: l.lines.map((x) => (x.id === lineId ? { ...x, ...patch } : x)) })) });
  const moveLine = (lotId: string, lineId: string, d: -1 | 1) => setBody({ lots: doc.body.lots.map((l) => {
    if (l.id !== lotId) return l;
    const i = l.lines.findIndex((x) => x.id === lineId), j = i + d;
    if (j < 0 || j >= l.lines.length) return l;
    const lines = [...l.lines];
    [lines[i], lines[j]] = [lines[j], lines[i]];
    return { ...l, lines };
  }) });
  const moveLot = (lotId: string, d: -1 | 1) => {
    const lots = [...doc.body.lots];
    const i = lots.findIndex((l) => l.id === lotId), j = i + d;
    if (j < 0 || j >= lots.length) return;
    [lots[i], lots[j]] = [lots[j], lots[i]];
    setBody(renumberLots({ lots }));
  };
  const rest = balance(doc);
  const ds = dueState(doc, today(), org?.reminder_before_days ?? 7);
  const exportPdf = async () => {
    await flush();
    const { invoicePdf } = await import('../../docs/finance-pdf');
    await invoicePdf(org!, doc, payments.data ?? [], { client, project }, creditFor.data?.reference ?? null);
  };

  return (
    <>
      <PageHeader
        back={<Link className="link" to="/app/factures">← Facturation</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{doc.reference ?? 'Brouillon'} — {doc.title} <Badge tone={INVOICE_STATUS[doc.status]?.tone}>{INVOICE_STATUS[doc.status]?.label}</Badge>
          {(ds.state === 'echue' || ds.state === 'a_echeance') && <Badge tone={DUE_LABEL[ds.state].tone}>{ds.state === 'echue' ? `${ds.days} jour(s) de retard` : `Échéance dans ${ds.days} jour(s)`}</Badge>}</span>}
        subtitle={<>{INVOICE_KIND_LABEL[doc.kind]}{creditFor.data?.reference ? ` sur ${creditFor.data.reference}` : ''}{project ? <> · <Link className="link" to={`/app/projets/${project.id}`}>{project.reference} {project.name}</Link></> : ''}{editable && <> · <span className={dirty ? 'text-warn-600' : 'text-ok-600'}>{saving ? 'Enregistrement…' : dirty ? 'Modifications en cours…' : 'Enregistré'}</span></>}</>}
        actions={<>
          <Allowed module="factures" action="exporter"><Button icon={<Download size={16} />} onClick={() => void exportPdf().catch((e) => toast('bad', errorMessage(e)))}>PDF</Button></Allowed>
          {doc.status === 'brouillon' && <Allowed module="factures" action="valider"><Button variant="primary" icon={<Send size={16} />} onClick={() => setDialog('issue')}>Émettre</Button></Allowed>}
          {(doc.status === 'emise' || doc.status === 'partielle') && doc.kind !== 'avoir' && <Allowed module="factures" action="creer"><Button variant="primary" icon={<CircleDollarSign size={16} />} onClick={() => setDialog('pay')}>Enregistrer un paiement</Button></Allowed>}
          {(doc.status === 'emise' || doc.status === 'partielle') && doc.kind !== 'avoir' && <Allowed module="factures" action="creer"><Button icon={<BellRing size={16} />} onClick={() => setDialog('remind')}>Relancer</Button></Allowed>}
          {doc.status === 'emise' && doc.amount_paid === 0 && <Allowed module="factures" action="valider"><Button icon={<XCircle size={16} />} onClick={() => setDialog('cancel')}>Annuler</Button></Allowed>}
          {doc.status === 'brouillon' && <Allowed module="factures" action="supprimer"><Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDialog('delete')}>Supprimer</Button></Allowed>}
        </>}
      />
      {doc.status === 'brouillon' && <Notice tone="navy" className="mb-3">Brouillon : le numéro définitif est attribué à l’émission (suite continue). Une facture émise ne se modifie plus ; elle se corrige par un avoir.</Notice>}
      {doc.status === 'annulee' && <Notice tone="warn" className="mb-3" title="Facture annulée">{doc.cancel_reason}</Notice>}
      <div className="mb-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Informations">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titre" className="sm:col-span-2"><Input disabled={!editable} value={doc.title} onChange={(e) => change({ title: e.target.value })} /></Field>
            <Field label="Client" required><Select disabled={!editable} value={doc.client_id ?? ''} onChange={(e) => change({ client_id: e.target.value || null })}><option value="">— Choisir —</option>{(contacts.data ?? []).filter((c) => c.kind === 'client').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Projet"><Select disabled={!editable} value={doc.project_id ?? ''} onChange={(e) => change({ project_id: e.target.value || null })}><option value="">— Aucun —</option>{(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
            <Field label="Date de facture" hint={editable ? 'Vide : date d’émission' : undefined}><Input type="date" disabled={!editable} value={doc.issue_date ?? ''} onChange={(e) => change({ issue_date: e.target.value || null })} /></Field>
            {doc.kind !== 'avoir' && <Field label="Échéance" hint={editable ? `Vide : ${org?.payment_days ?? 30} jours après l’émission` : undefined}><Input type="date" disabled={!editable} value={doc.due_date ?? ''} onChange={(e) => change({ due_date: e.target.value || null })} /></Field>}
            <Field label="Conditions de paiement" className="sm:col-span-2"><Textarea disabled={!editable} rows={2} value={doc.payment_terms ?? ''} onChange={(e) => change({ payment_terms: e.target.value })} /></Field>
          </div>
        </Card>
        <Card title="Montants" subtitle="Recalculés par le serveur à chaque enregistrement">
          <KeyValue items={[
            ['Total HT', formatMoney(result.totalHT, cur)],
            ...(result.discount ? [['Remise', '- ' + formatMoney(result.discount, cur)] as [string, string], ['Net HT', formatMoney(result.netHT, cur)] as [string, string]] : []),
            ...result.taxes.map((t) => [`${t.label} ${t.rate} %`, formatMoney(t.amount, cur)] as [string, string]),
            ['Total TTC', <b key="t" className="text-[16px] text-navy-900">{formatMoney(result.totalTTC, cur)}</b>],
            ...(doc.status !== 'brouillon' && doc.kind !== 'avoir' ? [['Réglé', formatMoney(doc.amount_paid, cur)] as [string, string], ['Reste à payer', <b key="r" className="text-signal-600">{formatMoney(rest, cur)}</b>] as [string, React.ReactNode]] : []),
          ]} />
          {editable && <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Remise (%)"><Num boxed label="Remise" value={doc.settings.discountPct ?? 0} decimals={2} onChange={(v) => change({ settings: { ...doc.settings, discountPct: v ?? 0 } })} /></Field>
            {doc.settings.taxes.map((t, i) => <Field key={i} label={`${t.label} (%)`}><Num boxed label={t.label} value={t.rate} decimals={2} onChange={(v) => change({ settings: { ...doc.settings, taxes: doc.settings.taxes.map((x, j) => (j === i ? { ...x, rate: v ?? 0 } : x)) } })} /></Field>)}
          </div>}
          {result.incomplete > 0 && <Notice tone="warn" className="mt-3">{result.incomplete} ligne(s) sans quantité ou sans prix : la facture ne peut pas être émise.</Notice>}
        </Card>
      </div>
      <Card bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="border-b border-line bg-navy-50/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              <th className="w-10 px-2 py-2">N°</th><th className="px-1">Réf.</th><th className="px-1">Désignation</th><th className="px-1">Unité</th><th className="px-1 text-right">Quantité</th><th className="px-1 text-right">P.U. HT</th><th className="px-2 text-right">Montant HT</th><th className="w-24" />
            </tr></thead>
            <tbody>
              {doc.body.lots.map((lot, li) => (
                <LotRows key={lot.id} lot={lot} lotIndex={li} editable={editable} isBpu={false} result={result} currency={cur}
                  onRename={(n) => setBody({ lots: doc.body.lots.map((l) => (l.id === lot.id ? { ...l, name: n } : l)) })}
                  onMoveLot={(d) => moveLot(lot.id, d)} onDeleteLot={() => setBody(renumberLots({ lots: doc.body.lots.filter((l) => l.id !== lot.id) }))}
                  onLine={(lid, p) => setLine(lot.id, lid, p)} onMoveLine={(lid, d) => moveLine(lot.id, lid, d)}
                  onDeleteLine={(lid) => setBody({ lots: doc.body.lots.map((l) => (l.id === lot.id ? { ...l, lines: l.lines.filter((x) => x.id !== lid) } : l)) })}
                  onAdd={(k) => setBody({ lots: doc.body.lots.map((l) => (l.id === lot.id ? { ...l, lines: [...l.lines, newLine({ kind: k })] } : l)) })} />
              ))}
            </tbody>
          </table>
        </div>
        {editable && <div className="border-t border-line-2 p-2"><Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setBody({ lots: [...doc.body.lots, newLot('Nouveau lot', doc.body.lots.length)] })}>Ajouter un lot</Button></div>}
      </Card>

      {doc.status !== 'brouillon' && doc.kind !== 'avoir' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Paiements reçus" subtitle="Saisis par votre équipe : déclarés, non confirmés par un système de paiement">
            {!(payments.data ?? []).length ? <p className="text-[13px] text-muted">Aucun paiement enregistré.</p> : (
              <ul className="divide-y divide-line-2">
                {(payments.data ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <span><b>{fmtDate(p.paid_on)}</b> · {PAYMENT_METHODS[p.method]}{p.reference ? ` · réf. ${p.reference}` : ''}<span className="block text-[11.5px] text-muted">Déclaré manuellement{p.note ? ` — ${p.note}` : ''}</span></span>
                    <span className="flex items-center gap-2"><b className="tabular">{formatMoney(p.amount, cur)}</b>{can('factures', 'supprimer') && <button aria-label="Supprimer ce paiement" className="p-1 text-faint hover:text-bad-600" onClick={() => removePayment.mutate(p.id, { onSuccess: refresh })}><Trash2 size={14} /></button>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Relances">
            {!(reminders.data ?? []).length ? <p className="text-[13px] text-muted">Aucune relance enregistrée.</p> : (
              <ul className="divide-y divide-line-2 text-[13px]">{(reminders.data ?? []).map((r) => <li key={r.id} className="py-2"><b>{fmtDateTime(r.sent_at)}</b> · {r.channel}{r.note ? ` — ${r.note}` : ''}</li>)}</ul>
            )}
          </Card>
        </div>
      )}

      {dialog === 'issue' && <Confirm title="Émettre la facture ?" confirmLabel="Émettre" onClose={() => setDialog(null)} onConfirm={() => issue.mutateAsync(undefined).then(refresh)}>
        Un numéro définitif lui sera attribué et elle ne pourra plus être modifiée (seulement corrigée par un avoir). Total : <b>{formatMoney(result.totalTTC, cur)}</b>.
      </Confirm>}
      {dialog === 'pay' && <PaymentDialog invoice={doc} rest={rest} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'remind' && <ReminderDialog invoice={doc} client={client} rest={rest} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'cancel' && <CancelDialog invoice={doc} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'delete' && <Confirm title="Supprimer ce brouillon ?" danger confirmLabel="Supprimer" onClose={() => setDialog(null)} onConfirm={() => remove.mutateAsync(undefined).then(() => nav('/app/factures'))}>Le brouillon sera supprimé définitivement.</Confirm>}
      {doc.status !== 'brouillon' && doc.kind !== 'avoir' && can('factures', 'creer') && (
        <p className="mt-3 text-[12.5px] text-muted"><FileMinus size={13} className="mr-1 inline" />Pour corriger cette facture : Facturation → Nouvelle facture → « Avoir sur une facture émise ».</p>
      )}
    </>
  );
}

function PaymentDialog({ invoice, rest, onClose, onDone }: { invoice: Invoice; rest: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(rest).replace('.', ','));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('virement');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const v = parseNumber(amount);
  const pay = useAction(() => insertRow('payments', { org_id: invoice.org_id, invoice_id: invoice.id, amount: v, paid_on: date, method, reference: ref || null, note: note || null }), { success: 'Paiement enregistré.', invalidate: [['payments'], ['invoices']] });
  return (
    <Modal title="Enregistrer un paiement" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!v || v <= 0 || v > rest} loading={pay.isPending} onClick={() => pay.mutate(undefined, { onSuccess: () => { onDone(); onClose(); } })}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Montant (reste ${formatMoney(rest, invoice.settings.currency)})`} required error={v && v > rest ? 'Supérieur au reste à payer' : null}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date du paiement" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Mode de paiement"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Référence (n° de transaction, chèque…)"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="Note" className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <Notice tone="navy" className="mt-3">Le paiement est enregistré comme <b>déclaré</b> par votre équipe : PLANORA BTP ne le présente jamais comme confirmé par un système de paiement.</Notice>
    </Modal>
  );
}

function ReminderDialog({ invoice, client, rest, onClose, onDone }: { invoice: Invoice; client?: Contact; rest: number; onClose: () => void; onDone: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const [channel, setChannel] = useState('whatsapp');
  const [note, setNote] = useState('');
  const late = invoice.due_date && invoice.due_date < today();
  const text = `Bonjour${client?.contact_person ? ' ' + client.contact_person : ''},\n\n${late ? 'Sauf erreur de notre part, la facture' : 'Nous vous rappelons que la facture'} ${invoice.reference} (${invoice.title}) ${late ? `est arrivée à échéance le ${fmtDate(invoice.due_date)}` : `arrive à échéance le ${fmtDate(invoice.due_date)}`}. Reste à régler : ${formatMoney(rest, invoice.settings.currency)}.\n\nMerci de votre règlement.\n${org?.name ?? ''}${org?.phone ? ' — ' + org.phone : ''}`;
  const save = useAction(() => insertRow('invoice_reminders', { org_id: invoice.org_id, invoice_id: invoice.id, channel, note: note || null }), { success: 'Relance enregistrée.', invalidate: [['invoice_reminders']] });
  const phone = (client?.phone ?? '').replace(/[^\d]/g, '');
  return (
    <Modal title="Relancer le client" onClose={onClose} footer={<><Button onClick={onClose}>Fermer</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { onDone(); onClose(); } })}>Enregistrer la relance</Button></>}>
      <div className="grid gap-3">
        <Field label="Message"><Textarea rows={7} readOnly value={text} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Copy size={14} />} onClick={() => navigator.clipboard.writeText(text).then(() => toast('ok', 'Message copié.'))}>Copier</Button>
          {phone && <a className="btn" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener"><Button size="sm">Ouvrir WhatsApp</Button></a>}
          {client?.email && <a href={`mailto:${client.email}?subject=${encodeURIComponent('Facture ' + invoice.reference)}&body=${encodeURIComponent(text)}`}><Button size="sm">Ouvrir la messagerie</Button></a>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Canal utilisé"><Select value={channel} onChange={(e) => setChannel(e.target.value)}>{['whatsapp', 'email', 'sms', 'telephone', 'courrier', 'autre'].map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. promesse de paiement le 20" /></Field>
        </div>
        <p className="text-[12px] text-muted">L’envoi se fait depuis votre téléphone ou votre messagerie ; PLANORA enregistre la relance pour le suivi. L’envoi automatique arrivera avec les notifications par e-mail.</p>
      </div>
    </Modal>
  );
}

function CancelDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const cancel = useAction(() => rpc('cancel_invoice', { p_invoice: invoice.id, p_reason: reason }), { success: 'Facture annulée.', invalidate: [['invoices']] });
  return (
    <Modal title={`Annuler la facture ${invoice.reference} ?`} onClose={onClose} footer={<><Button onClick={onClose}>Retour</Button><Button variant="danger" disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSuccess: () => { onDone(); onClose(); } })}>Annuler la facture</Button></>}>
      <Notice tone="warn" className="mb-3">Le numéro reste attribué (la suite n’a pas de trou). Selon votre réglementation, un avoir peut être préférable.</Notice>
      <Field label="Motif" required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
