// Coquille de l'application DQP : barre latérale, barre supérieure, espace de travail
// du projet, contenu, barre d'état. Les écrans lourds sont chargés à la demande.

import { FolderOpen, FolderPlus, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type ReactElement } from 'react';
import { crossCheck } from '../core/elements/crosscheck';
import { formatMoney } from '../core/format';
import { PromptDialog } from './ds/legacy';
import { cx, EmptyState, Skeleton } from './ds/primitives';
import { HelpDrawer } from './features/help/HelpDrawer';
import { CommandPalette } from './features/search/CommandPalette';
import { WorkspaceHeader } from './features/workspace/WorkspaceHeader';
import { useHotkey, useLocalState, useMediaQuery } from './hooks';
import { ALL_NAV, WORKSPACE_VIEWS } from './layouts/nav';
import { Sidebar } from './layouts/Sidebar';
import { Topbar } from './layouts/Topbar';
import { ImportView, useImporter } from './pages/ImportView';
import { NewProjectDialog } from './pages/NewProjectDialog';
import { api } from './services/api';
import { useExports } from './services/exports';
import { useStore, type View } from './stores/app-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = React.ComponentType<any>;
const named = (loader: () => Promise<Record<string, unknown>>, key: string) =>
  lazy(async () => ({ default: (await loader())[key] as AnyComponent }));

const DashboardPage = named(() => import('./pages/DashboardPage'), 'DashboardPage');
const OverviewPage = named(() => import('./pages/OverviewPage'), 'OverviewPage');
const ProjectsView = named(() => import('./pages/ProjectsView'), 'ProjectsView');
const ProjectInfoView = named(() => import('./pages/ProjectInfoView'), 'ProjectInfoView');
const AnalysisView = named(() => import('./pages/AnalysisView'), 'AnalysisView');
const DetectionPage = named(() => import('./pages/DetectionPage'), 'DetectionPage');
const PlanViewerView = named(() => import('./pages/PlanViewerView'), 'PlanViewerView');
const MetreView = named(() => import('./pages/MetreView'), 'MetreView');
const QuantitatifPage = named(() => import('./pages/QuantitatifPage'), 'QuantitatifPage');
const DqeView = named(() => import('./pages/DqeView'), 'DqeView');
const EstimateView = named(() => import('./pages/EstimateView'), 'EstimateView');
const PricesView = named(() => import('./pages/PricesView'), 'PricesView');
const DocumentsView = named(() => import('./pages/DocumentsView'), 'DocumentsView');
const SettingsView = named(() => import('./pages/SettingsView'), 'SettingsView');
const PlansView = named(() => import('./pages/PlannedViews'), 'PlansView');
const EngineeringView = named(() => import('./pages/PlannedViews'), 'EngineeringView');
const ConverterView = named(() => import('./pages/PlannedViews'), 'ConverterView');
const AiView = named(() => import('./pages/PlannedViews'), 'AiView');
const Model3DView = named(() => import('./pages/PlannedViews'), 'Model3DView');

function PageSkeleton() {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Chargement de l’écran">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-3 w-96" />
      <div className="grid grid-cols-4 gap-3 pt-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function App() {
  const s = useStore();
  const [newProject, setNewProject] = useState(false);
  const [versionPrompt, setVersionPrompt] = useState(false);
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const narrow = useMediaQuery('(max-width: 1440px)');
  const [collapsedPref, setCollapsed] = useLocalState<boolean | null>('sidebarCollapsed', null);
  const collapsed = collapsedPref ?? narrow;
  const importer = useImporter();
  const exporter = useExports();
  const p = s.project;

  // Menus natifs de l'application de bureau.
  useEffect(
    () =>
      api.onMenu((cmd) => {
        switch (cmd.type) {
          case 'navigate': s.go(cmd.view as View); break;
          case 'new-project': setNewProject(true); break;
          case 'open-project': s.go('projects'); break;
          case 'import': if (s.project) void importer.pick(); else s.toast('info', 'Créez ou ouvrez d’abord un projet.'); break;
          case 'save-version': if (s.project) setVersionPrompt(true); break;
          case 'export': if (s.project) void exporter.run(cmd.format); break;
          case 'undo': s.undo(); break;
          case 'redo': s.redo(); break;
        }
      }),
    [s, importer, exporter],
  );

  // Raccourcis de l'interface ; ceux des menus natifs sont doublés en mode navigateur.
  const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement | null)?.tagName ?? '');
  useHotkey('mod+k', (e) => { e.preventDefault(); setSearch(true); });
  useHotkey('mod+b', (e) => { e.preventDefault(); setCollapsed(!collapsed); });
  useHotkey('f1', (e) => { e.preventDefault(); setHelp(true); });
  const web = api.platform !== 'electron';
  useHotkey('mod+z', (e) => { if (!typing()) { e.preventDefault(); s.undo(); } }, web);
  useHotkey('mod+y', (e) => { if (!typing()) { e.preventDefault(); s.redo(); } }, web);
  useHotkey('mod+s', (e) => { e.preventDefault(); if (p) setVersionPrompt(true); }, web);

  const commands = useMemo(
    () => [
      { id: 'new', label: 'Nouveau projet', hint: 'Ctrl+N', run: () => setNewProject(true) },
      ...(p
        ? [
            { id: 'import', label: 'Importer des fichiers', hint: 'Excel, CSV, PDF', run: () => void importer.pick() },
            { id: 'xlsx', label: 'Exporter le DQE en Excel', run: () => void exporter.run('xlsx') },
            { id: 'pdf', label: 'Exporter le DQE en PDF', run: () => void exporter.run('pdf-dqe') },
            { id: 'report', label: 'Générer le rapport d’analyse', run: () => void exporter.run('pdf-report') },
            { id: 'version', label: 'Créer une version du projet', hint: 'Ctrl+S', run: () => setVersionPrompt(true) },
            { id: 'close', label: 'Fermer le projet', run: () => void s.closeProject() },
          ]
        : []),
      { id: 'help', label: 'Aide et raccourcis clavier', hint: 'F1', run: () => setHelp(true) },
    ],
    [p, importer, exporter, s],
  );

  // Badges de la barre latérale : uniquement des comptes réels.
  const badges = useMemo(() => {
    if (!p || !s.result) return {};
    const errors = [...p.analyses.flatMap((a) => a.fileAlerts), ...s.alerts].filter((a) => a.severity === 'error').length;
    const diffs = crossCheck(p, s.result).filter((c) => c.differs && !c.resolution).length;
    return { analysis: errors + diffs, dqe: s.result.incomplete };
  }, [p, s.result, s.alerts]);

  const pages: Record<View, ReactElement> = {
    dashboard: <DashboardPage onNew={() => setNewProject(true)} onImport={() => void importer.pick()} />,
    overview: <OverviewPage onImport={() => void importer.pick()} />,
    model3d: <Model3DView />,
    projects: <ProjectsView onNew={() => setNewProject(true)} />,
    project: <ProjectInfoView />,
    import: <ImportView importer={importer} />,
    analysis: <AnalysisView />,
    detection: <DetectionPage />,
    viewer: <PlanViewerView />,
    metre: <MetreView />,
    quantitatif: <QuantitatifPage />,
    dqe: <DqeView />,
    estimate: <EstimateView />,
    prices: <PricesView />,
    documents: <DocumentsView exporter={exporter} onVersion={() => setVersionPrompt(true)} />,
    plans: <PlansView />,
    engineering: <EngineeringView />,
    converter: <ConverterView />,
    ai: <AiView />,
    settings: <SettingsView />,
  };
  const needsProject = ALL_NAV.find((i) => i.view === s.view)?.needsProject || WORKSPACE_VIEWS.has(s.view);
  const inWorkspace = !!p && WORKSPACE_VIEWS.has(s.view);
  const flush = inWorkspace && s.view === 'dqe';
  const content = needsProject && !p ? (
    <EmptyState
      icon={<FolderOpen size={22} />}
      title="Aucun projet ouvert"
      action={<><button className="btn primary" onClick={() => setNewProject(true)}><FolderPlus size={14} />Nouveau projet</button><button className="btn" onClick={() => s.go('projects')}>Ouvrir un projet</button></>}
    >
      Ce module travaille sur un projet. Créez un projet ou ouvrez un projet existant.
    </EmptyState>
  ) : pages[s.view];

  return (
    <div className="flex h-full bg-bg text-fg">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          exporter={exporter}
          onSearch={() => setSearch(true)}
          onNewProject={() => setNewProject(true)}
          onImport={() => void importer.pick()}
          onVersion={() => setVersionPrompt(true)}
          onHelp={() => setHelp(true)}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />
        {inWorkspace && <WorkspaceHeader />}
        <main className={cx('relative min-h-0 flex-1 bg-[radial-gradient(1200px_500px_at_60%_-10%,rgba(47,124,246,.07),transparent)]', flush ? 'flex flex-col overflow-hidden' : 'overflow-auto')}>
          <div key={s.view + (p?.id ?? '')} className={cx('anim-rise', flush ? 'flex min-h-0 flex-1 flex-col' : 'px-5 py-4')}>
            <Suspense fallback={<PageSkeleton />}>{content}</Suspense>
          </div>
        </main>
        <footer className="flex h-[26px] shrink-0 items-center gap-4 border-t border-line-2 bg-[#070d18] px-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            {p ? (
              <>
                <span className={cx('h-1.5 w-1.5 rounded-full', s.saveState === 'error' ? 'bg-[var(--bad)]' : s.saveState === 'saved' ? 'bg-[var(--ok)]' : 'pulse bg-[var(--warn)]')} />
                {s.saveState === 'saved' && `Modifications enregistrées${s.lastSaved ? ' à ' + new Date(s.lastSaved).toLocaleTimeString('fr-FR') : ''}`}
                {s.saveState === 'dirty' && 'Modifications en attente…'}
                {s.saveState === 'saving' && 'Enregistrement…'}
                {s.saveState === 'error' && 'Échec de l’enregistrement'}
              </>
            ) : 'Aucun projet ouvert'}
          </span>
          {p && s.result && (
            <span className="tabular-nums">
              {s.result.lineCount} lignes · 🟢 {s.result.status.confirmed} · 🟠 {s.result.status.to_verify} · 🔴 {s.result.status.undetermined} · {formatMoney(s.result.totalHT, p.settings.currency)} HT
            </span>
          )}
          <span className="ml-auto">{api.platform === 'electron' ? 'DQP' : 'DQP (mode navigateur)'} {api.appVersion}</span>
        </footer>
      </div>

      <CommandPalette open={search} onClose={() => setSearch(false)} commands={commands} />
      <HelpDrawer open={help} onClose={() => setHelp(false)} />
      {newProject && <NewProjectDialog onClose={() => setNewProject(false)} />}
      {versionPrompt && (
        <PromptDialog
          title="Créer une version du projet"
          label="Nom de la version"
          initial={`Version du ${new Date().toLocaleString('fr-FR')}`}
          confirm="Créer la version"
          onCancel={() => setVersionPrompt(false)}
          onSubmit={async (label) => {
            setVersionPrompt(false);
            if (!s.project || !s.folder) return;
            await s.saveNow();
            await api.createVersion(s.folder, s.project, label);
            s.toast('success', `Version « ${label} » créée.`);
          }}
        />
      )}
      {importer.dialog}
      <div className="toasts" aria-live="polite">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="text-[12.5px]">{t.text}</span>
            {t.action && <button className="act" onClick={t.action.run}>{t.action.label}</button>}
            <button className="x" onClick={() => s.dismissToast(t.id)} aria-label="Fermer"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
