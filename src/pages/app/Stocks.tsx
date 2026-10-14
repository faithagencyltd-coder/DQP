// Stocks (§18.3) : stock par dépôt calculé uniquement à partir des mouvements (aucune quantité
// saisie « en dur »), seuils minimums et alertes, entrées, sorties affectées à un chantier,
// transferts entre dépôts, inventaires avec écart tracé, ajustements motivés, export CSV.

import { ArrowLeftRight, Boxes, Download, Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toCsv } from '../../engine/csv';
import { formatMoney, formatNumber, parseNumber } from '../../engine/money';
import { restockAlerts } from '../../engine/purchasing';
import { insertRow, rpc, updateRow, useAction, useRows } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { MOVE_KIND, fmtDate, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import type { PriceItem, Project, ProjectLot, StockLevel, StockMovement, Warehouse } from '../../lib/types';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Stat, Tabs, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';

type MoveKind = 'entree' | 'sortie' | 'transfert' | 'inventaire' | 'ajustement';
interface Line { id: string; item_id: string; warehouse_id: string; qty: number; min_qty: number | null; last_move: string | null }

function useStockData() {
  const { org } = useOrg();
  const levels = useRows<StockLevel>('stock_levels', org?.id);
  const thresholds = useRows<{ item_id: string; warehouse_id: string; min_qty: number }>('stock_thresholds', org?.id, { select: 'item_id, warehouse_id, min_qty' });
  const warehouses = useRows<Warehouse>('warehouses', org?.id, { order: ['name'] });
  const items = useRows<PriceItem>('price_items', org?.id, { select: 'id, code, designation, unit, kind, archived_at, purchase_price', filter: (q) => q.eq('kind', 'article'), key: ['articles'] });
  // Un seuil défini sans aucun mouvement reste visible (stock 0, donc en alerte).
  const lines = useMemo<Line[]>(() => {
    const map = new Map<string, Line>();
    for (const l of levels.data ?? []) map.set(`${l.item_id}|${l.warehouse_id}`, { id: `${l.item_id}|${l.warehouse_id}`, item_id: l.item_id, warehouse_id: l.warehouse_id, qty: Number(l.qty), min_qty: l.min_qty === null ? null : Number(l.min_qty), last_move: l.last_move });
    for (const t of thresholds.data ?? []) {
      const k = `${t.item_id}|${t.warehouse_id}`;
      if (!map.has(k)) map.set(k, { id: k, item_id: t.item_id, warehouse_id: t.warehouse_id, qty: 0, min_qty: Number(t.min_qty), last_move: null });
    }
    return [...map.values()];
  }, [levels.data, thresholds.data]);
  const itemMap = useMemo(() => new Map((items.data ?? []).map((i) => [i.id, i])), [items.data]);
  const whMap = useMemo(() => new Map((warehouses.data ?? []).map((w) => [w.id, w])), [warehouses.data]);
  return { lines, levels, warehouses, items, itemMap, whMap, loading: levels.isLoading || warehouses.isLoading || items.isLoading };
}

export function StocksPage() {
  const [tab, setTab] = useState<'etat' | 'mouvements' | 'depots'>('etat');
  return (
    <>
      <PageHeader title="Stocks" subtitle="Stock calculé à partir des mouvements : entrées, sorties vers les chantiers, transferts, inventaires et réceptions de commandes." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'etat', label: 'État du stock' }, { id: 'mouvements', label: 'Mouvements' }, { id: 'depots', label: 'Dépôts' }]} />
      {tab === 'etat' ? <Levels /> : tab === 'mouvements' ? <Movements /> : <Depots />}
    </>
  );
}

function Levels() {
  const { org, can } = useOrg();
  const { lines, warehouses, itemMap, whMap, loading } = useStockData();
  const [wh, setWh] = useState('');
  const [q, setQ] = useState('');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [move, setMove] = useState<{ kind: MoveKind; item_id?: string; warehouse_id?: string } | null>(null);
  const [threshold, setThreshold] = useState<Line | null>(null);
  const alerts = restockAlerts(lines);
  const alertKeys = new Set(alerts.map((a) => `${a.item_id}|${a.warehouse_id}`));
  const value = lines.reduce((s, l) => s + Math.max(0, l.qty) * (itemMap.get(l.item_id)?.purchase_price ?? 0), 0);
  const unpriced = lines.some((l) => l.qty > 0 && itemMap.get(l.item_id)?.purchase_price == null);
  const needle = q.trim().toLowerCase();
  const shown = lines
    .filter((l) => !wh || l.warehouse_id === wh)
    .filter((l) => !onlyAlerts || alertKeys.has(`${l.item_id}|${l.warehouse_id}`))
    .filter((l) => !needle || (itemMap.get(l.item_id)?.designation ?? '').toLowerCase().includes(needle) || (itemMap.get(l.item_id)?.code ?? '').toLowerCase().includes(needle))
    .sort((a, b) => (itemMap.get(a.item_id)?.designation ?? '').localeCompare(itemMap.get(b.item_id)?.designation ?? '', 'fr'));
  const activeWh = (warehouses.data ?? []).filter((w) => !w.archived_at);
  const exportCsv = () => {
    const csv = toCsv([['Code', 'Article', 'Unité', 'Dépôt', 'Quantité', 'Stock minimum', 'Alerte', 'Dernier mouvement'],
      ...shown.map((l) => { const it = itemMap.get(l.item_id); return [it?.code ?? '', it?.designation ?? '', it?.unit ?? '', whMap.get(l.warehouse_id)?.name ?? '', l.qty, l.min_qty ?? '', alertKeys.has(`${l.item_id}|${l.warehouse_id}`) ? 'oui' : '', l.last_move ?? '']; })]);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `stocks_${today()}.csv`);
  };
  if (loading) return <Spinner />;
  if (!activeWh.length) return <Notice tone="navy">Créez d’abord un dépôt (onglet « Dépôts ») : magasin central, conteneur de chantier… Le stock est suivi par dépôt.</Notice>;
  return (
    <>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Lignes de stock" value={String(lines.filter((l) => l.qty > 0).length)} />
        <Stat label="Alertes de réapprovisionnement" value={String(alerts.length)} tone={alerts.length ? 'bad' : undefined} />
        <Stat label="Valeur au prix d’achat" value={formatMoney(value, org!.currency)} hint={unpriced ? 'Certains articles n’ont pas de prix d’achat : non valorisés.' : undefined} />
      </div>
      {alerts.length > 0 && (
        <Notice tone="warn" className="mb-3">
          {alerts.length} article(s) sous le stock minimum : {alerts.slice(0, 4).map((a) => `${itemMap.get(a.item_id)?.designation ?? '?'} (${whMap.get(a.warehouse_id)?.name ?? '?'})`).join(', ')}{alerts.length > 4 ? '…' : ''}. Créez une demande d’achat depuis « Achats ».
        </Notice>
      )}
      <Card bodyClass="p-0" title="État du stock" actions={
        <div className="flex flex-wrap gap-2">
          <Allowed module="stocks" action="exporter"><Button size="sm" icon={<Download size={15} />} onClick={exportCsv} disabled={!shown.length}>CSV</Button></Allowed>
          {can('stocks', 'creer') && <Button size="sm" icon={<ArrowLeftRight size={15} />} onClick={() => setMove({ kind: 'transfert' })}>Transfert</Button>}
          {can('stocks', 'creer') && <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setMove({ kind: 'entree' })}>Mouvement</Button>}
        </div>}>
        <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
          <Field label="Rechercher" className="w-60"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Article ou code" /></Field>
          <Field label="Dépôt" className="w-56"><Select value={wh} onChange={(e) => setWh(e.target.value)}><option value="">Tous les dépôts</option>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}{w.archived_at ? ' (archivé)' : ''}</option>)}</Select></Field>
          <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} /> Alertes seulement</label>
        </div>
        <DataTable rows={shown}
          empty={<EmptyState icon={<Boxes size={22} />} title="Aucun stock">Enregistrez une entrée, ou réceptionnez une commande fournisseur dans un dépôt. Seuls les articles de la bibliothèque de prix sont suivis en stock.</EmptyState>}
          columns={[
            { key: 'item', label: 'Article', render: (l) => { const it = itemMap.get(l.item_id); return <span><b className="text-navy-900">{it?.designation ?? 'Article supprimé'}</b>{it?.code ? <span className="block text-[12px] text-muted">{it.code}</span> : null}</span>; } },
            { key: 'wh', label: 'Dépôt', render: (l) => whMap.get(l.warehouse_id)?.name ?? '—' },
            { key: 'qty', label: 'Quantité', align: 'right', sort: (l) => l.qty, render: (l) => <span className="tabular font-semibold">{formatNumber(l.qty, 3)} {itemMap.get(l.item_id)?.unit ?? ''}</span> },
            { key: 'min', label: 'Minimum', align: 'right', render: (l) => l.min_qty === null ? '—' : <span className="tabular">{formatNumber(l.min_qty, 3)}</span>, hideOnMobile: true },
            { key: 'state', label: 'État', render: (l) => alertKeys.has(`${l.item_id}|${l.warehouse_id}`) ? <Badge tone="bad">À réapprovisionner</Badge> : l.qty <= 0 ? <Badge tone="grey">Épuisé</Badge> : <Badge tone="ok">Disponible</Badge> },
            { key: 'last', label: 'Dernier mouvement', render: (l) => l.last_move ? fmtDate(l.last_move) : '—', hideOnMobile: true },
            { key: 'act', label: '', render: (l) => (
              <span className="flex flex-wrap gap-1">
                {can('stocks', 'creer') && l.qty > 0 && <Button size="sm" onClick={() => setMove({ kind: 'sortie', item_id: l.item_id, warehouse_id: l.warehouse_id })}>Sortie</Button>}
                {can('stocks', 'modifier') && <Button size="sm" variant="ghost" onClick={() => setMove({ kind: 'inventaire', item_id: l.item_id, warehouse_id: l.warehouse_id })}>Inventaire</Button>}
                {can('stocks', 'modifier') && <Button size="sm" variant="ghost" onClick={() => setThreshold(l)}>Seuil</Button>}
              </span>) },
          ]} />
      </Card>
      {move && <MoveDialog init={move} onClose={() => setMove(null)} />}
      {threshold && <ThresholdDialog line={threshold} label={`${itemMap.get(threshold.item_id)?.designation ?? ''} — ${whMap.get(threshold.warehouse_id)?.name ?? ''}`} onClose={() => setThreshold(null)} />}
    </>
  );
}

const KIND_HELP: Record<MoveKind, string> = {
  entree: 'Achat au comptant, retour de chantier, don… La quantité s’ajoute au dépôt.',
  sortie: 'Matériaux livrés ou consommés sur un chantier. Refusée si le stock est insuffisant.',
  transfert: 'Déplacement d’un dépôt à un autre : une sortie et une entrée liées.',
  inventaire: 'Saisissez la quantité réellement comptée ; l’écart est enregistré avec son motif.',
  ajustement: 'Casse, perte, vol, erreur de saisie… Quantité positive ou négative, motif obligatoire.',
};

function MoveDialog({ init, onClose }: { init: { kind: MoveKind; item_id?: string; warehouse_id?: string }; onClose: () => void }) {
  const { org, can } = useOrg();
  const toast = useToast();
  const { lines, warehouses, items } = useStockData();
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const [v, setV] = useState({ kind: init.kind, item_id: init.item_id ?? '', warehouse_id: init.warehouse_id ?? '', to: '', qty: '', unit_cost: '', project_id: '', lot: '', reason: '', moved_on: today() });
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', v.project_id), order: ['sort'], key: [v.project_id], enabled: !!v.project_id });
  const qty = parseNumber(v.qty);
  const available = lines.find((l) => l.item_id === v.item_id && l.warehouse_id === v.warehouse_id)?.qty ?? 0;
  const item = (items.data ?? []).find((i) => i.id === v.item_id);
  const activeWh = (warehouses.data ?? []).filter((w) => !w.archived_at);
  const kinds = (['entree', 'sortie', 'transfert', 'inventaire', 'ajustement'] as MoveKind[]).filter((k) => can('stocks', k === 'inventaire' || k === 'ajustement' ? 'modifier' : 'creer'));
  const needsReason = v.kind === 'ajustement';
  const valid = !!v.item_id && !!v.warehouse_id && qty !== null && Number.isFinite(qty)
    && (v.kind === 'inventaire' ? qty >= 0 : v.kind === 'ajustement' ? qty !== 0 : qty > 0)
    && (v.kind !== 'transfert' || (!!v.to && v.to !== v.warehouse_id))
    && (!needsReason || !!v.reason.trim());
  const save = useAction(async () => {
    if (v.kind === 'transfert') return rpc('transfer_stock', { p_item: v.item_id, p_from: v.warehouse_id, p_to: v.to, p_qty: qty, p_reason: v.reason || null });
    if (v.kind === 'inventaire') {
      const diff = await rpc<number>('count_stock', { p_item: v.item_id, p_warehouse: v.warehouse_id, p_counted: qty, p_reason: v.reason || null });
      toast('navy', Number(diff) === 0 ? 'Inventaire conforme : aucun écart.' : `Écart d’inventaire enregistré : ${Number(diff) > 0 ? '+' : ''}${formatNumber(Number(diff), 3)}.`);
      return;
    }
    const cost = parseNumber(v.unit_cost);
    return insertRow('stock_movements', {
      org_id: org!.id, item_id: v.item_id, warehouse_id: v.warehouse_id, kind: v.kind, qty,
      unit_cost: v.kind === 'entree' && cost !== null ? cost : null,
      project_id: v.kind === 'sortie' ? v.project_id || null : null, lot: v.kind === 'sortie' ? v.lot || null : null,
      reason: v.reason.trim() || null, moved_on: v.moved_on,
    });
  }, { success: v.kind === 'inventaire' ? undefined : 'Mouvement enregistré.', invalidate: [['stock_levels'], ['stock_movements']] });
  return (
    <Modal title="Mouvement de stock" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose, onError: (e) => toast('bad', errorMessage(e)) })}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type de mouvement" className="sm:col-span-2" hint={KIND_HELP[v.kind]}>
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as MoveKind })}>{kinds.map((k) => <option key={k} value={k}>{MOVE_KIND[k]}</option>)}</Select>
        </Field>
        <Field label="Article" required className="sm:col-span-2">
          <Select value={v.item_id} onChange={(e) => setV({ ...v, item_id: e.target.value })}>
            <option value="">— Choisir —</option>{(items.data ?? []).filter((i) => !i.archived_at || i.id === v.item_id).map((i) => <option key={i.id} value={i.id}>{i.designation} ({i.unit})</option>)}
          </Select>
        </Field>
        <Field label={v.kind === 'transfert' ? 'Dépôt de départ' : 'Dépôt'} required hint={v.item_id && v.warehouse_id ? `Stock actuel : ${formatNumber(available, 3)} ${item?.unit ?? ''}` : undefined}>
          <Select value={v.warehouse_id} onChange={(e) => setV({ ...v, warehouse_id: e.target.value })}><option value="">— Choisir —</option>{activeWh.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        </Field>
        {v.kind === 'transfert' && (
          <Field label="Dépôt d’arrivée" required><Select value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })}><option value="">— Choisir —</option>{activeWh.filter((w) => w.id !== v.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        )}
        <Field label={v.kind === 'inventaire' ? 'Quantité comptée' : v.kind === 'ajustement' ? 'Quantité (+ ou −)' : 'Quantité'} required>
          <Input inputMode="decimal" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} />
        </Field>
        {v.kind === 'entree' && <Field label="Coût unitaire" hint="Facultatif"><Input inputMode="decimal" value={v.unit_cost} onChange={(e) => setV({ ...v, unit_cost: e.target.value })} /></Field>}
        {v.kind === 'sortie' && <>
          <Field label="Chantier"><Select value={v.project_id} onChange={(e) => setV({ ...v, project_id: e.target.value, lot: '' })}><option value="">—</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
          <Field label="Lot"><Select value={v.lot} disabled={!v.project_id} onChange={(e) => setV({ ...v, lot: e.target.value })}><option value="">—</option>{(lots.data ?? []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</Select></Field>
        </>}
        {v.kind !== 'inventaire' && v.kind !== 'transfert' && <Field label="Date"><Input type="date" value={v.moved_on} onChange={(e) => setV({ ...v, moved_on: e.target.value })} /></Field>}
        <Field label={needsReason ? 'Motif' : 'Motif / commentaire'} required={needsReason} className="sm:col-span-2"><Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
      </div>
      {(v.kind === 'sortie' || v.kind === 'transfert') && qty !== null && qty > available && <Notice tone="bad" className="mt-3">Stock insuffisant dans ce dépôt ({formatNumber(available, 3)} disponible).</Notice>}
    </Modal>
  );
}

function ThresholdDialog({ line, label, onClose }: { line: Line; label: string; onClose: () => void }) {
  const { org } = useOrg();
  const [val, setVal] = useState(line.min_qty === null ? '' : String(line.min_qty).replace('.', ','));
  const n = parseNumber(val);
  const save = useAction(async () => {
    const q = supabase.from('stock_thresholds');
    const { error } = val.trim() === ''
      ? await q.delete().eq('item_id', line.item_id).eq('warehouse_id', line.warehouse_id)
      : await q.upsert({ org_id: org!.id, item_id: line.item_id, warehouse_id: line.warehouse_id, min_qty: n }, { onConflict: 'item_id,warehouse_id' });
    if (error) throw new Error(errorMessage(error));
  }, { success: 'Seuil enregistré.', invalidate: [['stock_levels'], ['stock_thresholds']] });
  return (
    <Modal title="Stock minimum" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={val.trim() !== '' && (n === null || n < 0)} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Enregistrer</Button></>}>
      <p className="mb-3 text-[14px]">{label}</p>
      <Field label="Quantité minimale" hint="Une alerte apparaît quand le stock passe sous ce seuil. Laissez vide pour supprimer le seuil."><Input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></Field>
    </Modal>
  );
}

function Movements() {
  const { org } = useOrg();
  const { itemMap, whMap, warehouses } = useStockData();
  const [wh, setWh] = useState('');
  const [kind, setKind] = useState('');
  const rows = useRows<StockMovement>('stock_movements', org?.id, { order: ['created_at', false], limit: 1000, filter: (q) => { let r = q; if (wh) r = r.eq('warehouse_id', wh); if (kind) r = r.eq('kind', kind); return r; }, key: [wh, kind] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name' });
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.reference])), [projects.data]);
  const list = rows.data ?? [];
  const exportCsv = () => {
    const csv = toCsv([['Date', 'Type', 'Code', 'Article', 'Unité', 'Dépôt', 'Quantité', 'Coût unitaire', 'Chantier', 'Lot', 'Motif'],
      ...list.map((m) => { const it = itemMap.get(m.item_id); return [m.moved_on, MOVE_KIND[m.kind], it?.code ?? '', it?.designation ?? '', it?.unit ?? '', whMap.get(m.warehouse_id)?.name ?? '', m.qty, m.unit_cost ?? '', pname.get(m.project_id ?? '') ?? '', m.lot ?? '', m.reason ?? '']; })]);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mouvements_stock_${today()}.csv`);
  };
  return (
    <Card bodyClass="p-0" title="Journal des mouvements" actions={<Allowed module="stocks" action="exporter"><Button size="sm" icon={<Download size={15} />} onClick={exportCsv} disabled={!list.length}>CSV</Button></Allowed>}>
      <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
        <Field label="Dépôt" className="w-56"><Select value={wh} onChange={(e) => setWh(e.target.value)}><option value="">Tous</option>{(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        <Field label="Type" className="w-56"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tous</option>{Object.entries(MOVE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      </div>
      {rows.isLoading ? <Spinner /> : (
        <DataTable rows={list}
          empty={<EmptyState icon={<Boxes size={22} />} title="Aucun mouvement">Les entrées, sorties, transferts, inventaires et réceptions apparaissent ici. Un mouvement ne se modifie pas : une erreur se corrige par un ajustement motivé.</EmptyState>}
          columns={[
            { key: 'date', label: 'Date', sort: (m) => m.moved_on, render: (m) => fmtDate(m.moved_on) },
            { key: 'kind', label: 'Type', render: (m) => <Badge tone={m.qty > 0 ? 'ok' : 'bad'}>{MOVE_KIND[m.kind]}</Badge> },
            { key: 'item', label: 'Article', render: (m) => <b className="text-navy-900">{itemMap.get(m.item_id)?.designation ?? '—'}</b> },
            { key: 'wh', label: 'Dépôt', render: (m) => whMap.get(m.warehouse_id)?.name ?? '—', hideOnMobile: true },
            { key: 'qty', label: 'Quantité', align: 'right', render: (m) => <span className={`tabular font-semibold ${m.qty < 0 ? 'text-bad' : 'text-ok'}`}>{m.qty > 0 ? '+' : ''}{formatNumber(m.qty, 3)} {itemMap.get(m.item_id)?.unit ?? ''}</span> },
            { key: 'proj', label: 'Chantier', render: (m) => m.project_id ? `${pname.get(m.project_id) ?? ''}${m.lot ? ' · ' + m.lot : ''}` : '—', hideOnMobile: true },
            { key: 'reason', label: 'Motif', render: (m) => m.reason ?? '—', hideOnMobile: true },
          ]} />
      )}
    </Card>
  );
}

function Depots() {
  const { org, can } = useOrg();
  const warehouses = useRows<Warehouse>('warehouses', org?.id, { order: ['name'] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const [edit, setEdit] = useState<Partial<Warehouse> | null>(null);
  const archive = useAction((w: Warehouse) => updateRow('warehouses', w.id, { archived_at: w.archived_at ? null : new Date().toISOString() }), { success: 'Dépôt mis à jour.', invalidate: [['warehouses']] });
  return (
    <>
      <Card bodyClass="p-0" title="Dépôts" actions={<Allowed module="stocks" action="creer"><Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEdit({})}>Nouveau dépôt</Button></Allowed>}>
        {warehouses.isLoading ? <Spinner /> : (
          <DataTable rows={warehouses.data ?? []}
            empty={<EmptyState icon={<WarehouseIcon size={22} />} title="Aucun dépôt">Magasin central, conteneur ou magasin de chantier : chaque dépôt a son propre stock.</EmptyState>}
            columns={[
              { key: 'name', label: 'Nom', render: (w) => <b className="text-navy-900">{w.name}</b> },
              { key: 'loc', label: 'Emplacement', render: (w) => w.location ?? '—' },
              { key: 'proj', label: 'Chantier rattaché', render: (w) => pname.get(w.project_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'state', label: 'État', render: (w) => w.archived_at ? <Badge tone="grey">Archivé</Badge> : <Badge tone="ok">Actif</Badge> },
              { key: 'act', label: '', render: (w) => can('stocks', 'creer') ? <span className="flex gap-1"><Button size="sm" onClick={() => setEdit(w)}>Modifier</Button><Button size="sm" variant="ghost" onClick={() => archive.mutate(w)}>{w.archived_at ? 'Réactiver' : 'Archiver'}</Button></span> : null },
            ]} />
        )}
      </Card>
      {edit && <DepotForm w={edit} projects={projects.data ?? []} onClose={() => setEdit(null)} />}
    </>
  );
}

function DepotForm({ w, projects, onClose }: { w: Partial<Warehouse>; projects: Project[]; onClose: () => void }) {
  const { org } = useOrg();
  const [v, setV] = useState({ name: w.name ?? '', location: w.location ?? '', project_id: w.project_id ?? '' });
  const save = useAction(() => {
    const values = { name: v.name.trim(), location: v.location.trim() || null, project_id: v.project_id || null };
    return w.id ? updateRow('warehouses', w.id, values) : insertRow('warehouses', { org_id: org!.id, ...values });
  }, { success: 'Dépôt enregistré.', invalidate: [['warehouses']] });
  return (
    <Modal title={w.id ? 'Modifier le dépôt' : 'Nouveau dépôt'} onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!v.name.trim()} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Enregistrer</Button></>}>
      <div className="grid gap-3">
        <Field label="Nom" required><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Magasin central" /></Field>
        <Field label="Emplacement"><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Cotonou, Akpakpa" /></Field>
        <Field label="Chantier rattaché" hint="Facultatif : pour un magasin de chantier."><Select value={v.project_id} onChange={(e) => setV({ ...v, project_id: e.target.value })}><option value="">—</option>{projects.filter((p) => !p.archived_at || p.id === v.project_id).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}
