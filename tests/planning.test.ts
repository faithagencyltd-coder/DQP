import { describe, expect, it } from 'vitest';
import { dependencyIssues, durationDays, isLate, monthGrid, plannedProgress, projectProgress, timelineRange, type TaskLike } from '../src/engine/planning';

const task = (p: Partial<TaskLike> & { id: string }): TaskLike => ({
  title: p.id, start_date: '2026-11-02', end_date: '2026-11-06', status: 'a_faire', depends_on: [], planned_qty: null, done_qty: null, weight: null, progress_pct: null, ...p,
});

describe('planning', () => {
  it('durées, retards et grille du mois', () => {
    expect(durationDays('2026-11-02', '2026-11-06')).toBe(5);
    expect(durationDays('2026-11-02', '2026-11-02')).toBe(1);
    expect(isLate(task({ id: 'a', end_date: '2026-11-06' }), '2026-11-07')).toBe(true);
    expect(isLate(task({ id: 'a', end_date: '2026-11-06', status: 'termine' }), '2026-11-07')).toBe(false);
    const g = monthGrid(2026, 11); // 1er novembre 2026 = dimanche
    expect(g[0][0]).toBe('2026-10-26');
    expect(g[0][6]).toBe('2026-11-01');
    expect(g[g.length - 1][6]).toBe('2026-12-06');
    expect(timelineRange([task({ id: 'a', start_date: '2026-11-04', end_date: '2026-11-10' })], '2026-01-01')).toEqual({ start: '2026-11-02', end: '2026-11-15', days: 14 });
  });

  it('dépendances : chevauchement et démarrage prématuré signalés', () => {
    const a = task({ id: 'a', end_date: '2026-11-06' });
    const b = task({ id: 'b', start_date: '2026-11-05', end_date: '2026-11-10', depends_on: ['a'] });
    const c = task({ id: 'c', start_date: '2026-11-09', end_date: '2026-11-12', depends_on: ['a'], status: 'en_cours' });
    const issues = dependencyIssues([a, b, c]);
    expect(issues.map((i) => i.task)).toEqual(['b', 'c']);
  });

  it('avancement par tâches terminées', () => {
    const p = projectProgress([task({ id: 'a', status: 'termine' }), task({ id: 'b', status: 'valide' }), task({ id: 'c', status: 'en_cours' })], 'taches');
    expect(p.pct).toBe(66.7);
    expect(p.done).toBe(2);
    expect(projectProgress([], 'taches').pct).toBeNull();
  });

  it('avancement par quantités : tâches sans quantité prévue exclues et signalées', () => {
    const p = projectProgress([
      task({ id: 'a', planned_qty: 100, done_qty: 40 }),
      task({ id: 'b', planned_qty: 50, done_qty: 60 }), // dépassement plafonné à 100 %
      task({ id: 'c' }),
    ], 'quantites');
    expect(p.pct).toBe(70);
    expect(p.excluded.map((e) => e.id)).toEqual(['c']);
  });

  it('avancement pondéré et avancement prévu à une date', () => {
    const tasks = [
      task({ id: 'a', weight: 30, status: 'termine' }),
      task({ id: 'b', weight: 50, progress_pct: 20 }),
      task({ id: 'c', weight: 20 }),
      task({ id: 'd' }),
    ];
    const p = projectProgress(tasks, 'ponderation');
    expect(p.pct).toBe(40); // (30 + 10) / 100
    expect(p.excluded).toHaveLength(1);
    const plan = [task({ id: 'x', start_date: '2026-11-01', end_date: '2026-11-10', planned_qty: 1 })];
    expect(plannedProgress(plan, 'quantites', '2026-11-05')).toBe(50);
    expect(plannedProgress(plan, 'taches', '2026-11-05')).toBe(0);
  });
});
