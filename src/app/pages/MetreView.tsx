// Métré (§9, §10) : chaque quantité avec sa formule, sa source et sa confiance.
// La formule se déplie pour montrer le calcul pas à pas. Liste virtualisée.

import { ChevronDown, ChevronRight, Ruler, Search } from 'lucide-react';
import { Fragment, useMemo, useRef, useState } from 'react';
import { describeExpression } from '../../core/dqe';
import { formatNumber, normalizeText } from '../../core/format';
import type { Confidence } from '../../core/types';
import { StatusBadge } from '../ds/legacy';
import { Card, cx, Pending } from '../ds/primitives';
import { useVirtual } from '../hooks';
import { useStore } from '../stores/app-store';

const ROW = 34;

export function MetreView() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [q, setQ] = useState('');
  const [lot, setLot] = useState('');
  const [unit, setUnit] = useState('');
  const [state, setState] = useState<Confidence | ''>('');
  const [open, setOpen] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(p.lots.flatMap((l) => l.sections.flatMap((x) => x.lines)).map((l) => [l.id, l])), [p]);
  const rows = useMemo(() => {
    const n = normalizeText(q);
    return p.lots.flatMap((l) =>
      l.sections.flatMap((sec) =>
        sec.lines
          .map((line) => ({ lot: l, sec, line, rr: r.lines.get(line.id)! }))
          .filter(({ line, rr }) => (!lot || l.id === lot) && (!unit || line.unit === unit) && (!state || rr.quantityStatus === state) && (!n || normalizeText(line.designation).includes(n))),
      ),
    );
  }, [p, r, q, lot, unit, state]);
  const units = useMemo(() => [...new Set(p.lots.flatMap((l) => l.sections.flatMap((x) => x.lines.map((y) => y.unit))).filter(Boolean))].sort(), [p]);
  const v = useVirtual(rows.length, ROW, scroller);
  const total = unit ? rows.reduce((t, x) => t + (x.rr.retained ?? 0), 0) : null;

  const formula = (line: (typeof rows)[number]['line']) =>
    line.quantity.expression ? describeExpression(line.quantity.expression, byId) : line.quantity.source?.formula ? `Formule du fichier : ${line.quantity.source.formula}` : line.quantity.origin === 'manual' ? 'Saisie manuelle' : line.quantity.value === null ? '—' : 'Valeur lue';
  const source = (line: (typeof rows)[number]['line']) =>
    line.quantity.source ? `${line.quantity.source.cell ? line.quantity.source.cell + ' · ' : ''}${line.quantity.source.fileName}` : line.quantity.origin === 'manual' ? 'Saisie' : '—';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_380px]">
        <div className="notice m-0">
          <b>Métré issu des fichiers</b>
          Les quantités viennent du DQE importé ou des saisies, avec leurs formules : par exemple, les enduits valent la surface des murs × 2,2, et suivent les
          corrections. Le métré géométrique à partir des plans (longueur × hauteur − ouvertures) arrivera avec la phase 3.
        </div>
        <Pending compact title="Métré géométrique des plans" phase="phase 3" icon={<Ruler size={22} />}>Murs, ouvertures, surfaces et volumes calculés à l’échelle à partir des tracés des plans.</Pending>
      </div>

      <Card
        bodyClass="p-0"
        title={`${rows.length} quantité(s)${total !== null ? ` — total ${formatNumber(total)} ${unit}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input className="in w-[220px] pl-8" placeholder="Rechercher un ouvrage…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="in" value={lot} onChange={(e) => setLot(e.target.value)}>
              <option value="">Tous les lots</option>
              {p.lots.map((l) => <option key={l.id} value={l.id}>{l.code} {l.name}</option>)}
            </select>
            <select className="in" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Toutes unités</option>
              {units.map((u) => <option key={u}>{u}</option>)}
            </select>
            <select className="in" value={state} onChange={(e) => setState(e.target.value as Confidence | '')}>
              <option value="">Tous les états</option>
              <option value="confirmed">🟢 Confirmé</option>
              <option value="to_verify">🟠 À vérifier</option>
              <option value="undetermined">🔴 Non déterminé</option>
            </select>
          </div>
        }
      >
        <div ref={scroller} className="max-h-[calc(100vh-var(--topbar)-360px)] min-h-[300px] overflow-auto">
          <table className="t" style={{ tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: 28 }} /><col /><col style={{ width: 62 }} /><col style={{ width: 110 }} /><col style={{ width: '24%' }} /><col style={{ width: 170 }} /><col style={{ width: 128 }} /><col style={{ width: 130 }} /></colgroup>
            <thead><tr><th /><th>Désignation</th><th>Unité</th><th className="n">Quantité</th><th>Formule</th><th>Source</th><th>Confiance</th><th>Lot</th></tr></thead>
            <tbody>
              {v.before > 0 && <tr style={{ height: v.before }}><td colSpan={8} style={{ padding: 0, border: 0 }} /></tr>}
              {rows.slice(v.start, v.end).map(({ lot: l, line, rr }) => (
                <Fragment key={line.id}>
                  <tr className={cx(open === line.id && 'sel')} style={{ height: ROW, cursor: 'pointer' }} onClick={() => setOpen(open === line.id ? null : line.id)}>
                    <td className="c">{open === line.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                    <td className="ellipsis" title={line.designation}><b>{line.designation}</b>{line.observation && <span className="muted"> · {line.observation}</span>}</td>
                    <td>{line.unit}</td>
                    <td className="n"><b>{formatNumber(rr.retained)}</b></td>
                    <td className="ellipsis small" title={formula(line)}>{formula(line)}</td>
                    <td className="ellipsis mono" title={source(line)}>{source(line)}</td>
                    <td><StatusBadge status={rr.quantityStatus} /></td>
                    <td className="ellipsis small muted" title={l.name}>{l.code} {l.name}</td>
                  </tr>
                  {open === line.id && (
                    <tr className="anim-fade">
                      <td />
                      <td colSpan={7} style={{ background: 'var(--bg-2)' }}>
                        <div className="grid grid-cols-1 gap-3 py-1.5 md:grid-cols-[1fr_1fr]">
                          <div>
                            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Calcul pas à pas</div>
                            <ol className="steps small">
                              {rr.steps.length ? rr.steps.map((x, i) => <li key={i}>{x}</li>) : <li>Quantité lue : {formatNumber(rr.quantity)} {line.unit}</li>}
                            </ol>
                          </div>
                          <div className="small">
                            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Traçabilité</div>
                            <div>Source : <span className="mono">{source(line)}</span></div>
                            {line.quantity.source?.formula && <div>Formule d’origine : <span className="mono">{line.quantity.source.formula}</span></div>}
                            {line.quantity.note && <div className="muted">{line.quantity.note}</div>}
                            {line.edits.filter((e) => e.field === 'quantity').map((e, i) => <div key={i} className="muted">Modifiée le {new Date(e.at).toLocaleString('fr-FR')} : {String(e.before ?? '—')} → {String(e.after ?? '—')}</div>)}
                            <button className="btn sm mt-2" onClick={() => s.go('dqe', line.id)}>Ouvrir dans le DQE</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {v.after > 0 && <tr style={{ height: v.after }}><td colSpan={8} style={{ padding: 0, border: 0 }} /></tr>}
              {rows.length === 0 && <tr><td colSpan={8} className="empty">Aucune quantité ne correspond.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
