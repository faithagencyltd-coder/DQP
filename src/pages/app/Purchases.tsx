// Achats et commandes (§18.1, §18.2) : demandes d'achat approuvées puis commandées, bons de
// commande validés selon les droits, réceptions totales ou partielles, rapprochement avec la
// facture du fournisseur et création de la dépense correspondante.

import { CheckCircle2, Download, PackageCheck, Plus, ShoppingCart, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { uid } from '../../engine/ids';
import { formatMoney, formatNumber, parseNumber } from '../../engine/money';
import { reconcile } from '../../engine/purchasing';
import { deleteRow, insertRow, rpc, updateRow, useAction, useRow, useRows } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { ORDER_STATUS, REQUEST_STATUS, fmtDate, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, OrderLine, PriceItem, Project, ProjectLot, PurchaseOrder, PurchaseReceipt, PurchaseRequest, Warehouse } from '../../lib/types';
import { Badge, Button, Card, Checkbox, Confirm, DataTable, EmptyState, Field, Input, KeyValue, Modal, Notice, PageHeader, Select, Spinner, Tabs, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';

export function PurchasesPage() {
  const [tab, setTab] = useState<'demandes' | 'commandes'>('demandes');
  return (
    <>
      <PageHeader title="Achats et commandes" subtitle="Demandes d’achat, approbation, bons de commande, réceptions et rapprochement des factures fournisseurs." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'demandes', label: 'Demandes d’achat' }, { id: 'commandes', label: 'Commandes fournisseurs' }]} />
      {tab === 'demandes' ? <Requests /> : <Orders />}
    </>
  );
}

function Requests() {
  const { org, can } = useOrg();
  const nav = useNavigate();
  const toast = useToast();
  const rows = useRows<PurchaseRequest>('purchase_requests', org?.id, { order: ['created_at', false] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const suppliers = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind, archived_at', filter: (q) => q.eq('kind', 'fournisseur'), key: ['fournisseurs'] });
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const [form, setForm] = useState(false);
  const [decide, setDecide] = useState<{ r: PurchaseRequest; approve: boolean } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [supplier, setSupplier] = useState('');
  const toOrder = useAction(() => rpc<string>('order_from_requests', { p_requests: picked, p_supplier: supplier || null }), { success: 'Commande créée (brouillon).', invalidate: [['purchase_requests'], ['purchase_orders']] });
  const approved = (rows.data ?? []).filter((r) => r.status === 'approuvee');
  return (
    <>
      <Card bodyClass="p-0" title="Demandes" actions={<Allowed module="achats" action="creer"><Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setForm(true)}>Nouvelle demande</Button></Allowed>}>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={rows.data ?? []}
            empty={<EmptyState icon={<ShoppingCart size={22} />} title="Aucune demande d’achat">Le chantier exprime un besoin (article, quantité, date) ; un responsable l’approuve, puis il est commandé.</EmptyState>}
            columns={[
              { key: 'sel', label: '', render: (r) => r.status === 'approuvee' && can('achats', 'creer') ? <input type="checkbox" aria-label={`Sélectionner ${r.reference}`} checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} /> : null },
              { key: 'ref', label: 'Réf.', render: (r) => <span className="tabular text-muted">{r.reference}</span> },
              { key: 'des', label: 'Besoin', render: (r) => <span><b className="text-navy-900">{r.designation}</b><span className="block text-[12px] text-muted">{formatNumber(r.qty, 3)} {r.unit}{r.needed_by ? ` · pour le ${fmtDate(r.needed_by)}` : ''}</span></span> },
              { key: 'project', label: 'Chantier', render: (r) => pname.get(r.project_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'just', label: 'Justification', render: (r) => r.justification ?? '—', hideOnMobile: true },
              { key: 'status', label: 'Statut', render: (r) => <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge> },
              { key: 'act', label: '', render: (r) => r.status === 'soumise' && can('achats', 'valider') ? <span className="flex gap-1"><Button size="sm" onClick={() => setDecide({ r, approve: true })}>Approuver</Button><Button size="sm" variant="ghost" onClick={() => setDecide({ r, approve: false })}>Refuser</Button></span>
                : r.order_id ? <Link className="link text-[13px]" to={`/app/achats/${r.order_id}`}>Voir la commande</Link> : null },
            ]} />
        )}
      </Card>
      {approved.length > 0 && can('achats', 'creer') && (
        <Card className="mt-3" title="Commander les demandes approuvées sélectionnées">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Fournisseur" className="w-72"><Select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">— Choisir —</option>{(suppliers.data ?? []).filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Button variant="primary" disabled={!picked.length} loading={toOrder.isPending} onClick={() => toOrder.mutate(undefined, { onSuccess: (id) => nav(`/app/achats/${id}`), onError: (e) => toast('bad', errorMessage(e)) })}>Créer le bon de commande ({picked.length})</Button>
          </div>
        </Card>
      )}
      {form && <RequestForm onClose={() => setForm(false)} />}
      {decide && <DecideDialog r={decide.r} approve={decide.approve} onClose={() => setDecide(null)} />}
    </>
  );
}

function RequestForm({ onClose }: { onClose: () => void }) {
  const { org } = useOrg();
  const items = useRows<PriceItem>('price_items', org?.id, { select: 'id, designation, unit, kind, archived_at, purchase_price', filter: (q) => q.eq('kind', 'article'), key: ['articles'] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const suppliers = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind, archived_at', filter: (q) => q.eq('kind', 'fournisseur'), key: ['fournisseurs'] });
  const [v, setV] = useState({ item_id: '', designation: '', qty: '', unit: 'u', needed_by: '', project_id: '', lot: '', supplier_id: '', justification: '' });
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', v.project_id), order: ['sort'], key: [v.project_id], enabled: !!v.project_id });
  const qty = parseNumber(v.qty);
  const save = useAction(() => insertRow('purchase_requests', { org_id: org!.id, item_id: v.item_id || null, designation: v.designation.trim(), qty, unit: v.unit, needed_by: v.needed_by || null, project_id: v.project_id || null, lot: v.lot || null, supplier_id: v.supplier_id || null, justification: v.justification || null }), { success: 'Demande envoyée pour approbation.', invalidate: [['purchase_requests']] });
  return (
    <Modal title="Nouvelle demande d’achat" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!v.designation.trim() || !qty || qty <= 0} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Envoyer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Article de la bibliothèque" className="sm:col-span-2" hint="Facultatif ; nécessaire pour l’entrée en stock à la réception.">
          <Select value={v.item_id} onChange={(e) => { const it = (items.data ?? []).find((x) => x.id === e.target.value); setV({ ...v, item_id: e.target.value, designation: it?.designation ?? v.designation, unit: it?.unit ?? v.unit }); }}>
            <option value="">— Article libre —</option>{(items.data ?? []).filter((x) => !x.archived_at).map((x) => <option key={x.id} value={x.id}>{x.designation} ({x.unit})</option>)}
          </Select>
        </Field>
        <Field label="Désignation" required className="sm:col-span-2"><Input value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })} /></Field>
        <Field label="Quantité" required><Input inputMode="decimal" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} /></Field>
        <Field label="Unité"><Input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} disabled={!!v.item_id} /></Field>
        <Field label="Chantier"><Select value={v.project_id} onChange={(e) => setV({ ...v, project_id: e.target.value, lot: '' })}><option value="">—</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
        <Field label="Lot"><Select value={v.lot} disabled={!v.project_id} onChange={(e) => setV({ ...v, lot: e.target.value })}><option value="">—</option>{(lots.data ?? []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</Select></Field>
        <Field label="Date souhaitée"><Input type="date" value={v.needed_by} onChange={(e) => setV({ ...v, needed_by: e.target.value })} /></Field>
        <Field label="Fournisseur proposé"><Select value={v.supplier_id} onChange={(e) => setV({ ...v, supplier_id: e.target.value })}><option value="">—</option>{(suppliers.data ?? []).filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Justification" className="sm:col-span-2"><Textarea rows={2} value={v.justification} onChange={(e) => setV({ ...v, justification: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function DecideDialog({ r, approve, onClose }: { r: PurchaseRequest; approve: boolean; onClose: () => void }) {
  const [note, setNote] = useState('');
  const act = useAction(() => rpc('decide_purchase_request', { p_request: r.id, p_approve: approve, p_note: note || null }), { success: approve ? 'Demande approuvée.' : 'Demande refusée.', invalidate: [['purchase_requests']] });
  return (
    <Modal title={`${approve ? 'Approuver' : 'Refuser'} ${r.reference}`} onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant={approve ? 'primary' : 'danger'} loading={act.isPending} onClick={() => act.mutate(undefined, { onSuccess: onClose })}>{approve ? 'Approuver' : 'Refuser'}</Button></>}>
      <p className="mb-3 text-[14px]">{r.designation} — {formatNumber(r.qty, 3)} {r.unit}</p>
      <Field label="Commentaire"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function Orders() {
  const { org } = useOrg();
  const nav = useNavigate();
  const rows = useRows<PurchaseOrder>('purchase_orders', org?.id, { order: ['created_at', false] });
  const suppliers = useRows<Contact>('contacts', org?.id, { select: 'id, name' });
  const sname = useMemo(() => new Map((suppliers.data ?? []).map((c) => [c.id, c.name])), [suppliers.data]);
  const create = useAction(() => insertRow<PurchaseOrder>('purchase_orders', { org_id: org!.id, currency: org!.currency, lines: [{ id: uid('l'), designation: '', unit: 'u', qty: null, unit_price: null }] }), { invalidate: [['purchase_orders']] });
  return (
    <Card bodyClass="p-0" title="Commandes" actions={<Allowed module="achats" action="creer"><Button size="sm" variant="primary" icon={<Plus size={15} />} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (o) => nav(`/app/achats/${o.id}`) })}>Nouvelle commande</Button></Allowed>}>
      {rows.isLoading ? <Spinner /> : (
        <DataTable rows={rows.data ?? []} onRowClick={(o) => nav(`/app/achats/${o.id}`)}
          empty={<EmptyState icon={<ShoppingCart size={22} />} title="Aucune commande">Créez une commande, ou commandez des demandes approuvées.</EmptyState>}
          columns={[
            { key: 'ref', label: 'Numéro', render: (o) => <span className="tabular text-muted">{o.reference}</span> },
            { key: 'sup', label: 'Fournisseur', render: (o) => <b className="text-navy-900">{sname.get(o.supplier_id ?? '') ?? '—'}</b> },
            { key: 'date', label: 'Date', sort: (o) => o.order_date, render: (o) => fmtDate(o.order_date) },
            { key: 'total', label: 'Total HT', align: 'right', render: (o) => <span className="tabular">{formatMoney(o.total_ht, o.currency)}</span> },
            { key: 'inv', label: 'Facture fournisseur', render: (o) => { const r = reconcile(o.lines, o.currency, o.supplier_invoice_amount); return r.status === 'sans_facture' ? '—' : <Badge tone={r.status === 'conforme' ? 'ok' : 'bad'}>{r.status === 'conforme' ? 'Conforme' : 'Écart'}</Badge>; }, hideOnMobile: true },
            { key: 'status', label: 'Statut', render: (o) => <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge> },
          ]} />
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ fiche commande
export function PurchaseOrderEditor() {
  const { id } = useParams();
  const { org, can } = useOrg();
  const toast = useToast();
  const nav = useNavigate();
  const row = useRow<PurchaseOrder>('purchase_orders', id);
  const suppliers = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind, phone, email, address, city, contact_person, archived_at' });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, location, archived_at' });
  const warehouses = useRows<Warehouse>('warehouses', org?.id, { order: ['name'] });
  const items = useRows<PriceItem>('price_items', org?.id, { select: 'id, designation, unit, kind, purchase_price, archived_at', filter: (q) => q.eq('kind', 'article'), key: ['articles'] });
  const receipts = useRows<PurchaseReceipt>('purchase_receipts', org?.id, { filter: (q) => q.eq('order_id', id), order: ['created_at'], key: [id] });
  const [o, setO] = useState<PurchaseOrder | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<null | 'receive' | 'cancel' | 'delete' | 'invoice'>(null);
  useEffect(() => { if (row.data && (!o || !dirty)) setO(row.data); }, [row.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = o?.status === 'brouillon' && can('achats', 'modifier');
  const save = useAction(async () => {
    const r = await updateRow<PurchaseOrder>('purchase_orders', o!.id, { supplier_id: o!.supplier_id, project_id: o!.project_id, warehouse_id: o!.warehouse_id, order_date: o!.order_date, expected_date: o!.expected_date, lines: o!.lines, notes: o!.notes });
    setDirty(false);
    setO(r);
    return r;
  }, { success: 'Commande enregistrée.', invalidate: [['purchase_orders']] });
  const status = useAction(async (s: string) => { if (dirty) await save.mutateAsync(undefined); await rpc('set_order_status', { p_order: o!.id, p_status: s }); }, { success: 'Statut mis à jour.', invalidate: [['purchase_orders']] });
  const remove = useAction(() => deleteRow('purchase_orders', o!.id), { success: 'Brouillon supprimé.', invalidate: [['purchase_orders']] });
  if (row.isLoading || !o) return row.isLoading || row.data ? <Spinner /> : <Notice tone="bad">Commande introuvable ou accès non autorisé.</Notice>;
  const set = (p: Partial<PurchaseOrder>) => { setO({ ...o, ...p }); setDirty(true); };
  const setLine = (lid: string, p: Partial<OrderLine>) => set({ lines: o.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const supplier = (suppliers.data ?? []).find((c) => c.id === o.supplier_id);
  const project = (projects.data ?? []).find((p) => p.id === o.project_id);
  const warehouse = (warehouses.data ?? []).find((w) => w.id === o.warehouse_id);
  const rec = reconcile(o.lines, o.currency, o.supplier_invoice_amount);
  const refresh = () => { void row.refetch(); void receipts.refetch(); };
  const total = o.lines.reduce((s, l) => s + (l.qty ?? 0) * (l.unit_price ?? 0), 0);
  return (
    <>
      <PageHeader back={<Link className="link" to="/app/achats">← Achats</Link>}
        title={<span className="flex items-center gap-2">{o.reference} <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></span>}
        subtitle={supplier?.name ?? 'Fournisseur à choisir'}
        actions={<>
          <Allowed module="achats" action="exporter"><Button icon={<Download size={16} />} onClick={async () => { const { orderPdf } = await import('../../docs/achats-pdf'); await orderPdf(org!, o, { supplier, project, warehouse }).catch((e) => toast('bad', errorMessage(e))); }}>Bon de commande PDF</Button></Allowed>
          {editable && <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(undefined)}>Enregistrer</Button>}
          {o.status === 'brouillon' && <Allowed module="achats" action="valider"><Button variant="primary" icon={<CheckCircle2 size={16} />} loading={status.isPending} onClick={() => status.mutate('validee')}>Valider</Button></Allowed>}
          {o.status === 'validee' && <Allowed module="achats" action="modifier"><Button onClick={() => status.mutate('envoyee')}>Marquer envoyée</Button></Allowed>}
          {['validee', 'envoyee', 'partielle'].includes(o.status) && <Allowed module="achats" action="creer"><Button variant="primary" icon={<PackageCheck size={16} />} onClick={() => setDialog('receive')}>Réceptionner</Button></Allowed>}
          {['brouillon', 'validee', 'envoyee'].includes(o.status) && <Allowed module="achats" action="valider"><Button icon={<XCircle size={16} />} onClick={() => setDialog('cancel')}>Annuler</Button></Allowed>}
          {o.status === 'brouillon' && <Allowed module="achats" action="supprimer"><Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDialog('delete')}>Supprimer</Button></Allowed>}
        </>} />
      <div className="mb-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Commande">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fournisseur" required><Select disabled={!editable} value={o.supplier_id ?? ''} onChange={(e) => set({ supplier_id: e.target.value || null })}><option value="">— Choisir —</option>{(suppliers.data ?? []).filter((c) => c.kind === 'fournisseur' && !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Chantier"><Select disabled={!editable} value={o.project_id ?? ''} onChange={(e) => set({ project_id: e.target.value || null })}><option value="">—</option>{(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
            <Field label="Date de commande"><Input type="date" disabled={!editable} value={o.order_date} onChange={(e) => set({ order_date: e.target.value })} /></Field>
            <Field label="Livraison souhaitée"><Input type="date" disabled={!editable} value={o.expected_date ?? ''} onChange={(e) => set({ expected_date: e.target.value || null })} /></Field>
            <Field label="Dépôt de livraison (entrée en stock)"><Select disabled={!editable} value={o.warehouse_id ?? ''} onChange={(e) => set({ warehouse_id: e.target.value || null })}><option value="">— Livraison directe sur chantier —</option>{(warehouses.data ?? []).filter((w) => !w.archived_at).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
            <Field label="Observations"><Input disabled={!editable} value={o.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </div>
        </Card>
        <Card title="Facture du fournisseur (rapprochement)">
          <KeyValue items={[['Commandé HT', formatMoney(rec.ordered, o.currency)], ['Reçu HT', formatMoney(rec.received, o.currency)], ['Facturé', rec.invoiced === null ? '—' : formatMoney(rec.invoiced, o.currency)], ['Référence', o.supplier_invoice_ref ?? '—']]} />
          <Notice tone={rec.status === 'conforme' ? 'ok' : rec.status === 'ecart' ? 'bad' : 'navy'} className="mt-3">{rec.text}</Notice>
          {o.status !== 'brouillon' && <Allowed module="achats" action="modifier"><Button size="sm" className="mt-3" onClick={() => setDialog('invoice')}>Saisir la facture du fournisseur</Button></Allowed>}
        </Card>
      </div>
      <Card bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead><tr className="border-b border-line bg-navy-50/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted"><th className="px-2 py-2">Article</th><th className="px-2">Désignation</th><th className="px-2">Unité</th><th className="px-2 text-right">Quantité</th><th className="px-2 text-right">P.U. HT</th><th className="px-2 text-right">Montant HT</th><th className="px-2 text-right">Reçu</th><th /></tr></thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id} className="border-b border-line-2">
                  <td className="px-2 py-1"><select aria-label="Article" disabled={!editable} className="cell-input w-44" value={l.item_id ?? ''} onChange={(e) => { const it = (items.data ?? []).find((x) => x.id === e.target.value); setLine(l.id, { item_id: e.target.value || null, designation: it?.designation ?? l.designation, unit: it?.unit ?? l.unit, unit_price: l.unit_price ?? it?.purchase_price ?? null }); }}><option value="">— libre —</option>{(items.data ?? []).filter((x) => !x.archived_at).map((x) => <option key={x.id} value={x.id}>{x.designation}</option>)}</select></td>
                  <td className="px-2 py-1"><input aria-label="Désignation" disabled={!editable} className="cell-input" value={l.designation} onChange={(e) => setLine(l.id, { designation: e.target.value })} /></td>
                  <td className="px-2 py-1"><input aria-label="Unité" disabled={!editable || !!l.item_id} className="cell-input w-16" value={l.unit} onChange={(e) => setLine(l.id, { unit: e.target.value })} /></td>
                  <td className="px-2 py-1 text-right"><input aria-label="Quantité" disabled={!editable} inputMode="decimal" className="cell-input w-20 text-right" defaultValue={l.qty ?? ''} onBlur={(e) => setLine(l.id, { qty: parseNumber(e.target.value) })} /></td>
                  <td className="px-2 py-1 text-right"><input aria-label="Prix unitaire" disabled={!editable} inputMode="decimal" className="cell-input w-24 text-right" defaultValue={l.unit_price ?? ''} onBlur={(e) => setLine(l.id, { unit_price: parseNumber(e.target.value) })} /></td>
                  <td className="tabular px-2 text-right">{formatMoney((l.qty ?? 0) * (l.unit_price ?? 0), o.currency)}</td>
                  <td className="tabular px-2 text-right">{formatNumber(l.received_qty ?? 0, 3)}</td>
                  <td className="px-1">{editable && <button aria-label="Supprimer la ligne" className="p-1 text-faint hover:text-bad-600" onClick={() => set({ lines: o.lines.filter((x) => x.id !== l.id) })}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={5} className="px-2 py-2">{editable && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => set({ lines: [...o.lines, { id: uid('l'), designation: '', unit: 'u', qty: null, unit_price: null }] })}>Ligne</Button>}</td><td className="tabular px-2 text-right font-bold">{formatMoney(dirty ? total : o.total_ht, o.currency)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        </div>
      </Card>
      {(receipts.data ?? []).length > 0 && <Card className="mt-4" title="Réceptions">
        <ul className="divide-y divide-line-2 text-[13px]">{(receipts.data ?? []).map((r) => <li key={r.id} className="py-2"><b>{fmtDate(r.received_on)}</b> · {r.lines.map((x) => { const l = o.lines.find((y) => y.id === x.line_id); return `${formatNumber(x.qty, 3)} ${l?.unit ?? ''} ${l?.designation ?? ''}`; }).join(', ')}{r.warehouse_id ? ` → ${(warehouses.data ?? []).find((w) => w.id === r.warehouse_id)?.name ?? 'dépôt'}` : ''}{r.note ? ` — ${r.note}` : ''}</li>)}</ul>
      </Card>}
      {dialog === 'receive' && <ReceiveDialog order={o} warehouses={warehouses.data ?? []} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'invoice' && <SupplierInvoiceDialog order={o} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'cancel' && <Confirm danger title={`Annuler la commande ${o.reference} ?`} confirmLabel="Annuler la commande" onClose={() => setDialog(null)} onConfirm={() => status.mutateAsync('annulee').then(refresh)}>La commande restera consultable avec le statut « Annulée ».</Confirm>}
      {dialog === 'delete' && <Confirm danger title="Supprimer ce brouillon ?" confirmLabel="Supprimer" onClose={() => setDialog(null)} onConfirm={() => remove.mutateAsync(undefined).then(() => nav('/app/achats'))}>Le brouillon sera supprimé.</Confirm>}
    </>
  );
}

function ReceiveDialog({ order, warehouses, onClose, onDone }: { order: PurchaseOrder; warehouses: Warehouse[]; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(order.lines.map((l) => [l.id, String((l.qty ?? 0) - (l.received_qty ?? 0)).replace('.', ',')])));
  const [wh, setWh] = useState(order.warehouse_id ?? '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const receive = useAction(() => rpc('receive_order', { p_order: order.id, p_lines: order.lines.map((l) => ({ line_id: l.id, qty: parseNumber(qty[l.id] ?? '0') ?? 0 })), p_warehouse: wh || null, p_date: date, p_note: note || null }), { success: 'Réception enregistrée.', invalidate: [['purchase_orders'], ['purchase_receipts'], ['stock_levels'], ['stock_movements']] });
  const noItem = order.lines.some((l) => !l.item_id);
  return (
    <Modal title="Réception de la commande" size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={receive.isPending} onClick={() => receive.mutate(undefined, { onSuccess: () => { onDone(); onClose(); } })}>Enregistrer la réception</Button></>}>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Dépôt"><Select value={wh} onChange={(e) => setWh(e.target.value)}><option value="">— Livraison directe (pas d’entrée en stock) —</option>{warehouses.filter((w) => !w.archived_at).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        <Field label="Note (bon de livraison…)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <table className="w-full text-[13px]">
        <thead><tr className="text-left text-[12px] text-muted"><th>Désignation</th><th className="text-right">Commandé</th><th className="text-right">Déjà reçu</th><th className="text-right">Reçu ce jour</th></tr></thead>
        <tbody>{order.lines.map((l) => (
          <tr key={l.id} className="border-t border-line-2"><td className="py-1.5">{l.designation}</td><td className="text-right">{formatNumber(l.qty ?? 0, 3)} {l.unit}</td><td className="text-right">{formatNumber(l.received_qty ?? 0, 3)}</td>
            <td className="text-right"><input aria-label={`Reçu ${l.designation}`} inputMode="decimal" className="cell-input w-24 text-right" value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} /></td></tr>
        ))}</tbody>
      </table>
      {wh && noItem && <Notice tone="navy" className="mt-3">Les lignes sans article de la bibliothèque sont réceptionnées mais n’entrent pas en stock.</Notice>}
    </Modal>
  );
}

function SupplierInvoiceDialog({ order, onClose, onDone }: { order: PurchaseOrder; onClose: () => void; onDone: () => void }) {
  const { org, can } = useOrg();
  const [ref, setRef] = useState(order.supplier_invoice_ref ?? '');
  const [amount, setAmount] = useState(order.supplier_invoice_amount !== null ? String(order.supplier_invoice_amount) : '');
  const [expense, setExpense] = useState(can('depenses', 'creer'));
  const save = useAction(async () => {
    const v = parseNumber(amount);
    await updateRow('purchase_orders', order.id, { supplier_invoice_ref: ref || null, supplier_invoice_amount: v });
    if (expense && v !== null) {
      await insertRow('expenses', { org_id: org!.id, project_id: order.project_id, supplier_id: order.supplier_id, category: 'materiaux', label: `Commande ${order.reference}`, amount_ht: v, tax_amount: 0, status: 'facturee', supplier_invoice_ref: ref || null, purchase_order_id: order.id });
    }
  }, { success: 'Facture du fournisseur enregistrée.', invalidate: [['purchase_orders'], ['expenses']] });
  return (
    <Modal title="Facture du fournisseur" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { onDone(); onClose(); } })}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Référence de la facture"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="Montant HT facturé"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      {can('depenses', 'creer') && <div className="mt-3"><Checkbox label="Créer la dépense correspondante (état « facturée », à payer)" checked={expense} onChange={setExpense} /></div>}
    </Modal>
  );
}
