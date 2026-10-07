import { PROJECT_TYPES } from '../../core/import/detect';
import { parseNumberFr } from '../../core/format';
import { updateInfo, updateSettings } from '../../core/project';
import type { ProjectInfo } from '../../core/types';
import { Panel, StatusBadge } from '../ds/legacy';
import { useStore } from '../stores/app-store';

export function ProjectInfoView() {
  const s = useStore();
  const p = s.project!;
  const field = (key: keyof ProjectInfo, label: string, placeholder?: string) => (
    <label className="f">
      <span>{label}</span>
      <input
        className="in"
        defaultValue={String(p.info[key] ?? '')}
        key={`${p.id}-${key}-${p.info[key]}`}
        placeholder={placeholder}
        onBlur={(e) => e.target.value !== p.info[key] && s.update((x) => updateInfo(x, { [key]: e.target.value }))}
      />
    </label>
  );
  const detectedTypes = p.analyses.flatMap((a) => a.detected.filter((d) => d.key === 'projectType'));

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="title">Informations du projet</h1>
      <p className="subtitle">Ces informations figurent sur le DQE, le rapport et les exports.</p>
      <Panel title="Projet">
        <div className="form">
          {field('name', 'Nom du projet')}
          {field('client', 'Maître d’ouvrage / client')}
          {field('location', 'Localisation')}
          {field('phase', 'Phase', 'Ex. Phase 2 : exécution')}
          {field('date', 'Date du document', 'Ex. Février 2026')}
          <label className="f">
            <span>Type de projet <StatusBadge status={p.info.projectTypeStatus} /></span>
            <select className="in" value={p.info.projectType} onChange={(e) => s.update((x) => updateInfo(x, { projectType: e.target.value, projectTypeStatus: e.target.value ? 'confirmed' : 'undetermined' }))}>
              <option value="">Non déterminé</option>
              {[...new Set([...PROJECT_TYPES, p.info.projectType].filter(Boolean))].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        {detectedTypes.length > 0 && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Type détecté par l’analyse : <b>{detectedTypes.map((d) => d.value).join(', ')}</b> — {detectedTypes[0].note}. Choisir une valeur dans la liste la confirme.
          </p>
        )}
      </Panel>
      <Panel title="Chiffrage">
        <div className="form">
          <label className="f">
            <span>Monnaie</span>
            <input className="in" defaultValue={p.settings.currency} onBlur={(e) => e.target.value.trim() && s.update((x) => updateSettings(x, { currency: e.target.value.trim() }))} />
          </label>
          <label className="f">
            <span>TVA (%) — 0 pour un DQE hors taxes</span>
            <input
              className="in"
              defaultValue={String(p.settings.vatRate).replace('.', ',')}
              key={`vat-${p.settings.vatRate}`}
              onBlur={(e) => {
                const v = parseNumberFr(e.target.value);
                if (v !== null && v >= 0 && v < 100) s.update((x) => updateSettings(x, { vatRate: v }));
              }}
            />
          </label>
          <label className="f" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row' }}>
            <input type="checkbox" checked={p.settings.roundAmounts} onChange={(e) => s.update((x) => updateSettings(x, { roundAmounts: e.target.checked }))} />
            <span>Arrondir chaque montant à l’unité (recommandé pour le FCFA)</span>
          </label>
        </div>
      </Panel>
    </div>
  );
}
