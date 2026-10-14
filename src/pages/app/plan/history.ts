// Historique du dessin : annuler / rétablir (100 étapes). Un glisser-déposer ne crée qu'une
// étape : l'état de départ est mémorisé au début du geste.

import { useCallback, useRef, useState } from 'react';
import type { PlanModel } from '../../../engine/plan/model';

const MAX = 100;

export function usePlanHistory(initial: PlanModel) {
  const [present, setPresent] = useState(initial);
  const cur = useRef(initial);
  const past = useRef<PlanModel[]>([]);
  const future = useRef<PlanModel[]>([]);
  const gesture = useRef<PlanModel | null>(null);

  const set = (m: PlanModel) => {
    cur.current = m;
    setPresent(m);
  };

  /** Modification définitive (une étape d'historique). */
  const commit = useCallback((next: PlanModel) => {
    const base = gesture.current ?? cur.current;
    gesture.current = null;
    if (next !== base) {
      past.current = [...past.current.slice(-(MAX - 1)), base];
      future.current = [];
    }
    set(next);
  }, []);

  /** Début d'un geste (glisser) : les états intermédiaires ne sont pas mémorisés. */
  const begin = useCallback(() => { gesture.current = cur.current; }, []);
  const live = useCallback((next: PlanModel) => set(next), []);
  /** Fin d'un geste sans changement (simple clic). */
  const cancel = useCallback(() => { gesture.current = null; }, []);

  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    if (!prev) return;
    past.current = past.current.slice(0, -1);
    future.current = [cur.current, ...future.current];
    set(prev);
  }, []);
  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, cur.current];
    set(next);
  }, []);
  const reset = useCallback((m: PlanModel) => {
    past.current = [];
    future.current = [];
    gesture.current = null;
    set(m);
  }, []);

  return { model: present, current: cur, commit, begin, live, cancel, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
