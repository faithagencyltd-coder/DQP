// Dépenses de chantier (§17.1) : rattachées à un projet, un lot, un fournisseur et un
// justificatif ; états engagée → facturée → payée (§17.3).

import { Download, Paperclip, Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toCsv } from '../../engine/csv';
import { formatMoney, parseNumber } from '../../engine/money';
import { deleteRow, insertRow, updateRow, useAction, useRows } from '../../lib/api';
import { downloadBlob, safeFileName } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { EXPENSE_CATEGORIES, EXPENSE_STATUS, PAYMENT_METHODS, fmtDate, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import type { Contact, Expense, Project, ProjectLot } from '../../lib/types';
import { Badge, Button, Card, Confirm, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Stat, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';
import { checkFile, openSigned } from './Documents';

export function ExpensesPage() {
  const { org } = useOrg();
  const [params] = useSearchParams();
  const [projectFilter, setProjectFilter] = useState(params.get('projet') ?? '');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [edit, setEdit] = useState<Partial<Expense> | null>(null);
  const rows = useRows<Expense>('expenses', org?.id, { order: ['expense_date', false] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const contacts = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind' });
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const sname = useMemo(() => new Map((contacts.data ?? []).map((c) => [c.id, c.name])), [contacts.data]);
  const cur = org?.currency ?? 'XOF';
  const s = q.trim().toLowerCase();
  const list = (rows.data ?? []).filter((e) => (!projectFilter || e.project_id === projectFilter) && (!category || e.category === category) && (!status || e.status === status)
    && (!from || e.expense_date >= from) && (!to || e.expense_date <= to)
    && (!s || [e.label, e.lot, e.note, e.supplier_invoice_ref, sname.get(e.supplier_id ?? '')].some((x) => x?.toLowerCase().includes(s))));
  const sum = (st?: string) => list.filter((e) => !st || e.status === st).reduce((a, e) => a + e.amount_ht, 0);
  const exportCsv = () => {
    const csv = toCsv([['Date', 'Projet', 'Lot', 'Catégorie', 'Libellé', 'Fournisseur', 'Montant HT', 'Taxes', 'Montant TTC', 'État', 'Payée le', 'Mode', 'Réf. facture fournisseur', 'Justificatif'],
      ...list.map((e) => [e.expense_date, pname.get(e.project_id ?? '') ?? '', e.lot ?? '', EXPENSE_CATEGORIES[e.category], e.label, sname.get(e.supplier_id ?? '') ?? '', e.amount_ht, e.tax_amount, e.amount_ttc, EXPENSE_STATUS[e.status].label, e.paid_on ?? '', e.payment_method ? PAYMENT_METHODS[e.payment_method] : '', e.supplier_invoice_ref ?? '', e.receipt_path ? 'oui' : 'non'])]);
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `depenses_${today()}.csv`);
  };
  return (
    <>
      <PageHeader title="Dépenses et rentabilité" subtitle="Matériaux, main-d’œuvre, transport, location, sous-traitance… rattachés au chantier, au lot, au fournisseur et au justificatif."
        actions={<>
          <Allowed module="depenses" action="exporter"><Button icon={<Download size={16} />} onClick={exportCsv} disabled={!list.length}>CSV</Button></Allowed>
          <Allowed module="depenses" action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ project_id: projectFilter || null, expense_date: today(), category: 'materiaux', status: 'engagee', amount_ht: 0, tax_amount: 0 })}>Nouvelle dépense</Button></Allowed>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total HT (filtre)" value={formatMoney(sum(), cur)} />
        <Stat label="Engagé (non facturé)" value={formatMoney(sum('engagee'), cur)} />
        <Stat label="Facturé, à payer" tone="warn" value={formatMoney(sum('facturee'), cur)} />
        <Stat label="Payé" tone="ok" value={formatMoney(sum('payee'), cur)} />
      </div>
      <Card bodyClass="p-0">
        <div className="grid gap-2 border-b border-line-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <SearchInput value={q} onChange={setQ} placeholder="Libellé, lot, fournisseur…" className="lg:col-span-2" />
          <Select aria-label="Projet" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="">Tous les projets</option>{(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select>
          <Select aria-label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Toutes catégories</option>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select aria-label="État" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous les états</option>{Object.entries(EXPENSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <div className="flex gap-1"><Input aria-label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input aria-label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={list} onRowClick={(e) => setEdit(e)}
            empty={<EmptyState icon={<Wallet size={22} />} title="Aucune dépense">Enregistrez les achats, la main-d’œuvre et les frais de chantier pour suivre le budget réel et la marge.</EmptyState>}
            columns={[
              { key: 'date', label: 'Date', sort: (e) => e.expense_date, render: (e) => fmtDate(e.expense_date) },
              { key: 'label', label: 'Dépense', render: (e) => <span><b className="text-navy-900">{e.label}</b>{!e.receipt_path && e.status !== 'engagee' && <Badge className="ml-1" tone="warn">sans justificatif</Badge>}<span className="block text-[12px] text-muted">{EXPENSE_CATEGORIES[e.category]}{e.lot ? ` · ${e.lot}` : ''}</span></span> },
              { key: 'project', label: 'Projet', render: (e) => pname.get(e.project_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'supplier', label: 'Fournisseur', render: (e) => sname.get(e.supplier_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'ht', label: 'HT', align: 'right', sort: (e) => e.amount_ht, render: (e) => <span className="tabular">{formatMoney(e.amount_ht, cur)}</span> },
              { key: 'status', label: 'État', render: (e) => <Badge tone={EXPENSE_STATUS[e.status].tone}>{EXPENSE_STATUS[e.status].label}</Badge> },
            ]} />
        )}
      </Card>
      {edit && <ExpenseForm initial={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export function ExpenseForm({ initial, onClose }: { initial: Partial<Expense>; onClose: () => void }) {
  const { org, can } = useOrg();
  const toast = useToast();
  const [e, setE] = useState<Partial<Expense>>(initial);
  const [ht, setHt] = useState(initial.amount_ht ? String(initial.amount_ht).replace('.', ',') : '');
  const [tax, setTax] = useState(initial.tax_amount ? String(initial.tax_amount).replace('.', ',') : '0');
  const [file, setFile] = useState<File | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const suppliers = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind, archived_at', filter: (q) => q.eq('kind', 'fournisseur'), key: ['fournisseurs'] });
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', e.project_id), order: ['sort'], key: [e.project_id], enabled: !!e.project_id });
  const set = (p: Partial<Expense>) => setE((x) => ({ ...x, ...p }));
  const vHt = parseNumber(ht), vTax = parseNumber(tax) ?? 0;
  const editable = initial.id ? can('depenses', 'modifier') : can('depenses', 'creer');
  const save = useAction(async () => {
    let receipt = e.receipt_path ?? null;
    if (file) {
      const chk = await checkFile(file);
      if ('error' in chk) throw new Error(chk.error);
      const path = `${org!.id}/depenses/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from('documents').upload(path, file, { contentType: chk.mime, upsert: false });
      if (up.error) throw new Error(`Justificatif : ${errorMessage(up.error)}`);
      receipt = path;
    }
    const values = {
      project_id: e.project_id || null, lot: e.lot || null, supplier_id: e.supplier_id || null, category: e.category, label: (e.label ?? '').trim(),
      expense_date: e.expense_date, amount_ht: vHt, tax_amount: vTax, status: e.status, paid_on: e.status === 'payee' ? (e.paid_on || today()) : null,
      payment_method: e.status === 'payee' ? (e.payment_method ?? null) : null, supplier_invoice_ref: e.supplier_invoice_ref || null, receipt_path: receipt, note: e.note || null,
    };
    return initial.id ? updateRow('expenses', initial.id, values) : insertRow('expenses', { org_id: org!.id, ...values });
  }, { success: 'Dépense enregistrée.', invalidate: [['expenses']] });
  const remove = useAction(() => deleteRow('expenses', initial.id!), { success: 'Dépense supprimée.', invalidate: [['expenses']] });
  const valid = !!(e.label ?? '').trim() && vHt !== null && vHt >= 0 && !!e.expense_date;
  return (
    <Modal title={initial.id ? 'Dépense' : 'Nouvelle dépense'} size="lg" onClose={onClose} footer={<>
      {initial.id && can('depenses', 'supprimer') && <Button variant="danger" className="mr-auto" onClick={() => setConfirmDel(true)}>Supprimer</Button>}
      <Button onClick={onClose}>Fermer</Button>
      {editable && <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Enregistrer</Button>}
    </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Libellé" required className="sm:col-span-2"><Input disabled={!editable} value={e.label ?? ''} onChange={(x) => set({ label: x.target.value })} placeholder="Ex. 40 sacs de ciment CPJ 35" /></Field>
        <Field label="Catégorie"><Select disabled={!editable} value={e.category} onChange={(x) => set({ category: x.target.value })}>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Date" required><Input disabled={!editable} type="date" value={e.expense_date ?? ''} onChange={(x) => set({ expense_date: x.target.value })} /></Field>
        <Field label="Projet"><Select disabled={!editable} value={e.project_id ?? ''} onChange={(x) => set({ project_id: x.target.value || null, lot: null })}><option value="">— Frais généraux —</option>{(projects.data ?? []).filter((p) => !p.archived_at || p.id === e.project_id).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
        <Field label="Lot"><Select disabled={!editable || !e.project_id} value={e.lot ?? ''} onChange={(x) => set({ lot: x.target.value || null })}><option value="">—</option>{(lots.data ?? []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</Select></Field>
        <Field label="Fournisseur"><Select disabled={!editable} value={e.supplier_id ?? ''} onChange={(x) => set({ supplier_id: x.target.value || null })}><option value="">—</option>{(suppliers.data ?? []).filter((c) => !c.archived_at || c.id === e.supplier_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Réf. facture fournisseur"><Input disabled={!editable} value={e.supplier_invoice_ref ?? ''} onChange={(x) => set({ supplier_invoice_ref: x.target.value })} /></Field>
        <Field label="Montant HT" required><Input disabled={!editable} inputMode="decimal" value={ht} onChange={(x) => setHt(x.target.value)} /></Field>
        <Field label="Taxes (montant)" hint={vHt !== null ? `TTC : ${formatMoney(vHt + vTax, org?.currency)}` : undefined}><Input disabled={!editable} inputMode="decimal" value={tax} onChange={(x) => setTax(x.target.value)} /></Field>
        <Field label="État"><Select disabled={!editable} value={e.status} onChange={(x) => set({ status: x.target.value as Expense['status'] })}>{Object.entries(EXPENSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        {e.status === 'payee' && <>
          <Field label="Payée le"><Input disabled={!editable} type="date" value={e.paid_on ?? today()} onChange={(x) => set({ paid_on: x.target.value })} /></Field>
          <Field label="Mode de paiement"><Select disabled={!editable} value={e.payment_method ?? ''} onChange={(x) => set({ payment_method: (x.target.value || null) as Expense['payment_method'] })}><option value="">—</option>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </>}
        <Field label="Justificatif (facture, reçu, photo)" className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {e.receipt_path && <Button size="sm" icon={<Paperclip size={14} />} onClick={() => openSigned(e.receipt_path!).catch((x) => toast('bad', errorMessage(x)))}>Voir le justificatif</Button>}
            {editable && <input aria-label="Justificatif" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="text-[13px]" onChange={(x) => setFile(x.target.files?.[0] ?? null)} />}
          </div>
        </Field>
        <Field label="Note" className="sm:col-span-2"><Textarea disabled={!editable} rows={2} value={e.note ?? ''} onChange={(x) => set({ note: x.target.value })} /></Field>
      </div>
      {e.status !== 'engagee' && !e.receipt_path && !file && <Notice tone="warn" className="mt-3">Dépense facturée ou payée sans justificatif : elle sera signalée dans les alertes du chantier.</Notice>}
      {confirmDel && <Confirm danger title="Supprimer cette dépense ?" confirmLabel="Supprimer" onClose={() => setConfirmDel(false)} onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}>La dépense sera retirée du budget réel du chantier.</Confirm>}
    </Modal>
  );
}
