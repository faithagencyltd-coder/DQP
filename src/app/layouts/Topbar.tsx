import {
  Bell, Check, ChevronDown, CircleHelp, ClipboardCheck, Download, FileDown, FileSpreadsheet, FolderOpen, FolderPlus, History,
  Import, Info, LayoutGrid, LogOut, Redo2, Search, Settings, SlidersHorizontal, Undo2, UserRound, Wifi, WifiOff,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { crossCheck } from '../../core/elements/crosscheck';
import { formatMoney } from '../../core/format';
import { Button, cx, Dropdown, IconButton, Kbd, Tooltip } from '../ds/primitives';
import { api } from '../services/api';
import type { Exporter, ExportFormat } from '../services/exports';
import { useStore } from '../stores/app-store';

function ExportButton({ exporter, disabled }: { exporter: Exporter; disabled: boolean }) {
  const [done, setDone] = useState(false);
  const run = async (f: ExportFormat) => {
    const ok = await exporter.run(f);
    if (ok) {
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    }
  };
  return (
    <Dropdown
      align="right"
      items={[
        { label: 'DQE Excel (.xlsx)', hint: 'Formules vivantes, traçabilité, contrôles', icon: <FileSpreadsheet size={14} />, onSelect: () => void run('xlsx') },
        { label: 'DQE PDF', hint: 'Présentation A4 professionnelle', icon: <FileDown size={14} />, onSelect: () => void run('pdf-dqe') },
        { separator: true },
        { label: 'Rapport d’analyse PDF', icon: <ClipboardCheck size={14} />, onSelect: () => void run('pdf-report') },
      ]}
      trigger={(open, toggle) => (
        <Button
          size="sm"
          variant={done ? 'success' : 'primary'}
          loading={exporter.busy}
          disabled={disabled}
          onClick={toggle}
          icon={done ? <Check size={14} /> : <Download size={14} />}
          className={cx(open && 'bg-brand-2')}
        >
          {exporter.busy ? 'Export…' : done ? 'Exporté' : 'Exporter'}
          {!exporter.busy && !done && <ChevronDown size={13} className="opacity-70" />}
        </Button>
      )}
    />
  );
}

export function Topbar(props: {
  exporter: Exporter;
  onSearch: () => void;
  onNewProject: () => void;
  onImport: () => void;
  onVersion: () => void;
  onHelp: () => void;
  onToggleSidebar: () => void;
}) {
  const s = useStore();
  const p = s.project;
  const r = s.result;
  const hasLines = !!r && r.lineCount > 0;

  // Notifications : erreurs réelles du projet, différences entre fichiers à arbitrer, activité.
  const notes = useMemo(() => {
    if (!p || !r) return { errors: [], diffs: [], count: 0 };
    const errors = [...p.analyses.flatMap((a) => a.fileAlerts), ...s.alerts].filter((a) => a.severity === 'error');
    const diffs = crossCheck(p, r).filter((c) => c.differs && !c.resolution);
    return { errors, diffs, count: errors.length + diffs.length };
  }, [p, r, s.alerts]);
  const [seen, setSeen] = useState(0);
  useEffect(() => setSeen(0), [p?.id]);
  const unread = Math.max(0, notes.count - seen);
  const initials = (s.settings?.userName || 'Utilisateur').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="flex h-[var(--topbar)] shrink-0 items-center gap-2 border-b border-line-2 bg-[rgba(10,17,32,.92)] px-3 backdrop-blur">
      {/* Projet actif */}
      <Dropdown
        width={300}
        trigger={(open, toggle) => (
          <button onClick={toggle} className={cx('flex h-9 max-w-[300px] items-center gap-2.5 rounded-[8px] border px-2.5 transition-colors', open ? 'border-line-strong bg-hover' : 'border-transparent hover:border-line hover:bg-hover')}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br from-brand to-cyan text-[10px] font-bold text-white">
              {p ? p.info.name.slice(0, 2).toUpperCase() : <FolderOpen size={13} />}
            </span>
            <span className="min-w-0 text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-[0.1em] text-faint">Projet</span>
              <span className="block truncate text-[13px] font-semibold text-fg">{p ? p.info.name : 'Aucun projet ouvert'}</span>
            </span>
            <ChevronDown size={14} className="shrink-0 text-muted" />
          </button>
        )}
        items={[
          ...(p
            ? [
                { label: 'Vue d’ensemble du projet', icon: <LayoutGrid size={14} />, onSelect: () => s.go('overview') },
                { label: 'Informations du projet', icon: <Info size={14} />, onSelect: () => s.go('project') },
                { separator: true },
              ]
            : []),
          ...s.projects.filter((x) => x.folder !== s.folder).slice(0, 5).map((x) => ({ label: x.name, hint: `${formatMoney(x.total)} · modifié le ${new Date(x.updatedAt).toLocaleDateString('fr-FR')}`, icon: <FolderOpen size={14} />, onSelect: () => void s.openProject(x.folder) })),
          { separator: true },
          { label: 'Nouveau projet…', icon: <FolderPlus size={14} />, shortcut: 'Ctrl N', onSelect: props.onNewProject },
          { label: 'Tous les projets', icon: <FolderOpen size={14} />, onSelect: () => s.go('projects') },
          ...(p ? [{ label: 'Fermer le projet', icon: <LogOut size={14} />, onSelect: () => void s.closeProject() }] : []),
        ]}
      />

      {/* Recherche globale */}
      <button onClick={props.onSearch} className="mx-auto flex h-9 w-full max-w-[520px] items-center gap-2.5 rounded-[8px] border border-line bg-bg-2 px-3 text-left text-[12.5px] text-faint transition-colors hover:border-line-strong hover:text-muted">
        <Search size={15} />
        <span className="flex-1 truncate">Rechercher un projet, un fichier, un ouvrage, un élément, un prix…</span>
        <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
      </button>

      {/* Actions rapides */}
      <div className="flex items-center gap-1">
        <IconButton label="Annuler (Ctrl+Z)" size="sm" disabled={!s.canUndo} onClick={s.undo}><Undo2 size={15} /></IconButton>
        <IconButton label="Rétablir (Ctrl+Y)" size="sm" disabled={!s.canRedo} onClick={s.redo}><Redo2 size={15} /></IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button size="sm" variant="secondary" icon={<Import size={14} />} disabled={!p} onClick={props.onImport}>Importer</Button>
        <Tooltip label="Créer une version du projet (Ctrl+S)" side="bottom">
          <Button size="sm" variant="secondary" icon={<History size={14} />} disabled={!p} onClick={props.onVersion}>Version</Button>
        </Tooltip>
        <ExportButton exporter={props.exporter} disabled={!hasLines && !p} />
        <span className="mx-1 h-5 w-px bg-line" />

        <Tooltip label={s.online ? 'Connecté à Internet. Les fonctions locales n’en dépendent pas.' : 'Hors ligne : import, analyse, DQE et exports restent disponibles. L’IA et les mises à jour attendront la connexion.'} side="bottom">
          <span className={cx('hidden h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium xl:flex', s.online ? 'border-[rgba(34,197,94,.3)] text-[#4ade80]' : 'border-line text-muted')}>
            {s.online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {s.online ? 'En ligne' : 'Hors ligne'}
          </span>
        </Tooltip>

        <Dropdown
          align="right"
          width={380}
          trigger={(open, toggle) => (
            <span className="relative">
              <IconButton label="Notifications" size="sm" active={open} onClick={(e) => { toggle(e); setSeen(notes.count); }}><Bell size={16} /></IconButton>
              {unread > 0 && <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full bg-[var(--bad)] px-1 text-center text-[10px] font-bold leading-4 text-white">{unread}</span>}
            </span>
          )}
        >
          {(close) => (
            <div className="max-h-[60vh] overflow-y-auto p-1">
              <div className="px-2.5 py-2 text-[12px] font-semibold text-fg">Notifications</div>
              {!p && <div className="px-2.5 pb-3 text-[12px] text-muted">Ouvrez un projet pour voir ses alertes.</div>}
              {notes.diffs.map((d) => (
                <button key={d.key} onClick={() => { s.go('analysis'); close(); }} className="flex w-full gap-2.5 rounded-[6px] px-2.5 py-2 text-left hover:bg-hover">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--warn)]" />
                  <span className="text-[12px] text-fg-2"><b className="text-fg">Différence entre fichiers</b> — {d.subject} : {d.values.map((v) => `${v.source} ${v.value ?? '—'}`).join(' / ')}</span>
                </button>
              ))}
              {notes.errors.slice(0, 12).map((a) => (
                <button key={a.id} onClick={() => { s.go(a.lineId ? 'dqe' : 'analysis', a.lineId); close(); }} className="flex w-full gap-2.5 rounded-[6px] px-2.5 py-2 text-left hover:bg-hover">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--bad)]" />
                  <span className="line-clamp-3 text-[12px] text-fg-2">{a.message}</span>
                </button>
              ))}
              {s.activity.length > 0 && <div className="mt-1 border-t border-line-2 px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Activité de la session</div>}
              {s.activity.slice(0, 8).map((t) => (
                <div key={t.id} className="flex gap-2.5 px-2.5 py-1.5 text-[11.5px] text-muted">
                  <span className="shrink-0 tabular-nums">{t.at ? new Date(t.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  <span className="line-clamp-2">{t.text}</span>
                </div>
              ))}
              {p && notes.count === 0 && s.activity.length === 0 && <div className="px-2.5 pb-3 text-[12px] text-muted">Aucune alerte bloquante.</div>}
            </div>
          )}
        </Dropdown>

        <IconButton label="Aide et raccourcis (F1)" size="sm" onClick={props.onHelp}><CircleHelp size={16} /></IconButton>

        <Dropdown
          align="right"
          trigger={(open, toggle) => <IconButton label="Paramètres rapides" size="sm" active={open} onClick={toggle}><SlidersHorizontal size={16} /></IconButton>}
          items={[
            { label: 'Réduire / agrandir le menu', icon: <LayoutGrid size={14} />, shortcut: 'Ctrl B', onSelect: props.onToggleSidebar },
            { label: 'Paramètres du projet (TVA, monnaie)', icon: <Info size={14} />, disabled: !p, onSelect: () => s.go('project') },
            { label: 'Paramètres de l’application', icon: <Settings size={14} />, onSelect: () => s.go('settings') },
          ]}
        />

        <Dropdown
          align="right"
          width={260}
          trigger={(open, toggle) => (
            <button onClick={toggle} className={cx('ml-1 flex h-9 items-center gap-2 rounded-[8px] border px-1.5 pr-2 transition-colors', open ? 'border-line-strong bg-hover' : 'border-transparent hover:bg-hover')}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#2a4f8f] to-[#1b3363] text-[11px] font-bold text-fg ring-1 ring-line-strong">{initials}</span>
              <span className="hidden text-left leading-tight 2xl:block">
                <span className="block max-w-[140px] truncate text-[12px] font-semibold text-fg">{s.settings?.userName || 'Utilisateur local'}</span>
                <span className="block text-[10.5px] text-muted">{s.settings?.role || s.settings?.company || 'Poste de travail'}</span>
              </span>
            </button>
          )}
          items={[
            { label: s.settings?.userName || 'Utilisateur local', hint: 'Profil local, sans compte en ligne', icon: <UserRound size={14} />, onSelect: () => s.go('settings') },
            { separator: true },
            { label: 'Paramètres', icon: <Settings size={14} />, onSelect: () => s.go('settings') },
            { label: `À propos — DQP ${api.appVersion}`, icon: <Info size={14} />, onSelect: () => s.go('settings') },
          ]}
        />
      </div>
    </header>
  );
}
