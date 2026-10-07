import { FolderOpen, FolderPlus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatMoney } from '../../core/format';
import type { ProjectSummary } from '../../core/types';
import { api } from '../browserApi';
import { ConfirmDialog, Panel } from '../components/ui';
import { useStore } from '../store';

export function ProjectsView({ onNew }: { onNew: () => void }) {
  const s = useStore();
  const [toTrash, setToTrash] = useState<ProjectSummary | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => void s.refreshProjects(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = s.projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h1 className="title">Projets</h1>
      <p className="subtitle">Dossier des projets : <span className="mono">{s.settings?.projectsRoot}</span></p>
      <Panel
        title={`${s.projects.length} projet(s)`}
        actions={
          <div className="row">
            <input className="in" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" onClick={() => void s.refreshProjects()}><RefreshCw size={14} />Actualiser</button>
            <button className="btn primary" onClick={onNew}><FolderPlus size={14} />Nouveau projet</button>
          </div>
        }
        flush
      >
        <table className="t">
          <thead><tr><th>Projet</th><th className="n">Lignes</th><th className="n">Total HT</th><th>Dernière modification</th><th>Dossier</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.folder} className={s.folder === p.folder ? 'sel' : ''}>
                <td><b>{p.name}</b>{s.folder === p.folder && <span className="badge info" style={{ marginLeft: 6 }}>ouvert</span>}</td>
                <td className="n">{p.lines}</td>
                <td className="n">{formatMoney(p.total)}</td>
                <td>{new Date(p.updatedAt).toLocaleString('fr-FR')}</td>
                <td className="mono small ellipsis" style={{ maxWidth: 280 }} title={p.folder}>{p.folder}</td>
                <td className="n">
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm primary" onClick={() => void s.openProject(p.folder)}>Ouvrir</button>
                    {api.platform === 'electron' && <button className="btn sm" title="Afficher le dossier" onClick={() => void api.openPath(p.folder)}><FolderOpen size={13} /></button>}
                    <button className="btn sm danger" title="Mettre à la corbeille" onClick={() => setToTrash(p)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="empty">Aucun projet.</td></tr>}
          </tbody>
        </table>
      </Panel>
      {toTrash && (
        <ConfirmDialog
          title="Mettre le projet à la corbeille ?"
          confirm="Mettre à la corbeille"
          danger
          onCancel={() => setToTrash(null)}
          onConfirm={async () => {
            const p = toTrash;
            setToTrash(null);
            if (s.folder === p.folder) await s.closeProject();
            await api.trashProject(p.folder);
            await s.refreshProjects();
            s.toast('info', `« ${p.name} » a été placé dans la corbeille ${api.platform === 'electron' ? 'de Windows (récupérable)' : 'du navigateur'}.`);
          }}
        >
          Le dossier du projet « {toTrash.name} » sera déplacé dans la corbeille. {api.platform === 'electron' ? 'Vous pourrez le restaurer depuis la corbeille de Windows.' : 'En mode navigateur, cette suppression est définitive.'}
        </ConfirmDialog>
      )}
    </div>
  );
}
