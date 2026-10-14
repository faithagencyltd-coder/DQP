// Planning (§19) : durées, retards, contrôles de dépendances, grille du calendrier et avancement
// d'un chantier selon une méthode transparente (§19.4). Aucun avancement n'est inventé : une tâche
// sans donnée exploitable pour la méthode choisie est exclue du calcul et signalée.

export type TaskStatus = 'a_faire' | 'en_cours' | 'en_attente' | 'bloque' | 'termine' | 'valide';
export type ProgressMethod = 'taches' | 'quantites' | 'ponderation';

export interface TaskLike {
  id: string; title: string; start_date: string; end_date: string; status: TaskStatus; depends_on: string[];
  planned_qty: number | null; done_qty: number | null; weight: number | null; progress_pct: number | null;
}

const DAY = 86_400_000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => isoDate(toUtc(d) + n * DAY);
/** Nombre de jours entre deux dates (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);
/** Durée en jours calendaires, début et fin inclus. */
export const durationDays = (start: string, end: string) => daysBetween(start, end) + 1;
/** Jour de la semaine, lundi = 0. */
export const weekday = (d: string) => (new Date(toUtc(d)).getUTCDay() + 6) % 7;

/** Date AAAA-MM-JJ en JJ/MM/AAAA. */
export const frDate = (d: string) => d.split('-').reverse().join('/');

export const isDone = (s: TaskStatus) => s === 'termine' || s === 'valide';

/** Tâche en retard : date de fin dépassée et pas encore terminée. */
export function isLate(t: Pick<TaskLike, 'end_date' | 'status'>, today: string): boolean {
  return !isDone(t.status) && t.end_date < today;
}

export interface DependencyIssue { task: string; predecessor: string; message: string }

/** Tâches qui commencent avant la fin d'une tâche dont elles dépendent, ou démarrées alors que la précédente n'est pas finie. */
export function dependencyIssues(tasks: TaskLike[]): DependencyIssue[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: DependencyIssue[] = [];
  for (const t of tasks) {
    for (const d of t.depends_on) {
      const p = byId.get(d);
      if (!p) continue;
      if (t.start_date <= p.end_date) out.push({ task: t.id, predecessor: p.id, message: `« ${t.title} » commence le ${frDate(t.start_date)} avant la fin de « ${p.title} » (${frDate(p.end_date)}).` });
      else if (t.status !== 'a_faire' && t.status !== 'en_attente' && !isDone(p.status)) out.push({ task: t.id, predecessor: p.id, message: `« ${t.title} » a démarré alors que « ${p.title} » n’est pas terminée.` });
    }
  }
  return out;
}

export interface TaskProgress { id: string; value: number | null; reason?: string }

/** Avancement d'une tâche (0 à 1) selon la méthode ; null = non mesurable avec cette méthode. */
export function taskProgress(t: TaskLike, method: ProgressMethod): TaskProgress {
  if (method === 'taches') return { id: t.id, value: isDone(t.status) ? 1 : 0 };
  if (method === 'quantites') {
    if (!t.planned_qty || t.planned_qty <= 0) return { id: t.id, value: isDone(t.status) ? 1 : null, reason: isDone(t.status) ? undefined : 'quantité prévue absente' };
    if (isDone(t.status)) return { id: t.id, value: 1 };
    if (t.done_qty === null) return { id: t.id, value: 0 };
    return { id: t.id, value: Math.min(1, Math.max(0, t.done_qty / t.planned_qty)) };
  }
  // Pondération : poids validé × (1 si terminée, sinon pourcentage déclaré, sinon 0).
  if (!t.weight || t.weight <= 0) return { id: t.id, value: null, reason: 'poids absent' };
  if (isDone(t.status)) return { id: t.id, value: 1 };
  return { id: t.id, value: t.progress_pct === null ? 0 : Math.min(100, Math.max(0, t.progress_pct)) / 100 };
}

export interface ProjectProgress {
  pct: number | null; method: ProgressMethod; counted: number; excluded: { id: string; title: string; reason: string }[];
  done: number; total: number; formula: string;
}

export const METHOD_LABEL: Record<ProgressMethod, string> = {
  taches: 'Tâches terminées',
  quantites: 'Quantités exécutées',
  ponderation: 'Pondération validée',
};

/** Avancement du chantier en %, arrondi à 0,1, avec la formule et les tâches exclues. */
export function projectProgress(tasks: TaskLike[], method: ProgressMethod): ProjectProgress {
  const excluded: ProjectProgress['excluded'] = [];
  let num = 0;
  let den = 0;
  let counted = 0;
  for (const t of tasks) {
    const p = taskProgress(t, method);
    if (p.value === null) { excluded.push({ id: t.id, title: t.title, reason: p.reason ?? 'donnée absente' }); continue; }
    const w = method === 'ponderation' ? Number(t.weight) : 1;
    num += w * p.value;
    den += w;
    counted++;
  }
  const done = tasks.filter((t) => isDone(t.status)).length;
  const formula = method === 'taches' ? 'tâches terminées ou validées ÷ nombre de tâches'
    : method === 'quantites' ? 'moyenne des (quantité exécutée ÷ quantité prévue) des tâches mesurées ; une tâche terminée compte 100 %'
      : 'Σ (poids × avancement) ÷ Σ poids ; avancement = 100 % si terminée, sinon pourcentage déclaré';
  return { pct: den > 0 ? Math.round((num / den) * 1000) / 10 : null, method, counted, excluded, done, total: tasks.length, formula };
}

/** Avancement attendu à une date d'après les dates prévues (part du temps écoulé, mêmes poids). */
export function plannedProgress(tasks: TaskLike[], method: ProgressMethod, day: string): number | null {
  let num = 0;
  let den = 0;
  for (const t of tasks) {
    if (taskProgress(t, method).value === null) continue;
    const w = method === 'ponderation' ? Number(t.weight) : 1;
    const elapsed = day < t.start_date ? 0 : day >= t.end_date ? 1 : (daysBetween(t.start_date, day) + 1) / durationDays(t.start_date, t.end_date);
    num += w * (method === 'taches' ? (day >= t.end_date ? 1 : 0) : elapsed);
    den += w;
  }
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

/** Semaines (lundi → dimanche) couvrant un mois ; month = 1 à 12. */
export function monthGrid(year: number, month: number): string[][] {
  const first = isoDate(Date.UTC(year, month - 1, 1));
  const last = isoDate(Date.UTC(year, month, 0));
  let d = addDays(first, -weekday(first));
  const weeks: string[][] = [];
  while (d <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    d = addDays(d, 7);
  }
  return weeks;
}

/** Étendue d'affichage d'une chronologie : du lundi précédant la 1re tâche au dimanche suivant la dernière. */
export function timelineRange(tasks: Pick<TaskLike, 'start_date' | 'end_date'>[], fallback: string): { start: string; end: string; days: number } {
  if (!tasks.length) {
    const s = addDays(fallback, -weekday(fallback));
    return { start: s, end: addDays(s, 27), days: 28 };
  }
  const min = tasks.reduce((m, t) => (t.start_date < m ? t.start_date : m), tasks[0].start_date);
  const max = tasks.reduce((m, t) => (t.end_date > m ? t.end_date : m), tasks[0].end_date);
  const start = addDays(min, -weekday(min));
  const end = addDays(max, 6 - weekday(max));
  return { start, end, days: durationDays(start, end) };
}

export interface WorkforceLine { role: string; count: number }
export const workforceTotal = (w: WorkforceLine[]) => w.reduce((s, l) => s + (Number.isFinite(l.count) ? l.count : 0), 0);
