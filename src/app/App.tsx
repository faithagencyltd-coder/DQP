import {
  BookOpen, Bot, Image as ImageIcon, Calculator, ChartColumn, ClipboardCheck, Cpu, FileDown, FileSpreadsheet, FileText, FolderOpen,
  FolderPlus, Gauge, History, Import, LayoutDashboard, Map, Redo2, Ruler, ScanSearch, Settings, Undo2, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatMoney } from '../core/format';
import { api } from './browserApi';
import { useExports } from './exports';
import { useStore, type View } from './store';
import { AnalysisView } from './views/AnalysisView';
import { DashboardView } from './views/DashboardView';
import { DocumentsView } from './views/DocumentsView';
import { DqeView } from './views/DqeView';
import { EstimateView } from './views/EstimateView';
import { ImportView, useImporter } from './views/ImportView';
import { MetreView } from './views/MetreView';
import { PlanViewerView } from './views/PlanViewerView';
import { NewProjectDialog } from './views/NewProjectDialog';
import { AiView, ConverterView, EngineeringView, PlansView } from './views/PlannedViews';
import { PricesView } from './views/PricesView';
import { ProjectInfoView } from './views/ProjectInfoView';
import { ProjectsView } from './views/ProjectsView';
import { SettingsView } from './views/SettingsView';
import { PromptDialog } from './components/ui';

const NAV: { group: string; items: { view: View; label: string; icon: typeof Gauge; needsProject?: boolean; phase?: string }[] }[] = [
  {
    group: 'Projet',
    items: [
      { view: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { view: 'projects', label: 'Projets', icon: FolderOpen },
      { view: 'import', label: 'Importation', icon: Import, needsProject: true },
    ],
  },
  {
    group: 'Analyse et chiffrage',
    items: [
      { view: 'analysis', label: 'Analyse', icon: ScanSearch, needsProject: true },
      { view: 'viewer', label: 'Aperçu des plans', icon: ImageIcon, needsProject: true },
      { view: 'metre', label: 'Métré', icon: Ruler, needsProject: true },
      { view: 'dqe', label: 'DQE', icon: FileSpreadsheet, needsProject: true },
      { view: 'estimate', label: 'Estimation', icon: ChartColumn, needsProject: true },
      { view: 'prices', label: 'Bibliothèque de prix', icon: BookOpen },
    ],
  },
  {
    group: 'Production',
    items: [
      { view: 'documents', label: 'Documents', icon: FileText, needsProject: true },
      { view: 'plans', label: 'Plans techniques', icon: Map, phase: 'P5' },
      { view: 'engineering', label: 'Engineering', icon: Calculator, phase: 'P6' },
      { view: 'converter', label: 'Converter', icon: Cpu, phase: 'P7' },
      { view: 'ai', label: 'DQP AI', icon: Bot, phase: 'P8' },
    ],
  },
];

const FLOW: { n: string; label: string; view: View }[] = [
  { n: '01', label: 'Nouveau projet', view: 'projects' },
  { n: '02', label: 'Importer', view: 'import' },
  { n: '03', label: 'Analyser', view: 'analysis' },
  { n: '04', label: 'Vérifier', view: 'analysis' },
  { n: '05', label: 'Métré', view: 'metre' },
  { n: '06', label: 'DQE', view: 'dqe' },
  { n: '07', label: 'Estimation', view: 'estimate' },
  { n: '08', label: 'Rapport', view: 'documents' },
  { n: '09', label: 'Exporter', view: 'documents' },
];

export function App() {
  const s = useStore();
  const [newProject, setNewProject] = useState(false);
  const [versionPrompt, setVersionPrompt] = useState(false);
  const importer = useImporter();
  const exporter = useExports();

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

  // Raccourcis clavier en mode navigateur (dans l'application, les menus les gèrent).
  useEffect(() => {
    if (api.platform === 'electron') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); s.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  const p = s.project;
  const hasLines = !!s.result && s.result.lineCount > 0;
  const flowDone: Record<string, boolean> = {
    '01': !!p,
    '02': !!p && p.sourceFiles.length > 0,
    '03': !!p && p.analyses.length > 0,
    '04': !!s.result && hasLines && s.result.status.to_verify === 0,
    '05': hasLines,
    '06': hasLines,
    '07': !!s.result && hasLines && s.result.incomplete === 0,
    '08': !!p && p.journal.some((j) => j.action.startsWith('Rapport')),
    '09': !!p && p.journal.some((j) => j.action.startsWith('Export')),
  };

  const views: Record<View, React.ReactElement> = {
    dashboard: <DashboardView onNew={() => setNewProject(true)} onImport={() => void importer.pick()} />,
    projects: <ProjectsView onNew={() => setNewProject(true)} />,
    project: <ProjectInfoView />,
    import: <ImportView importer={importer} />,
    analysis: <AnalysisView />,
    viewer: <PlanViewerView />,
    metre: <MetreView />,
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
  const needs = NAV.flatMap((g) => g.items).find((i) => i.view === s.view)?.needsProject || s.view === 'project';
  const current = needs && !p ? <NoProject onNew={() => setNewProject(true)} /> : views[s.view];

  return (
    <div className="app">
      <div className="toolbar">
        <div className="brand"><span className="logo">DQP</span>DQP</div>
        <button className="tb" onClick={() => setNewProject(true)} title="Nouveau projet (Ctrl+N)"><FolderPlus size={16} />Nouveau</button>
        <button className="tb" onClick={() => s.go('projects')} title="Ouvrir un projet"><FolderOpen size={16} />Ouvrir</button>
        <button className="tb" disabled={!p} onClick={() => void importer.pick()} title="Importer un fichier (Ctrl+I)"><Import size={16} />Importer</button>
        <span className="sep" />
        <button className="tb" disabled={!s.canUndo} onClick={s.undo} title="Annuler (Ctrl+Z)"><Undo2 size={16} /></button>
        <button className="tb" disabled={!s.canRedo} onClick={s.redo} title="Rétablir (Ctrl+Y)"><Redo2 size={16} /></button>
        <span className="sep" />
        <button className="tb" disabled={!hasLines || exporter.busy} onClick={() => void exporter.run('xlsx')} title="Exporter le DQE en Excel"><FileSpreadsheet size={16} />Excel</button>
        <button className="tb" disabled={!hasLines || exporter.busy} onClick={() => void exporter.run('pdf-dqe')} title="Exporter le DQE en PDF"><FileDown size={16} />PDF</button>
        <button className="tb" disabled={!p || exporter.busy} onClick={() => void exporter.run('pdf-report')} title="Rapport d’analyse PDF"><ClipboardCheck size={16} />Rapport</button>
        <button className="tb" disabled={!p} onClick={() => setVersionPrompt(true)} title="Créer une version (Ctrl+S)"><History size={16} />Version</button>
        <div className="proj">
          {p && (
            <>
              <b style={{ color: 'var(--text)' }}>{p.info.name}</b>
              {s.result && <span>· {formatMoney(s.result.totalHT, p.settings.currency)} HT</span>}
              <button className="icon-btn" title="Fermer le projet" onClick={() => void s.closeProject()}><X size={15} /></button>
            </>
          )}
          <button className="tb" onClick={() => s.go('settings')} title="Paramètres"><Settings size={16} /></button>
        </div>
      </div>

      <nav className="flow" aria-label="Parcours">
        {FLOW.map((f, i) => (
          <span key={f.n} style={{ display: 'flex' }}>
            {i > 0 && <span className="arrow">›</span>}
            <button
              className={`${flowDone[f.n] ? 'done' : ''} ${s.view === f.view && (f.n !== '04' && f.n !== '09') ? 'active' : ''}`}
              onClick={() => (f.n === '01' && !p ? setNewProject(true) : s.go(f.view))}
            >
              <span className="n">{flowDone[f.n] ? '✓' : f.n}</span>
              {f.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="body">
        <aside className="side">
          {NAV.map((g) => (
            <div key={g.group}>
              <h6>{g.group}</h6>
              {g.items.map((it) => (
                <button key={it.view} className={s.view === it.view ? 'active' : ''} onClick={() => s.go(it.view)}>
                  <it.icon size={16} />
                  {it.label}
                  {it.phase && <span className="tag">{it.phase}</span>}
                </button>
              ))}
            </div>
          ))}
          <h6>Application</h6>
          <button className={s.view === 'settings' ? 'active' : ''} onClick={() => s.go('settings')}><Settings size={16} />Paramètres</button>
        </aside>
        <main className={`main ${s.view === 'dqe' && p ? 'flush' : ''}`}>{current}</main>
      </div>

      <footer className="status">
        <span>
          {p ? (
            <>
              <span className="dot" style={{ background: s.saveState === 'error' ? '#f87171' : s.saveState === 'saved' ? '#4ade80' : '#facc15' }} />
              {s.saveState === 'saved' && `Enregistré${s.lastSaved ? ' à ' + new Date(s.lastSaved).toLocaleTimeString('fr-FR') : ''}`}
              {s.saveState === 'dirty' && 'Modifications en attente…'}
              {s.saveState === 'saving' && 'Enregistrement…'}
              {s.saveState === 'error' && 'Échec de l’enregistrement'}
            </>
          ) : (
            'Aucun projet ouvert'
          )}
        </span>
        {p && s.result && (
          <span>
            {s.result.lineCount} lignes · 🟢 {s.result.status.confirmed} · 🟠 {s.result.status.to_verify} · 🔴 {s.result.status.undetermined}
          </span>
        )}
        <span className="r">
          <span title="Les fonctions IA et services distants nécessitent Internet">
            <span className="dot" style={{ background: s.online ? '#4ade80' : '#9ca3af' }} />
            {s.online ? 'En ligne' : 'Hors ligne — fonctions locales disponibles'}
          </span>
          <span>{api.platform === 'electron' ? 'DQP' : 'DQP (mode navigateur)'} {api.appVersion}</span>
        </span>
      </footer>

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
      <div className="toasts">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            {t.action && <button className="act" onClick={t.action.run}>{t.action.label}</button>}
            <button className="x" onClick={() => s.dismissToast(t.id)} aria-label="Fermer"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoProject({ onNew }: { onNew: () => void }) {
  const s = useStore();
  return (
    <div className="empty">
      <FolderOpen size={36} />
      <h2>Aucun projet ouvert</h2>
      <p>Créez un nouveau projet ou ouvrez un projet existant pour continuer.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary" onClick={onNew}><FolderPlus size={15} />Nouveau projet</button>
        <button className="btn" onClick={() => s.go('projects')}><FolderOpen size={15} />Ouvrir un projet</button>
      </div>
    </div>
  );
}
