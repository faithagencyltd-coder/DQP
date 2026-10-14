// Planning et suivi de chantier (§19) : tâches en chronologie (Gantt), calendrier ou liste,
// dépendances, statuts, avancement selon une méthode affichée, rapports journaliers et réserves.

import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Download, GanttChart, List, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toCsv } from '../../engine/csv';
import { formatNumber, parseNumber } from '../../engine/money';
import { METHOD_LABEL, addDays, daysBetween, dependencyIssues, durationDays, isLate, monthGrid, plannedProgress, projectProgress, taskProgress, timelineRange, weekday, workforceTotal, type ProgressMethod } from '../../engine/planning';
import { deleteRow, insertRow, updateRow, useAction, useRows } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { REPORT_STATUS, TASK_PRIORITY, TASK_STATUS, fmtDate, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { personName, useTeam } from '../../lib/team';
import type { DailyReport, Project, ProjectLot, Task } from '../../lib/types';
import { Badge, Button, Card, Confirm, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Tabs, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';
import { ReservesView } from './Reserves';

type Tab = 'taches' | 'avancement' | 'rapports' | 'reserves';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function PlanningPage() {
  const { org } = useOrg();
  const [sp, setSp] = useSearchParams();
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at, start_date, end_date, progress_method, status', order: ['created_at', false] });
  const active = (projects.data ?? []).filter((p) => !p.archived_at);
  const pid = sp.get('projet') ?? active[0]?.id ?? '';
  const project = (projects.data ?? []).find((p) => p.id === pid);
  const tab = (sp.get('onglet') as Tab) || 'taches';
  const go = (patch: Record<string, string>) => setSp({ projet: pid, onglet: tab, ...patch }, { replace: true });
  return (
    <>
      <PageHeader title="Planning et suivi de chantier" subtitle="Tâches, dépendances, avancement mesuré, rapports journaliers avec photos et réserves." />
      {projects.isLoading ? <Spinner /> : !active.length ? (
        <EmptyState icon={<CalendarDays size={22} />} title="Aucun chantier">Créez d’abord un projet ; son planning et son suivi se gèrent ici.</EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Chantier" className="w-full sm:w-96">
              <Select value={pid} onChange={(e) => go({ projet: e.target.value })}>{active.map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select>
            </Field>
            {project && <Link className="link pb-2 text-[13px]" to={`/app/projets/${project.id}`}>Fiche du chantier</Link>}
          </div>
          <Tabs value={tab} onChange={(t) => go({ onglet: t })} items={[
            { id: 'taches', label: 'Tâches' }, { id: 'avancement', label: 'Avancement' }, { id: 'rapports', label: 'Rapports journaliers' }, { id: 'reserves', label: 'Réserves' },
          ]} />
          {project && tab === 'taches' && <TasksView project={project} />}
          {project && tab === 'avancement' && <ProgressView project={project} />}
          {project && tab === 'rapports' && <ReportsView project={project} />}
          {project && tab === 'reserves' && <ReservesView project={project} />}
        </>
      )}
    </>
  );
}

export function useTasks(projectId: string) {
  const { org } = useOrg();
  return useRows<Task>('tasks', org?.id, { filter: (q) => q.eq('project_id', projectId), order: ['start_date'], key: [projectId] });
}

// ---------------------------------------------------------------- tâches

function TasksView({ project }: { project: Project }) {
  const { org } = useOrg();
  const tasks = useTasks(project.id);
  const team = useTeam(org?.id);
  const [view, setView] = useState<'chronologie' | 'calendrier' | 'liste'>('chronologie');
  const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const list = useMemo(() => tasks.data ?? [], [tasks.data]);
  const issues = useMemo(() => dependencyIssues(list), [list]);
  const now = today();
  const late = list.filter((t) => isLate(t, now));
  const who = (t: Task) => t.assignee_id ? personName((team.data ?? []).find((m) => m.user_id === t.assignee_id)?.profile) : t.assignee_label ?? '—';
  const exportCsv = () => {
    const byId = new Map(list.map((t) => [t.id, t.title]));
    const csv = toCsv([['Tâche', 'Lot', 'Responsable', 'Début', 'Fin', 'Durée (jours)', 'Statut', 'Priorité', 'Dépend de', 'Quantité prévue', 'Quantité exécutée', 'Unité', 'Poids', 'Avancement déclaré (%)', 'Observations'],
      ...list.map((t) => [t.title, t.lot ?? '', who(t), t.start_date, t.end_date, durationDays(t.start_date, t.end_date), TASK_STATUS[t.status].label, TASK_PRIORITY[t.priority].label, t.depends_on.map((d) => byId.get(d) ?? '').join(' ; '), t.planned_qty ?? '', t.done_qty ?? '', t.unit ?? '', t.weight ?? '', t.progress_pct ?? '', t.observations ?? ''])]);
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `planning_${project.reference}_${now}.csv`);
  };
  const views = [
    { id: 'chronologie' as const, label: 'Chronologie', icon: <GanttChart size={15} /> },
    { id: 'calendrier' as const, label: 'Calendrier', icon: <CalendarDays size={15} /> },
    { id: 'liste' as const, label: 'Liste', icon: <List size={15} /> },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Vue du planning">
          {views.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${view === v.id ? 'bg-navy-900 text-white' : 'text-ink-2 hover:bg-navy-50'}`}>{v.icon}{v.label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <Allowed module="planning" action="exporter"><Button size="sm" icon={<Download size={15} />} onClick={exportCsv} disabled={!list.length}>CSV</Button></Allowed>
          <Allowed module="planning" action="creer"><Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEdit({ start_date: project.start_date && project.start_date > now ? project.start_date : now })}>Nouvelle tâche</Button></Allowed>
        </div>
      </div>
      {late.length > 0 && <Notice tone="bad" className="mb-3">{late.length} tâche(s) en retard (date de fin dépassée, non terminée) : {late.slice(0, 4).map((t) => t.title).join(', ')}{late.length > 4 ? '…' : ''}.</Notice>}
      {issues.length > 0 && <Notice tone="warn" className="mb-3" title="Dépendances à revoir">{issues.slice(0, 3).map((i) => <span key={i.task + i.predecessor} className="block">{i.message}</span>)}{issues.length > 3 && <span className="block">… et {issues.length - 3} autre(s).</span>}</Notice>}
      {tasks.isLoading ? <Spinner /> : !list.length ? (
        <Card><EmptyState icon={<ClipboardList size={22} />} title="Aucune tâche">Ajoutez les tâches du chantier avec leurs dates ; les dépendances, les retards et l’avancement se calculent ensuite.</EmptyState></Card>
      ) : view === 'chronologie' ? <Gantt tasks={list} method={project.progress_method ?? 'taches'} onOpen={setEdit} />
        : view === 'calendrier' ? <MonthCalendar tasks={list} onOpen={setEdit} />
          : (
            <Card bodyClass="p-0">
              <DataTable rows={list} onRowClick={setEdit} columns={[
                { key: 'title', label: 'Tâche', render: (t) => <span><b className="text-navy-900">{t.title}</b>{t.lot && <span className="block text-[12px] text-muted">{t.lot}</span>}</span> },
                { key: 'who', label: 'Responsable', render: who, hideOnMobile: true },
                { key: 'start', label: 'Début', sort: (t) => t.start_date, render: (t) => fmtDate(t.start_date) },
                { key: 'end', label: 'Fin', sort: (t) => t.end_date, render: (t) => fmtDate(t.end_date) },
                { key: 'dur', label: 'Durée', align: 'right', render: (t) => `${durationDays(t.start_date, t.end_date)} j`, hideOnMobile: true },
                { key: 'status', label: 'Statut', render: (t) => <span className="flex flex-wrap gap-1"><Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>{isLate(t, now) && <Badge tone="bad">En retard</Badge>}</span> },
                { key: 'prio', label: 'Priorité', render: (t) => <Badge tone={TASK_PRIORITY[t.priority].tone}>{TASK_PRIORITY[t.priority].label}</Badge>, hideOnMobile: true },
                { key: 'deps', label: 'Dépend de', render: (t) => t.depends_on.length ? t.depends_on.map((d) => list.find((x) => x.id === d)?.title).filter(Boolean).join(', ') : '—', hideOnMobile: true },
              ]} />
            </Card>
          )}
      {edit && <TaskForm project={project} task={edit} tasks={list} onClose={() => setEdit(null)} />}
    </>
  );
}

const ROW = 38;

function Gantt({ tasks, method, onOpen }: { tasks: Task[]; method: ProgressMethod; onOpen: (t: Task) => void }) {
  const [zoom, setZoom] = useState<'jour' | 'semaine'>('jour');
  const now = today();
  const range = timelineRange(tasks, now);
  const DW = zoom === 'jour' ? 30 : 11;
  const width = range.days * DW;
  const index = new Map(tasks.map((t, i) => [t.id, i]));
  const days = Array.from({ length: range.days }, (_, i) => addDays(range.start, i));
  const months: { label: string; from: number; span: number }[] = [];
  days.forEach((d, i) => {
    const label = `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
    if (months.length && months[months.length - 1].label === label) months[months.length - 1].span++;
    else months.push({ label, from: i, span: 1 });
  });
  const todayX = now >= range.start && now <= range.end ? (daysBetween(range.start, now) + 0.5) * DW : null;
  return (
    <Card bodyClass="p-0" title="Chronologie" actions={
      <Select aria-label="Échelle de la chronologie" value={zoom} onChange={(e) => setZoom(e.target.value as 'jour' | 'semaine')} className="!w-32 !py-1 text-[13px]"><option value="jour">Jours</option><option value="semaine">Semaines</option></Select>}>
      <div className="flex text-[12.5px]">
        <div className="w-36 shrink-0 border-r border-line sm:w-56">
          <div className="h-[52px] border-b border-line bg-navy-50/60 px-3 pt-8 text-[11px] font-bold uppercase tracking-wide text-muted">Tâche</div>
          {tasks.map((t) => (
            <button key={t.id} type="button" onClick={() => onOpen(t)} className="flex w-full items-center gap-2 border-b border-line-2 px-3 text-left hover:bg-navy-50/60" style={{ height: ROW }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TASK_STATUS[t.status].color }} />
              <span className="truncate font-semibold text-navy-900">{t.title}</span>
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            <div className="flex h-[26px] border-b border-line bg-navy-50/60">
              {months.map((m) => <div key={m.label} style={{ width: m.span * DW }} className="truncate border-r border-line px-2 pt-1 text-[11.5px] font-bold capitalize text-navy-900">{m.label}</div>)}
            </div>
            <div className="flex h-[26px] border-b border-line bg-navy-50/60">
              {days.map((d) => (
                <div key={d} style={{ width: DW }} className={`shrink-0 border-r border-line-2 pt-1 text-center text-[10.5px] ${weekday(d) === 6 ? 'text-signal-600' : 'text-muted'}`}>
                  {zoom === 'jour' ? +d.slice(8) : weekday(d) === 0 ? +d.slice(8) : ''}
                </div>
              ))}
            </div>
            <div className="relative" style={{ height: tasks.length * ROW }}>
              {days.map((d, i) => weekday(d) === 6 && <div key={d} className="absolute top-0 bottom-0 bg-navy-50/70" style={{ left: i * DW, width: DW }} />)}
              {tasks.map((_, i) => <div key={i} className="absolute left-0 right-0 border-b border-line-2" style={{ top: (i + 1) * ROW - 1 }} />)}
              {todayX !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-signal-500" style={{ left: todayX }} title="Aujourd’hui" />}
              <svg className="pointer-events-none absolute inset-0" width={width} height={tasks.length * ROW} aria-hidden>
                <defs><marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#64748b" /></marker></defs>
                {tasks.flatMap((t) => t.depends_on.map((d) => {
                  const j = index.get(d);
                  if (j === undefined) return null;
                  const p = tasks[j];
                  const x1 = (daysBetween(range.start, p.end_date) + 1) * DW;
                  const y1 = j * ROW + ROW / 2;
                  const x2 = daysBetween(range.start, t.start_date) * DW;
                  const y2 = (index.get(t.id) ?? 0) * ROW + ROW / 2;
                  const mid = x1 + 6;
                  return <path key={t.id + d} d={`M${x1},${y1} H${mid} V${y2} H${x2 - 1}`} fill="none" stroke={x2 < x1 ? '#dc2626' : '#64748b'} strokeWidth="1.3" markerEnd="url(#gantt-arrow)" />;
                }))}
              </svg>
              {tasks.map((t, i) => {
                const left = daysBetween(range.start, t.start_date) * DW;
                const w = Math.max(DW - 3, durationDays(t.start_date, t.end_date) * DW - 3);
                const prog = taskProgress(t, method).value;
                const late = isLate(t, now);
                return (
                  <button key={t.id} type="button" onClick={() => onOpen(t)} title={`${t.title} — ${fmtDate(t.start_date)} → ${fmtDate(t.end_date)} (${durationDays(t.start_date, t.end_date)} j) · ${TASK_STATUS[t.status].label}${late ? ' · en retard' : ''}`}
                    aria-label={`Ouvrir la tâche ${t.title}`}
                    className={`absolute overflow-hidden rounded-md text-left text-[11px] font-semibold text-white shadow-sm ${late ? 'ring-2 ring-bad-600 ring-offset-1' : ''}`}
                    style={{ left: left + 1, width: w, top: i * ROW + 8, height: ROW - 16, background: TASK_STATUS[t.status].color }}>
                    {prog !== null && prog > 0 && prog < 1 && <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${prog * 100}%` }} />}
                    <span className="relative block truncate px-1.5 leading-[22px]">{w > 60 ? t.title : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2 text-[12px] text-muted">
        {Object.entries(TASK_STATUS).map(([k, s]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-signal-500" />Aujourd’hui</span>
        <span>Contour rouge : en retard · flèche rouge : dépendance non respectée</span>
      </div>
    </Card>
  );
}

function MonthCalendar({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const now = today();
  const first = tasks.length && tasks[0].start_date > now ? tasks[0].start_date : now;
  const [ym, setYm] = useState({ y: +first.slice(0, 4), m: +first.slice(5, 7) });
  const weeks = monthGrid(ym.y, ym.m);
  const shift = (n: number) => setYm(({ y, m }) => { const k = y * 12 + (m - 1) + n; return { y: Math.floor(k / 12), m: (k % 12) + 1 }; });
  const month = `${ym.y}-${String(ym.m).padStart(2, '0')}`;
  return (
    <Card bodyClass="p-0" title={<span className="capitalize">{MONTHS[ym.m - 1]} {ym.y}</span>} actions={
      <div className="flex gap-1"><Button size="sm" variant="ghost" aria-label="Mois précédent" onClick={() => shift(-1)}><ChevronLeft size={16} /></Button><Button size="sm" onClick={() => setYm({ y: +now.slice(0, 4), m: +now.slice(5, 7) })}>Aujourd’hui</Button><Button size="sm" variant="ghost" aria-label="Mois suivant" onClick={() => shift(1)}><ChevronRight size={16} /></Button></div>}>
      <div className="grid grid-cols-7 border-b border-line bg-navy-50/60 text-center text-[11px] font-bold uppercase text-muted">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      {weeks.map((w) => (
        <div key={w[0]} className="grid grid-cols-7">
          {w.map((d) => {
            const on = tasks.filter((t) => t.start_date <= d && t.end_date >= d);
            return (
              <div key={d} className={`min-h-[86px] border-b border-r border-line-2 p-1 ${d.slice(0, 7) !== month ? 'bg-navy-50/40 text-faint' : ''}`}>
                <div className={`mb-1 text-right text-[11.5px] ${d === now ? 'font-bold text-signal-600' : ''}`}>{+d.slice(8)}</div>
                {on.slice(0, 3).map((t) => (
                  <button key={t.id} type="button" onClick={() => onOpen(t)} className="mb-0.5 block w-full truncate rounded px-1 text-left text-[10.5px] font-semibold text-white" style={{ background: TASK_STATUS[t.status].color }} title={t.title}>{t.title}</button>
                ))}
                {on.length > 3 && <span className="block text-[10.5px] text-muted">+{on.length - 3}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

function TaskForm({ project, task, tasks, onClose }: { project: Project; task: Partial<Task>; tasks: Task[]; onClose: () => void }) {
  const { org, can } = useOrg();
  const toast = useToast();
  const team = useTeam(org?.id);
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', project.id), order: ['sort'], key: [project.id] });
  const num = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
  const [v, setV] = useState({
    title: task.title ?? '', lot: task.lot ?? '', assignee_id: task.assignee_id ?? '', assignee_label: task.assignee_label ?? '',
    start_date: task.start_date ?? today(), end_date: task.end_date ?? task.start_date ?? today(), status: task.status ?? 'a_faire', priority: task.priority ?? 'normale',
    depends_on: task.depends_on ?? [], planned_qty: num(task.planned_qty), done_qty: num(task.done_qty), unit: task.unit ?? '', weight: num(task.weight), progress_pct: num(task.progress_pct), observations: task.observations ?? '',
  });
  const [del, setDel] = useState(false);
  const editable = task.id ? can('planning', 'modifier') : can('planning', 'creer');
  const others = tasks.filter((t) => t.id !== task.id);
  const pn = (s: string) => (s.trim() === '' ? null : parseNumber(s));
  const values = {
    title: v.title.trim(), lot: v.lot || null, assignee_id: v.assignee_id || null, assignee_label: v.assignee_id ? null : v.assignee_label.trim() || null,
    start_date: v.start_date, end_date: v.end_date, status: v.status, priority: v.priority, depends_on: v.depends_on,
    planned_qty: pn(v.planned_qty), done_qty: pn(v.done_qty), unit: v.unit.trim() || null, weight: pn(v.weight), progress_pct: pn(v.progress_pct), observations: v.observations.trim() || null,
  };
  const numbersOk = [values.planned_qty, values.done_qty, values.weight, values.progress_pct].every((n) => n === null || (Number.isFinite(n) && n >= 0)) && (values.progress_pct ?? 0) <= 100;
  const valid = !!values.title && !!v.start_date && !!v.end_date && v.end_date >= v.start_date && numbersOk;
  const save = useAction(() => task.id ? updateRow('tasks', task.id, values) : insertRow('tasks', { org_id: org!.id, project_id: project.id, ...values }), { success: 'Tâche enregistrée.', invalidate: [['tasks']] });
  const remove = useAction(() => deleteRow('tasks', task.id!), { success: 'Tâche supprimée.', invalidate: [['tasks']] });
  const canValidate = can('planning', 'valider') && (task.status === 'termine' || task.status === 'valide');
  const statuses = Object.entries(TASK_STATUS).filter(([k]) => k !== 'valide' || canValidate || task.status === 'valide');
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal size="lg" title={task.id ? 'Tâche' : 'Nouvelle tâche'} onClose={onClose} footer={<>
      {task.id && can('planning', 'supprimer') && task.status !== 'valide' && <Button variant="ghost" className="mr-auto" onClick={() => setDel(true)}>Supprimer</Button>}
      <Button onClick={onClose}>{editable ? 'Annuler' : 'Fermer'}</Button>
      {editable && <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose, onError: (e) => toast('bad', errorMessage(e)) })}>Enregistrer</Button>}
    </>}>
      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre" required className="sm:col-span-2"><Input value={v.title} onChange={set('title')} placeholder="Coulage de la dalle haute RDC" /></Field>
        <Field label="Lot"><Select value={v.lot} onChange={set('lot')}><option value="">—</option>{(lots.data ?? []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</Select></Field>
        <Field label="Responsable"><Select value={v.assignee_id} onChange={set('assignee_id')}><option value="">— Intervenant externe ou non désigné —</option>{(team.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{personName(m.profile)}</option>)}</Select></Field>
        {!v.assignee_id && <Field label="Intervenant externe" className="sm:col-span-2" hint="Sous-traitant, chef d’équipe…"><Input value={v.assignee_label} onChange={set('assignee_label')} /></Field>}
        <Field label="Début" required><Input type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value, end_date: v.end_date < e.target.value ? e.target.value : v.end_date })} /></Field>
        <Field label="Fin" required error={v.end_date < v.start_date ? 'La fin précède le début' : null} hint={v.end_date >= v.start_date ? `Durée : ${durationDays(v.start_date, v.end_date)} jour(s) calendaire(s)` : undefined}><Input type="date" value={v.end_date} min={v.start_date} onChange={set('end_date')} /></Field>
        <Field label="Statut" hint={!canValidate && task.status === 'termine' ? 'La validation demande le droit « valider ».' : undefined}><Select value={v.status} onChange={set('status')}>{statuses.map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</Select></Field>
        <Field label="Priorité"><Select value={v.priority} onChange={set('priority')}>{Object.entries(TASK_PRIORITY).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</Select></Field>
        {others.length > 0 && (
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Dépend de</span>
            <div className="grid max-h-36 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
              {others.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={v.depends_on.includes(t.id)} onChange={(e) => setV({ ...v, depends_on: e.target.checked ? [...v.depends_on, t.id] : v.depends_on.filter((x) => x !== t.id) })} />
                  <span className="truncate">{t.title} <span className="text-muted">(fin {fmtDate(t.end_date)})</span></span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-3 rounded-lg bg-navy-50/50 p-3 sm:col-span-2 sm:grid-cols-3">
          <p className="text-[12px] text-muted sm:col-span-3">Mesure de l’avancement (selon la méthode du chantier : {METHOD_LABEL[project.progress_method ?? 'taches']}). Laissez vide ce que vous ne mesurez pas : rien n’est estimé à votre place.</p>
          <Field label="Quantité prévue"><Input inputMode="decimal" value={v.planned_qty} onChange={set('planned_qty')} /></Field>
          <Field label="Quantité exécutée"><Input inputMode="decimal" value={v.done_qty} onChange={set('done_qty')} /></Field>
          <Field label="Unité"><Input value={v.unit} onChange={set('unit')} placeholder="m³, m², u…" /></Field>
          <Field label="Poids (pondération)"><Input inputMode="decimal" value={v.weight} onChange={set('weight')} /></Field>
          <Field label="Avancement déclaré (%)"><Input inputMode="decimal" value={v.progress_pct} onChange={set('progress_pct')} /></Field>
        </div>
        <Field label="Observations" className="sm:col-span-2"><Textarea rows={2} value={v.observations} onChange={set('observations')} /></Field>
      </fieldset>
      {task.validated_at && <p className="mt-3 text-[12.5px] text-muted">Validée le {fmtDate(task.validated_at)}.</p>}
      {del && <Confirm danger title="Supprimer cette tâche ?" confirmLabel="Supprimer" onClose={() => setDel(false)} onConfirm={() => remove.mutateAsync(undefined).then(onClose)}>Elle sera retirée des dépendances des autres tâches.</Confirm>}
    </Modal>
  );
}

// ---------------------------------------------------------------- avancement

export function ProgressSummary({ project, compact }: { project: Project; compact?: boolean }) {
  const tasks = useTasks(project.id);
  const list = tasks.data ?? [];
  const method = project.progress_method ?? 'taches';
  const p = projectProgress(list, method);
  const planned = plannedProgress(list, method, today());
  if (tasks.isLoading) return <Spinner />;
  const bar = (label: string, value: number | null, color: string) => (
    <div>
      <div className="mb-1 flex justify-between text-[13px]"><span className="font-semibold text-ink-2">{label}</span><b className="tabular text-navy-900">{value === null ? '—' : `${formatNumber(value, 1)} %`}</b></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-navy-50"><div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: color }} /></div>
    </div>
  );
  return (
    <div className="grid gap-3">
      {bar('Avancement mesuré', p.pct, '#16a34a')}
      {bar('Avancement prévu à ce jour (dates du planning)', planned, '#2563eb')}
      <p className="text-[12.5px] text-muted">Méthode : <b>{METHOD_LABEL[method]}</b> — {p.formula}. {p.counted} tâche(s) prise(s) en compte sur {p.total}{p.excluded.length ? `, ${p.excluded.length} exclue(s) faute de donnée` : ''}.</p>
      {!compact && p.excluded.length > 0 && <Notice tone="warn" title="Tâches exclues du calcul">{p.excluded.map((e) => <span key={e.id} className="block">{e.title} : {e.reason}</span>)}</Notice>}
      {p.pct === null && <Notice tone="navy">Aucun avancement calculable : ajoutez des tâches{method !== 'taches' ? ' et les données de la méthode choisie' : ''}.</Notice>}
    </div>
  );
}

function ProgressView({ project }: { project: Project }) {
  const { can } = useOrg();
  const tasks = useTasks(project.id);
  const list = tasks.data ?? [];
  const now = today();
  const setMethod = useAction((m: ProgressMethod) => updateRow('projects', project.id, { progress_method: m }), { success: 'Méthode d’avancement enregistrée.', invalidate: [['projects']] });
  const byStatus = Object.entries(TASK_STATUS).map(([k, s]) => ({ k, s, n: list.filter((t) => t.status === k).length }));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card title="Avancement du chantier" actions={can('projets', 'modifier') ? (
        <Select aria-label="Méthode d’avancement" value={project.progress_method ?? 'taches'} onChange={(e) => setMethod.mutate(e.target.value as ProgressMethod)} className="!w-56 !py-1 text-[13px]">
          {Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>) : undefined}>
        <ProgressSummary project={project} />
      </Card>
      <Card title="Tâches par statut">
        <ul className="grid gap-1.5 text-[13.5px]">
          {byStatus.map(({ k, s, n }) => <li key={k} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span><b className="tabular">{n}</b></li>)}
          <li className="flex items-center justify-between border-t border-line pt-1.5 text-bad-600"><span className="flex items-center gap-2"><AlertTriangle size={14} />En retard</span><b className="tabular">{list.filter((t) => isLate(t, now)).length}</b></li>
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- rapports journaliers

function ReportsView({ project }: { project: Project }) {
  const { org } = useOrg();
  const nav = useNavigate();
  const toast = useToast();
  const rows = useRows<DailyReport>('daily_reports', org?.id, { filter: (q) => q.eq('project_id', project.id), order: ['report_date', false], key: [project.id] });
  const [date, setDate] = useState(today());
  const existing = (rows.data ?? []).find((r) => r.report_date === date);
  const create = useAction(() => insertRow<DailyReport>('daily_reports', { org_id: org!.id, project_id: project.id, report_date: date }), { invalidate: [['daily_reports']] });
  return (
    <Card bodyClass="p-0" title="Rapports journaliers" actions={
      <Allowed module="planning" action="creer">
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="Date du rapport" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="!w-40 !py-1 text-[13px]" />
          {existing ? <Button size="sm" onClick={() => nav(`/app/planning/rapports/${existing.id}`)}>Ouvrir le rapport du {fmtDate(date)}</Button>
            : <Button size="sm" variant="primary" icon={<Plus size={15} />} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (r) => nav(`/app/planning/rapports/${r.id}`), onError: (e) => toast('bad', errorMessage(e)) })}>Nouveau rapport</Button>}
        </div>
      </Allowed>}>
      {rows.isLoading ? <Spinner /> : (
        <DataTable rows={rows.data ?? []} onRowClick={(r) => nav(`/app/planning/rapports/${r.id}`)}
          empty={<EmptyState icon={<ClipboardList size={22} />} title="Aucun rapport">Un rapport par jour : travaux exécutés, effectifs, matériaux, incidents, photos. Il est soumis puis validé par un responsable.</EmptyState>}
          columns={[
            { key: 'date', label: 'Date', sort: (r) => r.report_date, render: (r) => <b className="text-navy-900">{fmtDate(r.report_date)}</b> },
            { key: 'ref', label: 'Réf.', render: (r) => <span className="tabular text-muted">{r.reference}</span>, hideOnMobile: true },
            { key: 'work', label: 'Travaux exécutés', render: (r) => <span className="line-clamp-2">{r.work_done ?? '—'}</span> },
            { key: 'staff', label: 'Effectif', align: 'right', render: (r) => r.workforce.length ? workforceTotal(r.workforce) : '—', hideOnMobile: true },
            { key: 'photos', label: 'Photos', align: 'right', render: (r) => r.photos.length || '—', hideOnMobile: true },
            { key: 'inc', label: 'Incident', render: (r) => r.incidents ? <Badge tone="bad">Oui</Badge> : '—', hideOnMobile: true },
            { key: 'status', label: 'Statut', render: (r) => <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge> },
          ]} />
      )}
    </Card>
  );
}
