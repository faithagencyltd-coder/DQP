// Éditeur de plan : outils de dessin, propriétés de l'élément sélectionné, réglages du plan
// (fond importé, calibration, calques, hauteur des murs), rendu fidèle et rendu IA.
// Sauvegarde automatique ; un plan approuvé n'est plus modifiable.

import { useQueryClient } from '@tanstack/react-query';
import {
  BrickWall, Calculator, Copy, Crosshair, DoorOpen, MousePointer2, Redo2, Ruler, RotateCw, Sofa, Square, Trash2, Type, Undo2, Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { detectRoom, darkPixels, dilate, gridFor, rasterizeWalls, snapToWallFaces } from '../../../engine/plan/detect';
import { planToMetreLines } from '../../../engine/plan/exports';
import { autoFurnish, FURNITURE, FURNITURE_CATEGORIES, itemsInRoom, type FurnitureCategory } from '../../../engine/plan/furniture';
import {
  calibrate, clampOpening, dist, formatArea, LAYERS, newId, normalizePlan, OPENING_KINDS, type OpeningKind, planBounds, type PlanModel,
  polygonArea, polygonPerimeter, type Pt, ROOM_KINDS, roomKindFromName, type RoomKind, WALL_KINDS, type WallKind, wallLength, wallDir, labelPoint, pointInPolygon,
} from '../../../engine/plan/model';
import { DEFAULT_RULES } from '../../../engine/metre';
import { deleteRow, insertRow, updateRow, useAction, useRow, useRows } from '../../../lib/api';
import { errorMessage } from '../../../lib/errors';
import { WORK_STATUS, fmtDateTime } from '../../../lib/labels';
import { DEFAULT_MPP_IMAGE, DEFAULT_MPP_PDF, downloadPrivate, loadBackground, sampleBackground, type LoadedBackground } from '../../../lib/plan-files';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import type { MetreDoc, PlanDoc, Project } from '../../../lib/types';
import { parseNumber } from '../../../engine/money';
import { Badge, Button, Checkbox, Confirm, Field, Input, Menu, Modal, Notice, PageHeader, Select, Spinner, Tabs, useToast } from '../../../ui';
import { PlanCanvas, type Sel, type Tool, type ToolOptions } from './Canvas';
import { usePlanHistory } from './history';
import { AiPanel } from './AiPanel';
import { DEFAULT_SETTINGS, RenderPanel, type RenderSettings } from './RenderPanel';
import { PLAN_TYPES } from '../Plans';

const TOOLS: { id: Tool; label: string; icon: ReactNode; edit: boolean }[] = [
  { id: 'select', label: 'Sélection', icon: <MousePointer2 size={16} />, edit: false },
  { id: 'mur', label: 'Mur', icon: <BrickWall size={16} />, edit: true },
  { id: 'ouverture', label: 'Porte / fenêtre', icon: <DoorOpen size={16} />, edit: true },
  { id: 'piece_auto', label: 'Pièce (clic)', icon: <Wand2 size={16} />, edit: true },
  { id: 'piece', label: 'Pièce (contour)', icon: <Square size={16} />, edit: true },
  { id: 'meuble', label: 'Mobilier', icon: <Sofa size={16} />, edit: true },
  { id: 'cote', label: 'Cote', icon: <Ruler size={16} />, edit: true },
  { id: 'texte', label: 'Texte', icon: <Type size={16} />, edit: true },
  { id: 'mesure', label: 'Mesurer', icon: <Ruler size={16} className="rotate-45" />, edit: false },
  { id: 'echelle', label: 'Échelle', icon: <Crosshair size={16} />, edit: true },
];

const HELP: Record<Tool, string> = {
  select: 'Cliquez un élément pour le modifier ; glissez-le pour le déplacer ; poignées carrées : extrémités et sommets. Suppr : supprimer.',
  mur: 'Cliquez le point de départ puis chaque angle. Tapez une longueur puis Entrée pour une cote exacte. Double-clic ou Entrée : terminer.',
  ouverture: 'Cliquez sur un mur pour y placer l’ouverture ; ajustez largeur et sens dans les propriétés.',
  piece_auto: 'Cliquez à l’intérieur d’une pièce fermée par des murs (ou par les traits du fichier importé) : son contour est détecté.',
  piece: 'Cliquez chaque angle de la pièce ; cliquez le premier point ou Entrée pour fermer.',
  meuble: 'Choisissez un meuble puis cliquez pour le poser ; R : pivoter de 90°.',
  cote: 'Cliquez les deux extrémités, puis l’emplacement de la ligne de cote.',
  texte: 'Cliquez où écrire le texte.',
  mesure: 'Cliquez deux points pour lire la distance (rien n’est enregistré).',
  echelle: 'Cliquez deux points dont vous connaissez la distance réelle (une cote du plan), puis saisissez-la.',
};

type Tab = 'element' | 'plan' | 'rendu' | 'ia';

export function PlanEditor() {
  const { id } = useParams();
  const plan = useRow<PlanDoc>('plans', id);
  if (plan.isLoading) return <Spinner />;
  if (!plan.data) return <Notice tone="bad">Plan introuvable ou accès non autorisé.</Notice>;
  return <Editor key={plan.data.id} plan={plan.data} />;
}

function Editor({ plan }: { plan: PlanDoc }) {
  const { org, can } = useOrg();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const hist = usePlanHistory(useMemo(() => normalizePlan(plan.data), [plan.data]));
  const { model } = hist;
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name' });
  const project = (projects.data ?? []).find((p) => p.id === plan.project_id) ?? null;
  const [meta, setMeta] = useState(plan);
  const readOnly = meta.status === 'approuve' || !can('plans', 'modifier');

  const [tool, setTool] = useState<Tool>('select');
  const [opts, setOpts] = useState<ToolOptions>({ wallKind: 'mur', thickness: 0.2, openingKind: 'porte', roomKind: 'chambre', furnitureType: 'lit_double' });
  const [useBgForRooms, setUseBgForRooms] = useState(true);
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<Tab>('element');
  const [lengthTxt, setLengthTxt] = useState('');
  const [lengthReq, setLengthReq] = useState<{ value: number; seq: number } | null>(null);
  const [finishSig, setFinishSig] = useState(0);
  const [fitSig, setFitSig] = useState(0);
  const [calib, setCalib] = useState<{ a: Pt; b: Pt } | null>(null);
  const [noteAt, setNoteAt] = useState<Pt | null>(null);
  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ------------------------------------------------------------------ fond importé
  const [bg, setBg] = useState<LoadedBackground | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  useEffect(() => {
    if (!meta.source_path || !meta.source_mime) return;
    let alive = true;
    let url: string | null = null;
    setBgError(null);
    downloadPrivate(meta.source_path)
      .then((blob) => loadBackground(blob, meta.source_mime!, meta.source_page))
      .then((b) => {
        if (!alive) { URL.revokeObjectURL(b.url); return; }
        url = b.url;
        setBg(b);
        const m = hist.current.current;
        if (!m.background || m.background.widthPx !== b.widthPx || m.background.heightPx !== b.heightPx) {
          // Première ouverture : échelle provisoire, à vérifier par calibration.
          const mpp = m.background?.mpp ?? (b.kind === 'pdf' ? DEFAULT_MPP_PDF : DEFAULT_MPP_IMAGE);
          hist.reset({ ...m, background: { kind: b.kind, widthPx: b.widthPx, heightPx: b.heightPx, mpp, opacity: m.background?.opacity ?? 0.6, visible: true }, scaleVerified: m.background ? m.scaleVerified : false });
          setFitSig((n) => n + 1);
        }
      })
      .catch((e) => alive && setBgError(errorMessage(e)));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [meta.source_path, meta.source_page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ sauvegarde automatique
  const saved = useRef<PlanModel>(model);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(plan.updated_at);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = model !== saved.current;
  const save = useCallback(async (m: PlanModel) => {
    setSaving(true);
    try {
      const r = await updateRow<PlanDoc>('plans', plan.id, { data: m, scale_verified: m.scaleVerified });
      saved.current = m;
      setSavedAt(r.updated_at);
      setMeta((x) => ({ ...x, updated_at: r.updated_at, scale_verified: r.scale_verified }));
      setSaveError(null);
      void qc.invalidateQueries({ queryKey: ['plans', org?.id] });
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [plan.id, qc, org?.id]);
  useEffect(() => {
    if (readOnly || model === saved.current) return;
    const t = setTimeout(() => void save(model), 1200);
    return () => clearTimeout(t);
  }, [model, readOnly, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ------------------------------------------------------------------ clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) hist.redo(); else hist.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); return; }
      if (readOnly) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); }
      if (e.key.toLowerCase() === 'r' && sel?.kind === 'item') rotateItem(90);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ modifications
  const m = model;
  const commit = hist.commit;
  const removeSel = () => {
    if (!sel) return;
    const k = sel.kind, sid = sel.id;
    commit({
      ...m,
      walls: k === 'wall' ? m.walls.filter((x) => x.id !== sid) : m.walls,
      openings: m.openings.filter((x) => !(k === 'opening' && x.id === sid) && !(k === 'wall' && x.wallId === sid)),
      rooms: k === 'room' ? m.rooms.filter((x) => x.id !== sid) : m.rooms,
      items: k === 'item' ? m.items.filter((x) => x.id !== sid) : m.items,
      dims: k === 'dim' ? m.dims.filter((x) => x.id !== sid) : m.dims,
      notes: k === 'note' ? m.notes.filter((x) => x.id !== sid) : m.notes,
    });
    setSel(null);
  };
  const rotateItem = (deg: number) => {
    if (sel?.kind !== 'item') return;
    commit({ ...m, items: m.items.map((i) => (i.id === sel.id ? { ...i, rot: (((i.rot + deg) % 360) + 360) % 360 } : i)) });
  };

  const detect = async (at: Pt) => {
    const b = planBounds(m, true);
    if (!b) return toast('navy', 'Dessinez d’abord des murs ou importez un plan.');
    const withImage = !!(m.background && bg && useBgForRooms && m.layers.fond.visible);
    if (!withImage && !m.walls.length) return toast('navy', 'Aucun mur dessiné : tracez les murs, ou activez « utiliser les traits du fichier importé ».');
    // Sur une image, la grille suit la résolution du fichier (1 cellule ≈ 1 pixel).
    const g = gridFor(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1, withImage ? Math.max(0.01, m.background!.mpp) : 0.02);
    const walls = rasterizeWalls(m, g);
    let dark: Uint8Array | null = null;
    if (withImage) {
      try {
        dark = darkPixels(await sampleBackground(bg!.url, m.background!, g), g);
      } catch (e) {
        toast('bad', errorMessage(e));
      }
    }
    const merge = (extra: Uint8Array | null) => {
      const out = walls.slice();
      if (extra) for (let i = 0; i < out.length; i++) if (extra[i]) out[i] = 1;
      return out;
    };
    // Traits pris tels quels ; s'ils laissent fuir la zone (scan imparfait), on les épaissit d'un pixel.
    let r = detectRoom(merge(dark), g, at);
    if (!r.ok && dark && /pas fermée/.test(r.message)) r = detectRoom(merge(dilate(dark, g, 1)), g, at);
    if (!r.ok) return toast('navy', r.message);
    const points = snapToWallFaces(r.points, m, g.res * 2.5);
    const area = polygonArea(points);
    const dup = m.rooms.find((x) => pointInPolygon(labelPoint(points), x.points) && Math.abs(polygonArea(x.points) - area) / area < 0.2);
    if (dup) { setSel({ kind: 'room', id: dup.id }); return toast('navy', `Cette zone correspond déjà à la pièce « ${dup.name} ».`); }
    const base = ROOM_KINDS[opts.roomKind];
    const n = m.rooms.filter((x) => x.kind === opts.roomKind).length;
    const rid = newId('r');
    commit({ ...m, rooms: [...m.rooms, { id: rid, name: n ? `${base} ${n + 1}` : base, kind: opts.roomKind, points, ...(dark ? { fromImage: true } : {}) }] });
    setSel({ kind: 'room', id: rid });
    setTab('element');
  };

  const furnishRoom = (roomId: string) => {
    const room = m.rooms.find((x) => x.id === roomId);
    if (!room) return;
    const items = autoFurnish(m, room);
    if (!items.length) return toast('navy', 'Aucun meuble proposé : pièce trop petite, type « Pièce » générique ou place occupée.');
    commit({ ...m, items: [...m.items, ...items] });
    toast('ok', `${items.length} élément(s) proposé(s) : déplacez-les ou supprimez-les librement.`);
  };
  const furnishAll = () => {
    let cur = m;
    let count = 0;
    for (const r of m.rooms) {
      if (itemsInRoom(cur, r).length) continue;
      const items = autoFurnish(cur, r);
      count += items.length;
      cur = { ...cur, items: [...cur.items, ...items] };
    }
    if (!count) return toast('navy', 'Toutes les pièces ont déjà du mobilier (ou aucune proposition possible).');
    commit(cur);
    toast('ok', `${count} élément(s) proposé(s) dans les pièces vides.`);
  };

  const setStatus = useAction(async (status: PlanDoc['status']) => {
    if (dirty) await save(model);
    return updateRow<PlanDoc>('plans', plan.id, { status });
  }, { success: 'Statut mis à jour.', invalidate: [['plans']] });
  useEffect(() => { if (setStatus.data) setMeta((x) => ({ ...x, status: setStatus.data!.status })); }, [setStatus.data]);

  const toMetre = useAction(async () => {
    const lines = planToMetreLines(model, plan.reference);
    return insertRow<MetreDoc>('metres', { org_id: org!.id, title: `Métré — ${plan.name}${plan.level ? ' ' + plan.level : ''}`, project_id: plan.project_id, rules: org!.metre_rules ?? DEFAULT_RULES, lines });
  }, { success: (d) => `Métré ${d.reference} créé à partir du plan.`, invalidate: [['metres']] });

  const removePlan = useAction(async () => {
    const paths: string[] = [];
    if (meta.source_path) paths.push(meta.source_path);
    const { data: rs } = await supabase.from('plan_renders').select('input_path, storage_path').eq('plan_id', plan.id);
    for (const r of rs ?? []) { paths.push(r.input_path); if (r.storage_path) paths.push(r.storage_path); }
    await deleteRow('plans', plan.id);
    if (paths.length) await supabase.storage.from('documents').remove(paths);
  }, { success: 'Plan supprimé.', invalidate: [['plans']] });

  const updateMeta = async (patch: Partial<PlanDoc>) => {
    try {
      const r = await updateRow<PlanDoc>('plans', plan.id, patch);
      setMeta((x) => ({ ...x, ...r }));
      void qc.invalidateQueries({ queryKey: ['plans', org?.id] });
    } catch (e) {
      toast('bad', errorMessage(e));
    }
  };

  const stats = useMemo(() => ({ area: m.rooms.reduce((s, r) => s + polygonArea(r.points), 0), rooms: m.rooms.length, walls: m.walls.length }), [m]);

  return (
    <>
      <PageHeader
        back={<Link className="link" to="/app/plans">← Plans</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{meta.name}{meta.level ? <span className="text-muted">· {meta.level}</span> : null} <Badge tone={WORK_STATUS[meta.status]?.tone}>{WORK_STATUS[meta.status]?.label}</Badge></span>}
        subtitle={<>{meta.reference}{project ? <> · <Link className="link" to={`/app/projets/${project.id}`}>{project.reference} {project.name}</Link></> : ''} · {readOnly ? <span className="text-muted">Lecture seule</span> : <span className={saveError ? 'text-bad-600' : dirty ? 'text-warn-600' : 'text-ok-600'}>{saveError ? `Non enregistré : ${saveError}` : saving ? 'Enregistrement…' : dirty ? 'Modifications en cours…' : `Enregistré ${fmtDateTime(savedAt)}`}</span>}</>}
        actions={<>
          <Button icon={<Undo2 size={16} />} disabled={!hist.canUndo || readOnly} onClick={hist.undo} aria-label="Annuler">Annuler</Button>
          <Button icon={<Redo2 size={16} />} disabled={!hist.canRedo || readOnly} onClick={hist.redo} aria-label="Rétablir" />
          {can('plans', 'valider') && (
            <Select aria-label="Statut du plan" value={meta.status} className="!w-56" onChange={(e) => setStatus.mutate(e.target.value as PlanDoc['status'])}>
              {Object.entries(WORK_STATUS).filter(([k]) => k !== 'archive').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          )}
          <Menu trigger={(t) => <Button onClick={t}>Plus</Button>} items={[
            can('metres', 'creer') ? { label: 'Créer un métré depuis ce plan', onClick: () => model.scaleVerified ? toMetre.mutate(undefined, { onSuccess: (d) => nav(`/app/metres/${d.id}`) }) : toast('navy', 'Vérifiez d’abord l’échelle (outil « Échelle ») : aucune quantité n’est tirée d’un plan non calibré.') } : null,
            can('plans', 'supprimer') ? { label: 'Supprimer le plan', danger: true, onClick: () => setConfirmDelete(true) } : null,
          ]} />
        </>}
      />
      {meta.status === 'approuve' && <Notice tone="ok" className="mb-3" title="Plan approuvé">Le dessin est figé. Un utilisateur autorisé peut le repasser en « document de travail » pour le modifier.</Notice>}
      {bgError && <Notice tone="bad" className="mb-3">Fichier importé illisible : {bgError}</Notice>}
      {m.background && !m.scaleVerified && (
        <Notice tone="warn" className="mb-3" title="Échelle non vérifiée">
          Les longueurs et surfaces sont <b>indicatives (≈)</b> tant que l’échelle n’est pas calibrée sur une cote connue du plan.{' '}
          {!readOnly && <button type="button" className="link font-semibold" onClick={() => { setTool('echelle'); setTab('element'); }}>Vérifier l’échelle maintenant</button>}
        </Notice>
      )}

      {/* Barre d'outils */}
      <div className="mb-2 flex gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1" role="toolbar" aria-label="Outils de dessin">
        {TOOLS.filter((t) => !readOnly || !t.edit).map((t) => (
          <button key={t.id} type="button" aria-pressed={tool === t.id} onClick={() => { setTool(t.id); setTab('element'); }}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-semibold ${tool === t.id ? 'bg-navy-900 text-white' : 'text-ink-2 hover:bg-navy-50'}`}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>
      {!readOnly && <ToolBar tool={tool} opts={opts} setOpts={setOpts} lengthTxt={lengthTxt} setLengthTxt={setLengthTxt}
        onLength={(v) => setLengthReq({ value: v, seq: Date.now() })} onFinish={() => setFinishSig((n) => n + 1)}
        hasBg={!!m.background} useBg={useBgForRooms} setUseBg={setUseBgForRooms} />}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[58vh] min-h-[360px] overflow-hidden rounded-lg border border-line lg:h-[calc(100vh-250px)]">
          <PlanCanvas model={model} current={hist.current} bgUrl={bg?.url ?? null} bgSnap={bg?.snap ?? []} tool={tool} opts={opts} selection={sel} readOnly={readOnly}
            onSelect={(s) => { setSel(s); if (s) setTab('element'); }} begin={hist.begin} live={hist.live} commit={commit} cancel={hist.cancel}
            onCalibrate={(a, b) => setCalib({ a, b })} onDetect={(at) => void detect(at)} onNote={setNoteAt} onInfo={(t) => toast('navy', t)}
            lengthRequest={lengthReq} fitSignal={fitSig} finishSignal={finishSig} />
        </div>
        <div className="min-w-0 rounded-lg border border-line bg-white">
          <div className="border-b border-line-2 px-2 pt-2">
            <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'element', label: 'Élément' }, { id: 'plan', label: 'Plan' }, { id: 'rendu', label: 'Rendu' }, { id: 'ia', label: 'Rendu IA' }]} />
          </div>
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto p-3">
            {tab === 'element' && (sel
              ? <Properties model={m} sel={sel} readOnly={readOnly} commit={commit} onDelete={removeSel} onRotate={rotateItem} onFurnish={furnishRoom} onSelect={setSel} />
              : <div className="grid gap-3 text-[13px]">
                <p className="text-muted">{HELP[tool]}</p>
                {tool === 'meuble' && !readOnly && <FurniturePicker value={opts.furnitureType} onChange={(v) => setOpts({ ...opts, furnitureType: v })} />}
                <div className="rounded-lg bg-navy-50/60 p-3">
                  <div>{stats.walls} mur(s) · {stats.rooms} pièce(s)</div>
                  <div className="font-semibold">Surface des pièces : {m.scaleVerified ? '' : '≈ '}{formatArea(stats.area)}</div>
                </div>
              </div>)}
            {tab === 'plan' && <PlanSettings model={m} meta={meta} readOnly={readOnly} commit={commit} bg={bg} onMeta={updateMeta} onCalibrate={() => { setTool('echelle'); setTab('element'); }} />}
            {tab === 'rendu' && <RenderPanel model={m} plan={meta} project={project} settings={settings} onSettings={setSettings} onFurnishAll={furnishAll} canFurnish={!readOnly} />}
            {tab === 'ia' && <AiPanel model={m} plan={meta} bgUrl={bg?.url ?? null} bgSize={bg ? { w: bg.widthPx, h: bg.heightPx } : null} settings={settings} />}
          </div>
        </div>
      </div>

      {calib && <CalibrateModal a={calib.a} b={calib.b} onClose={() => setCalib(null)} onConfirm={(len) => {
        try {
          commit(calibrate(m, calib.a, calib.b, len));
          setCalib(null);
          setTool('select');
          setFitSig((n) => n + 1);
          toast('ok', 'Échelle vérifiée : les mesures sont désormais exactes à l’échelle saisie.');
        } catch (e) { toast('bad', errorMessage(e)); }
      }} />}
      {noteAt && <NoteModal onClose={() => setNoteAt(null)} onConfirm={(text) => {
        commit({ ...m, notes: [...m.notes, { id: newId('n'), at: noteAt, text, size: 0.25 }] });
        setNoteAt(null);
      }} />}
      {confirmDelete && <Confirm danger title="Supprimer ce plan ?" confirmLabel="Supprimer" typeToConfirm={meta.reference} onClose={() => setConfirmDelete(false)}
        onConfirm={() => removePlan.mutate(undefined, { onSuccess: () => nav('/app/plans') })}>
        Le dessin, le fichier importé et les rendus IA de ce plan seront définitivement supprimés.
      </Confirm>}
    </>
  );
}

// ------------------------------------------------------------------ barre d'options de l'outil
function ToolBar({ tool, opts, setOpts, lengthTxt, setLengthTxt, onLength, onFinish, hasBg, useBg, setUseBg }: {
  tool: Tool; opts: ToolOptions; setOpts: (o: ToolOptions) => void; lengthTxt: string; setLengthTxt: (s: string) => void; onLength: (v: number) => void; onFinish: () => void;
  hasBg: boolean; useBg: boolean; setUseBg: (v: boolean) => void;
}) {
  const sendLength = () => {
    const v = parseNumber(lengthTxt);
    if (v !== null && v > 0) { onLength(v); setLengthTxt(''); }
  };
  if (tool === 'select' || tool === 'mesure') return null;
  return (
    <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-line-2 bg-navy-50/50 p-2 text-[13px]">
      {tool === 'mur' && <>
        <Field label="Type" className="w-40"><Select value={opts.wallKind} onChange={(e) => { const k = e.target.value as WallKind; setOpts({ ...opts, wallKind: k, thickness: WALL_KINDS[k].thickness }); }}>{Object.entries(WALL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Épaisseur (cm)" className="w-28"><Input inputMode="decimal" value={Math.round(opts.thickness * 100)} onChange={(e) => { const v = parseNumber(e.target.value); if (v && v > 0) setOpts({ ...opts, thickness: v / 100 }); }} /></Field>
      </>}
      {tool === 'ouverture' && <Field label="Ouverture" className="w-48"><Select value={opts.openingKind} onChange={(e) => setOpts({ ...opts, openingKind: e.target.value as OpeningKind })}>{Object.entries(OPENING_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label} ({Math.round(v.width * 100)} cm)</option>)}</Select></Field>}
      {(tool === 'piece' || tool === 'piece_auto') && <Field label="Type de pièce" className="w-44"><Select value={opts.roomKind} onChange={(e) => setOpts({ ...opts, roomKind: e.target.value as RoomKind })}>{Object.entries(ROOM_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>}
      {tool === 'piece_auto' && hasBg && <Checkbox label="Utiliser aussi les traits du fichier importé" checked={useBg} onChange={setUseBg} />}
      {tool === 'meuble' && <FurniturePicker compact value={opts.furnitureType} onChange={(v) => setOpts({ ...opts, furnitureType: v })} />}
      {(tool === 'mur' || tool === 'cote' || tool === 'piece') && (
        <Field label="Longueur (m)" className="w-40">
          <div className="flex gap-1">
            <Input aria-label="Longueur saisie" inputMode="decimal" placeholder="ex. 4,25" value={lengthTxt} onChange={(e) => setLengthTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendLength(); } }} />
            <Button size="sm" onClick={sendLength}>OK</Button>
          </div>
        </Field>
      )}
      {(tool === 'mur' || tool === 'piece') && <Button size="sm" onClick={onFinish}>Terminer</Button>}
    </div>
  );
}

function FurniturePicker({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const groups = useMemo(() => {
    const g = new Map<FurnitureCategory, [string, string][]>();
    for (const [k, d] of Object.entries(FURNITURE)) g.set(d.category, [...(g.get(d.category) ?? []), [k, d.label]]);
    return [...g.entries()];
  }, []);
  return (
    <Field label="Meuble" className={compact ? 'w-56' : ''}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map(([cat, items]) => <optgroup key={cat} label={FURNITURE_CATEGORIES[cat]}>{items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
      </Select>
    </Field>
  );
}

// ------------------------------------------------------------------ propriétés
function NumField({ label, value, onChange, disabled, unit = 'cm', factor = 100 }: { label: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean; unit?: string; factor?: number }) {
  const show = (v: number | null) => (v === null ? '' : String(Math.round(v * factor * 100) / 100).replace('.', ','));
  const [txt, setTxt] = useState(show(value));
  useEffect(() => setTxt(show(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commitTxt = () => {
    const v = parseNumber(txt);
    if (txt.trim() === '') return onChange(null);
    if (v !== null) onChange(v / factor);
  };
  return (
    <Field label={`${label} (${unit})`}>
      <Input inputMode="decimal" disabled={disabled} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commitTxt} onKeyDown={(e) => { if (e.key === 'Enter') commitTxt(); }} />
    </Field>
  );
}

function Properties({ model: m, sel, readOnly, commit, onDelete, onRotate, onFurnish, onSelect }: {
  model: PlanModel; sel: NonNullable<Sel>; readOnly: boolean; commit: (m: PlanModel) => void; onDelete: () => void; onRotate: (d: number) => void; onFurnish: (roomId: string) => void; onSelect: (s: Sel) => void;
}) {
  const approx = m.scaleVerified ? '' : '≈ ';
  const del = !readOnly && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={onDelete}>Supprimer</Button>;
  if (sel.kind === 'wall') {
    const w = m.walls.find((x) => x.id === sel.id);
    if (!w) return null;
    const set = (patch: Partial<typeof w>) => commit({ ...m, walls: m.walls.map((x) => (x.id === w.id ? { ...x, ...patch } : x)), openings: m.openings.map((o) => (o.wallId === w.id ? clampOpening(o, { ...w, ...patch }) : o)) });
    const L = wallLength(w);
    return (
      <div className="grid gap-3">
        <h3 className="font-semibold">{WALL_KINDS[w.kind].label}</h3>
        <Field label="Type"><Select disabled={readOnly} value={w.kind} onChange={(e) => set({ kind: e.target.value as WallKind })}>{Object.entries(WALL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <NumField label="Épaisseur" value={w.thickness} disabled={readOnly} onChange={(v) => v && v > 0 && set({ thickness: v })} />
        <NumField label={`Longueur d’axe${approx ? ' (indicative)' : ''}`} unit="m" factor={1} value={Math.round(L * 1000) / 1000} disabled={readOnly} onChange={(v) => {
          if (!v || v <= 0) return;
          const d = wallDir(w);
          set({ b: [Math.round((w.a[0] + d[0] * v) * 1000) / 1000, Math.round((w.a[1] + d[1] * v) * 1000) / 1000] });
        }} />
        <p className="text-[12px] text-muted">Changer la longueur déplace l’extrémité de fin du mur, dans le même alignement.</p>
        <div>{del}</div>
      </div>
    );
  }
  if (sel.kind === 'opening') {
    const o = m.openings.find((x) => x.id === sel.id);
    const w = o && m.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return null;
    const set = (patch: Partial<typeof o>) => commit({ ...m, openings: m.openings.map((x) => (x.id === o.id ? clampOpening({ ...x, ...patch }, w) : x)) });
    return (
      <div className="grid gap-3">
        <h3 className="font-semibold">{OPENING_KINDS[o.kind].label}</h3>
        <Field label="Type"><Select disabled={readOnly} value={o.kind} onChange={(e) => set({ kind: e.target.value as OpeningKind })}>{Object.entries(OPENING_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Largeur" value={o.width} disabled={readOnly} onChange={(v) => v && v > 0 && set({ width: v })} />
          <NumField label="Hauteur" value={o.height} disabled={readOnly} onChange={(v) => set({ height: v && v > 0 ? v : null })} />
        </div>
        <NumField label="Position depuis le début du mur" unit="m" factor={1} value={Math.round(o.pos * 100) / 100} disabled={readOnly} onChange={(v) => v !== null && set({ pos: v })} />
        {OPENING_KINDS[o.kind].door && !readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => set({ side: o.side === 1 ? -1 : 1 })}>Inverser le côté d’ouverture</Button>
            <Button size="sm" onClick={() => set({ flip: !o.flip })}>Inverser la charnière</Button>
          </div>
        )}
        <p className="text-[12px] text-muted">La hauteur sert au métré (déduction de l’ouverture) ; laissée vide, elle reste « à compléter ».</p>
        <div>{del}</div>
      </div>
    );
  }
  if (sel.kind === 'room') {
    const r = m.rooms.find((x) => x.id === sel.id);
    if (!r) return null;
    const set = (patch: Partial<typeof r>) => commit({ ...m, rooms: m.rooms.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) });
    const furn = itemsInRoom(m, r);
    return (
      <div className="grid gap-3">
        <Field label="Nom de la pièce"><Input disabled={readOnly} defaultValue={r.name} key={r.id + r.name} onBlur={(e) => {
          const name = e.target.value.trim();
          if (name && name !== r.name) set({ name, kind: r.kind === 'autre' ? roomKindFromName(name) : r.kind });
        }} /></Field>
        <Field label="Type (revêtement et mobilier proposés)"><Select disabled={readOnly} value={r.kind} onChange={(e) => set({ kind: e.target.value as RoomKind })}>{Object.entries(ROOM_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <div className="rounded-lg bg-navy-50/60 p-3 text-[13px]">
          <div>Surface : <b>{approx}{formatArea(polygonArea(r.points))}</b></div>
          <div>Périmètre : {approx}{polygonPerimeter(r.points).toFixed(2).replace('.', ',')} m · {r.points.length} sommets</div>
          <div className="text-muted">{furn.length} meuble(s) dans la pièce</div>
        </div>
        {r.fromImage && <Notice tone="warn">Contour détecté sur l’image importée : sa précision dépend de la résolution du fichier ({m.background ? `1 pixel ≈ ${(m.background.mpp * 100).toFixed(1).replace('.', ',')} cm` : 'inconnue'}). Vérifiez-le sur une cote du plan et ajustez les sommets si besoin.</Notice>}
        {!readOnly && <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Sofa size={15} />} onClick={() => onFurnish(r.id)}>Proposer un aménagement</Button>
          {furn.length > 0 && <Button size="sm" variant="ghost" onClick={() => commit({ ...m, items: m.items.filter((i) => !furn.includes(i)) })}>Retirer le mobilier</Button>}
        </div>}
        <div>{del}</div>
      </div>
    );
  }
  if (sel.kind === 'item') {
    const i = m.items.find((x) => x.id === sel.id);
    if (!i) return null;
    const set = (patch: Partial<typeof i>) => commit({ ...m, items: m.items.map((x) => (x.id === i.id ? { ...x, ...patch } : x)) });
    return (
      <div className="grid gap-3">
        <h3 className="font-semibold">{FURNITURE[i.type]?.label ?? i.type}</h3>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Largeur" value={i.w} disabled={readOnly} onChange={(v) => v && v > 0 && set({ w: v })} />
          <NumField label="Profondeur" value={i.d} disabled={readOnly} onChange={(v) => v && v > 0 && set({ d: v })} />
        </div>
        <NumField label="Rotation" unit="°" factor={1} value={i.rot} disabled={readOnly} onChange={(v) => v !== null && set({ rot: ((v % 360) + 360) % 360 })} />
        {!readOnly && <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<RotateCw size={15} />} onClick={() => onRotate(90)}>Pivoter 90°</Button>
          <Button size="sm" icon={<Copy size={15} />} onClick={() => {
            const copy = { ...i, id: newId('i'), x: i.x + 0.3, y: i.y + 0.3 };
            commit({ ...m, items: [...m.items, copy] });
            onSelect({ kind: 'item', id: copy.id });
          }}>Dupliquer</Button>
        </div>}
        <div>{del}</div>
      </div>
    );
  }
  if (sel.kind === 'dim') {
    const d = m.dims.find((x) => x.id === sel.id);
    if (!d) return null;
    return (
      <div className="grid gap-3">
        <h3 className="font-semibold">Cote</h3>
        <div className="text-[13px]">Longueur mesurée : <b>{approx}{dist(d.a, d.b).toFixed(3).replace('.', ',')} m</b></div>
        <NumField label="Décalage de la ligne" unit="m" factor={1} value={d.offset} disabled={readOnly} onChange={(v) => v !== null && commit({ ...m, dims: m.dims.map((x) => (x.id === d.id ? { ...x, offset: v } : x)) })} />
        <p className="text-[12px] text-muted">La valeur affichée est toujours calculée depuis la géométrie : elle ne peut pas être saisie à la main.</p>
        <div>{del}</div>
      </div>
    );
  }
  const n = m.notes.find((x) => x.id === sel.id);
  if (!n) return null;
  return (
    <div className="grid gap-3">
      <Field label="Texte"><Input disabled={readOnly} defaultValue={n.text} key={n.id} onBlur={(e) => e.target.value.trim() && commit({ ...m, notes: m.notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value.trim() } : x)) })} /></Field>
      <NumField label="Hauteur du texte" value={n.size} disabled={readOnly} onChange={(v) => v && v > 0 && commit({ ...m, notes: m.notes.map((x) => (x.id === n.id ? { ...x, size: v } : x)) })} />
      <div>{del}</div>
    </div>
  );
}

// ------------------------------------------------------------------ réglages du plan
function PlanSettings({ model: m, meta, readOnly, commit, bg, onMeta, onCalibrate }: {
  model: PlanModel; meta: PlanDoc; readOnly: boolean; commit: (m: PlanModel) => void; bg: LoadedBackground | null; onMeta: (p: Partial<PlanDoc>) => void; onCalibrate: () => void;
}) {
  return (
    <div className="grid gap-4 text-[13px]">
      <div className="grid gap-3">
        <Field label="Nom du plan"><Input disabled={readOnly} defaultValue={meta.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== meta.name && onMeta({ name: e.target.value.trim() })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Niveau"><Input disabled={readOnly} defaultValue={meta.level} onBlur={(e) => e.target.value !== meta.level && onMeta({ level: e.target.value.trim() })} /></Field>
          <Field label="Type"><Select disabled={readOnly} value={meta.plan_type} onChange={(e) => onMeta({ plan_type: e.target.value as PlanDoc['plan_type'] })}>{Object.entries(PLAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
      </div>
      <section className="grid gap-2">
        <h3 className="font-semibold">Échelle</h3>
        {m.background ? (
          m.scaleVerified && m.calibration
            ? <Notice tone="ok">Vérifiée le {new Date(m.calibration.at).toLocaleDateString('fr-FR')} sur une distance réelle de {m.calibration.length.toString().replace('.', ',')} m.</Notice>
            : <Notice tone="warn">Non vérifiée : échelle provisoire. Les mesures sont indicatives.</Notice>
        ) : <Notice tone="ok">Plan dessiné directement en mètres : les dimensions sont celles saisies.</Notice>}
        {!readOnly && <Button size="sm" icon={<Crosshair size={15} />} onClick={onCalibrate}>{m.calibration ? 'Recalibrer' : 'Calibrer sur une cote connue'}</Button>}
      </section>
      {m.background && (
        <section className="grid gap-2">
          <h3 className="font-semibold">Fichier importé</h3>
          <div className="text-muted">{meta.source_name} · {bg ? `${bg.widthPx} × ${bg.heightPx} px` : 'chargement…'}{bg?.kind === 'pdf' ? ` · ${bg.snap.length} points d’accroche vectoriels` : ''}</div>
          {bg && bg.pages > 1 && (
            <Field label={`Page du PDF (sur ${bg.pages})`}><Select disabled={readOnly} value={meta.source_page} onChange={(e) => onMeta({ source_page: Number(e.target.value) })}>{Array.from({ length: bg.pages }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}</Select></Field>
          )}
          <Field label={`Opacité du fond : ${Math.round(m.background.opacity * 100)} %`}>
            <input type="range" min={10} max={100} value={Math.round(m.background.opacity * 100)} onChange={(e) => commit({ ...m, background: { ...m.background!, opacity: Number(e.target.value) / 100 } })} aria-label="Opacité du fond" />
          </Field>
        </section>
      )}
      <section className="grid gap-2">
        <h3 className="font-semibold">Métré et cotes</h3>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Hauteur sous plafond" unit="m" factor={1} value={m.wallHeight} disabled={readOnly} onChange={(v) => commit({ ...m, wallHeight: v && v > 0 ? v : null })} />
          <Field label="Unité des cotes"><Select disabled={readOnly} value={m.dimUnit} onChange={(e) => commit({ ...m, dimUnit: e.target.value as 'cm' | 'm' })}><option value="cm">Centimètres</option><option value="m">Mètres</option></Select></Field>
        </div>
      </section>
      <section className="grid gap-1.5">
        <h3 className="font-semibold">Calques</h3>
        {LAYERS.filter((l) => l.id !== 'fond' || m.background).map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2">
            <span>{l.label}</span>
            <span className="flex gap-3">
              <Checkbox label="Visible" checked={m.layers[l.id].visible} onChange={(v) => commit({ ...m, layers: { ...m.layers, [l.id]: { ...m.layers[l.id], visible: v } } })} />
              <Checkbox label="Verrouillé" checked={m.layers[l.id].locked} onChange={(v) => commit({ ...m, layers: { ...m.layers, [l.id]: { ...m.layers[l.id], locked: v } } })} />
            </span>
          </div>
        ))}
      </section>
      <section className="text-[12px] text-muted">
        <Calculator size={13} className="mr-1 inline" />« Plus → Créer un métré depuis ce plan » produit les surfaces des sols, les périmètres et les surfaces nettes des murs (hauteur ci-dessus), avec la source de chaque quantité.
      </section>
    </div>
  );
}

function CalibrateModal({ a, b, onClose, onConfirm }: { a: Pt; b: Pt; onClose: () => void; onConfirm: (len: number) => void }) {
  const [txt, setTxt] = useState('');
  const [unit, setUnit] = useState<'m' | 'cm'>('m');
  const v = parseNumber(txt);
  const len = v === null ? null : unit === 'cm' ? v / 100 : v;
  return (
    <Modal title="Vérifier l’échelle" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!len || len <= 0} onClick={() => len && onConfirm(len)}>Appliquer</Button></>}>
      <div className="grid gap-3">
        <p className="text-[13.5px]">Distance actuelle entre les deux points : <b>{dist(a, b).toFixed(3).replace('.', ',')} m</b> (échelle provisoire).</p>
        <div className="flex items-end gap-2">
          <Field label="Distance réelle (lue sur une cote du plan)" className="flex-1"><Input autoFocus inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="ex. 4,20" /></Field>
          <Select aria-label="Unité" value={unit} onChange={(e) => setUnit(e.target.value as 'm' | 'cm')} className="!w-24"><option value="m">m</option><option value="cm">cm</option></Select>
        </div>
        <p className="text-[12.5px] text-muted">Choisissez une cote longue (façade, mur principal) pour plus de précision. Tout le dessin et le fond sont remis à l’échelle ; les épaisseurs et les meubles gardent leur taille réelle.</p>
      </div>
    </Modal>
  );
}

function NoteModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (t: string) => void }) {
  const [txt, setTxt] = useState('');
  return (
    <Modal title="Ajouter un texte" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!txt.trim()} onClick={() => onConfirm(txt.trim())}>Ajouter</Button></>}>
      <Field label="Texte"><Input autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && txt.trim()) onConfirm(txt.trim()); }} /></Field>
    </Modal>
  );
}
