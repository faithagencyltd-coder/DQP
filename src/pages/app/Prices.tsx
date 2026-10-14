import { Archive, ArchiveRestore, Download, History, Library, Percent, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { insertRow, updateRow, useAction, useRows } from '../../lib/api';
import { COUNTRIES, PRICE_CATEGORIES, fmtDate } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, PriceItem } from '../../lib/types';
import { downloadBlob } from '../../lib/download';
import { mapHeaders, parseCsv, toCsv } from '../../engine/csv';
import { COST_KIND_LABEL, computeBreakdown, DEFAULT_BREAKDOWN, type CostBreakdown, type CostKind } from '../../engine/debourse';
import { formatMoney, formatNumber, parseNumber } from '../../engine/money';
import { UNITS } from '../../engine/units';
import { Badge, Button, Card, Checkbox, Confirm, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Tabs, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const OLD_DAYS = 365;

/** Âge d'un prix : sans date, il n'est pas présenté comme actuel (§13.5). */
export function priceAge(p: Pick<PriceItem, 'price_date'>): { tone: 'ok' | 'warn' | 'bad'; label: string } {
  if (!p.price_date) return { tone: 'bad', label: 'date inconnue' };
  const days = (Date.now() - new Date(p.price_date).getTime()) / 86400000;
  return days > OLD_DAYS ? { tone: 'warn', label: `ancien (${fmtDate(p.price_date)})` } : { tone: 'ok', label: fmtDate(p.price_date) };
}

export function PricesPage() {
  const { org } = useOrg();
  const items = useRows<PriceItem>('price_items', org?.id, { order: ['designation'] });
  const suppliers = useRows<Contact>('contacts', org?.id, { filter: (q) => q.eq('kind', 'fournisseur') });
  const [tab, setTab] = useState<'liste' | 'comparer'>('liste');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [kind, setKind] = useState('');
  const [country, setCountry] = useState('');
  const [archived, setArchived] = useState(false);
  const [onlyOld, setOnlyOld] = useState(false);
  const [edit, setEdit] = useState<Partial<PriceItem> | null>(null);
  const [hist, setHist] = useState<PriceItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [bulk, setBulk] = useState(false);
  const supplierName = useMemo(() => new Map((suppliers.data ?? []).map((s) => [s.id, s.name])), [suppliers.data]);
  const list = useMemo(() => (items.data ?? []).filter((p) => !!p.archived_at === archived && (!cat || p.category === cat) && (!kind || p.kind === kind)
    && (!country || p.country === country) && (!onlyOld || priceAge(p).tone !== 'ok')
    && (!q || norm([p.code, p.designation, p.description, p.city, supplierName.get(p.supplier_id ?? '')].join(' ')).includes(norm(q)))), [items.data, archived, cat, kind, country, onlyOld, q, supplierName]);
  const cur = org?.currency ?? 'XOF';

  const exportCsv = () => {
    const head = ['Code', 'Désignation', 'Type', 'Catégorie', 'Unité', 'Prix d’achat', 'Prix de vente', 'Devise', 'Pays', 'Ville', 'Date du prix', 'Source', 'Fournisseur', 'Pertes %', 'Conditions d’achat', 'Description'];
    const rows = list.map((p) => [p.code, p.designation, p.kind, p.category, p.unit, p.purchase_price, p.sale_price, p.currency, p.country, p.city, p.price_date, p.source, supplierName.get(p.supplier_id ?? ''), p.loss_pct, p.purchase_conditions, p.description]);
    downloadBlob(new Blob([toCsv([head, ...rows])], { type: 'text/csv;charset=utf-8' }), `bibliotheque_prix_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <>
      <PageHeader title="Bibliothèque de prix" subtitle="Matériaux, main-d’œuvre, matériel et ouvrages composés, par pays et par ville, avec date et source."
        actions={<>
          <Allowed module="prix" action="creer"><Button icon={<Upload size={16} />} onClick={() => setImporting(true)}>Importer</Button></Allowed>
          <Allowed module="prix" action="exporter"><Button icon={<Download size={16} />} disabled={!list.length} onClick={exportCsv}>Exporter</Button></Allowed>
          <Allowed module="prix" action="modifier"><Button icon={<Percent size={16} />} disabled={!list.length} onClick={() => setBulk(true)}>Mise à jour en masse</Button></Allowed>
          <Allowed module="prix" action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ kind: 'article', unit: 'u', category: 'Autre', currency: cur, country: org?.country, city: org?.city ?? null, price_date: new Date().toISOString().slice(0, 10) })}>Nouvel article</Button></Allowed>
        </>} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'liste', label: 'Articles et ouvrages' }, { id: 'comparer', label: 'Comparer les prix' }]} />
      {tab === 'liste' ? (
        <Card bodyClass="p-0">
          <div className="grid gap-2 border-b border-line-2 p-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_auto]">
            <SearchInput value={q} onChange={setQ} placeholder="Code, désignation, ville, fournisseur…" />
            <Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{PRICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Articles et ouvrages</option><option value="article">Articles</option><option value="ouvrage">Ouvrages composés</option></Select>
            <Select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">Tous pays</option>{Object.entries(COUNTRIES).filter(([k]) => k !== 'AUTRE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <div className="flex flex-col justify-center gap-1"><Checkbox label="Prix anciens" checked={onlyOld} onChange={setOnlyOld} /><Checkbox label="Archives" checked={archived} onChange={setArchived} /></div>
          </div>
          {items.isLoading ? <Spinner /> : (
            <DataTable rows={list} onRowClick={(p) => setEdit(p)} initialSort={{ key: 'des', dir: 1 }}
              empty={<EmptyState icon={<Library size={22} />} title="Aucun prix">Ajoutez vos articles (avec la date et la source du prix) ou importez un fichier CSV / Excel.</EmptyState>}
              columns={[
                { key: 'code', label: 'Code', sort: (p) => p.code, render: (p) => <span className="tabular text-muted">{p.code || '—'}</span>, hideOnMobile: true },
                { key: 'des', label: 'Désignation', sort: (p) => norm(p.designation), render: (p) => <div><div className="font-semibold text-navy-900">{p.designation} {p.kind === 'ouvrage' && <Badge tone="navy">ouvrage</Badge>}</div><div className="text-[12px] text-muted">{p.category}{p.supplier_id ? ` · ${supplierName.get(p.supplier_id) ?? ''}` : ''}</div></div> },
                { key: 'unit', label: 'Unité', render: (p) => p.unit },
                { key: 'buy', label: 'Achat', align: 'right', sort: (p) => p.purchase_price, render: (p) => formatMoney(p.purchase_price, p.currency, false), hideOnMobile: true },
                { key: 'sell', label: 'Vente', align: 'right', sort: (p) => p.sale_price, render: (p) => <b>{formatMoney(p.sale_price, p.currency, false)}</b> },
                { key: 'zone', label: 'Zone', render: (p) => [p.city, p.country].filter(Boolean).join(', ') || '—', hideOnMobile: true },
                { key: 'date', label: 'Date du prix', sort: (p) => p.price_date ?? '', render: (p) => { const a = priceAge(p); return <Badge tone={a.tone}>{a.label}</Badge>; } },
                { key: 'h', label: '', render: (p) => <button className="rounded p-1.5 text-ink-2 hover:bg-navy-50" aria-label="Historique" title="Historique des prix" onClick={(e) => { e.stopPropagation(); setHist(p); }}><History size={16} /></button> },
              ]} />
          )}
        </Card>
      ) : <PriceCompare items={(items.data ?? []).filter((p) => !p.archived_at)} />}
      <p className="mt-3 text-[12.5px] text-muted">Un prix est signalé « ancien » au-delà de {OLD_DAYS} jours, et « date inconnue » sans date. Les prix ne sont jamais présentés comme des prix de marché actuels sans source ni date.</p>
      {edit && <PriceForm initial={edit} items={items.data ?? []} suppliers={suppliers.data ?? []} onClose={() => setEdit(null)} />}
      {hist && <PriceHistory item={hist} onClose={() => setHist(null)} />}
      {importing && <PriceImport onClose={() => setImporting(false)} />}
      {bulk && <BulkUpdate items={list} onClose={() => setBulk(false)} />}
    </>
  );
}

function PriceCompare({ items }: { items: PriceItem[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, PriceItem[]>();
    for (const p of items) {
      const k = norm(p.designation) + '|' + p.unit;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.values()].filter((g) => g.length > 1).sort((a, b) => a[0].designation.localeCompare(b[0].designation));
  }, [items]);
  if (!groups.length) return <Card><EmptyState title="Rien à comparer">La comparaison regroupe les articles de même désignation et même unité saisis pour plusieurs pays, villes ou fournisseurs.</EmptyState></Card>;
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const prices = g.map((p) => p.sale_price).filter((x): x is number => x !== null);
        const min = Math.min(...prices), max = Math.max(...prices);
        return (
          <Card key={g[0].id} title={`${g[0].designation} (${g[0].unit})`} subtitle={prices.length > 1 ? `Écart : ${formatNumber(((max - min) / min) * 100, 1)} % entre le moins cher et le plus cher` : undefined} bodyClass="p-0">
            <table className="w-full text-[13.5px]">
              <tbody>
                {g.map((p) => (
                  <tr key={p.id} className="border-b border-line-2 last:border-0">
                    <td className="px-4 py-2">{[p.city, p.country && COUNTRIES[p.country]].filter(Boolean).join(', ') || 'Zone non précisée'}</td>
                    <td className="px-4 py-2 text-muted">{p.source ?? 'source non précisée'}</td>
                    <td className="px-4 py-2"><Badge tone={priceAge(p).tone}>{priceAge(p).label}</Badge></td>
                    <td className="tabular px-4 py-2 text-right font-semibold">{formatMoney(p.sale_price, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
      <p className="text-[12.5px] text-muted">Les prix d’un pays ne sont jamais appliqués automatiquement à un autre pays.</p>
    </div>
  );
}

function BreakdownEditor({ value, onChange, articles, currency }: { value: CostBreakdown; onChange: (b: CostBreakdown) => void; articles: PriceItem[]; currency: string }) {
  const r = computeBreakdown(value, currency);
  const setC = (i: number, patch: Partial<CostBreakdown['components'][number]>) => onChange({ ...value, components: value.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const [pick, setPick] = useState('');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <Field label="Quantité d’ouvrage décomposée" hint="Ex. 1 m³ de béton, 10 m² d’enduit"><Input inputMode="decimal" defaultValue={String(value.baseQty).replace('.', ',')} onBlur={(e) => onChange({ ...value, baseQty: parseNumber(e.target.value) ?? 1 })} /></Field>
        <Field label="Méthode de calcul">
          <Select value={value.method} onChange={(e) => onChange({ ...value, method: e.target.value as CostBreakdown['method'] })}>
            <option value="additive">Pertes + frais indirects + marge</option>
            <option value="coefficient">Coefficient de vente K</option>
          </Select>
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-navy-50 text-left text-[11.5px] uppercase text-muted"><tr><th className="p-2">Nature</th><th className="p-2">Désignation</th><th className="p-2">Unité</th><th className="p-2 text-right">Qté</th><th className="p-2 text-right">Coût unitaire</th><th className="p-2 text-right">Montant</th><th /></tr></thead>
          <tbody>
            {value.components.map((c, i) => (
              <tr key={i} className="border-t border-line-2">
                <td className="p-1"><select aria-label="Nature du composant" className="cell-input" value={c.kind} onChange={(e) => setC(i, { kind: e.target.value as CostKind })}>{Object.entries(COST_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td className="p-1"><input aria-label="Désignation du composant" className="cell-input" value={c.designation} onChange={(e) => setC(i, { designation: e.target.value })} /></td>
                <td className="p-1"><input aria-label="Unité du composant" className="cell-input w-16" value={c.unit} onChange={(e) => setC(i, { unit: e.target.value })} /></td>
                <td className="p-1"><input aria-label="Quantité du composant" className="cell-input w-20 text-right" inputMode="decimal" defaultValue={c.qty === null ? '' : String(c.qty).replace('.', ',')} onBlur={(e) => setC(i, { qty: parseNumber(e.target.value) })} /></td>
                <td className="p-1"><input aria-label="Coût unitaire du composant" className="cell-input w-28 text-right" inputMode="decimal" defaultValue={c.unitCost === null ? '' : String(c.unitCost).replace('.', ',')} onBlur={(e) => setC(i, { unitCost: parseNumber(e.target.value) })} /></td>
                <td className="tabular p-2 text-right">{c.qty !== null && c.unitCost !== null ? formatMoney(c.qty * c.unitCost, currency, false) : <span className="text-warn-600">à compléter</span>}</td>
                <td className="p-1"><button className="rounded p-1 text-faint hover:text-bad-600" aria-label="Retirer" onClick={() => onChange({ ...value, components: value.components.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => onChange({ ...value, components: [...value.components, { kind: 'materiau', designation: '', unit: 'u', qty: null, unitCost: null }] })}>Composant libre</Button>
        <Select className="!h-8 !w-auto text-[13px]" value={pick} onChange={(e) => {
          const a = articles.find((x) => x.id === e.target.value);
          if (a) onChange({ ...value, components: [...value.components, { kind: a.category === 'Main-d’œuvre' ? 'main_oeuvre' : a.category === 'Transport' ? 'transport' : a.category.startsWith('Location') || a.category === 'Matériel de chantier' ? 'materiel' : 'materiau', designation: a.designation, unit: a.unit, qty: null, unitCost: a.purchase_price ?? a.sale_price }] });
          setPick('');
        }}>
          <option value="">+ Depuis la bibliothèque…</option>
          {articles.filter((a) => a.kind === 'article' && !a.archived_at).map((a) => <option key={a.id} value={a.id}>{a.designation} ({a.unit}) — {formatMoney(a.purchase_price ?? a.sale_price, a.currency)}</option>)}
        </Select>
      </div>
      {value.method === 'additive' ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Pertes matériaux %"><Input inputMode="decimal" defaultValue={String(value.lossPct)} onBlur={(e) => onChange({ ...value, lossPct: parseNumber(e.target.value) ?? 0 })} /></Field>
          <Field label="Frais indirects %"><Input inputMode="decimal" defaultValue={String(value.indirectPct)} onBlur={(e) => onChange({ ...value, indirectPct: parseNumber(e.target.value) ?? 0 })} /></Field>
          <Field label="Marge %"><Input inputMode="decimal" defaultValue={String(value.marginPct)} onBlur={(e) => onChange({ ...value, marginPct: parseNumber(e.target.value) ?? 0 })} /></Field>
          <Field label="Marge calculée sur"><Select value={value.marginBase} onChange={(e) => onChange({ ...value, marginBase: e.target.value as CostBreakdown['marginBase'] })}><option value="cout">le prix de revient</option><option value="vente">le prix de vente</option></Select></Field>
        </div>
      ) : (
        <Field label="Coefficient de vente K" className="sm:w-48"><Input inputMode="decimal" defaultValue={String(value.coefficient).replace('.', ',')} onBlur={(e) => onChange({ ...value, coefficient: parseNumber(e.target.value) ?? 1 })} /></Field>
      )}
      <div className="rounded-lg bg-navy-50 p-3 text-[13px]">
        <div className="mb-1 font-semibold text-navy-900">Calcul (par unité d’ouvrage)</div>
        <ol className="list-decimal space-y-0.5 pl-5 text-ink-2">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <div className="mt-2 text-[15px] font-bold text-navy-900">Prix de vente HT : {r.salePrice === null ? <span className="text-warn-600">non déterminé</span> : formatMoney(r.salePrice, currency)}</div>
      </div>
    </div>
  );
}

function PriceForm({ initial, items, suppliers, onClose }: { initial: Partial<PriceItem>; items: PriceItem[]; suppliers: Contact[]; onClose: () => void }) {
  const { org } = useOrg();
  const [f, setF] = useState<Partial<PriceItem>>(initial);
  const [nums, setNums] = useState({ buy: initial.purchase_price?.toString().replace('.', ',') ?? '', sell: initial.sale_price?.toString().replace('.', ',') ?? '', loss: initial.loss_pct?.toString().replace('.', ',') ?? '' });
  const [bd, setBd] = useState<CostBreakdown>(initial.breakdown ?? { ...DEFAULT_BREAKDOWN, ...(org?.pricing_method ?? {}), components: [], baseQty: 1 });
  const cur = f.currency ?? org?.currency ?? 'XOF';
  const r = computeBreakdown(bd, cur);
  const set = (k: keyof PriceItem) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null });
  const save = useAction(async () => {
    const isOuvrage = f.kind === 'ouvrage';
    const values = {
      kind: f.kind, code: f.code ?? '', designation: (f.designation ?? '').trim(), category: f.category ?? 'Autre', description: f.description, unit: f.unit ?? 'u',
      purchase_price: isOuvrage ? r.ds : parseNumber(nums.buy), sale_price: isOuvrage ? r.salePrice : parseNumber(nums.sell), currency: cur,
      supplier_id: f.supplier_id || null, country: f.country || null, city: f.city, price_date: f.price_date || null, source: f.source,
      purchase_conditions: f.purchase_conditions, loss_pct: parseNumber(nums.loss), breakdown: isOuvrage ? bd : null,
    };
    return f.id ? updateRow('price_items', f.id, values) : insertRow('price_items', { ...values, org_id: org!.id });
  }, { success: 'Prix enregistré.', invalidate: [['price_items']] });
  const archive = useAction(() => updateRow('price_items', f.id!, { archived_at: f.archived_at ? null : new Date().toISOString() }), { success: f.archived_at ? 'Article restauré.' : 'Article archivé.', invalidate: [['price_items']] });
  return (
    <Modal title={f.id ? `Article ${f.code || ''} — ${initial.designation}` : 'Nouvel article de prix'} onClose={onClose} size="lg"
      footer={<>
        {f.id && <Allowed module="prix" action="modifier"><Button className="mr-auto" icon={f.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />} onClick={() => archive.mutate(undefined, { onSuccess: onClose })}>{f.archived_at ? 'Restaurer' : 'Archiver'}</Button></Allowed>}
        <Button onClick={onClose}>Fermer</Button>
        <Allowed module="prix" action={f.id ? 'modifier' : 'creer'}><Button variant="primary" loading={save.isPending} disabled={!f.designation?.trim()} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Enregistrer</Button></Allowed>
      </>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PriceItem['kind'], category: e.target.value === 'ouvrage' ? 'Ouvrages composés' : f.category })}>
            <option value="article">Article (matériau, main-d’œuvre, location…)</option>
            <option value="ouvrage">Ouvrage composé (décomposition des coûts)</option>
          </Select>
        </Field>
        <Field label="Code article"><Input value={f.code ?? ''} onChange={set('code')} placeholder="Ex. CIM-50" /></Field>
        <Field label="Catégorie"><Select value={f.category ?? 'Autre'} onChange={set('category')}>{PRICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Désignation" required className="sm:col-span-2"><Input value={f.designation ?? ''} onChange={set('designation')} placeholder="Ex. Ciment CPJ 35 — sac de 50 kg" /></Field>
        <Field label="Unité"><Select value={f.unit ?? 'u'} onChange={set('unit')}>{UNITS.map((u) => <option key={u.code} value={u.code}>{u.code} — {u.label}</option>)}</Select></Field>
        <Field label="Description" className="sm:col-span-3"><Textarea rows={2} value={f.description ?? ''} onChange={set('description')} /></Field>
        {f.kind === 'ouvrage' ? (
          <div className="sm:col-span-3"><BreakdownEditor value={bd} onChange={setBd} articles={items} currency={cur} /></div>
        ) : (
          <>
            <Field label="Prix d’achat HT"><Input inputMode="decimal" value={nums.buy} onChange={(e) => setNums({ ...nums, buy: e.target.value })} /></Field>
            <Field label="Prix de vente HT"><Input inputMode="decimal" value={nums.sell} onChange={(e) => setNums({ ...nums, sell: e.target.value })} /></Field>
            <Field label="Coefficient de perte %"><Input inputMode="decimal" value={nums.loss} onChange={(e) => setNums({ ...nums, loss: e.target.value })} /></Field>
          </>
        )}
        <Field label="Devise"><Select value={cur} onChange={set('currency')}><option value="XOF">FCFA (XOF)</option><option value="XAF">FCFA (XAF)</option><option value="EUR">Euro</option><option value="USD">Dollar US</option></Select></Field>
        <Field label="Pays"><Select value={f.country ?? ''} onChange={set('country')}><option value="">—</option>{Object.entries(COUNTRIES).filter(([k]) => k !== 'AUTRE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Ville ou zone"><Input value={f.city ?? ''} onChange={set('city')} /></Field>
        <Field label="Date du prix" hint="Indispensable pour juger de sa fraîcheur"><Input type="date" value={f.price_date ?? ''} onChange={set('price_date')} /></Field>
        <Field label="Source" hint="Facture, devis fournisseur, relevé…"><Input value={f.source ?? ''} onChange={set('source')} /></Field>
        <Field label="Fournisseur"><Select value={f.supplier_id ?? ''} onChange={set('supplier_id')}><option value="">—</option>{suppliers.filter((s) => !s.archived_at).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Conditions d’achat" className="sm:col-span-3"><Input value={f.purchase_conditions ?? ''} onChange={set('purchase_conditions')} placeholder="Ex. livraison incluse au-delà de 100 sacs" /></Field>
      </div>
    </Modal>
  );
}

function PriceHistory({ item, onClose }: { item: PriceItem; onClose: () => void }) {
  const { org } = useOrg();
  const h = useRows<{ id: number; purchase_price: number | null; sale_price: number | null; price_date: string | null; source: string | null; changed_at: string }>('price_history', org?.id, { filter: (q) => q.eq('item_id', item.id), order: ['changed_at', false], key: [item.id] });
  return (
    <Modal title={`Historique — ${item.designation}`} onClose={onClose}>
      {h.isLoading ? <Spinner /> : (
        <table className="w-full text-[13.5px]">
          <thead className="text-left text-[12px] text-muted"><tr><th className="py-1">Modifié le</th><th>Date du prix</th><th className="text-right">Achat</th><th className="text-right">Vente</th></tr></thead>
          <tbody>
            {(h.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-line-2"><td className="py-2">{new Date(r.changed_at).toLocaleString('fr-FR')}</td><td>{fmtDate(r.price_date)}</td><td className="tabular text-right">{formatMoney(r.purchase_price, item.currency, false)}</td><td className="tabular text-right font-semibold">{formatMoney(r.sale_price, item.currency, false)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function BulkUpdate({ items, onClose }: { items: PriceItem[]; onClose: () => void }) {
  const [pct, setPct] = useState('');
  const [field, setField] = useState<'sale_price' | 'purchase_price'>('sale_price');
  const [source, setSource] = useState('');
  const [confirm, setConfirm] = useState(false);
  const p = parseNumber(pct);
  const targets = items.filter((i) => i.kind === 'article' && i[field] !== null);
  const run = useAction(async () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const it of targets) await updateRow('price_items', it.id, { [field]: Math.round((it[field] as number) * (1 + (p ?? 0) / 100) * 100) / 100, price_date: today, source: source || `Mise à jour en masse ${p! > 0 ? '+' : ''}${p} %` });
    return targets.length;
  }, { success: (n) => `${n} prix mis à jour (historique conservé).`, invalidate: [['price_items']] });
  return (
    <Modal title="Mise à jour en masse" onClose={onClose}
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={p === null || p === 0 || !targets.length} onClick={() => setConfirm(true)}>Appliquer à {targets.length} article(s)</Button></>}>
      <p className="text-[13.5px] text-ink-2">S’applique aux articles actuellement affichés par les filtres (les ouvrages composés se recalculent depuis leur décomposition). L’ancien prix est conservé dans l’historique.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Prix concerné"><Select value={field} onChange={(e) => setField(e.target.value as typeof field)}><option value="sale_price">Prix de vente</option><option value="purchase_price">Prix d’achat</option></Select></Field>
        <Field label="Variation en %" hint="Ex. 5 ou -3,5"><Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
        <Field label="Source de la mise à jour" className="sm:col-span-2"><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ex. Hausse fournisseur janvier" /></Field>
      </div>
      {confirm && <Confirm title="Confirmer la mise à jour" confirmLabel="Mettre à jour" onClose={() => setConfirm(false)} onConfirm={() => run.mutateAsync(undefined).then(() => onClose())}>{targets.length} prix vont être modifiés de {p} %. La date du prix devient aujourd’hui.</Confirm>}
    </Modal>
  );
}

function PriceImport({ onClose }: { onClose: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = async (file: File) => {
    setError(null);
    let data: string[][];
    if (/\.xlsx$/i.test(file.name)) {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      data = [];
      ws.eachRow((r) => data.push((r.values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? '' : typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') : String(v)))));
    } else data = parseCsv(await file.text());
    if (data.length < 2) return setError('Le fichier ne contient pas de lignes.');
    const map = mapHeaders(data[0], {
      code: ['code', 'code article', 'reference', 'ref'], designation: ['designation', 'libelle', 'article', 'description article'], unit: ['unite', 'u', 'unit'],
      category: ['categorie', 'famille'], buy: ['prix d achat', 'prix achat', 'achat', 'pa'], sell: ['prix de vente', 'prix vente', 'vente', 'pv', 'prix unitaire', 'pu', 'prix'],
      country: ['pays'], city: ['ville', 'zone'], date: ['date du prix', 'date'], source: ['source'],
    });
    if (map.designation === undefined) return setError('Colonne « Désignation » introuvable.');
    setRows(data.slice(1).map((r) => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, (r[i as number] ?? '').trim()]))).filter((r) => r.designation));
  };
  const run = useAction(async () => {
    let n = 0;
    for (const r of rows!) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '') ? r.date : /^(\d{2})\/(\d{2})\/(\d{4})$/.test(r.date ?? '') ? r.date!.split('/').reverse().join('-') : null;
      await insertRow('price_items', {
        org_id: org!.id, kind: 'article', code: r.code ?? '', designation: r.designation, unit: r.unit || 'u', category: PRICE_CATEGORIES.includes(r.category ?? '') ? r.category : 'Autre',
        purchase_price: parseNumber(r.buy ?? ''), sale_price: parseNumber(r.sell ?? ''), currency: org!.currency, country: /^[A-Z]{2}$/.test(r.country ?? '') ? r.country : org!.country,
        city: r.city || null, price_date: date, source: r.source || 'Import de fichier',
      });
      n++;
    }
    return n;
  }, { success: (n) => `${n} article(s) importé(s).`, invalidate: [['price_items']] });
  return (
    <Modal title="Importer des prix (CSV ou Excel)" onClose={onClose} size="lg"
      footer={<><Button onClick={onClose}>Annuler</Button>{rows && <Button variant="primary" loading={run.isPending} disabled={!rows.length} onClick={() => run.mutate(undefined, { onSuccess: onClose })}>Importer {rows.length} article(s)</Button>}</>}>
      <p className="text-[13.5px] text-ink-2">Première ligne = en-têtes : <b>Désignation</b> (obligatoire), Code, Unité, Catégorie, Prix d’achat, Prix de vente, Pays (code BJ, CI…), Ville, Date du prix, Source. Sans date, le prix sera signalé « date inconnue ».</p>
      <input ref={input} type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0]).catch((er) => toast('bad', String(er)))} />
      <Button className="mt-3" icon={<Upload size={16} />} onClick={() => input.current?.click()}>Choisir le fichier</Button>
      {error && <Notice tone="bad" className="mt-3">{error}</Notice>}
      {rows && (
        <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border border-line">
          <table className="w-full text-[12.5px]"><thead className="sticky top-0 bg-navy-50 text-left text-muted"><tr><th className="p-2">Désignation</th><th className="p-2">Unité</th><th className="p-2 text-right">Vente</th><th className="p-2">Date</th></tr></thead>
            <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i} className="border-t border-line-2"><td className="p-2">{r.designation}</td><td className="p-2">{r.unit}</td><td className="p-2 text-right">{r.sell}</td><td className="p-2">{r.date || <span className="text-warn-600">inconnue</span>}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

