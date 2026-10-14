// Historique d'un contact (§7.1, §7.2) : pour un client, factures, paiements et solde ; pour un
// fournisseur, articles fournis et tarifs, commandes, factures et dépenses. Plus le journal des
// modifications de la fiche (§7.3).

import { Link } from 'react-router-dom';
import { balance, dueState } from '../../engine/finance';
import { formatMoney } from '../../engine/money';
import { reconcile } from '../../engine/purchasing';
import { useRows } from '../../lib/api';
import { EXPENSE_STATUS, INVOICE_STATUS, ORDER_STATUS, fmtDate, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, Expense, Invoice, Payment, PriceItem, PurchaseOrder } from '../../lib/types';
import { Badge, Card, KeyValue } from '../../ui';
import { ActivityList } from './Journal';

const row = 'flex items-center justify-between gap-2 border-b border-line-2 px-4 py-2.5 text-[13.5px] last:border-0 hover:bg-navy-50/50';

export function ClientHistory({ contact }: { contact: Contact }) {
  const { org, can } = useOrg();
  const cur = org?.currency ?? 'XOF';
  const allowed = can('factures', 'consulter');
  const invoices = useRows<Invoice>('invoices', org?.id, { select: 'id, reference, kind, title, status, net_ht, total_ttc, amount_paid, issue_date, due_date, quote_id, project_id, client_id', filter: (q) => q.eq('client_id', contact.id), order: ['created_at', false], key: ['client', contact.id], enabled: allowed });
  const ids = (invoices.data ?? []).map((i) => i.id);
  const payments = useRows<Payment>('payments', org?.id, { filter: (q) => q.in('invoice_id', ids), order: ['paid_on', false], key: ['client', contact.id, ids.length], enabled: allowed && ids.length > 0 });
  if (!allowed) return null;
  const now = today();
  const issued = (invoices.data ?? []).filter((i) => i.status !== 'brouillon' && i.status !== 'annulee');
  const billed = issued.reduce((s, i) => s + Number(i.total_ttc), 0);
  const paid = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const due = issued.reduce((s, i) => s + balance(i), 0);
  const overdue = issued.filter((i) => dueState(i, now).state === 'echue');
  const ref = new Map((invoices.data ?? []).map((i) => [i.id, i.reference ?? 'brouillon']));
  return (
    <>
      <Card title="Situation financière du client">
        <KeyValue items={[
          ['Facturé (TTC, avoirs déduits)', formatMoney(billed, cur)], ['Paiements déclarés', formatMoney(paid, cur)],
          ['Solde restant dû', <b key="s" className={due > 0 ? 'text-navy-900' : ''}>{formatMoney(due, cur)}</b>],
          ['Factures échues', overdue.length ? <span key="o" className="font-semibold text-bad-600">{overdue.length} · {formatMoney(overdue.reduce((s, i) => s + balance(i), 0), cur)}</span> : 'aucune'],
        ]} />
      </Card>
      <Card title={`Factures (${invoices.data?.length ?? 0})`} bodyClass="p-0">
        {!(invoices.data ?? []).length ? <p className="p-4 text-[13.5px] text-muted">Aucune facture.</p> : (invoices.data ?? []).map((i) => (
          <Link key={i.id} to={`/app/factures/${i.id}`} className={row}>
            <span className="min-w-0 truncate"><span className="text-muted">{i.reference ?? 'Brouillon'}</span> · <b className="text-navy-900">{i.title}</b>{i.issue_date && <span className="text-muted"> · {fmtDate(i.issue_date)}</span>}</span>
            <span className="flex shrink-0 items-center gap-2"><span className="tabular">{formatMoney(i.total_ttc, cur)}</span><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge></span>
          </Link>
        ))}
      </Card>
      <Card title={`Paiements (${payments.data?.length ?? 0})`} bodyClass="p-0">
        {!(payments.data ?? []).length ? <p className="p-4 text-[13.5px] text-muted">Aucun paiement déclaré.</p> : (payments.data ?? []).map((p) => (
          <div key={p.id} className={row}>
            <span>{fmtDate(p.paid_on)} · <span className="text-muted">{ref.get(p.invoice_id)}</span>{p.reference ? ` · ${p.reference}` : ''}</span>
            <span className="flex items-center gap-2"><span className="tabular font-semibold">{formatMoney(p.amount, cur)}</span><Badge tone="grey">Déclaré</Badge></span>
          </div>
        ))}
      </Card>
    </>
  );
}

export function SupplierHistory({ contact }: { contact: Contact }) {
  const { org, can } = useOrg();
  const cur = org?.currency ?? 'XOF';
  const items = useRows<PriceItem>('price_items', org?.id, { select: 'id, code, designation, unit, purchase_price, price_date, currency, archived_at, kind', filter: (q) => q.eq('supplier_id', contact.id), order: ['designation'], key: ['fournisseur', contact.id], enabled: can('prix', 'consulter') });
  const orders = useRows<PurchaseOrder>('purchase_orders', org?.id, { filter: (q) => q.eq('supplier_id', contact.id), order: ['order_date', false], key: ['fournisseur', contact.id], enabled: can('achats', 'consulter') });
  const expenses = useRows<Expense>('expenses', org?.id, { filter: (q) => q.eq('supplier_id', contact.id), order: ['expense_date', false], key: ['fournisseur', contact.id], enabled: can('depenses', 'consulter') });
  const active = (orders.data ?? []).filter((o) => o.status !== 'annulee' && o.status !== 'brouillon');
  const gaps = active.filter((o) => reconcile(o.lines, o.currency, o.supplier_invoice_amount).status === 'ecart');
  const dueRows = (expenses.data ?? []).filter((e) => e.status === 'facturee');
  return (
    <>
      {(can('achats', 'consulter') || can('depenses', 'consulter')) && (
        <Card title="Synthèse des achats">
          <KeyValue items={[
            ...(can('achats', 'consulter') ? [
              ['Commandes validées (HT)', formatMoney(active.reduce((s, o) => s + Number(o.total_ht), 0), cur)],
              ['Écarts facture / commande', gaps.length ? <span key="g" className="font-semibold text-bad-600">{gaps.length} commande(s)</span> : 'aucun'],
            ] as [string, React.ReactNode][] : []),
            ...(can('depenses', 'consulter') ? [
              ['Dépenses enregistrées (HT)', formatMoney((expenses.data ?? []).reduce((s, e) => s + Number(e.amount_ht), 0), cur)],
              ['Facturé, à payer (TTC)', formatMoney(dueRows.reduce((s, e) => s + Number(e.amount_ttc), 0), cur)],
            ] as [string, React.ReactNode][] : []),
          ]} />
        </Card>
      )}
      {can('prix', 'consulter') && (
        <Card title={`Articles fournis et tarifs (${items.data?.length ?? 0})`} bodyClass="p-0">
          {!(items.data ?? []).length ? <p className="p-4 text-[13.5px] text-muted">Aucun article de la bibliothèque n’est rattaché à ce fournisseur.</p> : (items.data ?? []).map((i) => (
            <Link key={i.id} to="/app/prix" className={row}>
              <span className="min-w-0 truncate">{i.code && <span className="text-muted">{i.code} · </span>}<b className="text-navy-900">{i.designation}</b>{i.archived_at && <Badge className="ml-2">Archivé</Badge>}</span>
              <span className="shrink-0 text-right"><span className="tabular font-semibold">{i.purchase_price === null ? 'prix non saisi' : `${formatMoney(i.purchase_price, i.currency)} / ${i.unit}`}</span>{i.price_date && <span className="block text-[11.5px] text-muted">au {fmtDate(i.price_date)}</span>}</span>
            </Link>
          ))}
        </Card>
      )}
      {can('achats', 'consulter') && (
        <Card title={`Commandes (${orders.data?.length ?? 0})`} bodyClass="p-0">
          {!(orders.data ?? []).length ? <p className="p-4 text-[13.5px] text-muted">Aucune commande.</p> : (orders.data ?? []).map((o) => (
            <Link key={o.id} to={`/app/achats/${o.id}`} className={row}>
              <span><span className="text-muted">{o.reference}</span> · {fmtDate(o.order_date)}{o.supplier_invoice_ref && <span className="text-muted"> · facture {o.supplier_invoice_ref}</span>}</span>
              <span className="flex items-center gap-2"><span className="tabular">{formatMoney(o.total_ht, o.currency)}</span><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></span>
            </Link>
          ))}
        </Card>
      )}
      {can('depenses', 'consulter') && (
        <Card title={`Factures et dépenses (${expenses.data?.length ?? 0})`} bodyClass="p-0">
          {!(expenses.data ?? []).length ? <p className="p-4 text-[13.5px] text-muted">Aucune dépense enregistrée chez ce fournisseur.</p> : (expenses.data ?? []).map((e) => (
            <Link key={e.id} to="/app/depenses" className={row}>
              <span className="min-w-0 truncate">{fmtDate(e.expense_date)} · <b className="text-navy-900">{e.label}</b>{e.supplier_invoice_ref && <span className="text-muted"> · {e.supplier_invoice_ref}</span>}{e.receipt_path && <span className="text-muted"> · justificatif</span>}</span>
              <span className="flex shrink-0 items-center gap-2"><span className="tabular">{formatMoney(e.amount_ttc, cur)}</span><Badge tone={EXPENSE_STATUS[e.status].tone}>{EXPENSE_STATUS[e.status].label}</Badge></span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

export function ContactJournal({ contact }: { contact: Contact }) {
  return <Card title="Historique des modifications de la fiche"><div className="max-h-[260px] overflow-y-auto"><ActivityList entityId={contact.id} limit={50} compact /></div></Card>;
}
