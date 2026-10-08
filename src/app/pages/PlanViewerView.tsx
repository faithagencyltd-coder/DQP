// Onglet « Plan 2D » : plan, éléments, propriétés, dans des panneaux redimensionnables.

import { ChevronLeft, ChevronRight, Import, Map as MapIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { effectiveStatus } from '../../core/elements/ops';
import { formatNumber } from '../../core/format';
import { addMeasurement } from '../../core/metre/measure';
import type { Segment } from '../../core/pdf/vectors';
import { StatusBadge } from '../ds/legacy';
import { Split } from '../ds/layout';
import { Button, Card, cx, EmptyState, IconButton, Tabs } from '../ds/primitives';
import { ElementInspector } from '../features/plan/ElementInspector';
import { FinishDialog, MeasurePanel, MeasureToolbar, proposeWalls, useMeasureTool } from '../features/plan/MeasureTools';
import { KIND_LABEL, PlanCanvas } from '../features/plan/PlanCanvas';
import { useStore } from '../stores/app-store';

export const PAGE_KIND: Record<string, string> = {
  plan: 'Plan', coupe: 'Coupe', facade: 'Façade', masse: 'Plan de masse', toiture: 'Toiture', fondation: 'Fondations',
  electricite: 'Électricité', plomberie: 'Plomberie', structure: 'Structure', autre: '—',
};

export function PlanViewerView() {
  const s = useStore();
  const p = s.project!;
  const pdfFiles = p.sourceFiles.filter((f) => f.kind === 'pdf');
  const [fileId, setFileId] = useState(pdfFiles[pdfFiles.length - 1]?.id ?? '');
  const [pageNo, setPageNo] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<'elements' | 'measures'>('elements');
  const [selMeasure, setSelMeasure] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[] | null>(null);

  useEffect(() => {
    const id = s.focusLineId;
    const m = id ? p.measurements.find((x) => x.id === id) : undefined;
    if (m) {
      setFileId(m.fileId);
      setPageNo(m.page);
      setPanel('measures');
      setSelMeasure(m.id);
      return;
    }
    const e = id ? p.elements.find((x) => x.id === id) : undefined;
    if (e) {
      setFileId(e.source.fileId);
      setPageNo(e.source.page ?? 1);
      setSelected(e.id);
    }
  }, [s.focusLineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const file = pdfFiles.find((f) => f.id === fileId) ?? pdfFiles[pdfFiles.length - 1];
  const pages = p.analyses.find((a) => a.fileId === file?.id)?.pages ?? [];
  const info = pages.find((x) => x.number === pageNo);
  const elements = useMemo(() => p.elements.filter((e) => e.source.fileId === file?.id && e.source.page === pageNo), [p.elements, file, pageNo]);
  const sel = p.elements.find((e) => e.id === selected);
  const tool = useMeasureTool(file, pageNo);
  const measureCount = p.measurements.filter((m) => m.fileId === file?.id && m.page === pageNo).length;
  useEffect(() => {
    setSegments(null);
    // Garde la mesure sélectionnée si elle appartient à la page affichée (ouverture depuis le Métré).
    setSelMeasure((id) => (id && p.measurements.some((m) => m.id === id && m.fileId === file?.id && m.page === pageNo) ? id : null));
  }, [file?.id, pageNo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tool.measuring) setPanel('measures'); }, [tool.measuring]);

  const propose = () => {
    if (!file || !segments) return;
    const r = proposeWalls(segments);
    if (!r) {
      s.toast('info', 'Aucun trait nettement plus épais que les autres sur cette page : DQP ne peut pas distinguer les murs. Tracez-les avec l’outil « Mur ».');
      return;
    }
    const res = addMeasurement(p, {
      kind: 'wall', label: `Murs proposés p.${pageNo}`, fileId: file.id, fileName: file.name, page: pageNo,
      points: r.parts[0], parts: r.parts, height: null, deductions: [], origin: 'proposal',
      note: `Proposition automatique : ${r.parts.length} trait(s) d’épaisseur ≥ ${formatNumber(r.threshold, 2)} pt. Un mur dessiné en double trait peut être compté deux fois, et des traits épais qui ne sont pas des murs peuvent être inclus : à vérifier sur le plan avant de valider. Hauteur à saisir.`,
    });
    s.update(() => res.project);
    setPanel('measures');
    setSelMeasure(res.id);
    s.toast('info', `${r.parts.length} tronçon(s) de mur proposé(s) — à vérifier, hauteur à saisir.`);
  };

  if (!file) {
    return (
      <EmptyState icon={<MapIcon size={22} />} title="Aucun plan PDF dans ce projet" action={<Button variant="primary" icon={<Import size={14} />} onClick={() => s.go('import')}>Importer un plan</Button>}>
        Importez les plans du projet (PDF vectoriels) : DQP y lit les pièces, surfaces, niveaux, menuiseries et le cartouche, et les affiche ici.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-[calc(100vh-var(--topbar)-210px)] min-h-[480px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="in" value={file.id} onChange={(e) => { setFileId(e.target.value); setPageNo(1); setSelected(null); }}>
          {pdfFiles.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <IconButton label="Page précédente" size="sm" disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)}><ChevronLeft size={15} /></IconButton>
        <span className="text-[12px] tabular-nums text-fg-2">Page {pageNo} / {pages.length || '?'}</span>
        <IconButton label="Page suivante" size="sm" disabled={pageNo >= pages.length} onClick={() => setPageNo(pageNo + 1)}><ChevronRight size={15} /></IconButton>
        {info && (
          <span className="ml-2 text-[12px] text-muted">
            {PAGE_KIND[info.kind]}{info.title ? ` — ${info.title}` : ''} · niveau : <b className="text-fg-2">{info.level ?? 'non déterminé'}</b> · échelle : <b className="text-fg-2">{info.scale ? `1/${info.scale}` : 'non déterminée'}</b>
            {info.scanned && <span className="badge bad ml-2">page scannée, non lue</span>}
          </span>
        )}
      </div>
      <Split id="plan-viewer" sizes={[0.68, 0.32]} min={280} className="min-h-0 flex-1">
        <Card className="h-full" bodyClass="h-full p-0">
          <PlanCanvas
            file={file} page={pageNo} selected={selected} onSelect={(id) => { setSelected(id); if (id) setPanel('elements'); }} className="h-full"
            measuring={tool.measuring} withSegments onSegments={setSegments}
            onPagePoint={tool.onPagePoint} onPageMove={tool.onPageMove}
            overlay={(ctx) => tool.overlay(ctx, selMeasure)}
            toolbar={<MeasureToolbar tool={tool.tool} setTool={tool.setTool} file={file} page={pageNo} onPropose={propose} segmentsReady={!!segments?.length} />}
          />
        </Card>
        <Card className="h-full" bodyClass="flex h-full min-h-0 flex-col p-0">
          <div className="border-b border-line-2 px-2 py-1.5">
            <Tabs size="sm" value={panel} onChange={setPanel} items={[
              { id: 'elements', label: `Éléments (${elements.length})` },
              { id: 'measures', label: `Mesures (${measureCount})` },
            ]} />
          </div>
          <div className="min-h-0 flex-1">
          {panel === 'measures' ? (
            <MeasurePanel file={file} page={pageNo} selectedId={selMeasure} onSelect={setSelMeasure} />
          ) : sel ? (
            <ElementInspector e={sel} onClose={() => setSelected(null)} onDetail={() => s.go('detection', sel.id)} />
          ) : (
            <div className="h-full overflow-y-auto">
              {elements.length === 0 && <div className="p-6 text-center text-[12.5px] text-muted">Aucun élément détecté sur cette page.</div>}
              {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => {
                const list = elements.filter((e) => e.kind === k);
                if (!list.length) return null;
                return (
                  <div key={k}>
                    <div className="sticky top-0 bg-surface px-3.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{KIND_LABEL[k]} · {list.length}</div>
                    {list.map((e) => {
                      const st = effectiveStatus(e);
                      return (
                        <button key={e.id} onClick={() => setSelected(e.id)} className={cx('flex w-full items-center gap-2 px-3.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-hover', st === 'rejected' && 'opacity-50')}>
                          <span className="min-w-0 flex-1 truncate text-fg-2">{e.name}</span>
                          {typeof e.props.surface?.value === 'number' && <span className="tabular-nums text-muted">{formatNumber(e.props.surface.value)} m²</span>}
                          {st === 'rejected' ? <span className="badge grey">Rejeté</span> : <StatusBadge status={st} short />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </Card>
      </Split>
      {tool.finish && (
        <FinishDialog file={file} page={pageNo} finish={tool.finish} onClose={() => tool.setFinish(null)} onCreated={(id) => { setPanel('measures'); setSelMeasure(id); }} />
      )}
    </div>
  );
}
