// État de l'application : projet ouvert, annuler/rétablir, sauvegarde automatique,
// bibliothèque de prix, navigation et notifications.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkProject } from '../../core/checks';
import { computeProject, type ProjectResult } from '../../core/dqe';
import type { Alert, PriceItem, Project, ProjectSummary } from '../../core/types';
import type { AppSettings } from '../../shared/api';
import { api } from '../services/api';

export type View =
  | 'dashboard' | 'projects' | 'project' | 'overview' | 'model3d' | 'import' | 'analysis' | 'detection' | 'viewer' | 'metre'
  | 'quantitatif' | 'dqe' | 'estimate' | 'plans' | 'engineering' | 'converter' | 'prices' | 'documents' | 'ai' | 'settings';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
  action?: { label: string; run: () => void };
  at?: string;
}

interface Store {
  view: View;
  go: (v: View, focusLineId?: string) => void;
  focusLineId: string | null;
  settings: AppSettings | null;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  projects: ProjectSummary[];
  refreshProjects: () => Promise<void>;
  project: Project | null;
  folder: string | null;
  result: ProjectResult | null;
  alerts: Alert[];
  /** Applique une modification au projet (annulable, sauvegardée automatiquement). */
  update: (fn: (p: Project) => Project) => void;
  openProject: (folder: string) => Promise<void>;
  createProject: (p: Project) => Promise<void>;
  closeProject: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
  lastSaved: string | null;
  saveNow: () => Promise<void>;
  prices: PriceItem[];
  setPrices: (items: PriceItem[]) => Promise<void>;
  toast: (kind: Toast['kind'], text: string, action?: Toast['action']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  /** Historique des notifications de la session (centre de notifications). */
  activity: Toast[];
  online: boolean;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}

const HISTORY = 100;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('dashboard');
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [prices, setPricesState] = useState<PriceItem[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activity, setActivity] = useState<Toast[]>([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ project: Project | null; folder: string | null }>({ project: null, folder: null });

  const toast = useCallback((kind: Toast['kind'], text: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text, action }]);
    setActivity((a) => [{ id, kind, text, at: new Date().toISOString() }, ...a].slice(0, 40));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 12000 : 6000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch (e) {
      toast('error', `Liste des projets indisponible : ${(e as Error).message}`);
    }
  }, [toast]);

  useEffect(() => {
    void (async () => {
      setSettingsState(await api.getSettings());
      setPricesState(await api.loadPrices());
      await refreshProjects();
    })();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refreshProjects]);

  const doSave = useCallback(async () => {
    const { project: p, folder: f } = latest.current;
    if (!p || !f) return;
    setSaveState('saving');
    try {
      const r = await api.saveProject(f, p);
      setLastSaved(r.savedAt);
      setSaveState((s) => (s === 'saving' ? 'saved' : s));
    } catch (e) {
      setSaveState('error');
      toast('error', `Échec de la sauvegarde automatique : ${(e as Error).message}`);
    }
  }, [toast]);

  const scheduleSave = useCallback(() => {
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(), 800);
  }, [doSave]);

  const saveNow = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await doSave();
  }, [doSave]);

  // Sauvegarde immédiate si l'utilisateur ferme la fenêtre avec des changements en attente.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving') {
        void doSave();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState, doSave]);

  // Historique annuler / rétablir : tenu dans des refs pour que plusieurs modifications
  // successives dans le même événement s'enchaînent correctement.
  const pastRef = useRef<Project[]>([]);
  const futureRef = useRef<Project[]>([]);
  const syncHistory = () => {
    setPast(pastRef.current);
    setFuture(futureRef.current);
  };

  const commit = useCallback(
    (next: Project) => {
      latest.current.project = next;
      setProject(next);
      scheduleSave();
    },
    [scheduleSave],
  );

  const update = useCallback(
    (fn: (p: Project) => Project) => {
      const cur = latest.current.project;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      pastRef.current = [...pastRef.current.slice(-HISTORY + 1), cur];
      futureRef.current = [];
      syncHistory();
      commit(next);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const cur = latest.current.project;
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!cur || !prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [cur, ...futureRef.current];
    syncHistory();
    commit(prev);
  }, [commit]);

  const redo = useCallback(() => {
    const cur = latest.current.project;
    const next = futureRef.current[0];
    if (!cur || !next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, cur];
    syncHistory();
    commit(next);
  }, [commit]);

  const resetHistory = () => {
    pastRef.current = [];
    futureRef.current = [];
    syncHistory();
  };

  const openProject = useCallback(
    async (f: string) => {
      await saveNow();
      try {
        const r = await api.openProject(f);
        latest.current = { project: r.project, folder: r.folder };
        setProject(r.project);
        setFolder(r.folder);
        resetHistory();
        setSaveState('saved');
        setLastSaved(r.project.updatedAt);
        setView('overview');
        if (r.recovered) toast('error', r.recovered);
      } catch (e) {
        toast('error', `Impossible d’ouvrir le projet : ${(e as Error).message}`);
      }
    },
    [saveNow, toast],
  );

  const createProject = useCallback(
    async (p: Project) => {
      await saveNow();
      const r = await api.createProject(p);
      latest.current = { project: r.project, folder: r.folder };
      setProject(r.project);
      setFolder(r.folder);
      resetHistory();
      setSaveState('saved');
      setLastSaved(r.project.updatedAt);
      await refreshProjects();
    },
    [saveNow, refreshProjects],
  );

  const closeProject = useCallback(async () => {
    await saveNow();
    latest.current = { project: null, folder: null };
    setProject(null);
    setFolder(null);
    resetHistory();
    setView('dashboard');
    await refreshProjects();
  }, [saveNow, refreshProjects]);

  const setSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettingsState(await api.setSettings(patch));
  }, []);

  const setPrices = useCallback(
    async (items: PriceItem[]) => {
      setPricesState(items);
      try {
        await api.savePrices(items);
      } catch (e) {
        toast('error', `Bibliothèque de prix non enregistrée : ${(e as Error).message}`);
      }
    },
    [toast],
  );

  const go = useCallback((v: View, lineId?: string) => {
    setView(v);
    setFocusLineId(lineId ?? null);
  }, []);

  const result = useMemo(() => (project ? computeProject(project) : null), [project]);
  const alerts = useMemo(() => (project && result ? checkProject(project, result, prices) : []), [project, result, prices]);

  const value: Store = {
    view, go, focusLineId, settings, setSettings, projects, refreshProjects, project, folder, result, alerts,
    update, openProject, createProject, closeProject, undo, redo,
    canUndo: past.length > 0, canRedo: future.length > 0,
    saveState, lastSaved, saveNow, prices, setPrices, toast, toasts, dismissToast, activity, online,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
