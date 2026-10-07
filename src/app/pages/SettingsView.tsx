import { FolderOpen } from 'lucide-react';
import { parseNumberFr } from '../../core/format';
import { ENGINE_VERSION } from '../../core/project';
import { api } from '../services/api';
import { Panel } from '../ds/legacy';
import { useStore } from '../stores/app-store';

export function SettingsView() {
  const s = useStore();
  const st = s.settings;
  if (!st) return null;
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 className="title">Paramètres</h1>
      <p className="subtitle">Réglages de l’application DQP sur cet ordinateur.</p>
      <Panel title="Projets">
        <div className="form">
          <label className="f" style={{ gridColumn: '1 / -1' }}>
            <span>Dossier des projets</span>
            <div className="row">
              <input className="in mono" style={{ flex: 1 }} value={st.projectsRoot} readOnly />
              <button
                className="btn"
                disabled={api.platform !== 'electron'}
                onClick={async () => {
                  const f = await api.chooseFolder();
                  if (f) {
                    await s.setSettings({ projectsRoot: f });
                    await s.refreshProjects();
                  }
                }}
              >
                <FolderOpen size={14} />Choisir…
              </button>
            </div>
          </label>
          <label className="f">
            <span>Votre nom (profil local)</span>
            <input className="in" defaultValue={st.userName ?? ''} placeholder="Ex. Faith Adehoumi" onBlur={(e) => void s.setSettings({ userName: e.target.value.trim() })} />
          </label>
          <label className="f">
            <span>Fonction</span>
            <input className="in" defaultValue={st.role ?? ''} placeholder="Ex. Ingénieur, métreur, architecte…" onBlur={(e) => void s.setSettings({ role: e.target.value.trim() })} />
          </label>
          <label className="f">
            <span>Entreprise / bureau d’études</span>
            <input className="in" defaultValue={st.company} onBlur={(e) => void s.setSettings({ company: e.target.value })} />
          </label>
          <label className="f">
            <span>TVA par défaut des nouveaux projets (%)</span>
            <input
              className="in"
              defaultValue={String(st.defaultVatRate)}
              onBlur={(e) => {
                const v = parseNumberFr(e.target.value);
                if (v !== null && v >= 0 && v < 100) void s.setSettings({ defaultVatRate: v });
              }}
            />
          </label>
        </div>
      </Panel>
      <Panel title="Sauvegarde et sécurité">
        <ul className="roadmap" style={{ margin: 0 }}>
          <li>Sauvegarde automatique moins d’une seconde après chaque modification.</li>
          <li>Écriture atomique (fichier temporaire puis remplacement) et copie de secours <span className="mono">project.json.bak</span> : en cas de fichier abîmé, DQP restaure la dernière sauvegarde valide.</li>
          <li>Versions nommées du projet (Fichier › Créer une version), consultables et restaurables dans Documents.</li>
          <li>Journal de toutes les modifications (Documents › Journal).</li>
          <li>Annuler / Rétablir (Ctrl+Z / Ctrl+Y) sur les 100 dernières actions.</li>
        </ul>
      </Panel>
      <Panel title="À propos">
        <div className="kv">
          <dt>Application</dt><dd>DQP {api.appVersion} — {api.platform === 'electron' ? 'application de bureau' : 'mode navigateur (démonstration)'}</dd>
          <dt>Moteur</dt><dd>Moteur de calcul DQP {ENGINE_VERSION} (déterministe : Quantité × Prix unitaire)</dd>
          <dt>Phase</dt><dd>Phase 1 (Core) terminée · Phase 2 (analyse des plans PDF) en cours</dd>
        </div>
      </Panel>
    </div>
  );
}
