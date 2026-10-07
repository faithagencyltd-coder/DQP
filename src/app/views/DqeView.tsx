import {
  ArrowDown, ArrowUp, Check, Combine, Copy, Link2, ListPlus, Pencil, Plus, Scissors, Trash2, Unlink,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { dependentLines, describeExpression, findLine, groupSections } from '../../core/dqe';
import { formatMoney, formatNumber } from '../../core/format';
import { findMatches } from '../../core/prices';
import {
  addLine, addLot, addSection, applyPrice, deleteLine, deleteLot, deleteSection, duplicateLine, editLine, FIELD_LABEL,
  mergeLots, moveLine, moveLot, moveSection, renameLot, renameSection, splitLot, unlinkQuantity, validateValue,
} from '../../core/project';
import type { DqeLine, LineField, Lot } from '../../core/types';
import { ConfirmDialog, Modal, PromptDialog, StatusBadge, STATUS_LABEL } from '../components/ui';
import { useStore } from '../store';

type Editing = { lineId: string; field: LineField } | null;
type Dialog =
  | { kind: 'add-lot' }
  | { kind: 'rename-lot'; lot: Lot }
  | { kind: 'delete-lot'; lot: Lot }
  | { kind: 'merge'; lot: Lot }
  | { kind: 'split'; lot: Lot }
  | { kind: 'add-section'; lot: Lot }
  | { kind: 'rename-section'; sectionId: string; title: string }
  | { kind: 'delete-section'; sectionId: string; title: string; lines: number }
  | null;

const ORDER_BASE: LineField[] = ['number', 'designation', 'unit', 'quantity', 'unitPrice', 'observation'];
const ORDER_ADV: LineField[] = ['number', 'designation', 'unit', 'quantity', 'coefficient', 'lossPercent', 'unitPrice', 'observation'];

export function DqeView() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [lotId, setLotId] = useState<string | 'all'>(p.lots[0]?.id ?? 'all');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [advanced, setAdvanced] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filter, setFilter] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Arrivée depuis une alerte ou l'analyse : sélectionner et montrer la ligne.
  useEffect(() => {
    if (!s.focusLineId) return;
    const f = findLine(p, s.focusLineId);
    if (f) {
      setLotId(f.lot.id);
      setSelected(f.line.id);
      setTimeout(() => document.getElementById(`line-${f.line.id}`)?.scrollIntoView({ block: 'center' }), 50);
    }
  }, [s.focusLineId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lotId !== 'all' && !p.lots.some((l) => l.id === lotId)) setLotId(p.lots[0]?.id ?? 'all');
  }, [p.lots, lotId]);

  const lots = lotId === 'all' ? p.lots : p.lots.filter((l) => l.id === lotId);
  const current = lotId === 'all' ? null : p.lots.find((l) => l.id === lotId) ?? null;
  const sel = selected ? findLine(p, selected) : undefined;
  const order = advanced ? ORDER_ADV : ORDER_BASE;
  const q = filter.trim().toLowerCase();
  const cols = advanced ? 11 : 9;

  const commit = (lineId: string, field: LineField, raw: string) => {
    s.update((x) => editLine(x, lineId, field, raw));
  };
  const nextCell = (lineId: string, field: LineField, back = false) => {
    const i = order.indexOf(field) + (back ? -1 : 1);
    setEditing(i >= 0 && i < order.length ? { lineId, field: order[i] } : null);
  };

  const cell = (line: DqeLine, field: LineField, display: React.ReactNode, raw: string, cls = '') => {
    const isEditing = editing?.lineId === line.id && editing.field === field;
    const manual = line.edits.some((e) => e.field === field);
    // On n'enregistre que si le texte a réellement changé (évite une fausse « modification manuelle »).
    const done = (v: string) => v !== raw && commit(line.id, field, v);
    return (
      <td className={`${cls} ${manual ? 'manual' : ''}`} onClick={() => { setSelected(line.id); if (!isEditing) setEditing({ lineId: line.id, field }); }}>
        {isEditing ? (
          <input
            autoFocus
            defaultValue={raw}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => { done(e.target.value); setEditing((cur) => (cur?.lineId === line.id && cur.field === field ? null : cur)); }}
            onKeyDown={(e) => {
              const el = e.currentTarget;
              if (e.key === 'Enter') { done(el.value); setEditing(null); }
              else if (e.key === 'Escape') { el.value = raw; setEditing(null); }
              else if (e.key === 'Tab') { e.preventDefault(); done(el.value); nextCell(line.id, field, e.shiftKey); }
            }}
          />
        ) : (
          <div className="cell" title={manual ? `Modifié manuellement (${FIELD_LABEL[field]})` : undefined}>{display}</div>
        )}
      </td>
    );
  };

  const numRaw = (v: number | null) => (v === null ? '' : String(Math.round(v * 1e6) / 1e6).replace('.', ','));

  return (
    <div className={`dqe ${sel ? 'with-detail' : ''}`}>
      {/* ---- Lots ---- */}
      <div className="lots">
        <div className="head">
          <span style={{ flex: 1 }}>Lots</span>
          <button className="btn sm" onClick={() => setDialog({ kind: 'add-lot' })}><Plus size={13} />Lot</button>
        </div>
        <div className={`lot-item ${lotId === 'all' ? 'active' : ''}`} onClick={() => setLotId('all')}>
          <div className="name">Tous les lots</div>
          <div className="amt">{formatMoney(r.totalHT, p.settings.currency)}</div>
        </div>
        {p.lots.map((lot) => {
          const t = r.lots.get(lot.id)!;
          return (
            <div key={lot.id} className={`lot-item ${lotId === lot.id ? 'active' : ''}`} onClick={() => setLotId(lot.id)}>
              <div className="code">{lot.code}</div>
              <div className="name">{lot.name}</div>
              <div className="amt">
                {formatMoney(t.amount, p.settings.currency)} · {t.lines} lignes
                {t.incomplete > 0 && <span style={{ color: 'var(--bad)' }}> · {t.incomplete} non chiffrée(s)</span>}
              </div>
            </div>
          );
        })}
        {p.lots.length === 0 && <div className="empty small">Aucun lot. Importez un DQE ou créez un lot.</div>}
      </div>

      {/* ---- Feuille DQE ---- */}
      <div className="sheet" ref={sheetRef}>
        <div className="sheet-bar">
          {current ? (
            <>
              <b>{current.code} — {current.name}</b>
              <button className="icon-btn" title="Renommer le lot" onClick={() => setDialog({ kind: 'rename-lot', lot: current })}><Pencil size={14} /></button>
              <button className="icon-btn" title="Monter le lot" onClick={() => s.update((x) => moveLot(x, current.id, -1))}><ArrowUp size={14} /></button>
              <button className="icon-btn" title="Descendre le lot" onClick={() => s.update((x) => moveLot(x, current.id, 1))}><ArrowDown size={14} /></button>
              <button className="btn sm" onClick={() => setDialog({ kind: 'add-section', lot: current })}><ListPlus size={13} />Section</button>
              <button className="btn sm" disabled={p.lots.length < 2} onClick={() => setDialog({ kind: 'merge', lot: current })}><Combine size={13} />Fusionner</button>
              <button className="btn sm" disabled={current.sections.length < 2} onClick={() => setDialog({ kind: 'split', lot: current })}><Scissors size={13} />Subdiviser</button>
              <button className="btn sm danger" onClick={() => setDialog({ kind: 'delete-lot', lot: current })}><Trash2 size={13} />Supprimer</button>
            </>
          ) : (
            <b>Tous les lots</b>
          )}
          <span className="spacer" />
          <input className="in" placeholder="Filtrer les lignes…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} />
          <label className="row small" style={{ gap: 4 }}>
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />Coefficients et pertes
          </label>
        </div>

        <table className="grid">
          <colgroup>
            <col style={{ width: 46 }} />
            <col />
            <col style={{ width: 54 }} />
            <col style={{ width: 96 }} />
            {advanced && <col style={{ width: 62 }} />}
            {advanced && <col style={{ width: 62 }} />}
            <col style={{ width: 96 }} />
            <col style={{ width: 118 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 92 }} />
          </colgroup>
          <thead>
            <tr>
              <th>N°</th><th>Désignation</th><th>Unité</th><th>Quantité</th>
              {advanced && <th title="Coefficient multiplicateur">Coef.</th>}
              {advanced && <th title="Perte / chute en %">Perte %</th>}
              <th>P.U. ({p.settings.currency})</th><th>Montant</th><th>Observation</th><th />
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => {
              const lt = r.lots.get(lot.id)!;
              return (
                <Fragment key={lot.id}>
                  {lotId === 'all' && <tr className="lot-row"><td colSpan={cols}>{lot.code} — {lot.name.toUpperCase()}</td></tr>}
                  {groupSections(lot).map((g, gi) => (
                    <Fragment key={gi}>
                      {g.path.length > 0 && <tr className="path-row"><td colSpan={cols}>{g.path.join(' › ')}</td></tr>}
                      {g.sections.map((section) => {
                        const lines = q ? section.lines.filter((l) => l.designation.toLowerCase().includes(q)) : section.lines;
                        if (q && lines.length === 0) return null;
                        const st = r.sections.get(section.id)!;
                        return (
                          <Fragment key={section.id}>
                            <tr className="sec-row">
                              <td colSpan={cols - 1}>{section.title}</td>
                              <td>
                                <div className="row-actions" style={{ opacity: 1 }}>
                                  <button className="icon-btn" title="Ajouter une ligne" onClick={() => { const res = addLine(p, section.id); s.update(() => res.project); setSelected(res.lineId); setEditing({ lineId: res.lineId, field: 'designation' }); }}><Plus size={14} /></button>
                                  <button className="icon-btn" title="Renommer la section" onClick={() => setDialog({ kind: 'rename-section', sectionId: section.id, title: section.title })}><Pencil size={13} /></button>
                                  <button className="icon-btn" title="Monter" onClick={() => s.update((x) => moveSection(x, section.id, -1))}><ArrowUp size={13} /></button>
                                  <button className="icon-btn" title="Supprimer la section" onClick={() => setDialog({ kind: 'delete-section', sectionId: section.id, title: section.title, lines: section.lines.length })}><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                            {lines.map((line) => {
                              const lr = r.lines.get(line.id)!;
                              const qCls = lr.quantityStatus === 'confirmed' ? '' : lr.quantityStatus === 'to_verify' ? 'warn' : 'bad';
                              const pCls = line.unitPrice.status === 'confirmed' ? '' : line.unitPrice.status === 'to_verify' ? 'warn' : 'bad';
                              return (
                                <tr key={line.id} id={`line-${line.id}`} className={`line ${selected === line.id ? 'sel' : ''}`}>
                                  {cell(line, 'number', line.number, line.number, 'c')}
                                  {cell(line, 'designation', line.designation || <span className="muted">(désignation)</span>, line.designation)}
                                  {cell(line, 'unit', line.unit, line.unit, 'c')}
                                  {cell(
                                    line,
                                    'quantity',
                                    <>
                                      {line.quantity.expression && <Link2 size={12} color="var(--brand-2)" aria-label="Quantité liée" />}
                                      {formatNumber(lr.quantity)}
                                    </>,
                                    numRaw(lr.quantity),
                                    `n ${qCls}`,
                                  )}
                                  {advanced && cell(line, 'coefficient', formatNumber(line.coefficient, 3), numRaw(line.coefficient), 'n')}
                                  {advanced && cell(line, 'lossPercent', formatNumber(line.lossPercent), numRaw(line.lossPercent), 'n')}
                                  {cell(line, 'unitPrice', formatNumber(line.unitPrice.value, 2), numRaw(line.unitPrice.value), `n ${pCls}`)}
                                  <td className="n amount" onClick={() => setSelected(line.id)}><div className="cell">{lr.amount === null ? <span className="muted">—</span> : formatNumber(lr.amount, 0)}</div></td>
                                  {cell(line, 'observation', <span className="small ellipsis">{line.observation}</span>, line.observation)}
                                  <td>
                                    <div className="row-actions">
                                      <button className="icon-btn" title="Monter" onClick={() => s.update((x) => moveLine(x, line.id, -1))}><ArrowUp size={13} /></button>
                                      <button className="icon-btn" title="Descendre" onClick={() => s.update((x) => moveLine(x, line.id, 1))}><ArrowDown size={13} /></button>
                                      <button className="icon-btn" title="Dupliquer" onClick={() => s.update((x) => duplicateLine(x, line.id))}><Copy size={13} /></button>
                                      <button className="icon-btn" title="Supprimer la ligne" onClick={() => { s.update((x) => deleteLine(x, line.id)); if (selected === line.id) setSelected(null); s.toast('info', 'Ligne supprimée.', { label: 'Annuler', run: s.undo }); }}><Trash2 size={13} /></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="sub-row">
                              <td colSpan={cols - 3}>Sous-total {section.title}{st.incomplete > 0 && <span className="muted small"> — {st.incomplete} ligne(s) non chiffrée(s)</span>}</td>
                              <td className="n">{formatNumber(st.amount, 0)}</td>
                              <td colSpan={2} />
                            </tr>
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                  {lot.sections.length === 0 && (
                    <tr><td colSpan={cols} className="muted" style={{ padding: 10 }}>Lot vide — ajoutez une section.</td></tr>
                  )}
                  <tr className="tot-row">
                    <td colSpan={cols - 3}>TOTAL {lot.code} — {lot.name.toUpperCase()}</td>
                    <td className="n">{formatNumber(lt.amount, 0)}</td>
                    <td colSpan={2} />
                  </tr>
                </Fragment>
              );
            })}
            {lotId === 'all' && p.lots.length > 0 && (
              <tr className="tot-row">
                <td colSpan={cols - 3}>TOTAL GÉNÉRAL HORS TAXES</td>
                <td className="n">{formatNumber(r.totalHT, 0)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
        {p.lots.length === 0 && (
          <div className="empty">
            <h2>DQE vide</h2>
            <p>Importez un DQE existant ou créez votre premier lot.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => s.go('import')}>Importer un fichier</button>
              <button className="btn" onClick={() => setDialog({ kind: 'add-lot' })}><Plus size={14} />Créer un lot</button>
            </div>
          </div>
        )}
      </div>

      {sel && <LineDetail lineId={sel.line.id} onClose={() => setSelected(null)} />}

      {/* ---- Dialogues ---- */}
      {dialog?.kind === 'add-lot' && (
        <PromptDialog title="Nouveau lot" label="Nom du lot" initial="" confirm="Créer" onCancel={() => setDialog(null)}
          onSubmit={(name) => { const next = addLot(p, name); s.update(() => next); setDialog(null); setLotId(next.lots[next.lots.length - 1].id); }} />
      )}
      {dialog?.kind === 'rename-lot' && (
        <PromptDialog title="Renommer le lot" label="Nom du lot" initial={dialog.lot.name} onCancel={() => setDialog(null)}
          onSubmit={(name) => { s.update((x) => renameLot(x, dialog.lot.id, name)); setDialog(null); }} />
      )}
      {dialog?.kind === 'add-section' && (
        <PromptDialog title={`Nouvelle section dans ${dialog.lot.name}`} label="Titre (ex. « A - Tuyauterie »)" confirm="Ajouter" onCancel={() => setDialog(null)}
          onSubmit={(title) => { s.update((x) => addSection(x, dialog.lot.id, title)); setDialog(null); }} />
      )}
      {dialog?.kind === 'rename-section' && (
        <PromptDialog title="Renommer la section" label="Titre" initial={dialog.title} onCancel={() => setDialog(null)}
          onSubmit={(title) => { s.update((x) => renameSection(x, dialog.sectionId, title)); setDialog(null); }} />
      )}
      {dialog?.kind === 'delete-lot' && (
        <ConfirmDialog title="Supprimer le lot ?" confirm="Supprimer" danger onCancel={() => setDialog(null)}
          onConfirm={() => { s.update((x) => deleteLot(x, dialog.lot.id)); setDialog(null); setLotId('all'); s.toast('info', `Lot « ${dialog.lot.name} » supprimé.`, { label: 'Annuler', run: s.undo }); }}>
          Le lot « {dialog.lot.name} » et ses {r.lots.get(dialog.lot.id)?.lines ?? 0} lignes seront supprimés. Vous pourrez annuler (Ctrl+Z).
        </ConfirmDialog>
      )}
      {dialog?.kind === 'delete-section' && (
        <ConfirmDialog title="Supprimer la section ?" confirm="Supprimer" danger onCancel={() => setDialog(null)}
          onConfirm={() => { s.update((x) => deleteSection(x, dialog.sectionId)); setDialog(null); }}>
          La section « {dialog.title} » et ses {dialog.lines} ligne(s) seront supprimées. Vous pourrez annuler (Ctrl+Z).
        </ConfirmDialog>
      )}
      {dialog?.kind === 'merge' && <MergeDialog lot={dialog.lot} onClose={() => setDialog(null)} onMerged={(target) => setLotId(target)} />}
      {dialog?.kind === 'split' && <SplitDialog lot={dialog.lot} onClose={() => setDialog(null)} />}
    </div>
  );
}

function MergeDialog({ lot, onClose, onMerged }: { lot: Lot; onClose: () => void; onMerged: (id: string) => void }) {
  const s = useStore();
  const others = s.project!.lots.filter((l) => l.id !== lot.id);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  return (
    <Modal title={`Fusionner « ${lot.name} »`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={!target} onClick={() => { s.update((x) => mergeLots(x, lot.id, target)); onMerged(target); onClose(); }}>Fusionner</button></>}>
      <label className="f">
        <span>Fusionner dans le lot</span>
        <select className="in" value={target} onChange={(e) => setTarget(e.target.value)}>
          {others.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
        </select>
      </label>
      <p className="small muted">Les sections de « {lot.name} » sont ajoutées à la fin du lot choisi, regroupées sous son nom. Le lot « {lot.name} » disparaît.</p>
    </Modal>
  );
}

function SplitDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const s = useStore();
  const [chosen, setChosen] = useState<string[]>([]);
  const [name, setName] = useState(`${lot.name} (2)`);
  return (
    <Modal title={`Subdiviser « ${lot.name} »`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={!chosen.length || chosen.length === lot.sections.length || !name.trim()} onClick={() => { s.update((x) => splitLot(x, lot.id, chosen, name.trim())); onClose(); }}>Créer le nouveau lot</button></>}>
      <label className="f"><span>Nom du nouveau lot</span><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <p className="small"><b>Sections à déplacer dans le nouveau lot :</b></p>
      {lot.sections.map((sec) => (
        <label key={sec.id} className="row small" style={{ marginBottom: 4 }}>
          <input type="checkbox" checked={chosen.includes(sec.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, sec.id] : c.filter((x) => x !== sec.id)))} />
          {[...sec.path, sec.title].join(' › ')} <span className="muted">({sec.lines.length} lignes)</span>
        </label>
      ))}
    </Modal>
  );
}

function LineDetail({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const s = useStore();
  const p = s.project!;
  const f = findLine(p, lineId);
  const r = s.result!.lines.get(lineId);
  const matches = useMemo(() => (f ? findMatches(f.line, s.prices) : []), [f, s.prices]);
  if (!f || !r) return null;
  const { line, lot, section } = f;
  const deps = dependentLines(p, lineId);
  const byId = new Map(p.lots.flatMap((l) => l.sections.flatMap((x) => x.lines)).map((l) => [l.id, l]));
  const src = (n: typeof line.quantity) =>
    n.source ? `${n.source.fileName}${n.source.sheet ? ' › ' + n.source.sheet : ''}${n.source.cell ? ' › cellule ' + n.source.cell : ''}` : n.origin === 'manual' ? 'Saisie manuelle' : n.origin === 'library' ? 'Bibliothèque de prix' : '—';

  return (
    <aside className="detail">
      <section>
        <div className="row"><h4 style={{ flex: 1, margin: 0 }}>Ligne sélectionnée</h4><button className="btn sm" onClick={onClose}>Fermer</button></div>
        <p style={{ margin: '6px 0 2px', fontWeight: 600 }}>{line.designation || '(sans désignation)'}</p>
        <div className="small muted">{lot.code} {lot.name} › {[...section.path, section.title].join(' › ')}</div>
      </section>
      <section>
        <h4>D’où vient cette quantité ?</h4>
        <dl className="kv">
          <dt>Quantité</dt><dd><b>{formatNumber(r.quantity)} {line.unit}</b> <StatusBadge status={r.quantityStatus} /></dd>
          <dt>Source</dt><dd>{src(line.quantity)}</dd>
          {line.quantity.source?.formula && <><dt>Formule source</dt><dd className="mono">{line.quantity.source.formula}</dd></>}
          {line.quantity.expression && <><dt>Liée à</dt><dd>{describeExpression(line.quantity.expression, byId)}</dd></>}
          {line.quantity.note && <><dt>Remarque</dt><dd>{line.quantity.note}</dd></>}
        </dl>
        <div className="row" style={{ marginTop: 6 }}>
          {line.quantity.expression && (
            <button className="btn sm" onClick={() => s.update((x) => unlinkQuantity(x, lineId, r.quantity))}><Unlink size={12} />Détacher la formule</button>
          )}
          {line.quantity.status === 'to_verify' && line.quantity.value !== null && !line.quantity.expression && (
            <button className="btn sm" onClick={() => s.update((x) => validateValue(x, lineId, 'quantity'))}><Check size={12} />Valider la quantité</button>
          )}
        </div>
      </section>
      <section>
        <h4>Prix unitaire</h4>
        <dl className="kv">
          <dt>P.U.</dt><dd><b>{formatMoney(line.unitPrice.value, p.settings.currency)}</b> <StatusBadge status={line.unitPrice.status} /></dd>
          <dt>Source</dt><dd>{src(line.unitPrice)}</dd>
          {line.unitPrice.note && <><dt>Remarque</dt><dd>{line.unitPrice.note}</dd></>}
        </dl>
        {line.unitPrice.status === 'to_verify' && line.unitPrice.value !== null && (
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => s.update((x) => validateValue(x, lineId, 'unitPrice'))}><Check size={12} />Valider le prix</button>
        )}
        {matches.length > 0 && (
          <>
            <p className="small" style={{ margin: '8px 0 4px' }}><b>Bibliothèque de prix — correspondances proposées</b></p>
            {matches.map((m) => (
              <div key={m.item.id} className="row small" style={{ marginBottom: 4, flexWrap: 'nowrap' }}>
                <span className="ellipsis" style={{ flex: 1 }} title={m.item.designation}>{m.item.code} {m.item.designation}</span>
                <span className="mono">{formatNumber(m.item.price, 0)}/{m.item.unit}</span>
                {!m.sameUnit && <span className="badge warn">unité ≠</span>}
                <button className="btn sm" onClick={() => s.update((x) => applyPrice(x, lineId, m.item))}>Appliquer</button>
              </div>
            ))}
          </>
        )}
      </section>
      <section>
        <h4>Calcul</h4>
        <ol className="steps small">{r.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
        {r.error && <p className="small" style={{ color: 'var(--bad)' }}>{r.error}</p>}
      </section>
      {deps.length > 0 && (
        <section>
          <h4>Quantités qui dépendent de cette ligne</h4>
          {deps.map((d) => <div key={d.id} className="small">• {d.designation}</div>)}
          <p className="small muted">Elles sont recalculées automatiquement quand cette quantité change.</p>
        </section>
      )}
      <section>
        <h4>Modifications manuelles ({line.edits.length})</h4>
        {line.edits.length === 0 && <div className="small muted">Aucune — valeurs d’origine.</div>}
        {[...line.edits].reverse().map((e, i) => (
          <div key={i} className="small" style={{ marginBottom: 3 }}>
            <span className="muted">{new Date(e.at).toLocaleString('fr-FR')}</span> — {FIELD_LABEL[e.field]} : <s>{String(e.before ?? '—')}</s> → <b>{String(e.after ?? '—')}</b>
          </div>
        ))}
      </section>
      <section className="small muted">
        Légende : fond jaune = {STATUS_LABEL.to_verify.toLowerCase()}, fond rouge = {STATUS_LABEL.undetermined.toLowerCase()}, texte bleu = modifié manuellement, <Link2 size={11} /> = quantité calculée à partir d’une autre ligne.
      </section>
    </aside>
  );
}
