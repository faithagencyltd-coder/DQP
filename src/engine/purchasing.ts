// Achats et stocks (§18) : valeur reçue d'une commande, rapprochement avec la facture du
// fournisseur, alertes de réapprovisionnement. Les quantités de stock viennent de la base
// (somme des mouvements) : ce module ne fait que les interpréter.

import { roundMoney } from './money';

export interface OrderLineLike { qty: number | null; unit_price: number | null; received_qty?: number }

export function orderTotal(lines: OrderLineLike[], currency: string): number {
  return lines.reduce((s, l) => s + roundMoney((l.qty ?? 0) * (l.unit_price ?? 0), currency), 0);
}

/** Valeur HT des quantités effectivement reçues. */
export function receivedValue(lines: OrderLineLike[], currency: string): number {
  return lines.reduce((s, l) => s + roundMoney((l.received_qty ?? 0) * (l.unit_price ?? 0), currency), 0);
}

export interface Reconciliation {
  status: 'sans_facture' | 'conforme' | 'ecart';
  ordered: number;
  received: number;
  invoiced: number | null;
  /** Facturé − reçu (positif : le fournisseur facture plus que reçu). */
  gap: number | null;
  text: string;
}

/** Rapprochement commande / réception / facture du fournisseur (tolérance en devise). */
export function reconcile(lines: OrderLineLike[], currency: string, invoiceAmount: number | null, tolerance = 1): Reconciliation {
  const ordered = orderTotal(lines, currency), received = receivedValue(lines, currency);
  if (invoiceAmount === null) return { status: 'sans_facture', ordered, received, invoiced: null, gap: null, text: 'Facture du fournisseur non encore saisie.' };
  const gap = roundMoney(invoiceAmount - received, currency);
  if (Math.abs(gap) <= tolerance) return { status: 'conforme', ordered, received, invoiced: invoiceAmount, gap, text: 'Facture conforme aux quantités reçues.' };
  return { status: 'ecart', ordered, received, invoiced: invoiceAmount, gap,
    text: gap > 0 ? `La facture dépasse de ${gap} la valeur des quantités reçues.` : `La facture est inférieure de ${-gap} à la valeur reçue.` };
}

export interface LevelLike { item_id: string; warehouse_id: string; qty: number; min_qty: number | null }

/** Articles sous le stock minimum (alerte de réapprovisionnement). */
export function restockAlerts(levels: LevelLike[]): LevelLike[] {
  return levels.filter((l) => l.min_qty !== null && Number(l.qty) < Number(l.min_qty));
}
