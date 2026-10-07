import { FileUp, Paperclip } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { formatMoney } from '../../core/format';
import { analyzeFile, applyImport, FORMATS, formatOf } from '../../core/import';
import type { ImportResult } from '../../core/import/dqe-parser';
import { newId, nowIso } from '../../core/format';
import { replaceProject } from '../../core/project';
import { computeProject } from '../../core/dqe';
import type { SourceFile } from '../../core/types';
import type { PickedFile } from '../../shared/api';
import { api } from '../browserApi';
import { INFO_LABEL, Modal, Panel, SeverityBadge, StatusBadge } from '../components/ui';
import { useStore } from '../store';

interface Pending {
  picked: PickedFile;
  file: SourceFile;
  result: ImportResult;
}

const ALL_EXT = FORMATS.flatMap((f) => f.info.support === 'unsupported' ? [] : f.ext);

export function useImporter() {
  const s = useStore();
  const [pending, setPending] = useState<Pending | null>(null);
  const [unsupported, setUnsupported] = useState<{ picked: PickedFile; message: string; canAttach: boolean } | null>(null);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [busy, setBusy] = useState(false);

  const analyze = useCallback(
    async (picked: PickedFile) => {
      const fmt = formatOf(picked.name);
      if (fmt.support !== 'supported') {
        setUnsupported({ picked, message: `${fmt.label} — ${fmt.explanation}`, canAttach: fmt.support === 'planned' });
        return;
      }
      setBusy(true);
      try {
        const { file, result } = await analyzeFile(picked.name, picked.bytes);
        setMode(s.project && s.project.lots.length > 0 ? 'append' : 'replace');
        setPending({ picked, file, result });
      } catch (e) {
        setUnsupported({ picked, message: (e as Error).message, canAttach: false });
      } finally {
        setBusy(false);
      }
    },
    [s.project],
  );

  const pick = useCallback(async () => {
    if (!s.project) return;
    const files = await api.pickFiles(
      [
        { name: 'Fichiers de projet', extensions: [...ALL_EXT] },
        { name: 'Excel / CSV (analysés)', extensions: ['xlsx', 'xlsm', 'csv'] },
      ],
      false,
    );
    if (files[0]) await analyze(files[0]);
  }, [s.project, analyze]);

  const confirm = useCallback(async () => {
    if (!pending || !s.folder) return;
    const { picked, file, result } = pending;
    setPending(null);
    try {
      const stored = await api.storeSourceFile(s.folder, picked.name, picked.bytes);
      const f = { ...file, storedPath: stored };
      s.update((p) => applyImport(p, f, result, mode));
      if (api.platform === 'electron') {
        const json = new TextEncoder().encode(JSON.stringify(result.analysis, null, 1));
        await api.writeProjectFile(s.folder, 'Analyse', `analyse_${picked.name}.json`, json);
      }
      s.toast('success', `${picked.name} importé : ${result.analysis.stats.lines} lignes dans ${result.lots.length} lots.`);
      s.go('analysis');
    } catch (e) {
      s.toast('error', `Import impossible : ${(e as Error).message}`);
    }
  }, [pending, s, mode]);

  const attach = useCallback(async () => {
    if (!unsupported || !s.folder) return;
    const { picked } = unsupported;
    setUnsupported(null);
    const stored = await api.storeSourceFile(s.folder, picked.name, picked.bytes);
    const fmt = formatOf(picked.name);
    const file: SourceFile = { id: newId('f'), name: picked.name, kind: fmt.kind, size: picked.bytes.byteLength, importedAt: nowIso(), storedPath: stored };
    s.update((p) => replaceProject(p, 'Fichier joint sans analyse', `${picked.name} (${fmt.label} — ${fmt.phase ?? 'non pris en charge'})`, (x) => void x.sourceFiles.push(file)));
    s.toast('info', `${picked.name} est joint au projet. Il sera analysable quand le module ${fmt.label} sera disponible (${fmt.phase}).`);
  }, [unsupported, s]);

  let dialog: ReactNode = null;
  if (pending) dialog = <PreviewDialog pending={pending} mode={mode} setMode={setMode} hasLots={!!s.project && s.project.lots.length > 0} onCancel={() => setPending(null)} onConfirm={() => void confirm()} />;
  else if (unsupported)
    dialog = (
      <Modal
        title={`Fichier non analysable : ${unsupported.picked.name}`}
        onClose={() => setUnsupported(null)}
        footer={
          <>
            <button className="btn" onClick={() => setUnsupported(null)}>Fermer</button>
            {unsupported.canAttach && <button className="btn primary" onClick={() => void attach()}><Paperclip size={14} />Joindre au projet sans analyse</button>}
          </>
        }
      >
        <p>{unsupported.message}</p>
        {unsupported.canAttach && (
          <p className="muted small">
            Vous pouvez joindre ce fichier au projet : il sera copié dans <span className="mono">Fichiers_sources</span> et listé avec les autres fichiers du projet, sans
            qu’aucune information n’en soit extraite pour l’instant.
          </p>
        )}
      </Modal>
    );

  return { pick, analyze, busy, dialog };
}

export type Importer = ReturnType<typeof useImporter>;

function PreviewDialog(props: { pending: Pending; mode: 'replace' | 'append'; setMode: (m: 'replace' | 'append') => void; hasLots: boolean; onCancel: () => void; onConfirm: () => void }) {
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
          <button className="btn" onClick={props.onCancel}>Annuler</button>
          <button className="btn primary" onClick={props.onConfirm}>Importer dans le projet</button>
        </>
      }
    >
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

export function ImportView({ importer }: { importer: Importer }) {
  const s = useStore();
  const [over, setOver] = useState(false);
  const p = s.project!;
  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 className="title">02 — Importer</h1>
      <p className="subtitle">Déposez les fichiers du projet. DQP vérifie le format réel de chaque fichier (pas seulement son extension).</p>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) await importer.analyze({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
        }}
      >
        <FileUp size={30} />
        <p style={{ margin: '8px 0' }}><b>Glissez un fichier ici</b> ou</p>
        <button className="btn primary" disabled={importer.busy} onClick={() => void importer.pick()}>{importer.busy ? 'Analyse en cours…' : 'Choisir un fichier…'}</button>
      </div>

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
