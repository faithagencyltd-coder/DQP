// Métré (§9, §10) : chaque quantité avec sa formule, sa source et sa confiance.
// La formule se déplie pour montrer le calcul pas à pas. Liste virtualisée.

import { ChevronDown, ChevronRight, ExternalLink, Map as MapIcon, Ruler, Search } from 'lucide-react';
import { Fragment, useMemo, useRef, useState } from 'react';
import { allLines, describeExpression } from '../../core/dqe';
import { computeMeasure, MEASURE_LABEL, scaleFor } from '../../core/metre/measure';
import { formatNumber, normalizeText } from '../../core/format';
import type { Confidence } from '../../core/types';
import { StatusBadge } from '../ds/legacy';
import { Button, Card, cx, EmptyState } from '../ds/primitives';
import { KIND_COLOR } from '../features/plan/MeasureTools';
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
    line.quantity.expression ? describeExpression(line.quantity.expression, byId, p) : line.quantity.source?.formula ? `Formule du fichier : ${line.quantity.source.formula}` : line.quantity.origin === 'manual' ? 'Saisie manuelle' : line.quantity.value === null ? '—' : 'Valeur lue';
  const source = (line: (typeof rows)[number]['line']) =>
    line.quantity.source ? `${line.quantity.source.cell ? line.quantity.source.cell + ' · ' : ''}${line.quantity.source.fileName}` : line.quantity.origin === 'manual' ? 'Saisie' : '—';

  return (
    <div className="space-y-3">
      <PlanMeasures />

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

/** Mesures prises sur les plans : formule, échelle, confiance et lignes du DQE alimentées. */
function PlanMeasures() {
  const s = useStore();
  const p = s.project!;
  const [open, setOpen] = useState<string | null>(null);
  const lines = useMemo(() => allLines(p), [p]);
  const hasPdf = p.sourceFiles.some((f) => f.kind === 'pdf');
  if (!p.measurements.length) {
    return (
      <Card title="Mesures sur plans">
        <EmptyState
          icon={<Ruler size={22} />}
          title="Aucune mesure prise sur les plans"
          action={hasPdf ? <Button variant="primary" icon={<MapIcon size={14} />} onClick={() => s.go('viewer')}>Mesurer sur le Plan 2D</Button> : <Button onClick={() => s.go('import')}>Importer un plan PDF</Button>}
        >
          Dans le Plan 2D : étalonnez la planche sur une cote connue, puis mesurez longueurs, surfaces, murs (longueur × hauteur − ouvertures) et comptages.
          Chaque mesure peut devenir la quantité d’une ligne du DQE, qui suit ensuite ses modifications.
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card bodyClass="p-0" title={`Mesures sur plans (${p.measurements.length})`} actions={<Button size="sm" icon={<MapIcon size={13} />} onClick={() => s.go('viewer')}>Plan 2D</Button>}>
      <table className="t">
        <thead>
          <tr><th className="w-6" /><th>Mesure</th><th>Type</th><th>Plan</th><th>Échelle</th><th className="n">Valeur</th><th>Unité</th><th>Confiance</th><th>Lignes du DQE</th><th className="w-8" /></tr>
        </thead>
        <tbody>
          {p.measurements.map((m) => {
            const r = computeMeasure(p, m);
            const sc = scaleFor(p, m.fileId, m.page);
            const linked = lines.filter((l) => l.quantity.expression?.includes(`{M:${m.id}}`));
            return (
              <Fragment key={m.id}>
                <tr className="cursor-pointer hover:bg-hover" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <td>{open === m.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                  <td><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: KIND_COLOR[m.kind] }} /><b>{m.label}</b></td>
                  <td>{MEASURE_LABEL[m.kind]}{m.origin === 'proposal' ? (m.accepted ? ' (proposition validée)' : ' (proposition)') : ''}</td>
                  <td className="text-muted">{m.fileName} · p.{m.page}</td>
                  <td className="text-muted">{m.kind === 'count' ? '—' : sc ? `1/${Math.round(sc.mmPerPt / (25.4 / 72))}${sc.status === 'confirmed' ? ' étalonnée' : ' lue'}` : 'non déterminée'}</td>
                  <td className="n"><b>{r.value === null ? '—' : formatNumber(r.value)}</b></td>
                  <td>{r.unit}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-muted">{linked.length ? linked.map((l) => l.designation).join(' ; ') : '—'}</td>
                  <td>
                    <button className="icon-btn" title="Ouvrir sur le plan" aria-label="Ouvrir sur le plan" onClick={(e) => { e.stopPropagation(); s.go('viewer', m.id); }}><ExternalLink size={13} /></button>
                  </td>
                </tr>
                {open === m.id && (
                  <tr>
                    <td />
                    <td colSpan={9}>
                      <ol className="steps small my-1">{r.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
                      {m.note && <p className="small muted m-0">{m.note}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
