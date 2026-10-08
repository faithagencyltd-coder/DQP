import { CheckCheck, ChevronDown, ChevronRight, Eraser, FileUp, Paperclip, RotateCcw, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatMoney, formatNumber } from '../../core/format';
import { applyImport, applyPlanImport, FORMATS, formatOf, type ImportProgress, type PlanImport } from '../../core/import';
import { runDqeAnalysis, runPlanAnalysis } from '../services/analysis';
import { AnalysisSteps, progressPct } from '../features/import/AnalysisProgress';
import type { ImportResult } from '../../core/import/dqe-parser';
import { newId, nowIso } from '../../core/format';
import { replaceProject } from '../../core/project';
import { computeProject } from '../../core/dqe';
import type { SourceFile } from '../../core/types';
import type { PickedFile } from '../../shared/api';
import { api } from '../services/api';
import { INFO_LABEL, Modal, Panel, SeverityBadge, StatusBadge } from '../ds/legacy';
import { Button, Card, cx, IconButton, ProgressBar, Spinner } from '../ds/primitives';
import { useStore } from '../stores/app-store';

type Pending =
  | { type: 'dqe'; picked: PickedFile; file: SourceFile; result: ImportResult }
  | { type: 'plan'; picked: PickedFile; file: SourceFile; plan: PlanImport };

export type ItemStatus = 'waiting' | 'analysing' | 'ready' | 'importing' | 'imported' | 'unsupported' | 'error' | 'attached';

/** Un fichier de la file d'import (§26) : son état réel, sa progression, son résultat, ses erreurs. */
export interface QueueItem {
  id: string;
  picked: PickedFile;
  status: ItemStatus;
  events: ImportProgress[];
  started?: number;
  ended?: number;
  pending?: Pending;
  summary?: string;
  error?: string;
  canAttach?: boolean;
  /** Même nom et même taille qu'un fichier déjà dans le projet ou dans la file. */
  duplicate?: boolean;
  /** Aperçu fermé par l'utilisateur : ne pas le rouvrir automatiquement. */
  deferred?: boolean;
}

const ALL_EXT = FORMATS.flatMap((f) => f.info.support === 'unsupported' ? [] : f.ext);
const FINISHED: ItemStatus[] = ['imported', 'attached', 'unsupported', 'error'];

export function useImporter() {
  const s = useStore();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const running = useRef(false);

  const patch = useCallback((id: string, p: Partial<QueueItem> | ((it: QueueItem) => Partial<QueueItem>)) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...(typeof p === 'function' ? p(it) : p) } : it)));
  }, []);

  /** Ajoute des fichiers à la file. Les formats non analysables sont signalés tout de suite. */
  const add = useCallback(
    (files: PickedFile[]) => {
      if (!s.project || !files.length) return;
      const known = s.project.sourceFiles;
      setItems((list) => [
        ...list,
        ...files.map((picked, i): QueueItem => {
          const fmt = formatOf(picked.name);
          const same = (n: string, size: number) => n === picked.name && size === picked.bytes.byteLength;
          const duplicate = known.some((f) => same(f.name, f.size)) || list.some((it) => same(it.picked.name, it.picked.bytes.byteLength)) || files.slice(0, i).some((f) => same(f.name, f.bytes.byteLength));
          const base = { id: newId('q'), picked, events: [], duplicate };
          if (fmt.support !== 'supported') return { ...base, status: 'unsupported', error: `${fmt.label} — ${fmt.explanation}`, canAttach: fmt.support === 'planned' };
          return { ...base, status: 'waiting' };
        }),
      ]);
      if (s.view !== 'import') s.go('import');
    },
    [s],
  );

  // Analyse séquentielle : un fichier à la fois (Excel dans un worker, PDF dans celui de pdf.js).
  useEffect(() => {
    if (running.current) return;
    const it = items.find((x) => x.status === 'waiting');
    if (!it) return;
    running.current = true;
    const { picked } = it;
    const kind = formatOf(picked.name).kind === 'pdf' ? 'plan' : 'dqe';
    patch(it.id, { status: 'analysing', started: Date.now(), events: [] });
    const onProgress = (ev: ImportProgress) => patch(it.id, (x) => ({ events: [...x.events, ev] }));
    void (async () => {
      try {
        if (kind === 'plan') {
          const { file, plan } = await runPlanAnalysis(picked.name, picked.bytes, onProgress);
          const pages = plan.analysis.pages ?? [];
          const scanned = pages.filter((x) => x.scanned).length;
          patch(it.id, {
            status: 'ready', ended: Date.now(), pending: { type: 'plan', picked, file, plan },
            summary: `${pages.length} page(s) · ${plan.elements.length} élément(s)${scanned ? ` · ${scanned} page(s) scannée(s) non lue(s)` : ''}`,
          });
        } else {
          const { file, result } = await runDqeAnalysis(picked.name, picked.bytes, onProgress);
          const tmp = { lots: result.lots, settings: { currency: 'FCFA', vatRate: 0, roundAmounts: true } } as Parameters<typeof computeProject>[0];
          const st = computeProject(tmp).status;
          patch(it.id, {
            status: 'ready', ended: Date.now(), pending: { type: 'dqe', picked, file, result },
            summary: `${result.analysis.stats.lines} ligne(s) · ${result.lots.length} lot(s) · 🟢 ${st.confirmed} 🟠 ${st.to_verify} 🔴 ${st.undetermined}`,
          });
        }
      } catch (e) {
        patch(it.id, { status: 'error', ended: Date.now(), error: (e as Error).message });
      } finally {
        running.current = false;
        setItems((l) => [...l]);
      }
    })();
  }, [items, patch]);

  const openItem = useCallback(
    (id: string) => {
      setMode(s.project && s.project.lots.length > 0 ? 'append' : 'replace');
      setOpenId(id);
    },
    [s.project],
  );

  // Dès qu'un fichier est analysé, son aperçu s'ouvre (sauf s'il a été remis à plus tard).
  useEffect(() => {
    if (openId) return;
    const it = items.find((x) => x.status === 'ready' && !x.deferred);
    if (it) openItem(it.id);
  }, [items, openId, openItem]);

  const importItem = useCallback(
    async (it: QueueItem, m: 'replace' | 'append' | 'auto'): Promise<boolean> => {
      const pending = it.pending;
      if (!pending || !s.folder) return false;
      const { picked, file } = pending;
      patch(it.id, { status: 'importing' });
      try {
        const stored = await api.storeSourceFile(s.folder, picked.name, picked.bytes);
        const f = { ...file, storedPath: stored };
        const analysis = pending.type === 'dqe' ? pending.result.analysis : pending.plan.analysis;
        if (pending.type === 'dqe') {
          const result = pending.result;
          s.update((p) => applyImport(p, f, result, m === 'auto' ? (p.lots.length ? 'append' : 'replace') : m));
          s.toast('success', `${picked.name} importé : ${result.analysis.stats.lines} lignes dans ${result.lots.length} lots.`);
        } else {
          const plan = pending.plan;
          const { pdfCache } = await import('../services/pdfjs');
          pdfCache.set(f.id, picked.bytes);
          s.update((p) => applyPlanImport(p, f, plan));
          s.toast('success', `${picked.name} importé : ${plan.analysis.stats.pages} page(s), ${plan.elements.length} élément(s) détecté(s).`);
        }
        if (api.platform === 'electron') {
          const json = new TextEncoder().encode(JSON.stringify(analysis, null, 1));
          await api.writeProjectFile(s.folder, 'Analyse', `analyse_${picked.name}.json`, json);
        }
        // L'aperçu (volumineux) n'est plus utile une fois le fichier importé.
        patch(it.id, { status: 'imported', pending: undefined });
        return true;
      } catch (e) {
        patch(it.id, { status: 'error', error: `Import impossible : ${(e as Error).message}` });
        s.toast('error', `Import impossible : ${(e as Error).message}`);
        return false;
      }
    },
    [s, patch],
  );

  /** Après un import : rester sur la file s'il reste du travail, sinon aller au résultat. */
  const afterImport = (kind: 'dqe' | 'plan', exceptId: string) => {
    const left = items.some((x) => x.id !== exceptId && (x.status === 'waiting' || x.status === 'analysing' || (x.status === 'ready' && !x.deferred)));
    if (!left) s.go(kind === 'plan' ? 'viewer' : 'analysis');
  };

  const confirm = async () => {
    const it = items.find((x) => x.id === openId);
    setOpenId(null);
    if (!it?.pending) return;
    const kind = it.pending.type;
    if (await importItem(it, mode)) afterImport(kind, it.id);
  };

  const importAll = async () => {
    const ready = items.filter((x) => x.status === 'ready');
    let last: 'dqe' | 'plan' = 'dqe';
    for (const it of ready) {
      if (it.pending) last = it.pending.type;
      await importItem(it, 'auto');
    }
    if (!items.some((x) => x.status === 'waiting' || x.status === 'analysing')) s.go(last === 'plan' ? 'viewer' : 'analysis');
  };

  const attach = async (it: QueueItem) => {
    if (!s.folder) return;
    const { picked } = it;
    const stored = await api.storeSourceFile(s.folder, picked.name, picked.bytes);
    const fmt = formatOf(picked.name);
    const file: SourceFile = { id: newId('f'), name: picked.name, kind: fmt.kind, size: picked.bytes.byteLength, importedAt: nowIso(), storedPath: stored };
    s.update((p) => replaceProject(p, 'Fichier joint sans analyse', `${picked.name} (${fmt.label} — ${fmt.phase ?? 'non pris en charge'})`, (x) => void x.sourceFiles.push(file)));
    patch(it.id, { status: 'attached' });
    s.toast('info', `${picked.name} est joint au projet. Il sera analysable quand le module ${fmt.label} sera disponible (${fmt.phase}).`);
  };

  const remove = (id: string) => setItems((l) => l.filter((x) => x.id !== id || x.status === 'analysing' || x.status === 'importing'));
  const clearFinished = () => setItems((l) => l.filter((x) => !FINISHED.includes(x.status)));
  const retry = (id: string) => patch(id, { status: 'waiting', events: [], error: undefined, ended: undefined });
  const defer = () => {
    if (openId) patch(openId, { deferred: true });
    setOpenId(null);
  };

  const pick = useCallback(async () => {
    if (!s.project) return;
    const files = await api.pickFiles(
      [
        { name: 'Fichiers de projet', extensions: [...ALL_EXT] },
        { name: 'Analysés : Excel, CSV, PDF', extensions: ['xlsx', 'xlsm', 'csv', 'pdf'] },
      ],
      true,
    );
    add(files);
  }, [s.project, add]);

  const open = items.find((x) => x.id === openId);
  const others = items.filter((x) => x.id !== openId && (x.status === 'waiting' || x.status === 'analysing' || x.status === 'ready')).length;
  let dialog: ReactNode = null;
  if (open?.pending?.type === 'dqe')
    dialog = <PreviewDialog pending={open.pending} mode={mode} setMode={setMode} hasLots={!!s.project && s.project.lots.length > 0} remaining={others} duplicate={open.duplicate} onCancel={defer} onConfirm={() => void confirm()} />;
  else if (open?.pending?.type === 'plan')
    dialog = <PlanPreviewDialog file={open.pending.file} plan={open.pending.plan} remaining={others} duplicate={open.duplicate} onCancel={defer} onConfirm={() => void confirm()} />;

  const busy = items.some((x) => x.status === 'analysing' || x.status === 'importing');
  return { pick, add, items, busy, dialog, openItem, importAll, attach, remove, clearFinished, retry };
}

export type Importer = ReturnType<typeof useImporter>;

function PreviewDialog(props: { pending: Extract<Pending, { type: 'dqe' }>; mode: 'replace' | 'append'; setMode: (m: 'replace' | 'append') => void; hasLots: boolean; remaining: number; duplicate?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { file, result } = props.pending;
  const a = result.analysis;
  const total = useMemo(() => {
    const tmp = { lots: result.lots, settings: { currency: 'FCFA', vatRate: 0, roundAmounts: true } } as Parameters<typeof computeProject>[0];
    return computeProject(tmp);
  }, [result]);
  const bySev = (sev: string) => a.fileAlerts.filter((x) => x.severity === sev).length;
  return (
    <Modal
      wide
      title={`03 — Analyse de ${file.name}`}
      onClose={props.onCancel}
      footer={
        <>
          {props.hasLots && (
            <select className="in" value={props.mode} onChange={(e) => props.setMode(e.target.value as 'replace' | 'append')} style={{ marginRight: 'auto' }}>
              <option value="append">Ajouter ces lots au DQE existant</option>
              <option value="replace">Remplacer le DQE existant</option>
            </select>
          )}
          {!props.hasLots && props.remaining > 0 && <span className="muted small" style={{ marginRight: 'auto' }}>{props.remaining} autre(s) fichier(s) dans la file</span>}
          <button className="btn" onClick={props.onCancel}>Plus tard</button>
          <button className="btn primary" onClick={props.onConfirm}>Importer dans le projet</button>
        </>
      }
    >
      {props.duplicate && <div className="notice warn" style={{ marginTop: 0 }}>Un fichier du même nom et de la même taille est déjà dans le projet ou dans la file : l’importer à nouveau en mode « Ajouter » doublerait ses lignes.</div>}
      <div className="kpis">
        <div className="kpi"><div className="v">{a.stats.lots}</div><div className="l">lots</div></div>
        <div className="kpi"><div className="v">{a.stats.lines}</div><div className="l">lignes</div></div>
        <div className="kpi"><div className="v">{a.stats.formulas}</div><div className="l">formules lues</div></div>
        <div className="kpi ok"><div className="v">🟢 {total.status.confirmed}</div><div className="l">confirmées</div></div>
        <div className="kpi warn"><div className="v">🟠 {total.status.to_verify}</div><div className="l">à vérifier</div></div>
        <div className="kpi bad"><div className="v">🔴 {total.status.undetermined}</div><div className="l">non déterminées</div></div>
      </div>
      <div className="grid2">
        <Panel title="Lots détectés" flush>
          <table className="t">
            <thead><tr><th>Lot</th><th className="n">Lignes</th><th className="n">Total DQP</th><th className="n">Total fichier</th></tr></thead>
            <tbody>
              {result.lots.map((lot) => {
                const t = total.lots.get(lot.id)!;
                const diff = lot.sourceTotal?.value != null && Math.abs(lot.sourceTotal.value - t.amount) >= 1;
                return (
                  <tr key={lot.id}>
                    <td>{lot.code} {lot.name}</td>
                    <td className="n">{t.lines}</td>
                    <td className="n">{formatMoney(t.amount)}</td>
                    <td className={`n ${diff ? 'bad' : ''}`} style={diff ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{lot.sourceTotal ? formatMoney(lot.sourceTotal.value) : '—'}</td>
                  </tr>
                );
              })}
              <tr>
                <td><b>Total</b></td><td className="n"><b>{total.lineCount}</b></td><td className="n"><b>{formatMoney(total.totalHT)}</b></td>
                <td className="n"><b>{a.sourceGrandTotal ? formatMoney(a.sourceGrandTotal.value) : '—'}</b></td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <Panel title="Informations détectées" flush>
          <table className="t">
            <tbody>
              {a.detected.map((d, i) => (
                <tr key={i}>
                  <td className="muted small">{INFO_LABEL[d.key]}</td>
                  <td>{d.value}{d.note && <div className="muted small">{d.note}</div>}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="mono small">{d.source?.cell}</td>
                </tr>
              ))}
              {a.detected.length === 0 && <tr><td className="muted">Aucune information de projet trouvée.</td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>
      <Panel title={`Contrôles du fichier — ${bySev('error')} erreur(s), ${bySev('warning')} à vérifier, ${bySev('info')} information(s)`} flush>
        {a.fileAlerts.map((x) => (
          <div key={x.id} className="alert-item">
            <SeverityBadge severity={x.severity} />
            <div className="msg small">{x.message}</div>
          </div>
        ))}
        {a.fileAlerts.length === 0 && <div className="empty">Aucune anomalie détectée dans le fichier.</div>}
      </Panel>
    </Modal>
  );
}

const PAGE_KIND: Record<string, string> = {
  plan: 'Plan', coupe: 'Coupe', facade: 'Façade', masse: 'Plan de masse', toiture: 'Toiture', fondation: 'Fondations',
  electricite: 'Électricité', plomberie: 'Plomberie', structure: 'Structure', autre: '—',
};
export { PAGE_KIND };

function PlanPreviewDialog(props: { file: SourceFile; plan: PlanImport; remaining: number; duplicate?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { analysis, elements } = props.plan;
  const count = (k: string) => elements.filter((e) => e.kind === k).length;
  const rooms = elements.filter((e) => e.kind === 'room');
  return (
    <Modal
      wide
      title={`03 — Analyse du plan ${props.file.name}`}
      onClose={props.onCancel}
      footer={
        <>
          {props.remaining > 0 && <span className="muted small" style={{ marginRight: 'auto' }}>{props.remaining} autre(s) fichier(s) dans la file</span>}
          <button className="btn" onClick={props.onCancel}>Plus tard</button>
          <button className="btn primary" onClick={props.onConfirm}>Importer dans le projet</button>
        </>
      }
    >
      {props.duplicate && <div className="notice warn" style={{ marginTop: 0 }}>Un fichier du même nom et de la même taille est déjà dans le projet ou dans la file : ses éléments seraient détectés deux fois.</div>}
      <div className="kpis">
        <div className="kpi"><div className="v">{analysis.pages?.length ?? 0}</div><div className="l">page(s)</div></div>
        <div className="kpi"><div className="v">{count('room')}</div><div className="l">pièce(s)</div></div>
        <div className="kpi"><div className="v">{rooms.filter((r) => typeof r.props.surface?.value === 'number').length}</div><div className="l">surface(s) lue(s)</div></div>
        <div className="kpi"><div className="v">{count('opening')}</div><div className="l">repère(s) de menuiserie</div></div>
        <div className="kpi"><div className="v">{count('equipment')}</div><div className="l">équipement(s) annoté(s)</div></div>
      </div>
      <div className="grid2">
        <Panel title="Pages" flush>
          <table className="t">
            <thead><tr><th>Page</th><th>Type</th><th>Titre</th><th>Niveau</th><th>Échelle</th><th>Contenu</th></tr></thead>
            <tbody>
              {(analysis.pages ?? []).map((pg) => (
                <tr key={pg.number}>
                  <td className="c">{pg.number}</td>
                  <td>{PAGE_KIND[pg.kind]}</td>
                  <td className="small">{pg.title ?? <span className="muted">—</span>}</td>
                  <td>{pg.level ?? <span className="muted">non déterminé</span>}</td>
                  <td>{pg.scale ? `1/${pg.scale}` : <span className="muted">—</span>}</td>
                  <td className="small">{pg.scanned ? <span className="badge bad">🔴 scannée, non lue</span> : `${pg.textLines} textes · ${pg.dimensions} cote(s)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Pièces et surfaces" flush>
          <table className="t">
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}<div className="small muted">{r.category}{r.level ? ` · ${r.level}` : ''}</div></td>
                  <td className="n">{typeof r.props.surface.value === 'number' ? `${String(r.props.surface.value).replace('.', ',')} m²` : '—'}</td>
                  <td><StatusBadge status={r.props.surface.status} /></td>
                </tr>
              ))}
              {rooms.length === 0 && <tr><td className="muted">Aucune pièce reconnue.</td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>
      {analysis.detected.length > 0 && (
        <Panel title="Cartouche et informations du projet" flush>
          <table className="t">
            <tbody>
              {analysis.detected.map((d, i) => (
                <tr key={i}><td className="muted small" style={{ width: 140 }}>{INFO_LABEL[d.key]}</td><td>{d.value}</td><td><StatusBadge status={d.status} /></td><td className="small muted">page {d.source?.page}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Panel title={`Contrôles (${analysis.fileAlerts.length})`} flush>
        {analysis.fileAlerts.map((x) => (
          <div key={x.id} className="alert-item"><SeverityBadge severity={x.severity} /><div className="msg small">{x.message}</div></div>
        ))}
        {analysis.fileAlerts.length === 0 && <div className="empty">Aucune remarque.</div>}
      </Panel>
    </Modal>
  );
}

export function ImportView({ importer }: { importer: Importer }) {
  const s = useStore();
  const [over, setOver] = useState(false);
  const p = s.project!;
  return (
    <div style={{ maxWidth: 1240 }}>
      <h1 className="title">02 — Importer</h1>
      <p className="subtitle">Déposez les fichiers du projet, un ou plusieurs à la fois. DQP vérifie le format réel de chaque fichier (pas seulement son extension) et les analyse l’un après l’autre.</p>
      <div
        className={cx('drop', over && 'over', importer.items.length > 0 && '!py-4')}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setOver(false);
          const files = [...e.dataTransfer.files];
          importer.add(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
        }}
      >
        <div className={cx('flex items-center justify-center gap-4', importer.items.length ? 'flex-row' : 'flex-col')}>
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-brand-soft text-brand-2"><FileUp size={24} /></div>
          <div className={importer.items.length ? 'text-left' : ''}>
            <p className="m-0 text-[13.5px] text-fg"><b>Glissez un ou plusieurs fichiers ici</b></p>
            <p className="m-0 mt-0.5 text-[12px] text-muted">Excel (.xlsx, .xlsm), CSV, PDF vectoriel · les autres formats peuvent être joints au projet sans analyse</p>
          </div>
          <Button variant="primary" icon={<FileUp size={14} />} onClick={() => void importer.pick()}>Choisir un fichier…</Button>
        </div>
      </div>

      {importer.items.length > 0 && <ImportQueue importer={importer} />}

      <div className="grid2" style={{ marginTop: 14 }}>
        <Panel title="Formats et état de prise en charge" flush>
          <table className="t">
            <thead><tr><th>Format</th><th>Extensions</th><th>État</th><th>Détail</th></tr></thead>
            <tbody>
              {FORMATS.map((f) => (
                <tr key={f.info.label}>
                  <td><b>{f.info.label}</b></td>
                  <td className="mono small">{f.ext.map((e) => '.' + e).join(' ')}</td>
                  <td>
                    {f.info.support === 'supported' && <span className="badge ok">Analysé</span>}
                    {f.info.support === 'planned' && <span className="badge grey">{f.info.phase}</span>}
                    {f.info.support === 'unsupported' && <span className="badge bad">Non lu</span>}
                  </td>
                  <td className="small">{f.info.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title={`Fichiers du projet (${p.sourceFiles.length})`} flush>
          <table className="t">
            <thead><tr><th>Fichier</th><th>Format</th><th>Statut</th><th>Importé le</th></tr></thead>
            <tbody>
              {p.sourceFiles.map((f) => {
                const analysed = p.analyses.some((a) => a.fileId === f.id);
                return (
                  <tr key={f.id}>
                    <td>
                      {f.storedPath && api.platform === 'electron' ? <a href="#" onClick={(e) => { e.preventDefault(); void api.openPath(f.storedPath!); }}>{f.name}</a> : f.name}
                    </td>
                    <td>{f.kind.toUpperCase()}</td>
                    <td>{analysed ? <span className="badge ok">Analysé</span> : <span className="badge grey">Joint, non analysé</span>}</td>
                    <td className="small">{new Date(f.importedAt).toLocaleString('fr-FR')}</td>
                  </tr>
                );
              })}
              {p.sourceFiles.length === 0 && <tr><td colSpan={4} className="empty">Aucun fichier.</td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="notice">
        <b>Structure attendue d’un DQE Excel ou CSV</b>
        Une ligne d’en-tête contenant au moins « Désignation » et deux colonnes parmi « Unité », « Quantité », « Prix unitaire », « Montant ». Les titres de parties
        (Bâtiment principal, Rez-de-chaussée, A - Tuyauterie…), les lignes « TOTAL » et les récapitulatifs sont reconnus automatiquement. Les formules du fichier sont
        conservées pour la traçabilité et recalculées par DQP.
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<ItemStatus, [string, string]> = {
  waiting: ['grey', 'En attente'],
  analysing: ['info', 'Analyse…'],
  ready: ['warn', 'Analysé, à importer'],
  importing: ['info', 'Import…'],
  imported: ['ok', 'Importé'],
  unsupported: ['bad', 'Non analysable'],
  error: ['bad', 'Erreur'],
  attached: ['grey', 'Joint sans analyse'],
};

function formatSize(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${formatNumber(n / 1024, 0)} Ko`;
  return `${formatNumber(n / 1024 / 1024, 1)} Mo`;
}

/** File d'import : état, progression réelle, résultat et erreurs de chaque fichier. */
function ImportQueue({ importer }: { importer: Importer }) {
  const [open, setOpen] = useState<string | null>(null);
  const { items } = importer;
  const count = (st: ItemStatus) => items.filter((x) => x.status === st).length;
  const ready = count('ready');
  const done = items.filter((x) => ['imported', 'attached', 'unsupported', 'error'].includes(x.status)).length;
  const active = items.find((x) => x.status === 'analysing');
  // Avancement global : fichiers terminés + fraction du fichier en cours d'analyse.
  const finishedOrReady = items.filter((x) => x.status !== 'waiting' && x.status !== 'analysing').length;
  const overall = Math.round(((finishedOrReady + (active ? progressPct(active.events) / 100 : 0)) / items.length) * 100);
  return (
    <Card
      className="mt-3.5"
      bodyClass="p-0"
      title={
        <span className="flex items-center gap-3">
          File d’import · {items.length} fichier(s)
          <span className="text-[11.5px] font-normal text-muted">{count('imported')} importé(s) · {ready} prêt(s) · {count('waiting') + (active ? 1 : 0)} en cours ou en attente{count('error') ? ` · ${count('error')} en erreur` : ''}{count('unsupported') ? ` · ${count('unsupported')} non analysable(s)` : ''}</span>
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          {ready > 1 && <Button size="sm" variant="primary" icon={<CheckCheck size={13} />} onClick={() => void importer.importAll()}>Importer les {ready} fichiers prêts</Button>}
          {done > 0 && <Button size="sm" icon={<Eraser size={13} />} onClick={importer.clearFinished}>Retirer les fichiers terminés</Button>}
        </div>
      }
    >
      <div className="flex items-center gap-3 border-b border-line-2 px-4 py-2">
        <ProgressBar value={overall} tone={overall === 100 ? 'ok' : 'brand'} className="h-1.5 flex-1" />
        <span className="w-12 text-right text-[12px] font-semibold tabular-nums text-fg">{overall} %</span>
      </div>
      <table className="t">
        <thead>
          <tr><th style={{ width: 24 }} /><th>Fichier</th><th>Format</th><th className="n">Taille</th><th>État</th><th style={{ width: 170 }}>Progression</th><th>Résultat</th><th>Erreurs et remarques</th><th className="n">Actions</th></tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const fmt = formatOf(it.picked.name);
            const pct = it.status === 'waiting' ? 0 : it.status === 'analysing' ? progressPct(it.events) : it.events.length ? (it.status === 'error' ? progressPct(it.events) : 100) : 0;
            const last = it.events[it.events.length - 1];
            const [tone, label] = STATUS_BADGE[it.status];
            const expandable = it.events.length > 0;
            return (
              <Fragment key={it.id}>
                <tr className={cx(expandable && 'cursor-pointer')} onClick={() => expandable && setOpen(open === it.id ? null : it.id)}>
                  <td>{expandable && (open === it.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}</td>
                  <td><b className="block max-w-[240px] truncate" title={it.picked.name}>{it.picked.name}</b></td>
                  <td className="small whitespace-nowrap">{fmt.label}</td>
                  <td className="n small whitespace-nowrap">{formatSize(it.picked.bytes.byteLength)}</td>
                  <td className="whitespace-nowrap"><span className={`badge ${tone}`}>{it.status === 'analysing' || it.status === 'importing' ? <Spinner size={10} /> : null}{label}</span></td>
                  <td>
                    {it.status === 'unsupported' || it.status === 'attached' ? (
                      <span className="small muted">—</span>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={pct} tone={it.status === 'error' ? 'bad' : pct === 100 ? 'ok' : 'brand'} className="flex-1" />
                          <span className="w-10 whitespace-nowrap text-right text-[11px] tabular-nums text-muted">{pct} %</span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted" style={{ maxWidth: 170 }}>
                          {it.status === 'waiting' ? 'en attente' : it.status === 'analysing' ? last?.label ?? 'démarrage…' : it.ended && it.started ? `analysé en ${((it.ended - it.started) / 1000).toFixed(1)} s` : ''}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="small">{it.summary ?? <span className="muted">—</span>}</td>
                  <td className="small">
                    {it.error && <div className="text-[#ff7a7a]">{it.error}</div>}
                    {it.duplicate && <div className="text-[#fbbf24]">Déjà présent (même nom, même taille)</div>}
                    {!it.error && !it.duplicate && <span className="muted">—</span>}
                  </td>
                  <td className="n" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      {it.status === 'ready' && <button className="btn sm primary" onClick={() => importer.openItem(it.id)}>Voir et importer</button>}
                      {it.status === 'unsupported' && it.canAttach && <button className="btn sm" onClick={() => void importer.attach(it)}><Paperclip size={12} />Joindre</button>}
                      {it.status === 'error' && !it.error?.startsWith('Import impossible') && <button className="btn sm" onClick={() => importer.retry(it.id)}><RotateCcw size={12} />Réessayer</button>}
                      {it.status !== 'analysing' && it.status !== 'importing' && (
                        <IconButton label="Retirer de la file" size="sm" onClick={() => importer.remove(it.id)}><X size={13} /></IconButton>
                      )}
                    </div>
                  </td>
                </tr>
                {open === it.id && (
                  <tr>
                    <td />
                    <td colSpan={8}><div className="max-w-[640px] py-1"><AnalysisSteps events={it.events} failed={it.status === 'error'} /></div></td>
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
