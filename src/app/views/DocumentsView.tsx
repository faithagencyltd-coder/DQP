import { ClipboardCheck, FileDown, FileSpreadsheet, FolderOpen, History, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { replaceProject } from '../../core/project';
import type { ProjectVersion } from '../../core/types';
import { api } from '../browserApi';
import { ConfirmDialog, Panel } from '../components/ui';
import type { Exporter } from '../exports';
import { useStore } from '../store';

export function DocumentsView({ exporter, onVersion }: { exporter: Exporter; onVersion: () => void }) {
  const s = useStore();
  const p = s.project!;
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [restore, setRestore] = useState<ProjectVersion | null>(null);
  const hasLines = (s.result?.lineCount ?? 0) > 0;

  const load = async () => s.folder && setVersions(await api.listVersions(s.folder));
  useEffect(() => void load(), [s.folder, p.journal.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h1 className="title">08 / 09 — Documents et exports</h1>
      <p className="subtitle">
        Les fichiers sont enregistrés dans le dossier du projet ({api.platform === 'electron' ? <span className="mono">{s.folder}</span> : 'téléchargements du navigateur'}).
        {api.platform === 'electron' && s.folder && (
          <> <a href="#" onClick={(e) => { e.preventDefault(); void api.openPath(s.folder!); }}>Ouvrir le dossier</a></>
        )}
      </p>
      <div className="grid3">
        <Panel title={<><FileSpreadsheet size={15} /> DQE Excel</>}>
          <p className="small muted">Récapitulatif, DQE complet avec formules (Quantité × PU, sous-totaux, totaux), montants en lettres, feuille de traçabilité et feuille des contrôles.</p>
          <button className="btn primary" disabled={!hasLines || exporter.busy} onClick={() => void exporter.run('xlsx')}>Exporter (.xlsx)</button>
        </Panel>
        <Panel title={<><FileDown size={15} /> DQE PDF</>}>
          <p className="small muted">Présentation professionnelle A4 : page de garde, lots, sous-totaux, récapitulatif général et montant en lettres.</p>
          <button className="btn primary" disabled={!hasLines || exporter.busy} onClick={() => void exporter.run('pdf-dqe')}>Exporter (.pdf)</button>
        </Panel>
        <Panel title={<><ClipboardCheck size={15} /> Rapport d’analyse</>}>
          <p className="small muted">Informations générales, fichiers analysés, éléments, quantités, contrôle des totaux, alertes, estimation, date et version du logiciel.</p>
          <button className="btn primary" disabled={exporter.busy} onClick={() => void exporter.run('pdf-report')}>Générer (.pdf)</button>
        </Panel>
      </div>

      {exporter.docs.length > 0 && (
        <Panel title="Documents produits pendant cette session" flush>
          <table className="t">
            <tbody>
              {exporter.docs.map((d) => (
                <tr key={d.path + d.at}>
                  <td>{d.label}</td>
                  <td className="mono small">{d.path}</td>
                  <td className="small">{new Date(d.at).toLocaleTimeString('fr-FR')}</td>
                  <td className="n">
                    {api.platform === 'electron' && (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm" onClick={() => void api.openPath(d.path)}>Ouvrir</button>
                        <button className="btn sm" onClick={() => void api.showInFolder(d.path)}><FolderOpen size={12} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="grid2">
        <Panel title={`Versions (${versions.length})`} actions={<button className="btn sm" onClick={onVersion}><History size={13} />Créer une version</button>} flush>
          <table className="t">
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{v.label}</td>
                  <td className="small muted">{new Date(v.createdAt).toLocaleString('fr-FR')}</td>
                  <td className="n"><button className="btn sm" onClick={() => setRestore(v)}><RotateCcw size={12} />Restaurer</button></td>
                </tr>
              ))}
              {versions.length === 0 && <tr><td className="empty">Aucune version. Une version fige l’état du projet (Ctrl+S).</td></tr>}
            </tbody>
          </table>
        </Panel>
        <Panel title={`Journal des modifications (${p.journal.length})`} flush>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <table className="t">
              <tbody>
                {[...p.journal].reverse().slice(0, 400).map((j, i) => (
                  <tr key={i}>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(j.at).toLocaleString('fr-FR')}</td>
                    <td className="small"><b>{j.action}</b>{j.detail && <div className="muted">{j.detail}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {restore && (
        <ConfirmDialog title="Restaurer cette version ?" confirm="Restaurer" onCancel={() => setRestore(null)}
          onConfirm={async () => {
            const v = restore;
            setRestore(null);
            try {
              const old = await api.readVersion(s.folder!, v.id);
              // L'état actuel reste récupérable par Annuler ; le journal garde toute l'histoire.
              s.update((cur) => replaceProject(cur, 'Version restaurée', v.label, (x) => {
                x.info = old.info;
                x.settings = old.settings;
                x.lots = old.lots;
                x.sourceFiles = old.sourceFiles;
                x.analyses = old.analyses;
              }));
              s.toast('success', `Version « ${v.label} » restaurée.`, { label: 'Annuler', run: s.undo });
            } catch (e) {
              s.toast('error', `Restauration impossible : ${(e as Error).message}`);
            }
          }}>
          Le projet reprendra l’état de la version « {restore.label} ». L’état actuel reste récupérable avec Annuler (Ctrl+Z) et le journal conserve tout l’historique.
        </ConfirmDialog>
      )}
    </div>
  );
}
