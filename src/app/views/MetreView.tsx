import { useMemo, useState } from 'react';
import { formatNumber } from '../../core/format';
import { PhaseNotice, Panel, StatusDot } from '../components/ui';
import { useStore } from '../store';

export function MetreView() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [unit, setUnit] = useState('');
  const [q, setQ] = useState('');

  const rows = useMemo(
    () =>
      p.lots.flatMap((lot) =>
        lot.sections.flatMap((sec) =>
          sec.lines.map((l) => ({ lot, sec, l, rr: r.lines.get(l.id)! })),
        ),
      ),
    [p, r],
  );
  const units = [...new Set(rows.map((x) => x.l.unit).filter(Boolean))].sort();
  const shown = rows.filter((x) => (!unit || x.l.unit === unit) && (!q || x.l.designation.toLowerCase().includes(q.toLowerCase())));
  const totalShown = unit ? shown.reduce((sum, x) => sum + (x.rr.retained ?? 0), 0) : null;

  return (
    <div>
      <h1 className="title">05 — Métré</h1>
      <p className="subtitle">Quantités du projet avec leur origine et leur calcul.</p>
      <PhaseNotice phase="Phase 3 — Métré intelligent">
        Le calcul automatique des quantités à partir des plans (longueurs et surfaces de murs, déduction des ouvertures, surfaces de carrelage et de peinture, volumes de béton)
        arrivera avec l’analyse des PDF (phase 2) et le métré intelligent (phase 3). Aujourd’hui, DQP reprend les quantités de votre DQE, conserve leurs formules et recalcule les
        quantités liées entre elles (ex. enduits = surface de murs × 2,2).
      </PhaseNotice>
      <Panel
        title={`${shown.length} quantité(s)${totalShown !== null ? ` — total ${formatNumber(totalShown)} ${unit}` : ''}`}
        actions={
          <div className="row">
            <input className="in" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="in" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Toutes les unités</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        }
        flush
      >
        <table className="t">
          <thead><tr><th>Lot</th><th>Désignation</th><th>Unité</th><th className="n">Quantité</th><th className="n">Retenue</th><th>État</th><th>Calcul / source</th></tr></thead>
          <tbody>
            {shown.map(({ lot, l, rr }) => (
              <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => s.go('dqe', l.id)}>
                <td className="small muted">{lot.code}</td>
                <td>{l.designation}</td>
                <td>{l.unit}</td>
                <td className="n">{formatNumber(rr.quantity)}</td>
                <td className="n">{formatNumber(rr.retained)}</td>
                <td><StatusDot status={rr.quantityStatus} /></td>
                <td className="small">
                  {rr.steps.filter((x) => !x.startsWith('Montant')).join(' · ') ||
                    (l.quantity.source ? <span className="mono muted">{l.quantity.source.fileName} !{l.quantity.source.cell}</span> : l.quantity.origin === 'manual' ? 'Saisie manuelle' : '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
