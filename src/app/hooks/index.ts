import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/** Préférence d'affichage mémorisée localement (jamais une donnée de projet). */
export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`dqp.pref.${key}`);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`dqp.pref.${key}`, JSON.stringify(v));
    } catch {
      /* préférence non mémorisée */
    }
  }, [key, v]);
  return [v, setV];
}

/** Raccourci clavier global (« mod+k » = Ctrl+K sous Windows, Cmd+K sous macOS). */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop()!;
    const mod = parts.includes('mod');
    const shift = parts.includes('shift');
    const h = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      if (mod !== (e.ctrlKey || e.metaKey)) return;
      if (shift !== e.shiftKey) return;
      ref.current(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [combo, enabled]);
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}

/**
 * Virtualisation d'une liste à hauteur de ligne fixe : seules les lignes visibles sont
 * rendues (gros projets, milliers de lignes).
 */
export function useVirtual(count: number, rowHeight: number, ref: React.RefObject<HTMLElement | null>, overscan = 12) {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 60) });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - overscan);
      const end = Math.min(count, Math.ceil((el.scrollTop + el.clientHeight) / rowHeight) + overscan);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [count, rowHeight, ref, overscan]);
  return { ...range, before: range.start * rowHeight, after: Math.max(0, (count - range.end) * rowHeight) };
}
