import { Download, FileUp, Plus, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber, newId, normalizeUnit, nowIso, parseNumberFr } from '../../core/format';
import { allLines } from '../../core/dqe';
import { CATEGORY_LABEL, findMatches, itemsFromProject, pricesFromCsv, pricesToCsv } from '../../core/prices';
import { applyPrice } from '../../core/project';
import type { PriceItem } from '../../core/types';
import { api } from '../browserApi';
import { ConfirmDialog, Modal, Panel } from '../components/ui';
import { useStore } from '../store';

export function PricesView() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [toDelete, setToDelete] = useState<PriceItem | null>(null);
  const [applying, setApplying] = useState(false);
  const items = s.prices;
  const shown = items.filter((i) => (!cat || i.category === cat) && (!q || `${i.code} ${i.designation} ${i.supplier}`.toLowerCase().includes(q.toLowerCase())));

  const patch = (id: string, change: Partial<PriceItem>) =>
    void s.setPrices(items.map((i) => (i.id === id ? { ...i, ...change, updatedAt: nowIso() } : i)));

  const add = () => {
    const item: PriceItem = { id: newId('pr'), code: `P${String(items.length + 1).padStart(4, '0')}`, designation: 'Nouvel article', unit: 'u', price: 0, supplier: '', category: 'materiau', location: '', updatedAt: nowIso(), source: 'Saisie' };
    void s.setPrices([item, ...items]);
  };

  const fromProject = () => {
    if (!s.project) return;
    const added = itemsFromProject(s.project, items);
    void s.setPrices([...items, ...added]);
    s.toast(added.length ? 'success' : 'info', added.length ? `${added.length} prix ajoutés depuis « ${s.project.info.name} ».` : 'Tous les prix du projet sont déjà dans la bibliothèque.');
  };

  const importCsv = async () => {
    const [f] = await api.pickFiles([{ name: 'CSV', extensions: ['csv', 'txt'] }], false);
    if (!f) return;
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(f.bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(f.bytes);
    }
    const added = pricesFromCsv(text);
    if (!added.length) return s.toast('error', 'Aucun prix reconnu. En-tête attendu : Code;Désignation;Unité;Prix;Fournisseur;Catégorie;Localisation');
    void s.setPrices([...items, ...added]);
    s.toast('success', `${added.length} prix importés.`);
  };

  const exportCsv = async () => {
    const bytes = new TextEncoder().encode(pricesToCsv(items));
    const path = await api.saveAs('Bibliotheque_prix_DQP.csv', bytes);
    if (path) s.toast('success', `Bibliothèque exportée : ${path}`);
  };

  return (
    <div>
      <h1 className="title">Bibliothèque de prix</h1>
      <p className="subtitle">Vos prix de référence (matériaux, main-d’œuvre, fournitures, équipements, prestations, ouvrages). Ils sont propres à cet ordinateur et communs à tous vos projets.</p>
      <Panel
        title={`${items.length} article(s)`}
        actions={
          <div className="row">
            <input className="in" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="in" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Toutes catégories</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn" onClick={add}><Plus size={14} />Article</button>
            <button className="btn" disabled={!s.project} onClick={fromProject} title="Ajoute à la bibliothèque les prix unitaires du projet ouvert">Prix du projet → bibliothèque</button>
            <button className="btn" disabled={!s.project || !items.length} onClick={() => setApplying(true)}><Wand2 size={14} />Appliquer au DQE</button>
            <button className="btn" onClick={() => void importCsv()}><FileUp size={14} />Importer CSV</button>
            <button className="btn" disabled={!items.length} onClick={() => void exportCsv()}><Download size={14} />Exporter CSV</button>
          </div>
        }
        flush
      >
        <div style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
          <table className="t">
            <thead>
              <tr><th style={{ width: 80 }}>Code</th><th>Désignation</th><th style={{ width: 70 }}>Unité</th><th className="n" style={{ width: 110 }}>Prix</th><th style={{ width: 140 }}>Fournisseur</th><th style={{ width: 130 }}>Catégorie</th><th style={{ width: 120 }}>Localisation</th><th style={{ width: 90 }}>Mise à jour</th><th style={{ width: 34 }} /></tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td><input className="in" style={{ width: '100%' }} defaultValue={i.code} onBlur={(e) => e.target.value !== i.code && patch(i.id, { code: e.target.value })} /></td>
                  <td><input className="in" style={{ width: '100%' }} defaultValue={i.designation} title={i.source} onBlur={(e) => e.target.value !== i.designation && patch(i.id, { designation: e.target.value })} /></td>
                  <td><input className="in" style={{ width: '100%' }} defaultValue={i.unit} onBlur={(e) => normalizeUnit(e.target.value) !== i.unit && patch(i.id, { unit: normalizeUnit(e.target.value) })} /></td>
                  <td>
                    <input className="in" style={{ width: '100%', textAlign: 'right' }} defaultValue={String(i.price).replace('.', ',')} key={`${i.id}-${i.price}`}
                      onBlur={(e) => { const v = parseNumberFr(e.target.value); if (v !== null && v !== i.price) patch(i.id, { price: v }); }} />
                  </td>
                  <td><input className="in" style={{ width: '100%' }} defaultValue={i.supplier} onBlur={(e) => e.target.value !== i.supplier && patch(i.id, { supplier: e.target.value })} /></td>
                  <td>
                    <select className="in" style={{ width: '100%' }} value={i.category} onChange={(e) => patch(i.id, { category: e.target.value as PriceItem['category'] })}>
                      {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td><input className="in" style={{ width: '100%' }} defaultValue={i.location} onBlur={(e) => e.target.value !== i.location && patch(i.id, { location: e.target.value })} /></td>
                  <td className="small muted">{new Date(i.updatedAt).toLocaleDateString('fr-FR')}</td>
                  <td><button className="icon-btn" title="Supprimer" onClick={() => setToDelete(i)}><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    {items.length === 0 ? 'Bibliothèque vide. Ajoutez des articles, importez un CSV, ou reprenez les prix du DQE ouvert (« Prix du projet → bibliothèque »).' : 'Aucun article ne correspond.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      {toDelete && (
        <ConfirmDialog title="Supprimer l’article ?" confirm="Supprimer" danger onCancel={() => setToDelete(null)}
          onConfirm={() => { void s.setPrices(items.filter((i) => i.id !== toDelete.id)); setToDelete(null); }}>
          « {toDelete.designation} » sera retiré de la bibliothèque. Les lignes de DQE qui utilisent ce prix gardent leur valeur actuelle.
        </ConfirmDialog>
      )}
      {applying && <ApplyDialog onClose={() => setApplying(false)} />}
    </div>
  );
}

/** Propose, pour les lignes sans prix (ou à prix nul), le meilleur article de même unité. */
function ApplyDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const p = s.project!;
  const [onlyMissing, setOnlyMissing] = useState(true);
  const proposals = useMemo(
    () =>
      allLines(p)
        .filter((l) => !onlyMissing || l.unitPrice.value === null || l.unitPrice.value === 0)
        .map((l) => ({ line: l, match: findMatches(l, s.prices, 1).find((m) => m.sameUnit && m.score >= 0.4) }))
        .filter((x) => x.match && x.match.item.price !== x.line.unitPrice.value),
    [p, s.prices, onlyMissing],
  );
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  return (
    <Modal wide title="Appliquer la bibliothèque de prix au DQE" onClose={onClose}
      footer={
        <>
          <label className="row small" style={{ marginRight: 'auto' }}>
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />Seulement les lignes sans prix
          </label>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={!chosen.size} onClick={() => {
            const sel = proposals.filter((x) => chosen.has(x.line.id));
            s.update((proj) => sel.reduce((acc, x) => applyPrice(acc, x.line.id, x.match!.item), proj));
            s.toast('success', `${sel.length} prix appliqué(s). Chaque changement est tracé dans la ligne.`);
            onClose();
          }}>Appliquer ({chosen.size})</button>
        </>
      }>
      {proposals.length === 0 ? (
        <div className="empty">Aucune correspondance fiable trouvée (même unité, désignation proche).</div>
      ) : (
        <table className="t">
          <thead>
            <tr>
              <th><input type="checkbox" checked={chosen.size === proposals.length} onChange={(e) => setChosen(e.target.checked ? new Set(proposals.map((x) => x.line.id)) : new Set())} /></th>
              <th>Ligne du DQE</th><th className="n">PU actuel</th><th>Article proposé</th><th className="n">Prix</th><th className="n">Similarité</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(({ line, match }) => (
              <tr key={line.id}>
                <td><input type="checkbox" checked={chosen.has(line.id)} onChange={(e) => setChosen((c) => { const n = new Set(c); if (e.target.checked) n.add(line.id); else n.delete(line.id); return n; })} /></td>
                <td>{line.designation} <span className="muted small">({line.unit})</span></td>
                <td className="n">{formatNumber(line.unitPrice.value, 0)}</td>
                <td>{match!.item.code} {match!.item.designation}</td>
                <td className="n">{formatNumber(match!.item.price, 0)}</td>
                <td className="n">{Math.round(match!.score * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
