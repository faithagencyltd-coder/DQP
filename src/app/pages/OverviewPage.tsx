// Vue d'ensemble du projet : analyse | plan 2D (ou 3D en attente du moteur) | confiance,
// alertes et quantités — dans des panneaux redimensionnables, puis coûts et évolution.

import { AlertTriangle, Box, ChevronRight, CircleDollarSign, FileWarning, Import, Map as MapIcon, Ruler, ScanLine, ShieldCheck, Split as SplitIcon, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { detectElements } from '../../core/classify';
import { crossCheck } from '../../core/elements/crosscheck';
import { activeElements, effectiveStatus } from '../../core/elements/ops';
import { formatMoney, formatNumber } from '../../core/format';
import { confidence, projectSteps } from '../../core/progress';
import { mainQuantities } from '../../core/quantities';
import { StatusBadge, StatusDot } from '../ds/legacy';
import { Donut, LineChart } from '../ds/charts';
import { Split } from '../ds/layout';
import { Button, Card, cx, EmptyState, Pending, Ring, Tabs } from '../ds/primitives';
import { ElementInspector } from '../features/plan/ElementInspector';
import { PlanCanvas } from '../features/plan/PlanCanvas';
import { ConfidenceDrawer } from '../features/workspace/WorkspaceHeader';
import { useStore, type View } from '../stores/app-store';

function Row({ icon, label, value, onClick, tone }: { icon?: React.ReactNode; label: React.ReactNode; value: React.ReactNode; onClick?: () => void; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-2.5 rounded-[7px] px-2 py-[7px] text-left text-[12.5px] transition-colors hover:bg-hover">
      {icon && <span className="text-muted group-hover:text-brand-2">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-fg-2">{label}</span>
      <span className={cx('font-semibold tabular-nums', tone === 'bad' ? 'text-[#ff7a7a]' : tone === 'warn' ? 'text-[#fbbf24]' : tone === 'ok' ? 'text-[#4ade80]' : 'text-fg')}>{value}</span>
      {onClick && <ChevronRight size={13} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" />}
    </button>
  );
}

export function OverviewPage({ onImport }: { onImport: () => void }) {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [selected, setSelected] = useState<string | null>(null);
  const [confOpen, setConfOpen] = useState(false);
  const steps = useMemo(() => projectSteps(p, r), [p, r]);
  const conf = useMemo(() => confidence(p, r), [p, r]);
  const quantities = useMemo(() => mainQuantities(p, r), [p, r]);
  const dqeEls = useMemo(() => detectElements(p, r), [p, r]);
  const diffs = useMemo(() => crossCheck(p, r).filter((c) => c.differs && !c.resolution), [p, r]);
  const pdf = p.sourceFiles.filter((f) => f.kind === 'pdf').pop();
  const sel = p.elements.find((e) => e.id === selected);
  const done = steps.filter((x) => x.state === 'done').length;

  const els = activeElements(p);
  const planCount = (kind: string, cat?: RegExp) => els.filter((e) => e.kind === kind && (!cat || cat.test(e.category))).length;
  const dqeCount = (name: string) => dqeEls.filter((e) => e.element === name && (e.unit === 'u' || e.unit === 'ens')).reduce((n, e) => n + e.quantity, 0);
  const detected = [
    { label: 'Pièces (plans)', value: planCount('room'), view: 'detection' as View },
    { label: 'Niveaux (plans)', value: planCount('level'), view: 'detection' as View },
    { label: 'Portes (repères des plans)', value: planCount('opening', /^Porte$/), view: 'detection' as View },
    { label: 'Fenêtres (repères des plans)', value: planCount('opening', /Fenêtre/), view: 'detection' as View },
    { label: 'Équipements annotés (plans)', value: planCount('equipment'), view: 'detection' as View },
    { label: 'Portes (DQE)', value: dqeCount('Portes'), view: 'quantitatif' as View },
    { label: 'Appareils sanitaires (DQE)', value: ['WC', 'Lavabos / vasques', 'Douches', 'Éviers', 'Baignoires'].reduce((n, x) => n + dqeCount(x), 0), view: 'quantitatif' as View },
    { label: 'Points électriques (DQE)', value: ['Prises', 'Interrupteurs / boutons', 'Luminaires'].reduce((n, x) => n + dqeCount(x), 0), view: 'quantitatif' as View },
  ].filter((d) => d.value > 0);

  const allAlerts = [...p.analyses.flatMap((a) => a.fileAlerts), ...s.alerts];
  const count = (codes: string[]) => s.alerts.filter((a) => codes.includes(a.code)).length;
  const alertRows = [
    { label: 'Prix manquants ou nuls', n: count(['NO_PRICE', 'ZERO_PRICE']), tone: 'bad' as const, icon: <Tag size={14} />, view: 'dqe' as View },
    { label: 'Quantités manquantes ou nulles', n: count(['NO_QUANTITY', 'ZERO_QUANTITY']), tone: 'bad' as const, icon: <Ruler size={14} />, view: 'metre' as View },
    { label: 'Unités manquantes', n: count(['NO_UNIT']), tone: 'warn' as const, icon: <AlertTriangle size={14} />, view: 'dqe' as View },
    { label: 'Incohérences dans les fichiers', n: allAlerts.filter((a) => a.severity === 'error').length, tone: 'bad' as const, icon: <FileWarning size={14} />, view: 'analysis' as View },
    { label: 'Éléments de plan à vérifier', n: els.filter((e) => effectiveStatus(e) === 'to_verify').length, tone: 'warn' as const, icon: <ScanLine size={14} />, view: 'detection' as View },
    { label: 'Différences entre fichiers', n: diffs.length, tone: 'warn' as const, icon: <SplitIcon size={14} />, view: 'analysis' as View },
  ];

  const costData = p.lots.map((l) => ({ id: l.id, label: l.name, value: r.lots.get(l.id)!.amount })).filter((d) => d.value > 0);
  const history = p.journal.filter((j) => typeof j.total === 'number').map((j) => ({ t: Date.parse(j.at), v: j.total!, label: j.action }));

  return (
    <div className="space-y-3">
      <Split id="overview" sizes={[0.25, 0.47, 0.28]} min={250} className="h-[clamp(460px,calc(100vh-330px),760px)]">
        {/* ---- Analyse du projet ---- */}
        <Card title="Analyse du projet" icon={<ScanLine size={15} />} className="h-full" bodyClass="min-h-0 overflow-y-auto p-3">
          <div className="mb-3 flex items-center gap-4 px-1">
            <Ring value={(done / steps.length) * 100} size={86} stroke={8} sub="du parcours" />
            <div className="space-y-1 text-[12.5px]">
              <div className="flex items-center gap-2"><StatusDot status="confirmed" /><b className="tabular-nums text-fg">{conf.confirmed}</b> confirmés</div>
              <div className="flex items-center gap-2"><StatusDot status="to_verify" /><b className="tabular-nums text-fg">{conf.to_verify}</b> à vérifier</div>
              <div className="flex items-center gap-2"><StatusDot status="undetermined" /><b className="tabular-nums text-fg">{conf.undetermined}</b> non déterminés</div>
            </div>
          </div>
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Éléments détectés</div>
          {detected.length ? detected.map((d) => <Row key={d.label} label={d.label} value={formatNumber(d.value, 0)} onClick={() => s.go(d.view)} />) : <p className="px-2 text-[12px] text-muted">Aucun élément détecté pour l’instant.</p>}
          <div className="mt-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Progression du projet</div>
          {steps.map((st, i) => (
            <Row
              key={st.id}
              label={<span className="flex items-center gap-2"><span className="w-4 text-[11px] tabular-nums text-faint">{String(i + 1).padStart(2, '0')}</span>{st.label}</span>}
              value={<span className={cx('badge', st.state === 'done' ? 'ok' : st.state === 'verify' ? 'warn' : st.state === 'current' ? 'info' : 'grey')}>{st.state === 'done' ? 'Terminé' : st.state === 'verify' ? 'À vérifier' : st.state === 'current' ? 'En cours' : st.state === 'unavailable' ? 'Non disponible' : 'À faire'}</span>}
            />
          ))}
        </Card>

        {/* ---- Zone centrale : plan 2D / 3D ---- */}
        <Card
          className="h-full"
          bodyClass="relative h-full min-h-0 p-0"
          title={pdf ? pdf.name : 'Plan du projet'}
          icon={<MapIcon size={15} />}
          actions={<Tabs size="sm" value={mode} onChange={setMode} items={[{ id: '2d', label: '2D' }, { id: '3d', label: '3D', hint: 'Disponible avec l’import IFC (phase 4)' }]} />}
        >
          {mode === '3d' ? (
            <div className="h-full p-4">
              <Pending title="Modèle 3D" phase="phase 4 (IFC)" icon={<Box size={30} />}>
                La vue 3D sera alimentée par la maquette IFC exportée de Revit ou d’Archicad. DQP n’affiche pas de modèle 3D fictif.
              </Pending>
            </div>
          ) : pdf ? (
            <>
              <PlanCanvas file={pdf} page={1} selected={selected} onSelect={setSelected} compact className="h-full" />
              {sel && (
                <div className="absolute bottom-3 right-3 top-3 z-20 w-[300px] overflow-hidden rounded-[10px] border border-line bg-surface shadow-ds-3">
                  <ElementInspector e={sel} onClose={() => setSelected(null)} onDetail={() => s.go('viewer', sel.id)} />
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={<MapIcon size={22} />} title="Aucun plan importé" action={<Button variant="primary" icon={<Import size={14} />} onClick={onImport}>Importer un plan PDF</Button>}>
              Importez les plans du projet pour les voir ici avec les éléments détectés (pièces, surfaces, menuiseries…).
            </EmptyState>
          )}
        </Card>

        {/* ---- Confiance, alertes, quantités ---- */}
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
          <Card title="Niveau de confiance" icon={<ShieldCheck size={15} />} className="shrink-0">
            <button onClick={() => setConfOpen(true)} className="flex w-full items-center gap-4 rounded-[8px] p-1 text-left transition-colors hover:bg-hover">
              <Ring value={conf.pct} size={80} stroke={8} sub="confirmé" segments={[{ value: conf.confirmed, color: 'var(--ok)' }, { value: conf.to_verify, color: 'var(--warn)' }, { value: conf.undetermined, color: 'var(--bad)' }]} />
              <div className="flex-1 space-y-1.5 text-[12px]">
                {(['confirmed', 'to_verify', 'undetermined'] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <StatusBadge status={k} />
                    <span className="ml-auto tabular-nums text-fg">{conf.total ? Math.round((conf[k] / conf.total) * 100) : 0} %</span>
                  </div>
                ))}
              </div>
            </button>
          </Card>
          <Card title="Alertes" icon={<AlertTriangle size={15} />} bodyClass="p-1.5" className="shrink-0">
            {alertRows.map((a) => <Row key={a.label} icon={a.icon} label={a.label} value={a.n} tone={a.n ? a.tone : 'ok'} onClick={() => s.go(a.view)} />)}
          </Card>
          <Card title="Quantités principales" icon={<Ruler size={15} />} bodyClass="p-1.5" className="shrink-0">
            {quantities.length === 0 && <p className="px-2 text-[12px] text-muted">Aucune quantité : importez un DQE.</p>}
            {quantities.map((q) => (
              <Row key={q.id} label={<span className="flex items-center gap-2"><StatusDot status={q.status} />{q.label}</span>} value={<>{formatNumber(q.value)} <span className="font-normal text-muted">{q.unit}</span>{q.missing ? <span className="ml-1 text-[11px] text-[#ff7a7a]">+{q.missing} ?</span> : null}</>} onClick={() => s.go('quantitatif')} />
            ))}
          </Card>
        </div>
      </Split>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1fr]">
        <Card title="Répartition des coûts par lot" icon={<CircleDollarSign size={15} />} actions={<span className="text-[12px] font-semibold tabular-nums text-fg">{formatMoney(r.totalHT, p.settings.currency)} HT</span>}>
          {costData.length ? (
            <Donut data={costData} unit="" onSelect={() => s.go('estimate')} center={<><span className="text-[10.5px] text-muted">Total HT</span><span className="text-[13px] font-bold tabular-nums text-fg">{formatNumber(r.totalHT / 1e6, 1)} M</span></>} />
          ) : (
            <p className="m-0 text-[12px] text-muted">Aucun montant : importez un DQE ou chiffrez les lignes.</p>
          )}
        </Card>
        <Card title="Évolution du montant estimatif" icon={<CircleDollarSign size={15} />} actions={<span className="text-[11px] text-muted">d’après le journal du projet</span>}>
          <LineChart points={history} height={170} empty="L’historique se construit à chaque modification du projet." format={(v) => formatMoney(v, p.settings.currency)} />
        </Card>
      </div>
      <ConfidenceDrawer open={confOpen} onClose={() => setConfOpen(false)} />
    </div>
  );
}
