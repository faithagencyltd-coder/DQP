// Migrations du format de projet : un projet enregistré par une version antérieure
// de DQP est mis à niveau à l'ouverture, sans perte.

import type { Project } from './types';

export const CURRENT_SCHEMA = 3;

export function migrateProject(raw: unknown): Project {
  const p = raw as Record<string, unknown> & { schema?: number };
  if (!p || typeof p !== 'object' || !Array.isArray(p.lots) || !p.info) throw new Error('format de projet inconnu');
  if (typeof p.schema !== 'number' || p.schema > CURRENT_SCHEMA) {
    throw new Error(`projet enregistré par une version plus récente de DQP (schéma ${p.schema})`);
  }
  if (p.schema === 1) {
    // Schéma 2 : éléments du bâtiment (plans) et résolutions des différences entre sources.
    p.elements = [];
    p.resolutions = [];
    p.schema = 2;
  }
  if (p.schema === 2) {
    // Schéma 3 : échelles des planches et mesures (métré sur plans).
    p.scales = [];
    p.measurements = [];
    p.schema = 3;
  }
  return p as unknown as Project;
}
