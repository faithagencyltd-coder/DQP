import { describe, expect, it } from 'vitest';
import { orderTotal, receivedValue, reconcile, restockAlerts } from '../src/engine/purchasing';

describe('achats et stocks', () => {
  const lines = [{ qty: 100, unit_price: 5200, received_qty: 60 }, { qty: 10, unit_price: 12500.5, received_qty: 10 }];
  it('totaux de commande et valeur reçue (arrondis FCFA par ligne)', () => {
    expect(orderTotal(lines, 'XOF')).toBe(520000 + 125005);
    expect(receivedValue(lines, 'XOF')).toBe(312000 + 125005);
  });
  it('rapprochement avec la facture du fournisseur', () => {
    expect(reconcile(lines, 'XOF', null).status).toBe('sans_facture');
    expect(reconcile(lines, 'XOF', 437005).status).toBe('conforme');
    const r = reconcile(lines, 'XOF', 645005);
    expect(r).toMatchObject({ status: 'ecart', gap: 208000 });
    expect(r.text).toMatch(/dépasse/);
  });
  it('alertes de réapprovisionnement', () => {
    expect(restockAlerts([{ item_id: 'a', warehouse_id: 'w', qty: 5, min_qty: 10 }, { item_id: 'b', warehouse_id: 'w', qty: 50, min_qty: 10 }, { item_id: 'c', warehouse_id: 'w', qty: 0, min_qty: null }]).map((x) => x.item_id)).toEqual(['a']);
  });
});
