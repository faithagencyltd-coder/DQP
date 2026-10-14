import { Calculator, ChevronDown, ChevronRight, Copy, Download, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { insertRow, updateRow, useAction, useRow, useRows } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { WORK_STATUS, fmtDateTime } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { MetreDoc, Project, ProjectLot, Quote } from '../../lib/types';
import { DEFAULT_RULES, DIM_LABEL, FORMULAS, computeMetre, groupMetre, type MetreFormula, type MetreLine, type MetreRules } from '../../engine/metre';
import { formatNumber, parseNumber } from '../../engine/money';
import { uid } from '../../engine/ids';
import { UNITS } from '../../engine/units';
import { newLine, newLot, type DocBody } from '../../engine/dqe';
import { Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';

export function MetresPage() {
  const { org } = useOrg();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [projectFilter, setProjectFilter] = useState(params.get('projet') ?? '');
  const [creating, setCreating] = useState(false);
  const rows = useRows<MetreDoc>('metres', org?.id, { select: 'id, reference, title, project_id, status, updated_at, created_at, archived_at, lines', order: ['updated_at', false] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const list = (rows.data ?? []).filter((m) => !m.archived_at && (!projectFilter || m.project_id === projectFilter));
  return (
    <>
      <PageHeader title="Métrés et quantitatifs" subtitle="Longueurs, surfaces, volumes, unités, forfaits : chaque quantité garde ses dimensions et son calcul."
        actions={<Allowed module="metres" action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouveau métré</Button></Allowed>} />
      <Card bodyClass="p-0">
        <div className="border-b border-line-2 p-3">
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="sm:w-80"><option value="">Tous les projets</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select>
        </div>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={list} onRowClick={(m) => nav(`/app/metres/${m.id}`)}
            empty={<EmptyState icon={<Calculator size={22} />} title="Aucun métré">Créez un métré, saisissez les dimensions : PLANORA calcule et garde le détail de chaque quantité.</EmptyState>}
            columns={[
              { key: 'ref', label: 'Référence', sort: (m) => m.reference, render: (m) => <span className="tabular text-muted">{m.reference}</span> },
              { key: 'title', label: 'Titre', sort: (m) => m.title, render: (m) => <b className="text-navy-900">{m.title}</b> },
              { key: 'project', label: 'Projet', render: (m) => pname.get(m.project_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'lines', label: 'Lignes', align: 'right', render: (m) => m.lines?.length ?? 0, hideOnMobile: true },
              { key: 'status', label: 'Statut', render: (m) => <Badge tone={WORK_STATUS[m.status]?.tone}>{WORK_STATUS[m.status]?.label}</Badge> },
              { key: 'upd', label: 'Modifié', sort: (m) => m.updated_at, render: (m) => fmtDateTime(m.updated_at), hideOnMobile: true },
            ]} />
        )}
      </Card>
      {creating && <NewMetre projectId={projectFilter} onClose={() => setCreating(false)} />}
    </>
  );
}

function NewMetre({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { org } = useOrg();
  const nav = useNavigate();
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const [title, setTitle] = useState('');
  const [pid, setPid] = useState(projectId);
  const create = useAction(() => insertRow<MetreDoc>('metres', { org_id: org!.id, title: title.trim(), project_id: pid || null, rules: org!.metre_rules ?? DEFAULT_RULES, lines: [] }), { success: (m) => `Métré ${m.reference} créé.`, invalidate: [['metres']] });
  return (
    <Modal title="Nouveau métré" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!title.trim()} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (m) => nav(`/app/metres/${m.id}`) })}>Créer</Button></>}>
      <div className="grid gap-4">
        <Field label="Titre" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Métré gros œuvre — villa R+1" /></Field>
        <Field label="Projet"><Select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">— Aucun —</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}

const emptyLine = (lot = ''): MetreLine => ({ id: uid('m'), ref: '', designation: '', location: '', lot, formula: 'surface', L: null, l: null, H: null, N: 1, openings: [], unit: 'm²', source: 'Saisie manuelle', notes: '' });

function NumCell({ value, onChange, disabled, label, boxed }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; label: string; boxed?: boolean }) {
  const [txt, setTxt] = useState(value === null ? '' : String(value).replace('.', ','));
  useEffect(() => setTxt(value === null ? '' : String(value).replace('.', ',')), [value]);
  const bad = txt.trim() !== '' && parseNumber(txt) === null;
  return <input aria-label={label} disabled={disabled} inputMode="decimal" className={`${boxed ? 'input w-28' : 'cell-input w-[72px]'} text-right ${bad ? '!border-bad-600' : ''}`} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => { const v = parseNumber(txt); if (!bad) onChange(v); }} />;
}

export function MetreEditor() {
  const { id } = useParams();
  const { org, can } = useOrg();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const doc = useRow<MetreDoc>('metres', id);
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name' });
  const [lines, setLines] = useState<MetreLine[] | null>(null);
  const [rules, setRules] = useState<MetreRules>(DEFAULT_RULES);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [openingFor, setOpeningFor] = useState<MetreLine | null>(null);
  const [gen, setGen] = useState(false);
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', doc.data?.project_id), order: ['sort'], key: [doc.data?.project_id], enabled: !!doc.data?.project_id });

  useEffect(() => {
    if (doc.data && lines === null) {
      setLines(doc.data.lines ?? []);
      setRules({ ...DEFAULT_RULES, ...doc.data.rules });
      setSavedAt(doc.data.updated_at);
    }
  }, [doc.data, lines]);

  const locked = doc.data?.status === 'approuve';
  const editable = !locked && can('metres', 'modifier');

  // Sauvegarde automatique (1,5 s après la dernière modification).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = async (ls: MetreLine[], rl: MetreRules) => {
    setSaving(true);
    try {
      const r = await updateRow<MetreDoc>('metres', id!, { lines: ls, rules: rl });
      setSavedAt(r.updated_at);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['metres'] });
    } catch (e) {
      toast('bad', `Sauvegarde impossible : ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };
  const update = (ls: MetreLine[], rl = rules) => {
    setLines(ls);
    setRules(rl);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(ls, rl), 1500);
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setStatus = useAction(async (status: MetreDoc['status']) => {
    if (dirty && lines) await save(lines, rules);
    return updateRow<MetreDoc>('metres', id!, { status });
  }, { success: 'Statut mis à jour.', invalidate: [['metres']] });

  if (doc.isLoading || lines === null) return <Spinner />;
  if (!doc.data) return <Notice tone="bad">Métré introuvable ou accès non autorisé.</Notice>;
  const m = doc.data;
  const setLine = (lid: string, patch: Partial<MetreLine>) => update(lines.map((l) => {
    if (l.id !== lid) return l;
    const next = { ...l, ...patch };
    if (patch.formula && patch.formula !== l.formula && FORMULAS[patch.formula].unit) next.unit = FORMULAS[patch.formula].unit;
    return next;
  }));
  const results = new Map(lines.map((l) => [l.id, computeMetre(l, rules)]));
  const incomplete = lines.filter((l) => results.get(l.id)!.qty === null).length;
  const project = (projects.data ?? []).find((p) => p.id === m.project_id);

  const exportExcel = async () => {
    const { exportMetreXlsx } = await import('../../docs/xlsx');
    await exportMetreXlsx(org!, m, lines, rules, project);
  };
  const exportPdf = async () => {
    const { metrePdf } = await import('../../docs/pdf');
    await metrePdf(org!, { ...m, lines, rules }, project);
  };

  return (
    <>
      <PageHeader
        back={<Link className="link" to="/app/metres">← Métrés</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{m.title} <Badge tone={WORK_STATUS[m.status]?.tone}>{WORK_STATUS[m.status]?.label}</Badge></span>}
        subtitle={<>{m.reference}{project ? <> · <Link className="link" to={`/app/projets/${project.id}`}>{project.reference} {project.name}</Link></> : ''} · <span className={dirty ? 'text-warn-600' : 'text-ok-600'}>{saving ? 'Enregistrement…' : dirty ? 'Modifications en cours…' : `Enregistré ${fmtDateTime(savedAt)}`}</span></>}
        actions={<>
          <Allowed module="metres" action="exporter"><Button icon={<Download size={16} />} onClick={() => void exportPdf().catch((e) => toast('bad', errorMessage(e)))}>PDF</Button></Allowed>
          <Allowed module="metres" action="exporter"><Button icon={<Download size={16} />} onClick={() => void exportExcel().catch((e) => toast('bad', errorMessage(e)))}>Excel</Button></Allowed>
          <Allowed module="dqe" action="creer"><Button variant="primary" icon={<FileSpreadsheet size={16} />} disabled={!lines.length} onClick={() => setGen(true)}>Générer un DQE</Button></Allowed>
        </>}
      />
      {locked && <Notice tone="ok" className="mb-4" title="Métré approuvé">Les quantités sont figées. Pour les modifier, un utilisateur autorisé doit le repasser en « document de travail ».</Notice>}
      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <Card bodyClass="flex flex-wrap items-end gap-4 py-3">
          <Field label="Arrondi des quantités" className="w-44">
            <Select value={rules.decimals} disabled={!editable} onChange={(e) => update(lines, { ...rules, decimals: Number(e.target.value) })}>{[0, 1, 2, 3].map((d) => <option key={d} value={d}>{d} décimale(s)</option>)}</Select>
          </Field>
          <Field label="Seuil de déduction des ouvertures (m²)" hint="Ouvertures plus petites : non déduites" className="w-64">
            <NumCell boxed label="Seuil" value={rules.openingThreshold} disabled={!editable} onChange={(v) => update(lines, { ...rules, openingThreshold: v ?? 0 })} />
          </Field>
          <div className="text-[13px] text-muted">{lines.length} ligne(s){incomplete ? <> · <span className="font-semibold text-warn-600">{incomplete} incomplète(s)</span></> : ''}</div>
        </Card>
        <Card bodyClass="flex items-center gap-2 py-3">
          <span className="text-[13px] text-muted">Statut :</span>
          <Allowed module="metres" action="valider">
            <Select value={m.status} className="!w-56" onChange={(e) => setStatus.mutate(e.target.value as MetreDoc['status'])}>{Object.entries(WORK_STATUS).filter(([k]) => k !== 'archive').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          </Allowed>
        </Card>
      </div>
      <Card bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-navy-50/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <th className="w-6" /><th className="px-1 py-2">Réf.</th><th className="px-1">Désignation</th><th className="px-1">Localisation</th><th className="px-1">Lot</th><th className="px-1">Formule</th>
                <th className="px-1 text-right">Long.</th><th className="px-1 text-right">Larg.</th><th className="px-1 text-right">Haut.</th><th className="px-1 text-right">Nombre</th>
                <th className="px-1 text-right">Pertes %</th><th className="px-2 text-right">Quantité</th><th className="px-1">Unité</th><th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const r = results.get(l.id)!;
                const need = new Set(FORMULAS[l.formula].dims);
                const free = l.formula === 'libre';
                return (
                  <Fragment key={l.id}>
                    <tr className="border-b border-line-2 align-middle">
                      <td className="pl-2"><button aria-label="Détail du calcul" className="text-faint hover:text-ink" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                      <td className="px-1"><input aria-label="Référence" disabled={!editable} className="cell-input w-16" value={l.ref} onChange={(e) => setLine(l.id, { ref: e.target.value })} /></td>
                      <td className="px-1"><input aria-label="Désignation" disabled={!editable} className="cell-input min-w-[200px]" value={l.designation} placeholder="Ex. Dalle pleine" onChange={(e) => setLine(l.id, { designation: e.target.value })} /></td>
                      <td className="px-1"><input aria-label="Localisation" disabled={!editable} className="cell-input w-28" value={l.location} placeholder="Ex. Séjour" onChange={(e) => setLine(l.id, { location: e.target.value })} /></td>
                      <td className="px-1">
                        <input aria-label="Lot" disabled={!editable} list={`lots-${m.id}`} className="cell-input w-32" value={l.lot} onChange={(e) => setLine(l.id, { lot: e.target.value })} />
                      </td>
                      <td className="px-1">
                        <select aria-label="Formule" disabled={!editable} className="cell-input w-40" value={l.formula} onChange={(e) => setLine(l.id, { formula: e.target.value as MetreFormula })}>
                          {Object.entries(FORMULAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </td>
                      {(['L', 'l', 'H', 'N'] as const).map((d) => (
                        <td key={d} className="px-1 text-right">
                          {need.has(d) || free ? <NumCell label={DIM_LABEL[d]} value={l[d]} disabled={!editable} onChange={(v) => setLine(l.id, { [d]: v })} /> : <span className="text-faint">·</span>}
                        </td>
                      ))}
                      <td className="px-1 text-right"><NumCell label="Pertes" value={l.lossPct ?? null} disabled={!editable} onChange={(v) => setLine(l.id, { lossPct: v })} /></td>
                      <td className="tabular px-2 text-right font-bold text-navy-900">
                        {l.formula === 'forfait' ? <NumCell label="Quantité forfaitaire" value={l.qty ?? null} disabled={!editable} onChange={(v) => setLine(l.id, { qty: v })} />
                          : r.qty === null ? <span className="text-[12px] font-semibold text-warn-600" title={r.steps.join('\n')}>à compléter</span> : formatNumber(r.qty, rules.decimals, false)}
                      </td>
                      <td className="px-1">
                        <select aria-label="Unité" disabled={!editable} className="cell-input w-20" value={l.unit} onChange={(e) => setLine(l.id, { unit: e.target.value })}>{UNITS.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}</select>
                      </td>
                      <td className="whitespace-nowrap px-1 text-right">
                        {editable && <button aria-label="Dupliquer" title="Dupliquer" className="rounded p-1 text-faint hover:text-ink" onClick={() => update([...lines.slice(0, lines.indexOf(l) + 1), { ...l, id: uid('m') }, ...lines.slice(lines.indexOf(l) + 1)])}><Copy size={14} /></button>}
                        {editable && <button aria-label="Supprimer" title="Supprimer" className="rounded p-1 text-faint hover:text-bad-600" onClick={() => update(lines.filter((x) => x.id !== l.id))}><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                    {open === l.id && (
                      <tr className="border-b border-line-2 bg-navy-50/40">
                        <td />
                        <td colSpan={13} className="px-2 py-3">
                          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                            <div>
                              <div className="mb-1 text-[11.5px] font-semibold uppercase text-muted">Détail du calcul</div>
                              <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-ink-2">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                              {l.formula === 'libre' && <Field label="Formule libre (variables L, l, H, N)" className="mt-3"><Input disabled={!editable} value={l.expression ?? ''} placeholder="Ex. (L + 0,5) × l × N" onChange={(e) => setLine(l.id, { expression: e.target.value })} /></Field>}
                              {l.formula === 'mur' && (
                                <div className="mt-3">
                                  <div className="text-[13px] font-semibold text-navy-900">Ouvertures déduites ({l.openings.length})</div>
                                  {l.openings.map((o, i) => <div key={i} className="text-[13px] text-ink-2">{o.count ?? '?'} × {o.label} {o.width ?? '?'} × {o.height ?? '?'} m</div>)}
                                  {editable && <Button size="sm" className="mt-2" onClick={() => setOpeningFor(l)}>Modifier les ouvertures</Button>}
                                </div>
                              )}
                            </div>
                            <div className="grid gap-3">
                              <Field label="Source de la mesure"><Input disabled={!editable} value={l.source} onChange={(e) => setLine(l.id, { source: e.target.value })} placeholder="Ex. Plan RDC indice B, cote relevée" /></Field>
                              <Field label="Observations"><Input disabled={!editable} value={l.notes} onChange={(e) => setLine(l.id, { notes: e.target.value })} /></Field>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <datalist id={`lots-${m.id}`}>{(lots.data ?? []).map((x) => <option key={x.id} value={x.name} />)}</datalist>
        {!lines.length && <EmptyState icon={<Calculator size={22} />} title="Aucune ligne">Ajoutez une ligne, choisissez une formule et saisissez les dimensions en mètres.</EmptyState>}
        {editable && (
          <div className="flex flex-wrap gap-2 border-t border-line-2 p-3">
            <Button icon={<Plus size={16} />} onClick={() => update([...lines, emptyLine(lines[lines.length - 1]?.lot ?? '')])}>Ajouter une ligne</Button>
            {dirty && <Button variant="ghost" onClick={() => void save(lines, rules)}>Enregistrer maintenant</Button>}
          </div>
        )}
      </Card>
      <GroupsCard lines={lines} rules={rules} />
      {openingFor && <OpeningsEditor line={openingFor} onClose={() => setOpeningFor(null)} onSave={(openings) => setLine(openingFor.id, { openings })} />}
      {gen && <GenerateDqe metre={{ ...m, lines, rules }} onClose={() => setGen(false)} onCreated={(q) => nav(`/app/documents-chiffres/${q.id}`)} />}
    </>
  );
}

function GroupsCard({ lines, rules }: { lines: MetreLine[]; rules: MetreRules }) {
  const groups = groupMetre(lines.filter((l) => l.designation.trim()), rules);
  if (!groups.length) return null;
  return (
    <Card title="Récapitulatif par lot et par ouvrage" subtitle="Regroupement des lignes de même lot, désignation et unité — base du DQE" className="mt-4" bodyClass="p-0">
      <table className="w-full text-[13.5px]">
        <thead><tr className="border-b border-line bg-navy-50/60 text-left text-[11.5px] uppercase text-muted"><th className="px-4 py-2">Lot</th><th className="px-2">Ouvrage</th><th className="px-2 text-right">Lignes</th><th className="px-4 text-right">Quantité</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} className="border-b border-line-2 last:border-0">
              <td className="px-4 py-2 text-muted">{g.lot || 'Sans lot'}</td>
              <td className="px-2">{g.designation}</td>
              <td className="px-2 text-right">{g.lineIds.length}</td>
              <td className="tabular px-4 text-right font-semibold">{g.qty === null ? <span className="text-warn-600">incomplet ({g.incomplete} ligne(s))</span> : `${formatNumber(g.qty, rules.decimals, false)} ${g.unit}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function OpeningsEditor({ line, onClose, onSave }: { line: MetreLine; onClose: () => void; onSave: (o: MetreLine['openings']) => void }) {
  const [list, setList] = useState(line.openings.length ? line.openings : [{ label: 'Porte', width: 0.9, height: 2.1, count: 1 }]);
  const set = (i: number, patch: Partial<MetreLine['openings'][number]>) => setList(list.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <Modal title={`Ouvertures — ${line.designation || 'mur'}`} onClose={onClose} wide footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" onClick={() => { onSave(list); onClose(); }}>Appliquer</Button></>}>
      <p className="mb-3 text-[13px] text-muted">Dimensions en mètres. Une ouverture sans dimension rend la surface « à compléter » : rien n’est supposé.</p>
      <table className="w-full text-[13px]">
        <thead className="text-left text-[12px] text-muted"><tr><th>Ouverture</th><th className="text-right">Nombre</th><th className="text-right">Largeur</th><th className="text-right">Hauteur</th><th /></tr></thead>
        <tbody>
          {list.map((o, i) => (
            <tr key={i}>
              <td className="py-1 pr-2"><input className="cell-input" value={o.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Nom" /></td>
              <td className="text-right"><NumCell label="Nombre" value={o.count} onChange={(v) => set(i, { count: v })} /></td>
              <td className="text-right"><NumCell label="Largeur" value={o.width} onChange={(v) => set(i, { width: v })} /></td>
              <td className="text-right"><NumCell label="Hauteur" value={o.height} onChange={(v) => set(i, { height: v })} /></td>
              <td><button className="p-1 text-faint hover:text-bad-600" aria-label="Retirer" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button size="sm" className="mt-2" icon={<Plus size={14} />} onClick={() => setList([...list, { label: 'Fenêtre', width: 1.2, height: 1.2, count: 1 }])}>Ajouter</Button>
    </Modal>
  );
}

/** DQE généré depuis le métré : un lot par lot du métré, une ligne par ouvrage regroupé. */
function GenerateDqe({ metre, onClose, onCreated }: { metre: MetreDoc; onClose: () => void; onCreated: (q: Quote) => void }) {
  const { org } = useOrg();
  const [title, setTitle] = useState(`DQE — ${metre.title}`);
  const [kind, setKind] = useState<'dqe' | 'devis'>('dqe');
  const [skipIncomplete, setSkipIncomplete] = useState(false);
  const groups = groupMetre(metre.lines.filter((l) => l.designation.trim()), metre.rules);
  const incomplete = groups.filter((g) => g.qty === null).length;
  const create = useAction(async () => {
    const byLot = new Map<string, typeof groups>();
    for (const g of groups) {
      if (skipIncomplete && g.qty === null) continue;
      byLot.set(g.lot || 'Travaux', [...(byLot.get(g.lot || 'Travaux') ?? []), g]);
    }
    const body: DocBody = { lots: [...byLot.entries()].map(([name, gs], i) => ({
      ...newLot(name, i),
      lines: gs.map((g) => newLine({ designation: g.designation, unit: g.unit, qty: g.qty, qtySource: { kind: 'metre', id: metre.id, label: `${metre.reference} (${g.lineIds.length} ligne(s))`, verified: metre.status !== 'travail' } })),
    })) };
    return insertRow<Quote>('quotes', {
      org_id: org!.id, kind, title: title.trim(), project_id: metre.project_id, source_kind: 'metre', source_id: metre.id, body,
      settings: { currency: org!.currency, taxes: kind === 'devis' ? org!.default_taxes : [], discountPct: 0 },
      payment_terms: kind === 'devis' ? org!.payment_terms : null,
      valid_until: kind === 'devis' ? new Date(Date.now() + org!.quote_validity_days * 86400000).toISOString().slice(0, 10) : null,
    });
  }, { success: (q) => `${q.reference} créé à partir du métré.`, invalidate: [['quotes']] });
  return (
    <Modal title="Générer un document chiffré depuis le métré" onClose={onClose}
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={create.isPending} disabled={!title.trim()} onClick={() => create.mutate(undefined, { onSuccess: onCreated })}>Générer</Button></>}>
      <div className="grid gap-4">
        <Field label="Type de document"><Select value={kind} onChange={(e) => setKind(e.target.value as 'dqe' | 'devis')}><option value="dqe">DQE (détail quantitatif estimatif)</option><option value="devis">Devis</option></Select></Field>
        <Field label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <p className="text-[13.5px] text-ink-2">{groups.length} ouvrage(s) regroupé(s) par lot. Les quantités sont reprises du métré avec leur source ; les prix unitaires seront à renseigner (bibliothèque, BPU ou saisie).</p>
        {incomplete > 0 && (
          <Notice tone="warn" title={`${incomplete} ouvrage(s) sans quantité déterminée`}>
            Ils seront repris avec une quantité vide, signalée « à compléter ».
            <div className="mt-2"><Checkbox label="Ne pas reprendre ces ouvrages" checked={skipIncomplete} onChange={setSkipIncomplete} /></div>
          </Notice>
        )}
      </div>
    </Modal>
  );
}
