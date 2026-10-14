// Rendu par IA (en option) : à partir du rendu fidèle (géométrie exacte) ou du fichier importé.
// Quota mensuel, état réel du traitement, surcouche des noms et cotes exacts du dessin et
// mention « illustration non contractuelle » sur toute image affichée ou téléchargée.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Maximize2, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlanModel } from '../../../engine/plan/model';
import { aiCanvasFor, renderOverlaySvg, renderPlanSvg, type Frame } from '../../../engine/plan/render';
import { AI_RENDER_UNITS, AI_STYLES, RENDER_STATUS, startAiRender } from '../../../lib/ai-render';
import { deleteRow } from '../../../lib/api';
import { downloadBlob, safeFileName } from '../../../lib/download';
import { errorMessage } from '../../../lib/errors';
import { fmtDateTime } from '../../../lib/labels';
import { downloadPrivate, fitImage } from '../../../lib/plan-files';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import type { AiQuota, PlanDoc, PlanRender } from '../../../lib/types';
import { Badge, Button, Checkbox, Field, Modal, Notice, Select, Spinner, useToast } from '../../../ui';
import type { RenderSettings } from './RenderPanel';

export function AiPanel({ model, plan, bgUrl, bgSize, settings }: { model: PlanModel; plan: PlanDoc; bgUrl: string | null; bgSize: { w: number; h: number } | null; settings: RenderSettings }) {
  const { org, can, denyReason } = useOrg();
  const toast = useToast();
  const qc = useQueryClient();
  const [source, setSource] = useState<PlanRender['source']>(model.walls.length || model.rooms.length ? 'rendu_fidele' : 'plan_importe');
  const [style, setStyle] = useState<PlanRender['style']>(settings.style === 'realiste' ? 'moderne' : settings.style);
  const [overlay, setOverlay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ url: string; render: PlanRender } | null>(null);

  const quota = useQuery({
    queryKey: ['ai-quota', org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_quota_status', { p_org: org!.id });
      if (error) throw new Error(errorMessage(error));
      return ((Array.isArray(data) ? data[0] : data) ?? null) as AiQuota | null;
    },
  });
  const renders = useQuery({
    queryKey: ['plan_renders', plan.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_renders').select('*').eq('plan_id', plan.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw new Error(errorMessage(error));
      return (data ?? []) as PlanRender[];
    },
    // Suivi de l'état réel tant qu'un rendu est en attente ou en cours.
    refetchInterval: (q) => ((q.state.data as PlanRender[] | undefined)?.some((r) => r.status === 'en_attente' || r.status === 'en_cours') ? 4000 : false),
  });

  const hasDrawing = model.walls.length > 0 || model.rooms.length > 0;
  const deny = denyReason('plans', 'creer');
  const left = quota.data?.remaining ?? 0;

  const generate = async () => {
    setBusy(true);
    try {
      let input: Blob;
      let frame: Frame | null = null;
      if (source === 'rendu_fidele') {
        if (!hasDrawing) throw new Error('Dessinez d’abord les murs et les pièces, ou choisissez le fichier importé comme source.');
        const { svgToPng } = await import('../../../docs/plan-export');
        const r = renderPlanSvg(model, { style, furniture: settings.furniture, forAI: aiCanvasFor(model) });
        input = await svgToPng(r.svg, r.frame.width, r.frame.height);
        frame = r.frame;
      } else {
        if (!bgUrl || !bgSize) throw new Error('Aucun fichier importé pour ce plan.');
        const ratio = bgSize.w / bgSize.h;
        const size = ratio > 1.22 ? { width: 1536, height: 1024 } : ratio < 0.82 ? { width: 1024, height: 1536 } : { width: 1024, height: 1024 };
        input = await fitImage(bgUrl, size.width, size.height);
      }
      await startAiRender({ planId: plan.id, source, style, frame, input });
      toast('ok', 'Rendu IA terminé.');
    } catch (e) {
      toast('bad', errorMessage(e));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ['plan_renders', plan.id] });
      void qc.invalidateQueries({ queryKey: ['ai-quota', org?.id] });
    }
  };

  const compose = async (r: PlanRender) => {
    const { composeAiImage } = await import('../../../docs/plan-export');
    const raw = URL.createObjectURL(await downloadPrivate(r.storage_path!));
    try {
      const ov = overlay && r.frame && r.source === 'rendu_fidele'
        ? renderOverlaySvg(model, r.frame, { style: r.style, labels: settings.labels, areas: settings.areas, autoDims: settings.autoDims, manualDims: settings.manualDims, furniture: settings.furniture })
        : null;
      return await composeAiImage(raw, ov, r.frame);
    } finally {
      URL.revokeObjectURL(raw);
    }
  };
  const open = async (r: PlanRender) => {
    try { setView({ url: URL.createObjectURL(await compose(r)), render: r }); } catch (e) { toast('bad', errorMessage(e)); }
  };
  const download = async (r: PlanRender) => {
    try { downloadBlob(await compose(r), safeFileName(`${plan.reference}_${plan.name}_rendu_IA_${r.style}`) + '.png'); } catch (e) { toast('bad', errorMessage(e)); }
  };
  const remove = async (r: PlanRender) => {
    try {
      await deleteRow('plan_renders', r.id);
      await supabase.storage.from('documents').remove([r.input_path, ...(r.storage_path ? [r.storage_path] : [])]);
      void qc.invalidateQueries({ queryKey: ['plan_renders', plan.id] });
    } catch (e) {
      toast('bad', errorMessage(e));
    }
  };

  return (
    <div className="grid gap-3">
      <Notice tone="navy" title="Rendu photo-réaliste par IA">
        L’IA transforme l’image en rendu de présentation. Elle peut déformer des détails : le résultat est une <b>illustration non contractuelle</b>, toujours marquée comme telle.
        Avec le rendu fidèle comme source, les noms, surfaces et cotes affichés sont ceux de votre dessin, posés par PLANORA (pas écrits par l’IA).
      </Notice>
      <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
        <span className="text-muted">Quota IA du mois</span>
        {quota.isLoading ? <Spinner label="" /> : quota.data ? <b className="tabular">{left} / {quota.data.quota} unités</b> : <span>—</span>}
      </div>
      <Field label="Image envoyée à l’IA">
        <Select value={source} onChange={(e) => setSource(e.target.value as PlanRender['source'])}>
          <option value="rendu_fidele" disabled={!hasDrawing}>Rendu fidèle de mon dessin (recommandé)</option>
          <option value="plan_importe" disabled={!plan.source_path}>Fichier importé tel quel</option>
        </Select>
      </Field>
      {source === 'plan_importe' && <Notice tone="warn">Sans dessin, PLANORA ne connaît ni les pièces ni les cotes : l’image produite n’aura aucun nom ni cote exacts. Pour un résultat fiable, tracez le plan puis utilisez le rendu fidèle.</Notice>}
      <Field label="Ambiance">
        <Select value={style} onChange={(e) => setStyle(e.target.value as PlanRender['style'])}>
          {(Object.keys(AI_STYLES) as PlanRender['style'][]).map((k) => <option key={k} value={k}>{AI_STYLES[k].label} — {AI_STYLES[k].hint}</option>)}
        </Select>
      </Field>
      <Checkbox label="Afficher les noms, surfaces et cotes exacts sur l’image" checked={overlay} onChange={setOverlay} />
      {can('plans', 'creer') ? (
        <Button variant="primary" icon={<Sparkles size={16} />} loading={busy} disabled={busy || left < AI_RENDER_UNITS} onClick={() => void generate()}>
          Générer le rendu IA ({AI_RENDER_UNITS} unités)
        </Button>
      ) : <Notice tone="warn">{deny}</Notice>}
      {quota.data && left < AI_RENDER_UNITS && <Notice tone="warn">Quota IA insuffisant ce mois-ci ({left} unité(s) restante(s)). Il se renouvelle le 1er du mois ; une offre supérieure en donne davantage.</Notice>}
      {busy && <p className="text-[12.5px] text-muted">Traitement en cours (souvent 20 à 90 secondes). Vous pouvez continuer à travailler : l’état se met à jour tout seul.</p>}

      <div className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Rendus IA de ce plan</div>
      {renders.isLoading ? <Spinner /> : !renders.data?.length ? <p className="text-[13px] text-muted">Aucun rendu IA pour l’instant.</p> : (
        <ul className="grid gap-2">
          {renders.data.map((r) => (
            <RenderRow key={r.id} r={r} onOpen={() => void open(r)} onDownload={() => void download(r)} onDelete={() => void remove(r)} canExport={can('plans', 'exporter')} />
          ))}
        </ul>
      )}
      {view && (
        <Modal title={`Rendu IA — ${AI_STYLES[view.render.style].label}`} size="xl" onClose={() => { URL.revokeObjectURL(view.url); setView(null); }}>
          {new Date(plan.updated_at) > new Date(view.render.created_at) && view.render.source === 'rendu_fidele' && overlay && (
            <Notice tone="warn" className="mb-3">Le dessin a été modifié après ce rendu : les noms et cotes affichés sont ceux du dessin actuel et peuvent ne plus correspondre à l’image.</Notice>
          )}
          <img src={view.url} alt="Rendu IA du plan (illustration non contractuelle)" className="mx-auto max-h-[75vh] w-auto" />
        </Modal>
      )}
    </div>
  );
}

function RenderRow({ r, onOpen, onDownload, onDelete, canExport }: { r: PlanRender; onOpen: () => void; onDownload: () => void; onDelete: () => void; canExport: boolean }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (r.status !== 'termine' || !r.storage_path) return;
    let url: string | null = null;
    downloadPrivate(r.storage_path).then((b) => { url = URL.createObjectURL(b); setThumb(url); }).catch(() => setThumb(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [r.status, r.storage_path]);
  const st = RENDER_STATUS[r.status];
  return (
    <li className="flex gap-3 rounded-lg border border-line p-2">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-navy-50">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : r.status === 'en_cours' || r.status === 'en_attente' ? <Spinner label="" /> : null}
      </div>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-1.5"><Badge tone={st.tone}>{st.label}</Badge><span className="font-semibold">{AI_STYLES[r.style].label}</span></div>
        <div className="text-muted">{r.source === 'rendu_fidele' ? 'Depuis le rendu fidèle' : 'Depuis le fichier importé'} · {fmtDateTime(r.created_at)}</div>
        {r.status === 'echec' && r.error && <div className="text-bad-600">{r.error}</div>}
        <div className="mt-1 flex gap-1">
          {r.status === 'termine' && <Button size="sm" variant="ghost" icon={<Maximize2 size={14} />} onClick={onOpen}>Voir</Button>}
          {r.status === 'termine' && canExport && <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={onDownload}>PNG</Button>}
          {r.status !== 'en_cours' && r.status !== 'en_attente' && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label="Supprimer ce rendu" onClick={onDelete} />}
        </div>
      </div>
    </li>
  );
}
