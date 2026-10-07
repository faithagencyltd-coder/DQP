import { useState } from 'react';
import { PROJECT_TYPES } from '../../core/import/detect';
import { createProject, updateSettings } from '../../core/project';
import { Modal } from '../ds/legacy';
import { useStore } from '../stores/app-store';

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      let p = createProject(name.trim(), {
        client: client.trim(),
        location: location.trim(),
        projectType: type,
        projectTypeStatus: type ? 'confirmed' : 'undetermined',
      });
      if (s.settings?.defaultVatRate) p = updateSettings(p, { vatRate: s.settings.defaultVatRate });
      await s.createProject(p);
      onClose();
      s.go('import');
      s.toast('success', `Projet « ${p.info.name} » créé. Importez maintenant vos fichiers.`);
    } catch (e) {
      s.toast('error', `Création impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="01 — Nouveau projet"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={() => void submit()}>Créer le projet</button>
        </>
      }
    >
      <div className="form" onKeyDown={(e) => e.key === 'Enter' && void submit()}>
        <label className="f" style={{ gridColumn: '1 / -1' }}>
          <span>Nom du projet *</span>
          <input className="in" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Villa SENOU" />
        </label>
        <label className="f">
          <span>Maître d’ouvrage / client</span>
          <input className="in" value={client} onChange={(e) => setClient(e.target.value)} />
        </label>
        <label className="f">
          <span>Localisation</span>
          <input className="in" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Abomey-Calavi" />
        </label>
        <label className="f">
          <span>Type de projet</span>
          <select className="in" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Déterminer à l’analyse</option>
            {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Un dossier de projet est créé avec les sous-dossiers Fichiers_sources, Analyse, Metre, Quantites, DQE, Estimation, Plans, Documents et Exports.
      </p>
    </Modal>
  );
}
