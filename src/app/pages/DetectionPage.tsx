// Détection des éléments (§4, §8) : tout ce que DQP a reconnu, quelle que soit la source
// (plans PDF, désignations du DQE), avec filtres, état de confiance et accès au détail.

import { Check, FileSpreadsheet, Map as MapIcon, ScanLine, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { detectElements } from '../../core/classify';
import { acceptElement, effectiveStatus, rejectElement } from '../../core/elements/ops';
import { formatNumber, normalizeText } from '../../core/format';
import type { Confidence, ElementKind } from '../../core/types';
import { StatusBadge } from '../ds/legacy';
import { Split } from '../ds/layout';
import { Button, Card, cx, EmptyState, Tabs, useContextMenu } from '../ds/primitives';
import { ElementInspector } from '../features/plan/ElementInspector';
import { KIND_LABEL } from '../features/plan/PlanCanvas';
import { useStore } from '../stores/app-store';

type Source = 'plans' | 'dqe';
type Filter = 'all' | Confidence | 'rejected';

export function DetectionPage() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [source, setSource] = useState<Source>(p.elements.length ? 'plans' : 'dqe');
  const [kind, setKind] = useState<ElementKind | 'all'>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const menu = useContextMenu();

  useEffect(() => {
    const id = s.focusLineId;
    if (id && p.elements.some((e) => e.id === id)) {
      setSource('plans');
      setSelected(id);
    }
  }, [s.focusLineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = normalizeText(q);
  const planRows = useMemo(
    () =>
      p.elements.filter((e) => {
        const st = effectiveStatus(e);
        return (kind === 'all' || e.kind === kind) && (filter === 'all' || st === filter) && (!n || normalizeText(`${e.name} ${e.category} ${e.level ?? ''}`).includes(n));
      }),
    [p.elements, kind, filter, n],
  );
  const dqeEls = useMemo(() => detectElements(p, r).filter((e) => (filter === 'all' || e.status === filter) && (!n || normalizeText(`${e.element} ${e.family}`).includes(n))), [p, r, filter, n]);
  const sel = p.elements.find((e) => e.id === selected);

  if (!p.elements.length && !r.lineCount) {
    return (
      <EmptyState icon={<ScanLine size={22} />} title="Rien à détecter pour l’instant" action={<Button variant="primary" onClick={() => s.go('import')}>Importer des fichiers</Button>}>
        Importez des plans PDF ou un DQE : DQP reconnaît les pièces, niveaux, menuiseries, équipements et ouvrages, chacun avec sa source et son niveau de confiance.
      </EmptyState>
    );
  }

  const counts = (k: ElementKind | 'all') => p.elements.filter((e) => k === 'all' || e.kind === k).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={source}
          onChange={setSource}
          items={[
            { id: 'plans', label: `Plans (${p.elements.length})`, icon: <MapIcon size={14} /> },
            { id: 'dqe', label: `Désignations du DQE (${detectElements(p, r).length})`, icon: <FileSpreadsheet size={14} /> },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="in w-[240px] pl-8" placeholder="Filtrer les éléments…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="in" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">Tous les états</option>
            <option value="confirmed">🟢 Confirmé</option>
            <option value="to_verify">🟠 À vérifier</option>
            <option value="undetermined">🔴 Non déterminé</option>
            {source === 'plans' && <option value="rejected">Rejetés</option>}
          </select>
        </div>
      </div>

      {source === 'plans' ? (
        <Split id="detection" sizes={[0.66, 0.34]} min={300} className="h-[calc(100vh-var(--topbar)-280px)] min-h-[420px]">
          <Card className="h-full" bodyClass="flex h-full min-h-0 flex-col p-0" title={<span className="flex flex-wrap gap-1">{(['all', 'room', 'opening', 'equipment', 'surface_total', 'level'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cx('rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors', kind === k ? 'border-brand-2/60 bg-brand-soft text-fg' : 'border-line text-muted hover:text-fg')}>
              {k === 'all' ? 'Tous' : KIND_LABEL[k]} <span className="tabular-nums opacity-70">{counts(k)}</span>
            </button>
          ))}</span>}>
            {p.elements.length === 0 ? (
              <EmptyState icon={<MapIcon size={20} />} title="Aucun plan analysé" action={<Button variant="primary" onClick={() => s.go('import')}>Importer un plan PDF</Button>} />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="t">
                  <thead><tr><th>Élément</th><th>Type</th><th>Niveau</th><th className="n">Surface / dimensions</th><th>Source</th><th>Confiance</th><th /></tr></thead>
                  <tbody>
                    {planRows.map((e) => {
                      const st = effectiveStatus(e);
                      const surf = e.props.surface?.value;
                      const dims = e.props.largeur?.value != null && e.props.hauteur?.value != null ? `${e.props.largeur.value}×${e.props.hauteur.value} cm` : null;
                      return (
                        <tr
                          key={e.id}
                          className={cx(selected === e.id && 'sel', st === 'rejected' && 'opacity-50')}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelected(e.id)}
                          onContextMenu={(ev) => menu.open(ev, [
                            { label: 'Valider', icon: <Check size={14} />, onSelect: () => s.update((x) => acceptElement(x, e.id)) },
                            { label: 'Rejeter', icon: <X size={14} />, danger: true, onSelect: () => s.update((x) => rejectElement(x, e.id)) },
                            { separator: true },
                            { label: 'Voir sur le plan', icon: <MapIcon size={14} />, onSelect: () => s.go('viewer', e.id) },
                          ])}
                        >
                          <td><b>{e.name}</b></td>
                          <td>{e.category}<div className="small muted">{KIND_LABEL[e.kind]}</div></td>
                          <td>{e.level ?? <span className="muted">—</span>}</td>
                          <td className="n">{typeof surf === 'number' ? `${formatNumber(surf)} m²` : dims ?? (e.props.surface || e.props.largeur ? <span style={{ color: 'var(--bad)' }}>non déterminé</span> : '—')}</td>
                          <td className="small muted">{e.source.fileName} · p.{e.source.page}</td>
                          <td>{st === 'rejected' ? <span className="badge grey">Rejeté</span> : <StatusBadge status={st} />}</td>
                          <td className="n">
                            <div className="row-actions" style={{ opacity: 1 }}>
                              {st !== 'confirmed' && st !== 'rejected' && <button className="icon-btn" title="Valider" onClick={(ev) => { ev.stopPropagation(); s.update((x) => acceptElement(x, e.id)); }}><Check size={14} /></button>}
                              <button className="icon-btn" title="Voir sur le plan" onClick={(ev) => { ev.stopPropagation(); s.go('viewer', e.id); }}><MapIcon size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {planRows.length === 0 && <tr><td colSpan={7} className="empty">Aucun élément ne correspond aux filtres.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card className="h-full" bodyClass="h-full min-h-0 p-0" title={sel ? undefined : 'Propriétés'}>
            {sel ? <ElementInspector e={sel} onClose={() => setSelected(null)} onDetail={() => s.go('viewer', sel.id)} /> : <div className="p-6 text-center text-[12.5px] text-muted">Sélectionnez un élément pour voir ses propriétés, sa source et son niveau de confiance. Clic droit : actions rapides.</div>}
          </Card>
        </Split>
      ) : (
        <Card title="Éléments reconnus dans les désignations du DQE" bodyClass="p-0" actions={<span className="text-[11.5px] text-muted">Classement par mots-clés : à contrôler · quantités lues dans le DQE</span>}>
          <table className="t">
            <thead><tr><th>Élément</th><th>Famille</th><th className="n">Quantité</th><th>Unité</th><th className="n">Lignes</th><th>Confiance</th></tr></thead>
            <tbody>
              {dqeEls.map((e) => (
                <tr key={e.element + e.unit} style={{ cursor: 'pointer' }} onClick={() => s.go('dqe', e.lines[0]?.id)}>
                  <td><b>{e.element}</b><div className="small muted ellipsis" style={{ maxWidth: 460 }}>{e.lines.map((l) => l.designation).join(' · ')}</div></td>
                  <td>{e.family}</td>
                  <td className="n"><b>{e.lines.some((l) => l.quantity !== null) ? formatNumber(e.quantity) : '—'}</b></td>
                  <td>{e.unit}</td>
                  <td className="n">{e.lines.length}</td>
                  <td><StatusBadge status={e.status} /></td>
                </tr>
              ))}
              {dqeEls.length === 0 && <tr><td colSpan={6} className="empty">Aucun élément.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
      {menu.node}
    </div>
  );
}
