// Panneaux redimensionnables (§7) : poignées glissables, tailles mémorisées par écran,
// double-clic sur une poignée pour revenir aux tailles par défaut.

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './primitives';

function load(id: string, fallback: number[]): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(`dqp.split.${id}`) ?? 'null');
    return Array.isArray(v) && v.length === fallback.length ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Disposition horizontale de N panneaux ; `sizes` en fractions (somme = 1). */
export function Split({ id, sizes: initial, min = 220, children, className }: { id: string; sizes: number[]; min?: number; children: ReactNode; className?: string }) {
  const panes = Children.toArray(children);
  const [sizes, setSizes] = useState(() => load(id, initial));
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; x: number; start: number[]; width: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(`dqp.split.${id}`, JSON.stringify(sizes));
    } catch {
      /* préférence d'affichage seulement */
    }
  }, [id, sizes]);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.x) / d.width;
      const next = [...d.start];
      const minF = min / d.width;
      let a = d.start[d.i] + dx;
      let b = d.start[d.i + 1] - dx;
      if (a < minF) { b -= minF - a; a = minF; }
      if (b < minF) { a -= minF - b; b = minF; }
      next[d.i] = a;
      next[d.i + 1] = b;
      setSizes(next);
    },
    [min],
  );
  const onUp = useCallback(() => {
    drag.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onMove);
  }, [onMove]);

  const start = (i: number) => (e: React.PointerEvent) => {
    if (!wrap.current) return;
    drag.current = { i, x: e.clientX, start: sizes, width: wrap.current.clientWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  return (
    <div ref={wrap} className={cx('flex min-h-0 w-full', className)}>
      {panes.map((pane, i) => (
        <div key={i} className="flex min-h-0 min-w-0" style={{ flex: `${sizes[i]} 1 0px` }}>
          <div className="min-h-0 min-w-0 flex-1">{pane}</div>
          {i < panes.length - 1 && (
            <div
              role="separator"
              aria-orientation="vertical"
              title="Glisser pour redimensionner · double-clic pour réinitialiser"
              onPointerDown={start(i)}
              onDoubleClick={() => setSizes(initial)}
              className="group relative mx-[3px] w-[8px] shrink-0 cursor-col-resize"
            >
              <span className="absolute inset-y-6 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-line-2 transition-colors duration-150 group-hover:bg-brand-2 group-active:bg-cyan" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
