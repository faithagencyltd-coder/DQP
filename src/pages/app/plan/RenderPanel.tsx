// Rendu de présentation fidèle : aperçu en direct, styles, options, exports PNG / PDF / DXF
// et enregistrement dans les documents du projet.

import { Download, FileImage, FileText, Maximize2, Save, Sofa } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { planToDxf } from '../../../engine/plan/exports';
import type { PlanModel } from '../../../engine/plan/model';
import { DEFAULT_RENDER, renderPlanSvg, THEMES, type RenderOptions, type RenderStyle } from '../../../engine/plan/render';
import { insertRow } from '../../../lib/api';
import { downloadBlob, safeFileName } from '../../../lib/download';
import { errorMessage } from '../../../lib/errors';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import type { PlanDoc, Project } from '../../../lib/types';
import { Button, Checkbox, Field, Modal, Notice, Select, useToast } from '../../../ui';

export type RenderSettings = Omit<RenderOptions, 'title' | 'pixelWidth' | 'forAI'> & { titleBlock: boolean };

export const DEFAULT_SETTINGS: RenderSettings = { ...DEFAULT_RENDER, titleBlock: true };

export function renderOptions(s: RenderSettings, plan: PlanDoc, orgName: string, project?: Project | null, pixelWidth = 1400): Partial<RenderOptions> {
  const { titleBlock, ...rest } = s;
  return {
    ...rest,
    pixelWidth,
    title: titleBlock ? { planName: plan.name, level: plan.level, reference: plan.reference, project: project ? `${project.reference} · ${project.name}` : undefined, company: orgName, date: new Date().toLocaleDateString('fr-FR') } : null,
  };
}

export function RenderPanel({ model, plan, project, settings, onSettings, onFurnishAll, canFurnish }: {
  model: PlanModel; plan: PlanDoc; project?: Project | null; settings: RenderSettings; onSettings: (s: RenderSettings) => void; onFurnishAll: () => void; canFurnish: boolean;
}) {
  const { org, can } = useOrg();
  const toast = useToast();
  const [big, setBig] = useState(false);
  const [paper, setPaper] = useState<'A4' | 'A3'>('A3');
  const [busy, setBusy] = useState<string | null>(null);
  const preview = useMemo(() => renderPlanSvg(model, renderOptions(settings, plan, org!.name, project, 900)), [model, settings, plan, org, project]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([preview.svg], { type: 'image/svg+xml' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [preview.svg]);
  const empty = !model.walls.length && !model.rooms.length;
  const set = (patch: Partial<RenderSettings>) => onSettings({ ...settings, ...patch });
  const base = safeFileName(`${plan.reference}_${plan.name}${plan.level ? '_' + plan.level : ''}`);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast('bad', errorMessage(e)); } finally { setBusy(null); }
  };
  const png = () => run('png', async () => {
    const { svgToPng } = await import('../../../docs/plan-export');
    const r = renderPlanSvg(model, renderOptions(settings, plan, org!.name, project, 3200));
    downloadBlob(await svgToPng(r.svg, r.frame.width, r.frame.height), `${base}_rendu.png`);
  });
  const pdfDoc = async () => {
    const { buildPlanPdf } = await import('../../../docs/plan-export');
    const { titleBlock: _t, ...opts } = settings;
    void _t;
    return buildPlanPdf(model, opts, { planName: plan.name, level: plan.level, reference: plan.reference, project: project ? `${project.reference} · ${project.name}` : undefined }, org!, paper);
  };
  const pdf = () => run('pdf', async () => { (await pdfDoc()).save(`${base}.pdf`); });
  const dxf = () => run('dxf', async () => { downloadBlob(new Blob([planToDxf(model)], { type: 'application/dxf' }), `${base}.dxf`); });
  const toDocuments = () => run('doc', async () => {
    const blob = (await pdfDoc()).output('blob');
    const path = `${org!.id}/${plan.project_id ?? 'general'}/${crypto.randomUUID()}-${base}.pdf`;
    const up = await supabase.storage.from('documents').upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw new Error(errorMessage(up.error));
    try {
      await insertRow('documents', { org_id: org!.id, project_id: plan.project_id, doc_type: 'plan', name: `${plan.reference} ${plan.name}${plan.level ? ' — ' + plan.level : ''} (présentation).pdf`, storage_path: path, size_bytes: blob.size, mime: 'application/pdf', comment: 'Rendu de présentation généré par PLANORA BTP' });
    } catch (e) {
      await supabase.storage.from('documents').remove([path]);
      throw e;
    }
    toast('ok', 'PDF enregistré dans les documents' + (project ? ' du projet.' : '.'));
  });

  return (
    <div className="grid gap-3">
      <Field label="Style de présentation">
        <Select value={settings.style} onChange={(e) => set({ style: e.target.value as RenderStyle })}>
          {(Object.keys(THEMES) as RenderStyle[]).map((k) => <option key={k} value={k}>{THEMES[k].label} — {THEMES[k].description}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
        <Checkbox label="Mobilier" checked={settings.furniture} onChange={(v) => set({ furniture: v })} />
        <Checkbox label="Noms des pièces" checked={settings.labels} onChange={(v) => set({ labels: v })} />
        <Checkbox label="Surfaces" checked={settings.areas} onChange={(v) => set({ areas: v })} />
        <Checkbox label="Cotes automatiques" checked={settings.autoDims} onChange={(v) => set({ autoDims: v })} />
        <Checkbox label="Cotes dessinées" checked={settings.manualDims} onChange={(v) => set({ manualDims: v })} />
        <Checkbox label="Textes" checked={settings.notes} onChange={(v) => set({ notes: v })} />
        <Checkbox label="Barre d’échelle" checked={settings.scaleBar} onChange={(v) => set({ scaleBar: v })} />
        <Checkbox label="Cartouche" checked={settings.titleBlock} onChange={(v) => set({ titleBlock: v })} />
        <Checkbox label="Pelouse et clôture autour" checked={settings.garden ?? !!THEMES[settings.style].garden} onChange={(v) => set({ garden: v })} />
      </div>
      {canFurnish && model.rooms.length > 0 && (
        <Button size="sm" icon={<Sofa size={15} />} onClick={onFurnishAll}>Meubler les pièces vides (proposition)</Button>
      )}
      {preview.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      {!empty && url && (
        <button type="button" className="group relative overflow-hidden rounded-lg border border-line bg-white" onClick={() => setBig(true)} aria-label="Agrandir l’aperçu du rendu">
          <img src={url} alt="Aperçu du rendu de présentation" className="w-full" />
          <span className="absolute right-2 top-2 rounded bg-white/90 p-1 shadow-sm"><Maximize2 size={14} /></span>
        </button>
      )}
      {can('plans', 'exporter') && !empty && (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<FileImage size={15} />} loading={busy === 'png'} onClick={png}>Image PNG</Button>
            <Button size="sm" icon={<FileText size={15} />} loading={busy === 'pdf'} onClick={pdf}>PDF</Button>
            <Select aria-label="Format du PDF" value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'A3')} className="!w-24 !py-1 text-[13px]"><option value="A3">A3</option><option value="A4">A4</option></Select>
            <Button size="sm" icon={<Download size={15} />} loading={busy === 'dxf'} onClick={dxf}>DXF</Button>
          </div>
          {can('documents', 'creer') && <Button size="sm" variant="ghost" icon={<Save size={15} />} loading={busy === 'doc'} onClick={toDocuments}>Enregistrer le PDF dans les documents</Button>}
          <p className="text-[12px] text-muted">Le PDF est posé à une échelle normalisée (1/50, 1/100…) indiquée dans le cartouche, valable pour une impression à 100 %. Le DXF s’ouvre dans les logiciels de DAO (calques MURS, PIECES, COTES…).</p>
        </div>
      )}
      {big && url && (
        <Modal title="Rendu de présentation" size="xl" onClose={() => setBig(false)}>
          <img src={url} alt="Rendu de présentation" className="mx-auto max-h-[75vh] w-auto" />
        </Modal>
      )}
    </div>
  );
}
