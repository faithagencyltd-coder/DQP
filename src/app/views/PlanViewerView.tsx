// Aperçu des plans (§31 zone centrale) : rendu de la page PDF et encadrement des
// éléments détectés, avec validation, correction ou rejet de chacun (§8, §16).

import { Check, ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { acceptElement, correctElement, effectiveStatus, rejectElement, restoreElement } from '../../core/elements/ops';
import { formatNumber } from '../../core/format';
import type { BuildingElement, ElementKind } from '../../core/types';
import { api } from '../browserApi';
import { Panel, StatusBadge } from '../components/ui';
import { pdfCache } from '../pdfjs';
import { useStore } from '../store';
import { PAGE_KIND } from './ImportView';

const KIND_LABEL: Record<ElementKind, string> = {
  level: 'Niveau',
  room: 'Pièce',
  equipment: 'Équipement',
  opening: 'Menuiserie',
  surface_total: 'Surface totale',
};
const COLORS = { confirmed: '#16a34a', to_verify: '#d97706', undetermined: '#dc2626', rejected: '#94a3b8' };

export function PlanViewerView() {
  const s = useStore();
  const p = s.project!;
  const pdfFiles = p.sourceFiles.filter((f) => f.kind === 'pdf');
  const [fileId, setFileId] = useState(pdfFiles[pdfFiles.length - 1]?.id ?? '');
  const [pageNo, setPageNo] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number; scale: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<{ id: string; doc: import('pdfjs-dist').PDFDocumentProxy } | null>(null);

  const file = pdfFiles.find((f) => f.id === fileId);
  const analysis = p.analyses.find((a) => a.fileId === fileId);
  const pages = analysis?.pages ?? [];
  const pageInfo = pages.find((x) => x.number === pageNo);
  const elements = useMemo(() => p.elements.filter((e) => e.source.fileId === fileId && e.source.page === pageNo), [p.elements, fileId, pageNo]);

  useEffect(() => {
    if (!fileId && pdfFiles.length) setFileId(pdfFiles[pdfFiles.length - 1].id);
  }, [pdfFiles, fileId]);

  // Chargement et rendu de la page.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!file) return;
      setError(null);
      try {
        const { pdfjs } = await import('../pdfjs');
        if (docRef.current?.id !== file.id) {
          let bytes = pdfCache.get(file.id);
          if (!bytes && file.storedPath && s.folder) {
            bytes = await api.readProjectFile(s.folder, file.storedPath);
            pdfCache.set(file.id, bytes);
          }
          if (!bytes) throw new Error('Le fichier PDF n’est pas disponible dans cette session : réimportez-le pour afficher l’aperçu.');
          const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
          docRef.current = { id: file.id, doc };
        }
        const doc = docRef.current!.doc;
        const page = await doc.getPage(Math.min(pageNo, doc.numPages));
        const base = page.getViewport({ scale: 1 });
        const avail = (wrapRef.current?.clientWidth ?? 900) - 24;
        const scale = (avail / base.width) * zoom;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(vp.width * ratio);
        canvas.height = Math.floor(vp.height * ratio);
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) setSize({ w: vp.width, h: vp.height, scale });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, pageNo, zoom, s.folder]);

  useEffect(() => {
    if (s.focusLineId && p.elements.some((e) => e.id === s.focusLineId)) {
      const e = p.elements.find((x) => x.id === s.focusLineId)!;
      setFileId(e.source.fileId);
      setPageNo(e.source.page ?? 1);
      setSelected(e.id);
    }
  }, [s.focusLineId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pdfFiles.length) {
    return (
      <div className="empty">
        <h2>Aucun plan PDF</h2>
        <p>Importez les plans du projet (PDF) pour les analyser et les afficher ici.</p>
        <button className="btn primary" onClick={() => s.go('import')}>Importer un plan</button>
      </div>
    );
  }

  const sel = p.elements.find((e) => e.id === selected);
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <h1 className="title" style={{ margin: 0 }}>Aperçu des plans</h1>
        <span className="spacer" />
        <select className="in" value={fileId} onChange={(e) => { setFileId(e.target.value); setPageNo(1); setSelected(null); }}>
          {pdfFiles.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="btn sm" disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)}><ChevronLeft size={14} /></button>
        <span className="small">Page {pageNo} / {pages.length || '?'}</span>
        <button className="btn sm" disabled={pageNo >= pages.length} onClick={() => setPageNo(pageNo + 1)}><ChevronRight size={14} /></button>
        <button className="btn sm" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}><ZoomOut size={14} /></button>
        <span className="small">{Math.round(zoom * 100)} %</span>
        <button className="btn sm" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}><ZoomIn size={14} /></button>
      </div>
      {pageInfo && (
        <p className="subtitle">
          {PAGE_KIND[pageInfo.kind]}{pageInfo.title ? ` — ${pageInfo.title}` : ''} · niveau : {pageInfo.level ?? 'non déterminé'} · échelle : {pageInfo.scale ? `1/${pageInfo.scale}` : 'non déterminée'}
          {pageInfo.scanned && <b style={{ color: 'var(--bad)' }}> · page scannée : contenu non lu (OCR prévu)</b>}
        </p>
      )}
      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', alignItems: 'start' }}>
        <div ref={wrapRef} className="panel" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)', padding: 12 }}>
          {error ? (
            <div className="empty">{error}</div>
          ) : (
            <div style={{ position: 'relative', width: size?.w, height: size?.h }}>
              <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 0 0 1px var(--line)' }} />
              {size &&
                elements.map((e) => {
                  const [x, y, w, h] = e.source.bbox ?? [0, 0, 0, 0];
                  const st = effectiveStatus(e);
                  return (
                    <button
                      key={e.id}
                      title={`${KIND_LABEL[e.kind]} : ${e.name}`}
                      onClick={() => setSelected(e.id)}
                      style={{
                        position: 'absolute',
                        left: x * size.scale - 3,
                        top: y * size.scale - 3,
                        width: w * size.scale + 6,
                        height: h * size.scale + 6,
                        border: `2px solid ${COLORS[st]}`,
                        background: selected === e.id ? `${COLORS[st]}33` : 'transparent',
                        borderRadius: 3,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  );
                })}
            </div>
          )}
        </div>
        <div>
          {sel && <ElementCard e={sel} onClose={() => setSelected(null)} />}
          <Panel title={`Éléments de la page (${elements.length})`} flush>
            <div style={{ maxHeight: sel ? 300 : 'calc(100vh - 290px)', overflow: 'auto' }}>
              <table className="t">
                <tbody>
                  {elements.map((e) => {
                    const st = effectiveStatus(e);
                    return (
                      <tr key={e.id} className={selected === e.id ? 'sel' : ''} style={{ cursor: 'pointer', opacity: st === 'rejected' ? 0.5 : 1 }} onClick={() => setSelected(e.id)}>
                        <td className="small muted">{KIND_LABEL[e.kind]}</td>
                        <td>{e.name}<div className="small muted">{e.category}</div></td>
                        <td className="n small">{e.props.surface && typeof e.props.surface.value === 'number' ? `${formatNumber(e.props.surface.value)} m²` : ''}</td>
                        <td>{st === 'rejected' ? <span className="badge grey">Rejeté</span> : <StatusBadge status={st} short />}</td>
                      </tr>
                    );
                  })}
                  {elements.length === 0 && <tr><td className="empty">Aucun élément détecté sur cette page.</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="small muted">Cadres : <span style={{ color: COLORS.confirmed }}>■ confirmé</span> · <span style={{ color: COLORS.to_verify }}>■ à vérifier</span> · <span style={{ color: COLORS.undetermined }}>■ information manquante</span> · <span style={{ color: COLORS.rejected }}>■ rejeté</span></p>
        </div>
      </div>
    </div>
  );
}

const PROP_LABEL: Record<string, string> = { surface: 'Surface', largeur: 'Largeur', hauteur: 'Hauteur', code: 'Repère' };

export function ElementCard({ e, onClose }: { e: BuildingElement; onClose?: () => void }) {
  const s = useStore();
  const st = effectiveStatus(e);
  return (
    <Panel
      title={<>{KIND_LABEL[e.kind]} : {e.name}</>}
      actions={onClose && <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={15} /></button>}
    >
      <dl className="kv">
        <dt>État</dt><dd>{st === 'rejected' ? <span className="badge grey">Rejeté</span> : <StatusBadge status={st} />}</dd>
        <dt>Catégorie</dt>
        <dd><input className="in" style={{ width: '100%' }} defaultValue={e.category} key={e.id + e.category} onBlur={(ev) => s.update((p) => correctElement(p, e.id, 'category', ev.target.value))} /></dd>
        <dt>Niveau</dt>
        <dd><input className="in" style={{ width: '100%' }} defaultValue={e.level ?? ''} key={e.id + (e.level ?? '')} placeholder="non déterminé" onBlur={(ev) => s.update((p) => correctElement(p, e.id, 'level', ev.target.value))} /></dd>
        {Object.entries(e.props).map(([k, v]) => (
          <FragmentProp key={k} label={PROP_LABEL[k] ?? k} id={e.id} prop={k} value={v.value} unit={v.unit} status={v.status} note={v.note} />
        ))}
        <dt>Source</dt>
        <dd className="small">{e.source.fileName}, page {e.source.page}<br /><span className="mono">« {e.source.text} »</span></dd>
        {e.note && <><dt>Remarque</dt><dd className="small">{e.note}</dd></>}
      </dl>
      <div className="row" style={{ marginTop: 8 }}>
        {st !== 'rejected' ? (
          <>
            <button className="btn sm primary" onClick={() => s.update((p) => acceptElement(p, e.id))}><Check size={12} />Valider</button>
            <button className="btn sm danger" onClick={() => s.update((p) => rejectElement(p, e.id))}><X size={12} />Rejeter</button>
          </>
        ) : (
          <button className="btn sm" onClick={() => s.update((p) => restoreElement(p, e.id))}><RotateCcw size={12} />Rétablir</button>
        )}
      </div>
      {e.edits.length > 0 && (
        <div className="small" style={{ marginTop: 8 }}>
          <b>Corrections :</b>
          {e.edits.map((x, i) => <div key={i} className="muted">{new Date(x.at).toLocaleString('fr-FR')} — {x.prop} : {String(x.before ?? '—')} → {String(x.after ?? '—')}</div>)}
        </div>
      )}
    </Panel>
  );
}

function FragmentProp(props: { label: string; id: string; prop: string; value: number | string | null; unit?: string; status: 'confirmed' | 'to_verify' | 'undetermined'; note?: string }) {
  const s = useStore();
  const shown = props.value === null ? '' : typeof props.value === 'number' ? String(props.value).replace('.', ',') : props.value;
  return (
    <>
      <dt>{props.label}</dt>
      <dd>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <input className="in" style={{ width: 90 }} defaultValue={shown} key={props.id + props.prop + shown} placeholder="—"
            onBlur={(ev) => ev.target.value !== shown && s.update((p) => correctElement(p, props.id, props.prop, ev.target.value))} />
          <span className="small">{props.unit}</span>
          <StatusBadge status={props.status} short />
        </div>
        {props.note && <div className="small muted">{props.note}</div>}
      </dd>
    </>
  );
}
