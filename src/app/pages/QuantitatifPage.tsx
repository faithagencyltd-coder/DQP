// Quantitatif (§13) : « qu’est-ce qu’il faut réaliser et en quelle quantité ? » —
// sans les prix. Par lot, par unité, et quantités principales regroupées.

import { Layers, Ruler, Sigma } from 'lucide-react';
import { useMemo, useState } from 'react';
import { groupSections } from '../../core/dqe';
import { formatNumber } from '../../core/format';
import { mainQuantities } from '../../core/quantities';
import { StatusBadge, StatusDot } from '../ds/legacy';
import { BarList } from '../ds/charts';
import { Card, cx, EmptyState, Tabs } from '../ds/primitives';
import { useStore } from '../stores/app-store';

export function QuantitatifPage() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [view, setView] = useState<'lots' | 'units'>('lots');
  const main = useMemo(() => mainQuantities(p, r), [p, r]);
  const byUnit = useMemo(() => {
    const m = new Map<string, { lines: number; qty: number; missing: number }>();
    for (const l of p.lots) for (const sec of l.sections) for (const line of sec.lines) {
      const k = line.unit || '(sans unité)';
      const e = m.get(k) ?? { lines: 0, qty: 0, missing: 0 };
      const rr = r.lines.get(line.id)!;
      e.lines++;
      if (rr.retained === null) e.missing++;
      else e.qty += rr.retained;
      m.set(k, e);
    }
    return [...m].sort((a, b) => b[1].lines - a[1].lines);
  }, [p, r]);

  if (!r.lineCount) {
    return <EmptyState icon={<Sigma size={22} />} title="Aucune quantité" action={<button className="btn primary" onClick={() => s.go('import')}>Importer un DQE</button>}>Importez un DQE (Excel ou CSV) ou saisissez des ouvrages dans le module DQE.</EmptyState>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[1fr_380px]">
      <Card
        bodyClass="p-0"
        title="Quantitatif"
        icon={<Sigma size={15} />}
        actions={<Tabs size="sm" value={view} onChange={setView} items={[{ id: 'lots', label: 'Par lot', icon: <Layers size={13} /> }, { id: 'units', label: 'Par unité', icon: <Ruler size={13} /> }]} />}
      >
        {view === 'lots' ? (
          <div className="max-h-[calc(100vh-var(--topbar)-300px)] overflow-auto">
            <table className="t">
              <thead><tr><th style={{ width: 70 }}>N°</th><th>Désignation</th><th style={{ width: 70 }}>Unité</th><th className="n" style={{ width: 130 }}>Quantité</th><th style={{ width: 140 }}>Confiance</th></tr></thead>
              {p.lots.map((lot) => (
                <tbody key={lot.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 500px' } as React.CSSProperties}>
                  <tr><td colSpan={5} style={{ background: 'linear-gradient(90deg, rgba(47,124,246,.22), transparent)', color: 'var(--text)', fontWeight: 700 }}>{lot.code} — {lot.name}</td></tr>
                  {groupSections(lot).map((g, gi) => (
                    <FragmentRows key={gi} path={g.path} sections={g.sections} />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <table className="t">
            <thead><tr><th>Unité</th><th className="n">Lignes</th><th className="n">Quantité cumulée</th><th className="n">Lignes sans quantité</th></tr></thead>
            <tbody>
              {byUnit.map(([u, e]) => (
                <tr key={u}><td><b>{u}</b></td><td className="n">{e.lines}</td><td className="n"><b>{formatNumber(e.qty)}</b></td><td className={cx('n', e.missing > 0 && 'text-[#ff7a7a]')}>{e.missing || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Quantités principales" icon={<Ruler size={15} />}>
        <BarList data={main.map((q) => ({ id: q.id, label: q.label, value: q.value, sub: q.unit }))} format={(v) => formatNumber(v)} />
        <ul className="m-0 mt-3 list-none space-y-1 p-0 text-[11.5px] text-muted">
          {main.map((q) => (
            <li key={q.id} className="flex items-center gap-2"><StatusDot status={q.status} />{q.label} : {q.lines.length} ligne(s){q.missing ? <span className="text-[#ff7a7a]"> · {q.missing} sans quantité (non comptée)</span> : ''}</li>
          ))}
        </ul>
      </Card>
    </div>
  );

  function FragmentRows({ path, sections }: { path: string[]; sections: ReturnType<typeof groupSections>[number]['sections'] }) {
    return (
      <>
        {path.length > 0 && <tr><td colSpan={5} style={{ color: 'var(--cyan)', fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '.05em' }}>{path.join(' › ')}</td></tr>}
        {sections.map((sec) => (
          <FragmentSection key={sec.id} title={sec.title} lines={sec.lines} />
        ))}
      </>
    );
  }

  function FragmentSection({ title, lines }: { title: string; lines: (typeof p.lots)[number]['sections'][number]['lines'] }) {
    return (
      <>
        <tr><td /><td colSpan={4} style={{ fontWeight: 650, color: 'var(--text)' }}>{title}</td></tr>
        {lines.map((l) => {
          const rr = r.lines.get(l.id)!;
          return (
            <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => s.go('metre')}>
              <td className="muted small">{l.number}</td>
              <td>{l.designation}</td>
              <td>{l.unit}</td>
              <td className="n"><b>{formatNumber(rr.retained)}</b></td>
              <td><StatusBadge status={rr.quantityStatus} /></td>
            </tr>
          );
        })}
      </>
    );
  }
}
