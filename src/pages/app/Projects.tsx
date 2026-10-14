import { Archive, ArchiveRestore, Briefcase, Calculator, FileSpreadsheet, FileText, Layers, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteRow, insertRow, updateRow, useAction, useRow, useRows } from '../../lib/api';
import { COUNTRIES, DEFAULT_LOTS, PROJECT_STATUS, PROJECT_TYPES, QUOTE_STATUS, WORK_STATUS, fmtDate } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { personName, useTeam } from '../../lib/team';
import type { Contact, MetreDoc, Project, ProjectLot, Quote } from '../../lib/types';
import { formatMoney, parseNumber } from '../../engine/money';
import { Badge, Button, Card, Checkbox, Confirm, DataTable, EmptyState, Field, Input, KeyValue, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Tabs, Textarea } from '../../ui';
import { ProjectSite } from './ProjectSite';
import { Allowed } from '../../ui/guard';
import { ContactForm } from './Contacts';
import { DocumentsPanel } from './Documents';
import { ActivityList } from './Journal';
import { ProjectFinance } from './ProjectFinance';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ProjectsPage() {
  const { org } = useOrg();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('actifs');
  const [type, setType] = useState('');
  const [creating, setCreating] = useState(false);
  const rows = useRows<Project>('projects', org?.id, { order: ['created_at', false] });
  const contacts = useRows<Contact>('contacts', org?.id);
  const clientName = useMemo(() => new Map((contacts.data ?? []).map((c) => [c.id, c.name])), [contacts.data]);
  const list = useMemo(() => {
    const n = norm(q);
    return (rows.data ?? []).filter((p) => {
      if (status === 'archives') { if (!p.archived_at) return false; }
      else if (p.archived_at) return false;
      if (status === 'actifs' && ['termine', 'annule'].includes(p.status)) return false;
      if (!['actifs', 'archives', ''].includes(status) && p.status !== status) return false;
      if (type && p.project_type !== type) return false;
      return !n || norm([p.name, p.reference, p.city, p.location, clientName.get(p.client_id ?? '')].join(' ')).includes(n);
    });
  }, [rows.data, q, status, type, clientName]);
  const cur = org?.currency ?? 'XOF';
  return (
    <>
      <PageHeader title="Projets et chantiers" subtitle="Chaque projet a une référence unique, ses lots, ses documents, ses métrés et ses devis."
        actions={<Allowed module="projets" action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouveau projet</Button></Allowed>} />
      <Card bodyClass="p-0">
        <div className="flex flex-col gap-2 border-b border-line-2 p-3 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Nom, référence, client, ville…" className="sm:max-w-sm sm:flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-52">
            <option value="actifs">Projets actifs</option>
            <option value="">Tous (hors archives)</option>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            <option value="archives">Archives</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-60">
            <option value="">Tous les types</option>
            {Object.entries(PROJECT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={list} onRowClick={(p) => nav(`/app/projets/${p.id}`)}
            empty={<EmptyState icon={<Briefcase size={22} />} title={q ? 'Aucun résultat' : 'Aucun projet'}>{!q && 'Créez votre premier projet pour y rattacher métrés, DQE, devis et documents.'}</EmptyState>}
            columns={[
              { key: 'ref', label: 'Référence', sort: (p) => p.reference, render: (p) => <span className="tabular text-muted">{p.reference}</span> },
              { key: 'name', label: 'Projet', sort: (p) => norm(p.name), render: (p) => <div><div className="font-semibold text-navy-900">{p.name}</div><div className="text-[12px] text-muted">{PROJECT_TYPES[p.project_type]}</div></div> },
              { key: 'client', label: 'Client', render: (p) => clientName.get(p.client_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'place', label: 'Localisation', render: (p) => [p.location, p.city].filter(Boolean).join(', ') || '—', hideOnMobile: true },
              { key: 'budget', label: 'Budget', align: 'right', sort: (p) => p.budget_validated ?? p.budget_estimate ?? null, render: (p) => formatMoney(p.budget_validated ?? p.budget_estimate, cur), hideOnMobile: true },
              { key: 'status', label: 'Statut', sort: (p) => p.status, render: (p) => <Badge tone={PROJECT_STATUS[p.status]?.tone}>{PROJECT_STATUS[p.status]?.label}</Badge> },
            ]} />
        )}
      </Card>
      {creating && <ProjectForm onClose={() => setCreating(false)} onSaved={(p) => nav(`/app/projets/${p.id}`)} />}
    </>
  );
}

export function ProjectForm({ initial, onClose, onSaved }: { initial?: Project; onClose: () => void; onSaved?: (p: Project) => void }) {
  const { org } = useOrg();
  const contacts = useRows<Contact>('contacts', org?.id, { order: ['name'] });
  const team = useTeam(org?.id);
  const [f, setF] = useState<Partial<Project>>(initial ?? { project_type: 'construction_neuve', status: 'etude', country: org?.country });
  const [budgets, setBudgets] = useState({ est: initial?.budget_estimate?.toString().replace('.', ',') ?? '', val: initial?.budget_validated?.toString().replace('.', ',') ?? '' });
  const [withLots, setWithLots] = useState(!initial);
  const [newClient, setNewClient] = useState(false);
  const set = (k: keyof Project) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null });
  const save = useAction(async () => {
    const values = {
      name: f.name?.trim(), client_id: f.client_id || null, project_type: f.project_type, location: f.location, city: f.city, country: f.country || null,
      description: f.description, start_date: f.start_date || null, end_date: f.end_date || null, manager_id: f.manager_id || null,
      budget_estimate: parseNumber(budgets.est), budget_validated: parseNumber(budgets.val), status: f.status,
    };
    if (initial) return updateRow<Project>('projects', initial.id, values);
    const p = await insertRow<Project>('projects', { ...values, org_id: org!.id });
    if (withLots) for (const [i, name] of DEFAULT_LOTS.entries()) await insertRow('project_lots', { org_id: org!.id, project_id: p.id, name, sort: i });
    return p;
  }, { success: (p) => (initial ? 'Projet enregistré.' : `Projet ${p.reference} créé.`), invalidate: [['projects'], ['project_lots']] });
  const dateError = f.start_date && f.end_date && f.end_date < f.start_date ? 'La fin prévue précède le début.' : null;
  return (
    <Modal title={initial ? `Modifier ${initial.reference}` : 'Nouveau projet'} onClose={onClose} size="lg"
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={save.isPending} disabled={!f.name?.trim() || (f.name?.trim().length ?? 0) < 2 || !!dateError} onClick={() => save.mutate(undefined, { onSuccess: (p) => { onClose(); onSaved?.(p); } })}>{initial ? 'Enregistrer' : 'Créer le projet'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du projet" required className="sm:col-span-2"><Input value={f.name ?? ''} onChange={set('name')} placeholder="Ex. Villa R+1 à Fidjrossè" /></Field>
        {!initial && <Notice tone="navy" className="sm:col-span-2">La référence unique (PRJ-{new Date().getFullYear()}-0001…) est attribuée automatiquement.</Notice>}
        <Field label="Client">
          <div className="flex gap-2">
            <Select aria-label="Client" value={f.client_id ?? ''} onChange={set('client_id')}>
              <option value="">— Aucun —</option>
              {(contacts.data ?? []).filter((c) => c.kind === 'client' && !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Allowed module="clients" action="creer"><Button onClick={() => setNewClient(true)} aria-label="Nouveau client">+</Button></Allowed>
          </div>
        </Field>
        <Field label="Type de projet"><Select value={f.project_type ?? ''} onChange={set('project_type')}>{Object.entries(PROJECT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Localisation" hint="Quartier, lot, parcelle…"><Input value={f.location ?? ''} onChange={set('location')} /></Field>
        <Field label="Ville"><Input value={f.city ?? ''} onChange={set('city')} /></Field>
        <Field label="Pays"><Select value={f.country ?? ''} onChange={set('country')}><option value="">—</option>{Object.entries(COUNTRIES).filter(([k]) => k !== 'AUTRE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Statut"><Select value={f.status ?? 'etude'} onChange={set('status')}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Date de début"><Input type="date" value={f.start_date ?? ''} onChange={set('start_date')} /></Field>
        <Field label="Date de fin prévisionnelle" error={dateError}><Input type="date" value={f.end_date ?? ''} onChange={set('end_date')} /></Field>
        <Field label="Responsable"><Select value={f.manager_id ?? ''} onChange={set('manager_id')}><option value="">—</option>{(team.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{personName(m.profile)}</option>)}</Select></Field>
        <div />
        <Field label={`Budget estimatif (${org?.currency === 'XOF' ? 'FCFA' : org?.currency})`}><Input inputMode="decimal" value={budgets.est} onChange={(e) => setBudgets({ ...budgets, est: e.target.value })} /></Field>
        <Field label={`Budget validé (${org?.currency === 'XOF' ? 'FCFA' : org?.currency})`}><Input inputMode="decimal" value={budgets.val} onChange={(e) => setBudgets({ ...budgets, val: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={f.description ?? ''} onChange={set('description')} /></Field>
        {!initial && <div className="sm:col-span-2"><Checkbox checked={withLots} onChange={setWithLots} label="Créer les lots standard (installation de chantier, terrassement, fondations… 23 lots), modifiables ensuite" /></div>}
      </div>
      {newClient && <ContactForm initial={{ kind: 'client', client_type: 'particulier', country: org?.country }} existing={contacts.data ?? []} onClose={() => setNewClient(false)} onSaved={(c) => setF((x) => ({ ...x, client_id: c.id }))} />}
    </Modal>
  );
}

type Tab = 'infos' | 'lots' | 'metres' | 'dqe' | 'devis' | 'finances' | 'documents' | 'journal' | 'gestion';

export function ProjectDetail() {
  const { id } = useParams();
  const { org, can } = useOrg();
  const p = useRow<Project>('projects', id);
  const contacts = useRows<Contact>('contacts', org?.id);
  const team = useTeam(org?.id);
  const quotes = useRows<Quote>('quotes', org?.id, { select: 'id, reference, title, kind, status, total_ht, total_ttc, issue_date, version, locked, settings', filter: (q) => q.eq('project_id', id), key: ['project', id] });
  const metres = useRows<MetreDoc>('metres', org?.id, { select: 'id, reference, title, status, updated_at', filter: (q) => q.eq('project_id', id), key: ['project', id] });
  const [tab, setTab] = useState<Tab>('infos');
  const [edit, setEdit] = useState(false);
  const archive = useAction(() => updateRow('projects', id!, { archived_at: p.data?.archived_at ? null : new Date().toISOString() }), { success: p.data?.archived_at ? 'Projet restauré.' : 'Projet archivé.', invalidate: [['projects']] });
  if (p.isLoading) return <Spinner />;
  if (!p.data) return <Notice tone="bad">Projet introuvable ou accès non autorisé.</Notice>;
  const x = p.data;
  const cur = org?.currency ?? 'XOF';
  const client = (contacts.data ?? []).find((c) => c.id === x.client_id);
  const manager = (team.data ?? []).find((m) => m.user_id === x.manager_id);
  const dqe = (quotes.data ?? []).filter((q) => q.kind !== 'devis');
  const devis = (quotes.data ?? []).filter((q) => q.kind === 'devis');
  return (
    <>
      <PageHeader
        back={<Link className="link" to="/app/projets">← Projets et chantiers</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{x.name} <Badge tone={PROJECT_STATUS[x.status]?.tone}>{PROJECT_STATUS[x.status]?.label}</Badge>{x.archived_at && <Badge>Archivé</Badge>}</span>}
        subtitle={`${x.reference} · ${PROJECT_TYPES[x.project_type]}${client ? ' · ' + client.name : ''}`}
        actions={<>
          <Allowed module="projets" action="modifier"><Button icon={x.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />} onClick={() => archive.mutate(undefined)} loading={archive.isPending}>{x.archived_at ? 'Restaurer' : 'Archiver'}</Button></Allowed>
          <Allowed module="projets" action="modifier"><Button variant="primary" onClick={() => setEdit(true)}>Modifier</Button></Allowed>
        </>}
      />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'infos', label: 'Informations' },
        { id: 'lots', label: 'Lots' },
        { id: 'metres', label: `Métrés (${metres.data?.length ?? 0})`, hidden: !can('metres', 'consulter') },
        { id: 'dqe', label: `DQE / BPU (${dqe.length})`, hidden: !can('dqe', 'consulter') },
        { id: 'devis', label: `Devis (${devis.length})`, hidden: !can('devis', 'consulter') },
        { id: 'finances', label: 'Finances', hidden: !can('depenses', 'consulter') && !can('factures', 'consulter') },
        { id: 'documents', label: 'Documents', hidden: !can('documents', 'consulter') },
        { id: 'journal', label: 'Historique' },
        { id: 'gestion', label: 'Gestion de chantier' },
      ]} />
      {tab === 'infos' && (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card title="Informations générales">
            <KeyValue items={[
              ['Référence', x.reference], ['Client', client ? <Link className="link" to={`/app/clients/${client.id}`}>{client.name}</Link> : null],
              ['Type de projet', PROJECT_TYPES[x.project_type]], ['Localisation', [x.location, x.city, x.country && COUNTRIES[x.country]].filter(Boolean).join(', ') || null],
              ['Début', fmtDate(x.start_date)], ['Fin prévisionnelle', fmtDate(x.end_date)], ['Responsable', manager ? personName(manager.profile) : null],
              ['Description', x.description && <span className="whitespace-pre-wrap">{x.description}</span>],
            ]} />
          </Card>
          <Card title="Budget">
            <KeyValue items={[
              ['Budget estimatif', formatMoney(x.budget_estimate, cur)], ['Budget validé', formatMoney(x.budget_validated, cur)],
              ['Devis acceptés (TTC)', formatMoney(devis.filter((d) => d.status === 'accepte').reduce((s, d) => s + (d.total_ttc ?? 0), 0), cur)],
              ['Devis en cours (TTC)', formatMoney(devis.filter((d) => ['brouillon', 'en_validation', 'envoye'].includes(d.status)).reduce((s, d) => s + (d.total_ttc ?? 0), 0), cur)],
            ]} />
            <p className="mt-4 text-[12.5px] text-muted">Dépenses réelles, facturé, encaissé et marges : onglet « Finances ».</p>
          </Card>
        </div>
      )}
      {tab === 'lots' && <ProjectLots project={x} />}
      {tab === 'metres' && (
        <Card title="Métrés du projet" actions={<Link to={`/app/metres?projet=${x.id}`}><Button size="sm" icon={<Calculator size={15} />}>Ouvrir les métrés</Button></Link>} bodyClass="p-0">
          {(metres.data ?? []).length === 0 ? <EmptyState icon={<Calculator size={22} />} title="Aucun métré">Créez un métré depuis le module Métrés en le rattachant à ce projet.</EmptyState> : (metres.data ?? []).map((m) => (
            <Link key={m.id} to={`/app/metres/${m.id}`} className="flex items-center justify-between border-b border-line-2 px-4 py-2.5 text-[13.5px] last:border-0 hover:bg-navy-50/50">
              <span><span className="text-muted">{m.reference}</span> · <b className="text-navy-900">{m.title}</b></span>
              <Badge tone={WORK_STATUS[m.status]?.tone}>{WORK_STATUS[m.status]?.label}</Badge>
            </Link>
          ))}
        </Card>
      )}
      {(tab === 'dqe' || tab === 'devis') && (
        <Card title={tab === 'dqe' ? 'DQE et BPU du projet' : 'Devis du projet'} bodyClass="p-0"
          actions={<Link to={tab === 'dqe' ? `/app/dqe?projet=${x.id}` : `/app/devis?projet=${x.id}`}><Button size="sm" icon={tab === 'dqe' ? <FileSpreadsheet size={15} /> : <FileText size={15} />}>{tab === 'dqe' ? 'Ouvrir DQE et BPU' : 'Ouvrir les devis'}</Button></Link>}>
          {(tab === 'dqe' ? dqe : devis).length === 0 ? <EmptyState title="Aucun document">Créez-en un depuis le module correspondant en le rattachant à ce projet.</EmptyState> : (tab === 'dqe' ? dqe : devis).map((q) => (
            <Link key={q.id} to={`/app/documents-chiffres/${q.id}`} className="flex items-center justify-between gap-2 border-b border-line-2 px-4 py-2.5 text-[13.5px] last:border-0 hover:bg-navy-50/50">
              <span><span className="text-muted">{q.reference} v{q.version}</span> · <b className="text-navy-900">{q.title}</b></span>
              <span className="flex items-center gap-2"><span className="tabular">{formatMoney(q.kind === 'devis' ? q.total_ttc : q.total_ht, q.settings?.currency)}</span><Badge tone={QUOTE_STATUS[q.status]?.tone}>{QUOTE_STATUS[q.status]?.label}</Badge></span>
            </Link>
          ))}
        </Card>
      )}
      {tab === 'finances' && <ProjectFinance project={x} />}
      {tab === 'documents' && <DocumentsPanel projectId={x.id} />}
      {tab === 'journal' && <Card title="Historique du projet"><ActivityList projectId={x.id} /></Card>}
      {tab === 'gestion' && <ProjectSite project={x} />}
      {edit && <ProjectForm initial={x} onClose={() => setEdit(false)} />}
    </>
  );
}

function ProjectLots({ project }: { project: Project }) {
  const { org } = useOrg();
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', project.id), order: ['sort'], key: [project.id] });
  const [name, setName] = useState('');
  const [del, setDel] = useState<ProjectLot | null>(null);
  const add = useAction((n: string) => insertRow('project_lots', { org_id: org!.id, project_id: project.id, name: n.trim(), sort: (lots.data?.length ?? 0) }), { success: 'Lot ajouté.', invalidate: [['project_lots']] });
  const rename = useAction((a: { id: string; name: string }) => updateRow('project_lots', a.id, { name: a.name.trim() }), { invalidate: [['project_lots']] });
  const remove = useAction((id: string) => deleteRow('project_lots', id), { success: 'Lot supprimé.', invalidate: [['project_lots']] });
  const addDefaults = useAction(async () => {
    const have = new Set((lots.data ?? []).map((l) => l.name));
    let i = lots.data?.length ?? 0;
    for (const n of DEFAULT_LOTS) if (!have.has(n)) await insertRow('project_lots', { org_id: org!.id, project_id: project.id, name: n, sort: i++ });
  }, { success: 'Lots standard ajoutés.', invalidate: [['project_lots']] });
  return (
    <Card title={`Lots du projet (${lots.data?.length ?? 0})`} subtitle="Utilisés pour organiser métrés, DQE, devis et documents."
      actions={<Allowed module="projets" action="modifier"><Button size="sm" icon={<Layers size={15} />} loading={addDefaults.isPending} onClick={() => addDefaults.mutate(undefined)}>Ajouter les lots standard</Button></Allowed>}>
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(name, { onSuccess: () => setName('') }); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouveau lot, ex. Piscine" />
        <Allowed module="projets" action="modifier"><Button type="submit" icon={<Plus size={16} />} disabled={!name.trim()}>Ajouter</Button></Allowed>
      </form>
      {lots.isLoading ? <Spinner /> : (lots.data ?? []).length === 0 ? <p className="text-[13.5px] text-muted">Aucun lot.</p> : (
        <ol className="divide-y divide-line-2 rounded-lg border border-line">
          {(lots.data ?? []).map((l, i) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="tabular w-8 text-[12px] text-muted">{String(i + 1).padStart(2, '0')}</span>
              <input className="cell-input flex-1" defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && rename.mutate({ id: l.id, name: e.target.value })} aria-label="Nom du lot" />
              <Allowed module="projets" action="modifier"><button className="rounded p-1.5 text-faint hover:bg-bad-50 hover:text-bad-600" aria-label="Supprimer le lot" onClick={() => setDel(l)}><Trash2 size={15} /></button></Allowed>
            </li>
          ))}
        </ol>
      )}
      {del && <Confirm title="Supprimer ce lot ?" danger confirmLabel="Supprimer" onClose={() => setDel(null)} onConfirm={() => remove.mutateAsync(del.id).then(() => undefined)}>Le lot « {del.name} » sera retiré de la liste du projet. Les métrés et documents déjà classés dans ce lot gardent leur classement.</Confirm>}
    </Card>
  );
}

