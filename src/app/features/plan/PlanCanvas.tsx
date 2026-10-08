// Visionneuse de plan 2D : rendu fidèle de la page PDF, éléments détectés en calques,
// zoom (molette + Ctrl, boutons), déplacement (glisser), plein écran, sélection.
// Ne dessine rien qui ne vient pas du fichier : les cadres sont les zones de texte lues.

import { Expand, Layers, Minimize, Move, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { effectiveStatus } from '../../../core/elements/ops';
import { pageSegments, type Segment } from '../../../core/pdf/vectors';
import type { BuildingElement, ElementKind, SourceFile } from '../../../core/types';
import { cx, Dropdown, IconButton, Skeleton } from '../../ds/primitives';
import { api } from '../../services/api';
import { pdfCache } from '../../services/pdfjs';
import { useStore } from '../../stores/app-store';

export const KIND_LABEL: Record<ElementKind, string> = {
  level: 'Niveaux',
  room: 'Pièces',
  equipment: 'Équipements',
  opening: 'Menuiseries',
  surface_total: 'Surfaces totales',
};
export const STATUS_COLOR = { confirmed: '#22c55e', to_verify: '#f5a524', undetermined: '#f04b4b', rejected: '#64748b' };

type Doc = import('pdfjs-dist').PDFDocumentProxy;
const docs = new Map<string, Promise<Doc>>();

async function loadDoc(file: SourceFile, folder: string | null): Promise<Doc> {
  if (!docs.has(file.id)) {
    docs.set(
      file.id,
      (async () => {
        const { pdfjs } = await import('../../services/pdfjs');
        let bytes = pdfCache.get(file.id);
        if (!bytes && file.storedPath && folder) {
          bytes = await api.readProjectFile(folder, file.storedPath);
          pdfCache.set(file.id, bytes);
        }
        if (!bytes) throw new Error('Le fichier PDF n’est pas disponible dans cette session : réimportez-le pour afficher l’aperçu.');
        return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      })(),
    );
  }
  const p = docs.get(file.id)!;
  p.catch(() => docs.delete(file.id));
  return p;
}

/** Contexte transmis au calque de mesure : dimensions de la page (points) et zoom. */
export interface OverlayCtx {
  pw: number;
  ph: number;
  /** Pixels écran par point de page. */
  pxPerPt: number;
  segments: Segment[];
}

const segCache = new Map<string, Segment[]>();

export function PlanCanvas({
  file, page, selected, onSelect, compact, className, measuring, overlay, onPagePoint, onPageMove, withSegments, onSegments, toolbar,
}: {
  file: SourceFile; page: number; selected: string | null; onSelect: (id: string | null) => void; compact?: boolean; className?: string;
  /** Un outil de mesure est actif : curseur en croix, clic = point sur la page. */
  measuring?: boolean;
  overlay?: (ctx: OverlayCtx) => React.ReactNode;
  onPagePoint?: (pt: [number, number], e: React.PointerEvent) => void;
  onPageMove?: (pt: [number, number] | null, e?: React.PointerEvent) => void;
  withSegments?: boolean;
  /** Tracés vectoriels de la page, une fois lus (aimantation, proposition de murs). */
  onSegments?: (segments: Segment[]) => void;
  toolbar?: React.ReactNode;
}) {
  const s = useStore();
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState<{ w: number; h: number; scale: number; pw: number; ph: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState(false);
  const [hidden, setHidden] = useState<Set<ElementKind>>(new Set(['level']));
  const dragging = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // Un seul rendu à la fois : pdf.js refuse deux rendus simultanés sur le même canevas.
  const task = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const generation = useRef(0);

  const elements = useMemo(() => s.project!.elements.filter((e) => e.source.fileId === file.id && e.source.page === page), [s.project, file.id, page]);
  const kinds = useMemo(() => [...new Set(elements.map((e) => e.kind))], [elements]);

  // Rendu de la page à la taille du conteneur (le zoom est appliqué en CSS, puis re-rendu net).
  const render = useCallback(async () => {
    const box = wrap.current;
    if (!box) return;
    const gen = ++generation.current;
    setError(null);
    try {
      const doc = await loadDoc(file, s.folder);
      const pg = await doc.getPage(Math.min(page, doc.numPages));
      const base = pg.getViewport({ scale: 1 });
      const scale = Math.min((box.clientWidth - 24) / base.width, (box.clientHeight - 24) / base.height);
      const quality = Math.min(4, Math.max(1, zoom)) * (window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale: scale * quality });
      const c = canvasRef.current;
      if (!c || gen !== generation.current) return;
      if (task.current) {
        task.current.cancel();
        await task.current.promise.catch(() => {});
      }
      if (gen !== generation.current) return;
      // Rendu hors écran puis copie : le plan affiché ne disparaît jamais pendant un nouveau rendu.
      const off = document.createElement('canvas');
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      const t = pg.render({ canvasContext: off.getContext('2d')!, viewport: vp });
      task.current = t;
      await t.promise;
      if (gen !== generation.current) return;
      c.width = off.width;
      c.height = off.height;
      c.getContext('2d')!.drawImage(off, 0, 0);
      setFit({ w: base.width * scale, h: base.height * scale, scale, pw: base.width, ph: base.height });
      setLoading(false);
      if (withSegments) {
        const key = `${file.id}:${page}`;
        if (!segCache.has(key)) {
          const { pdfjs } = await import('../../services/pdfjs');
          segCache.set(key, await pageSegments(pg, pdfjs.OPS));
        }
        setSegments(segCache.get(key)!);
        onSegments?.(segCache.get(key)!);
      }
    } catch (e) {
      if ((e as Error).name === 'RenderingCancelledException' || gen !== generation.current) return;
      setError((e as Error).message);
      setLoading(false);
    }
  }, [file, page, s.folder, zoom, withSegments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conversion écran → point de page (points PDF, origine en haut à gauche).
  const toPage = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const r = stage.current?.getBoundingClientRect();
    if (!r || !fit) return null;
    return [((e.clientX - r.left) / r.width) * fit.pw, ((e.clientY - r.top) / r.height) * fit.ph];
  };

  useEffect(() => {
    setLoading(true);
    void render();
  }, [file.id, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => void render(), 180);
    return () => clearTimeout(t);
  }, [zoom, full]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ro = new ResizeObserver(() => void render());
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [render]);
  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrap.current?.parentElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Centrer l'élément sélectionné quand on zoome dessus.
  useEffect(() => {
    if (!selected || !fit) return;
    const e = elements.find((x) => x.id === selected);
    if (e && zoom > 1.05) {
      const [x, y, w, h] = e.source.bbox ?? [0, 0, 0, 0];
      setPan({ x: (fit.w / 2 - (x + w / 2) * fit.scale) * zoom, y: (fit.h / 2 - (y + h / 2) * fit.scale) * zoom });
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (k: number) => setZoom((z) => Math.min(8, Math.max(0.5, z * k)));
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const toggleFull = () => {
    const el = wrap.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className={cx('relative flex min-h-0 flex-col bg-[#0a1324]', className)}>
      <div className={cx('absolute left-2 top-2 z-10 flex gap-1 rounded-[9px] border border-line bg-[rgba(14,23,40,.92)] p-1 shadow-ds-2 backdrop-blur', compact && 'scale-95')}>
        <IconButton label="Zoom avant (Ctrl + molette)" size="sm" onClick={() => zoomBy(1.25)}><ZoomIn size={15} /></IconButton>
        <IconButton label="Zoom arrière" size="sm" onClick={() => zoomBy(0.8)}><ZoomOut size={15} /></IconButton>
        <IconButton label="Ajuster à la fenêtre" size="sm" onClick={reset}><RotateCcw size={15} /></IconButton>
        <span className="flex items-center px-1.5 text-[11px] tabular-nums text-muted">{Math.round(zoom * 100)} %</span>
        <Dropdown
          trigger={(open, toggle) => <IconButton label="Calques" size="sm" active={open} onClick={toggle}><Layers size={15} /></IconButton>}
        >
          {() => (
            <div className="min-w-[200px] p-1.5">
              <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Calques</div>
              {(Object.keys(KIND_LABEL) as ElementKind[]).map((k) => (
                <label key={k} className={cx('flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12.5px] hover:bg-hover', !kinds.includes(k) && 'opacity-40')}>
                  <input type="checkbox" checked={!hidden.has(k)} disabled={!kinds.includes(k)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                  {KIND_LABEL[k]}
                  <span className="ml-auto text-[11px] text-muted">{elements.filter((e) => e.kind === k).length}</span>
                </label>
              ))}
            </div>
          )}
        </Dropdown>
        <IconButton label={full ? 'Quitter le plein écran' : 'Plein écran'} size="sm" onClick={toggleFull}>{full ? <Minimize size={15} /> : <Expand size={15} />}</IconButton>
      </div>
      {toolbar}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1.5 rounded-[6px] bg-[rgba(14,23,40,.85)] px-2 py-1 text-[10.5px] text-muted">
        <Move size={11} /> {measuring ? 'Clic : ajouter un point · double-clic ou Entrée : terminer · Échap : annuler · glisser : déplacer' : 'Glisser pour déplacer · Ctrl + molette pour zoomer'}
      </div>
      <div
        ref={wrap}
        className={cx('relative min-h-0 flex-1 overflow-hidden', measuring ? 'cursor-crosshair' : dragging.current ? 'cursor-grabbing' : 'cursor-grab')}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1.12 : 0.89);
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.el) return;
          dragging.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragging.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
          if (measuring) onPageMove?.(toPage(e), e);
        }}
        onPointerLeave={() => onPageMove?.(null)}
        onPointerUp={(e) => {
          const d = dragging.current;
          dragging.current = null;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
            const pt = toPage(e);
            if (measuring && pt) onPagePoint?.(pt, e);
            else onSelect(null);
          }
        }}
      >
        {loading && !error && <div className="absolute inset-6"><Skeleton className="h-full w-full" /></div>}
        {error ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-[12.5px] text-muted">{error}</div>
        ) : (
          <div
            ref={stage}
            className="absolute left-1/2 top-1/2 transition-transform duration-150 ease-ds"
            style={{ width: fit?.w, height: fit?.h, transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}
          >
            <canvas ref={canvasRef} className="block h-full w-full rounded-[2px] bg-white shadow-[0_8px_40px_rgba(0,0,0,.55)]" />
            {fit &&
              elements
                .filter((e) => !hidden.has(e.kind))
                .map((e) => <Marker key={e.id} e={e} scale={fit.scale} zoom={zoom} selected={selected === e.id} onSelect={onSelect} passive={measuring} />)}
            {fit && overlay && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${fit.pw} ${fit.ph}`} preserveAspectRatio="none">
                {overlay({ pw: fit.pw, ph: fit.ph, pxPerPt: fit.scale * zoom, segments })}
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Marker({ e, scale, zoom, selected, onSelect, passive }: { e: BuildingElement; scale: number; zoom: number; selected: boolean; onSelect: (id: string) => void; passive?: boolean }) {
  const [x, y, w, h] = e.source.bbox ?? [0, 0, 0, 0];
  const st = effectiveStatus(e);
  const color = STATUS_COLOR[st];
  const pad = 3 / zoom;
  return (
    <button
      data-el="1"
      aria-label={`${e.category} ${e.name}`}
      title={`${e.category} — ${e.name}`}
      onClick={(ev) => { ev.stopPropagation(); onSelect(e.id); }}
      className="absolute rounded-[2px] p-0 transition-[background,box-shadow] duration-150"
      style={{
        pointerEvents: passive ? 'none' : undefined,
        opacity: passive ? 0.45 : 1,
        left: x * scale - pad,
        top: y * scale - pad,
        width: w * scale + pad * 2,
        height: h * scale + pad * 2,
        border: `${(selected ? 2.5 : 1.5) / zoom}px solid ${color}`,
        background: selected ? `${color}38` : `${color}12`,
        boxShadow: selected ? `0 0 0 ${4 / zoom}px ${color}40` : undefined,
      }}
    />
  );
}
