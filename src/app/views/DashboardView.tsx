import { FileSpreadsheet, FolderOpen, FolderPlus, Import, ScanSearch } from 'lucide-react';
import { formatMoney, formatNumber } from '../../core/format';
import { Panel, SeverityBadge } from '../components/ui';
import { useStore } from '../store';

export function DashboardView({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  const s = useStore();
  const p = s.project;

  if (!p) {
    return (
      <div style={{ maxWidth: 980 }}>
        <h1 className="title">Bienvenue dans DQP</h1>
        <p className="subtitle">Analyse de projets BTP, métré, DQE et estimation.</p>
        <div className="notice">
          <b>Importer → Comprendre → Vérifier → Mesurer → Quantifier → Chiffrer → Documenter → Exporter</b>
          DQP reçoit un projet déjà conçu, en extrait les informations utiles et prépare le DQE et l’estimation. Chaque information porte un niveau de
          confiance : 🟢 confirmée, 🟠 à vérifier, 🔴 non déterminée. DQP n’invente jamais une valeur absente.
        </div>
        <div className="row" style={{ marginBottom: 18 }}>
          <button className="btn primary" onClick={onNew}><FolderPlus size={15} />Nouveau projet</button>
          <button className="btn" onClick={() => s.go('projects')}><FolderOpen size={15} />Ouvrir un projet</button>
        </div>
        <Panel title="Projets récents" flush>
          {s.projects.length === 0 ? (
            <div className="empty">Aucun projet pour l’instant.</div>
          ) : (
            <table className="t">
              <thead><tr><th>Projet</th><th className="n">Lignes</th><th className="n">Total HT</th><th>Modifié</th><th /></tr></thead>
              <tbody>
                {s.projects.slice(0, 8).map((pr) => (
                  <tr key={pr.folder}>
                    <td><b>{pr.name}</b></td>
                    <td className="n">{pr.lines}</td>
                    <td className="n">{formatMoney(pr.total)}</td>
                    <td>{new Date(pr.updatedAt).toLocaleString('fr-FR')}</td>
                    <td className="n"><button className="btn sm" onClick={() => void s.openProject(pr.folder)}>Ouvrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    );
  }

  const r = s.result!;
  const fileAlerts = p.analyses.flatMap((a) => a.fileAlerts);
  const errors = [...fileAlerts, ...s.alerts].filter((a) => a.severity === 'error');
  const warnings = [...fileAlerts, ...s.alerts].filter((a) => a.severity === 'warning');
  const cur = p.settings.currency;

  return (
    <div>
      <h1 className="title">{p.info.name}</h1>
      <p className="subtitle">
        {[p.info.projectType, p.info.location, p.info.phase, p.info.date].filter(Boolean).join(' · ') || 'Informations du projet à compléter'}
        {' · '}<a href="#" onClick={(e) => { e.preventDefault(); s.go('project'); }}>modifier</a>
      </p>

      {p.lots.length === 0 && (
        <div className="notice">
          <b>Étape suivante : importer vos fichiers</b>
          Importez un DQE existant (Excel .xlsx ou CSV) pour que DQP l’analyse, ou créez vos lots directement dans le module DQE.
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={onImport}><Import size={15} />Importer un fichier</button>
            <button className="btn" onClick={() => s.go('dqe')}><FileSpreadsheet size={15} />Saisir le DQE</button>
          </div>
        </div>
      )}

      <div className="kpis">
        <div className="kpi"><div className="v">{formatMoney(r.totalHT, cur)}</div><div className="l">Total hors taxes</div></div>
        <div className="kpi"><div className="v">{p.lots.length}</div><div className="l">lots</div></div>
        <div className="kpi"><div className="v">{r.lineCount}</div><div className="l">lignes d’ouvrage</div></div>
        <div className="kpi ok"><div className="v">🟢 {r.status.confirmed}</div><div className="l">confirmées</div></div>
        <div className="kpi warn"><div className="v">🟠 {r.status.to_verify}</div><div className="l">à vérifier</div></div>
        <div className="kpi bad"><div className="v">🔴 {r.status.undetermined}</div><div className="l">non déterminées</div></div>
      </div>

      <div className="grid2">
        <Panel title="Répartition par lot" actions={<button className="btn sm" onClick={() => s.go('estimate')}>Estimation</button>} flush>
          <table className="t">
            <tbody>
              {p.lots.map((lot) => {
                const t = r.lots.get(lot.id)!;
                const pct = r.totalHT ? (t.amount / r.totalHT) * 100 : 0;
                return (
                  <tr key={lot.id} style={{ cursor: 'pointer' }} onClick={() => s.go('dqe')}>
                    <td style={{ width: '45%' }}><span className="muted small">{lot.code}</span> {lot.name}</td>
                    <td style={{ width: '25%' }}><div className="bar"><i style={{ width: `${pct}%` }} /></div></td>
                    <td className="n">{formatNumber(t.amount, 0)}</td>
                    <td className="n muted small">{formatNumber(pct, 1)} %</td>
                  </tr>
                );
              })}
              {p.lots.length === 0 && <tr><td className="muted">Aucun lot.</td></tr>}
            </tbody>
          </table>
        </Panel>
        <Panel title={`Points de contrôle (${errors.length} erreurs, ${warnings.length} à vérifier)`} actions={<button className="btn sm" onClick={() => s.go('analysis')}><ScanSearch size={13} />Analyse</button>} flush>
          {[...errors, ...warnings].slice(0, 8).map((a) => (
            <div key={a.id} className="alert-item clickable" onClick={() => s.go(a.lineId ? 'dqe' : 'analysis', a.lineId)}>
              <SeverityBadge severity={a.severity} />
              <div className="msg small">{a.message}</div>
            </div>
          ))}
          {errors.length + warnings.length === 0 && <div className="empty">Aucun point bloquant.</div>}
        </Panel>
      </div>
      {r.incomplete > 0 && (
        <div className="notice warn">
          <b>{r.incomplete} ligne(s) non chiffrée(s)</b>
          Ces lignes n’ont pas de quantité ou de prix unitaire : elles ne sont pas comptées dans le total. Complétez-les dans le DQE.
        </div>
      )}
    </div>
  );
}
