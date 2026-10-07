import { Check, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { detectElements, detectStructure } from '../../core/classify';
import { crossCheck, resolve, unresolve, type Comparison } from '../../core/elements/crosscheck';
import { acceptElement, activeElements, effectiveStatus, rejectElement } from '../../core/elements/ops';
import { editLine } from '../../core/project';
import { formatMoney, formatNumber } from '../../core/format';
import { updateInfo, validateValue } from '../../core/project';
import type { Alert, Confidence, DetectedInfo } from '../../core/types';
import { INFO_LABEL, Panel, SeverityBadge, StatusBadge, StatusDot } from '../components/ui';
import { useStore } from '../store';


export function AnalysisView() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [sev, setSev] = useState<'all' | Alert['severity']>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [verifyFilter, setVerifyFilter] = useState<Confidence | 'all'>('all');
  const elements = useMemo(() => detectElements(p, r), [p, r]);
  const structure = useMemo(() => detectStructure(p), [p]);
  const fileAlerts = p.analyses.flatMap((a) => a.fileAlerts);
  const all = [...fileAlerts, ...s.alerts];
  const shown = all.filter((a) => sev === 'all' || a.severity === sev);
  const detected = p.analyses.flatMap((a) => a.detected.map((d) => ({ ...d, file: a.fileName })));
  const grand = p.analyses.find((a) => a.sourceGrandTotal)?.sourceGrandTotal;

  const comparisons = useMemo(() => crossCheck(p, r), [p, r]);
  const toVerify = p.lots.flatMap((lot) =>
    lot.sections.flatMap((sec) =>
      sec.lines
        .map((l) => ({ lot, sec, l, rr: r.lines.get(l.id)! }))
        .filter(({ l, rr }) => rr.quantityStatus !== 'confirmed' || l.unitPrice.status !== 'confirmed'),
    ),
  );
  const filteredVerify = toVerify.filter(({ l, rr }) => verifyFilter === 'all' || rr.quantityStatus === verifyFilter || l.unitPrice.status === verifyFilter);

  const useInfo = (d: DetectedInfo) => {
    if (d.key === 'title') s.update((x) => updateInfo(x, { name: d.value.replace(/^projet de construction d['’]une?\s+/i, '').trim() || d.value }));
    if (d.key === 'location') s.update((x) => updateInfo(x, { location: d.value }));
    if (d.key === 'date') s.update((x) => updateInfo(x, { date: d.value }));
    if (d.key === 'phase') s.update((x) => updateInfo(x, { phase: d.value }));
    if (d.key === 'projectType') s.go('project');
  };

  if (p.analyses.length === 0 && r.lineCount === 0) {
    return (
      <div className="empty">
        <h2>Aucune analyse</h2>
        <p>Importez un fichier pour que DQP l’analyse.</p>
        <button className="btn primary" onClick={() => s.go('import')}>Importer un fichier</button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="title">03 / 04 — Analyse et vérification</h1>
      <p className="subtitle">
        Projet analysé : <b>{p.info.name}</b> · Fichiers analysés : {p.analyses.map((a) => a.fileName).join(', ') || '—'}
      </p>

      <div className="kpis">
        <div className="kpi"><div className="v">{p.lots.length}</div><div className="l">lots</div></div>
        <div className="kpi"><div className="v">{p.lots.reduce((n, l) => n + l.sections.length, 0)}</div><div className="l">sections</div></div>
        <div className="kpi"><div className="v">{r.lineCount}</div><div className="l">lignes d’ouvrage</div></div>
        <div className="kpi"><div className="v">{structure.levels.length || '—'}</div><div className="l">niveau(x) : {structure.levels.join(', ') || 'non déterminé'}</div></div>
        <div className="kpi ok"><div className="v">🟢 {r.status.confirmed}</div><div className="l">éléments confirmés</div></div>
        <div className="kpi warn"><div className="v">🟠 {r.status.to_verify}</div><div className="l">éléments à vérifier</div></div>
        <div className="kpi bad"><div className="v">🔴 {r.status.undetermined}</div><div className="l">éléments non déterminés</div></div>
      </div>

      {comparisons.length > 0 && <ComparisonsPanel comparisons={comparisons} />}
      {p.elements.length > 0 && <PlanElementsPanel />}

      <div className="grid2">
        <Panel title="Éléments reconnus dans le DQE" flush>
          <table className="t">
            <thead><tr><th>Élément</th><th>Famille</th><th className="n">Quantité</th><th>Unité</th><th>État</th></tr></thead>
            <tbody>
              {elements.map((e) => {
                const key = e.element + e.unit;
                return (
                  <Fragment key={key}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(open === key ? null : key)}>
                      <td>{open === key ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {e.element}</td>
                      <td className="muted small">{e.family}</td>
                      <td className="n"><b>{e.lines.some((l) => l.quantity !== null) ? formatNumber(e.quantity) : '—'}</b></td>
                      <td>{e.unit}</td>
                      <td><StatusBadge status={e.status} /></td>
                    </tr>
                    {open === key &&
                      e.lines.map((l) => (
                        <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => s.go('dqe', l.id)}>
                          <td colSpan={2} className="small" style={{ paddingLeft: 26 }}>{l.designation}</td>
                          <td className="n small">{formatNumber(l.quantity)}</td>
                          <td colSpan={2} className="small muted">voir la ligne</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
              {elements.length === 0 && <tr><td colSpan={5} className="muted">Aucun élément reconnu.</td></tr>}
            </tbody>
          </table>
          <p className="small muted" style={{ padding: '0 12px' }}>
            Quantités lues dans le DQE ; le rattachement d’une ligne à un élément est fait par mots-clés de la désignation. Cliquez sur un élément pour voir les lignes qui le composent.
          </p>
        </Panel>

        <div>
          <Panel title="Informations du projet détectées" flush>
            <table className="t">
              <tbody>
                {detected.map((d, i) => (
                  <tr key={i}>
                    <td className="muted small" style={{ width: 90 }}>{INFO_LABEL[d.key]}</td>
                    <td>
                      {d.value}
                      {d.note && <div className="small muted">{d.note}</div>}
                      <div className="small muted mono">{d.file}{d.source?.cell ? ' !' + d.source.cell : ''}</div>
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    <td className="n">{d.key !== 'country' && <button className="btn sm" onClick={() => useInfo(d)}>Utiliser</button>}</td>
                  </tr>
                ))}
                {detected.length === 0 && <tr><td className="muted">Aucune information détectée.</td></tr>}
              </tbody>
            </table>
          </Panel>
          <Panel title="Croisement des totaux : fichier source / DQP" flush>
            <table className="t">
              <thead><tr><th>Lot</th><th className="n">Fichier</th><th className="n">DQP</th><th className="n">Écart</th></tr></thead>
              <tbody>
                {p.lots.map((lot) => {
                  const t = r.lots.get(lot.id)!.amount;
                  const src = lot.sourceTotal;
                  const d = src?.value != null ? t - src.value : null;
                  const bad = d !== null && Math.abs(d) >= 1;
                  return (
                    <tr key={lot.id}>
                      <td>{lot.code} {lot.name}</td>
                      <td className="n">{src ? <>{formatNumber(src.value, 0)}<div className="mono small muted">{src.source.cell}</div></> : '—'}</td>
                      <td className="n">{formatNumber(t, 0)}</td>
                      <td className="n" style={bad ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{d === null ? '—' : bad ? `⚠️ ${formatNumber(Math.round(d), 0)}` : '✓'}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td><b>Total général</b></td>
                  <td className="n"><b>{grand ? formatNumber(grand.value, 0) : '—'}</b></td>
                  <td className="n"><b>{formatNumber(r.totalHT, 0)}</b></td>
                  <td className="n"><b>{grand?.value != null ? formatNumber(Math.round(r.totalHT - grand.value), 0) : '—'}</b></td>
                </tr>
              </tbody>
            </table>
            <p className="small muted" style={{ padding: '0 12px' }}>Les modifications faites dans DQP changent le total DQP ; le total du fichier reste celui lu à l’import ({formatMoney(grand?.value ?? null, p.settings.currency)}).</p>
          </Panel>
        </div>
      </div>

      <Panel
        title={`Alertes (${all.length})`}
        actions={
          <div className="row">
            {(['all', 'error', 'warning', 'info'] as const).map((k) => (
              <button key={k} className={`btn sm ${sev === k ? 'primary' : ''}`} onClick={() => setSev(k)}>
                {k === 'all' ? 'Toutes' : k === 'error' ? `Erreurs (${all.filter((a) => a.severity === 'error').length})` : k === 'warning' ? `À vérifier (${all.filter((a) => a.severity === 'warning').length})` : `Infos (${all.filter((a) => a.severity === 'info').length})`}
              </button>
            ))}
          </div>
        }
        flush
      >
        <div style={{ maxHeight: 340, overflow: 'auto' }}>
          {shown.map((a) => (
            <div key={a.id} className={`alert-item ${a.lineId ? 'clickable' : ''}`} onClick={() => a.lineId && s.go('dqe', a.lineId)}>
              <SeverityBadge severity={a.severity} />
              <div className="msg small">
                {a.message}
                {a.source?.cell && <span className="mono muted"> — {a.source.fileName} !{a.source.cell}</span>}
              </div>
              <span className="badge grey">{fileAlerts.includes(a) ? 'Fichier source' : 'DQE'}</span>
            </div>
          ))}
          {shown.length === 0 && <div className="empty">Aucune alerte.</div>}
        </div>
      </Panel>

      <Panel
        title={`04 — Éléments à vérifier (${toVerify.length})`}
        actions={
          <select className="in" value={verifyFilter} onChange={(e) => setVerifyFilter(e.target.value as Confidence | 'all')}>
            <option value="all">Tous</option>
            <option value="to_verify">🟠 À vérifier</option>
            <option value="undetermined">🔴 Non déterminés</option>
          </select>
        }
        flush
      >
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="t">
            <thead><tr><th>Lot</th><th>Désignation</th><th>Unité</th><th className="n">Quantité</th><th className="n">P.U.</th><th>Motif</th><th /></tr></thead>
            <tbody>
              {filteredVerify.map(({ lot, l, rr }) => (
                <tr key={l.id}>
                  <td className="small muted">{lot.code}</td>
                  <td>{l.designation}</td>
                  <td>{l.unit}</td>
                  <td className="n"><span className="row" style={{ justifyContent: 'flex-end', gap: 5 }}><StatusDot status={rr.quantityStatus} />{formatNumber(rr.quantity)}</span></td>
                  <td className="n"><span className="row" style={{ justifyContent: 'flex-end', gap: 5 }}><StatusDot status={l.unitPrice.status} />{formatNumber(l.unitPrice.value, 0)}</span></td>
                  <td className="small">{[rr.quantityStatus !== 'confirmed' && l.quantity.note, l.unitPrice.status !== 'confirmed' && l.unitPrice.note].filter(Boolean).join(' · ')}</td>
                  <td className="n">
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {rr.quantityStatus === 'to_verify' && l.quantity.value !== null && !l.quantity.expression && (
                        <button className="btn sm" title="Valider la quantité telle quelle" onClick={() => s.update((x) => validateValue(x, l.id, 'quantity'))}><Check size={12} />Qté</button>
                      )}
                      {l.unitPrice.status === 'to_verify' && l.unitPrice.value !== null && (
                        <button className="btn sm" title="Valider le prix tel quel" onClick={() => s.update((x) => validateValue(x, l.id, 'unitPrice'))}><Check size={12} />PU</button>
                      )}
                      <button className="btn sm" onClick={() => s.go('dqe', l.id)}><Pencil size={12} />Corriger</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredVerify.length === 0 && <tr><td colSpan={7} className="empty">Tout est vérifié.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/** Différences entre les sources (§27) : l’utilisateur décide quelle information conserver. */
function ComparisonsPanel({ comparisons }: { comparisons: Comparison[] }) {
  const s = useStore();
  const open = comparisons.filter((c) => c.differs && !c.resolution).length;
  return (
    <Panel title={`Croisement des fichiers — ${open} différence(s) à arbitrer`} flush>
      <p className="small muted" style={{ margin: '8px 12px' }}>
        Les comptages des plans sont faits à partir des étiquettes écrites sur les plans (à vérifier sur l’aperçu). Une source qui ne dit rien n’est pas comptée à zéro.
        Choisissez la valeur à conserver ; si elle concerne une seule ligne du DQE, DQP propose de l’y appliquer (modification tracée).
      </p>
      <table className="t">
        <thead><tr><th>Information</th>{['Valeurs par source', 'Décision'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {comparisons.map((c) => {
            const dqe = c.values.find((v) => v.source === 'DQE');
            const canApply = c.resolution && dqe?.lineIds?.length === 1 && typeof c.resolution.value === 'number' && c.resolution.chosen !== 'DQE' && dqe.value !== c.resolution.value;
            return (
              <tr key={c.key}>
                <td style={{ width: 220 }}>
                  {c.differs ? <b style={{ color: c.resolution ? 'var(--ok)' : 'var(--warn)' }}>{c.resolution ? '✓' : '⚠️'} {c.subject}</b> : <b>{c.subject}</b>}
                  {c.indicative && <div className="small muted">Indicatif</div>}
                  {c.note && <div className="small muted">{c.note}</div>}
                </td>
                <td>
                  {c.values.map((v) => (
                    <div key={v.source} className="row" style={{ marginBottom: 4, flexWrap: 'nowrap' }}>
                      <span className="small" style={{ minWidth: 160 }}>{v.source}</span>
                      <b style={{ minWidth: 70 }}>{v.value === null ? <span className="muted">—</span> : typeof v.value === 'number' ? `${formatNumber(v.value)}${c.unit ? ' ' + c.unit : ''}` : v.value}</b>
                      <span className="small muted ellipsis" style={{ maxWidth: 380 }} title={v.detail}>{v.detail}</span>
                      {c.differs && v.value !== null && c.resolution?.chosen !== v.source && (
                        <button className="btn sm" onClick={() => s.update((p) => resolve(p, c, v))}>Retenir</button>
                      )}
                    </div>
                  ))}
                </td>
                <td style={{ width: 230 }}>
                  {c.resolution ? (
                    <>
                      <div className="small">Retenu : <b>{c.resolution.chosen}</b> ({String(c.resolution.value)})</div>
                      <div className="row" style={{ marginTop: 4 }}>
                        {canApply && (
                          <button className="btn sm primary" onClick={() => s.update((p) => editLine(p, dqe!.lineIds![0], 'quantity', String(c.resolution!.value)))}>Appliquer au DQE</button>
                        )}
                        <button className="btn sm" onClick={() => s.update((p) => unresolve(p, c.key))}>Annuler</button>
                      </div>
                      {c.resolution.chosen !== 'DQE' && dqe && (dqe.lineIds?.length ?? 0) > 1 && <div className="small muted">Plusieurs lignes de DQE concernées : corrigez-les dans le DQE.</div>}
                    </>
                  ) : c.differs ? <span className="small muted">À arbitrer</span> : <span className="small muted">Pas de différence</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

const KIND_ORDER = ['level', 'surface_total', 'room', 'opening', 'equipment'] as const;
const KIND_TITLE: Record<string, string> = { level: 'Niveaux', surface_total: 'Surfaces totales', room: 'Pièces', opening: 'Menuiseries (repères)', equipment: 'Équipements annotés' };

function PlanElementsPanel() {
  const s = useStore();
  const p = s.project!;
  const [kind, setKind] = useState<(typeof KIND_ORDER)[number]>('room');
  const list = p.elements.filter((e) => e.kind === kind);
  const active = activeElements(p);
  const by = (st: string) => active.filter((e) => effectiveStatus(e) === st).length;
  return (
    <Panel
      title={`Éléments détectés dans les plans — 🟢 ${by('confirmed')} · 🟠 ${by('to_verify')} · 🔴 ${by('undetermined')}`}
      actions={
        <div className="row">
          {KIND_ORDER.map((k) => (
            <button key={k} className={`btn sm ${kind === k ? 'primary' : ''}`} onClick={() => setKind(k)}>{KIND_TITLE[k]} ({p.elements.filter((e) => e.kind === k).length})</button>
          ))}
        </div>
      }
      flush
    >
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        <table className="t">
          <thead><tr><th>Nom lu</th><th>Catégorie</th><th>Niveau</th><th>Valeurs</th><th>État</th><th>Source</th><th /></tr></thead>
          <tbody>
            {list.map((e) => {
              const st = effectiveStatus(e);
              return (
                <tr key={e.id} style={{ opacity: st === 'rejected' ? 0.5 : 1 }}>
                  <td><b>{e.name}</b></td>
                  <td>{e.category}</td>
                  <td>{e.level ?? <span className="muted">—</span>}</td>
                  <td className="small">
                    {Object.entries(e.props).map(([k, v]) => (
                      <div key={k}>{k} : {v.value === null ? <span style={{ color: 'var(--bad)' }}>non déterminé</span> : typeof v.value === 'number' ? `${formatNumber(v.value)} ${v.unit ?? ''}` : v.value} <StatusDot status={v.status} /></div>
                    ))}
                  </td>
                  <td>{st === 'rejected' ? <span className="badge grey">Rejeté</span> : <StatusBadge status={st} />}</td>
                  <td className="small muted">{e.source.fileName} p.{e.source.page}</td>
                  <td className="n">
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {st !== 'rejected' && st !== 'confirmed' && <button className="btn sm" onClick={() => s.update((x) => acceptElement(x, e.id))}><Check size={12} />Valider</button>}
                      {st !== 'rejected' && <button className="btn sm" onClick={() => s.update((x) => rejectElement(x, e.id))}>Rejeter</button>}
                      <button className="btn sm" onClick={() => s.go('viewer', e.id)}>Voir</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={7} className="empty">Aucun élément de ce type.</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
