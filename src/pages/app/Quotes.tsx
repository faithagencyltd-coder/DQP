import { FileSpreadsheet, FileText, Plus, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { insertRow, useAction, useRows } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { QUOTE_STATUS, fmtDate } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, MetreDoc, PriceItem, Project, ProjectLot, Quote } from '../../lib/types';
import { cloneBody, newLot, type DocBody } from '../../engine/dqe';
import { formatMoney } from '../../engine/money';
import { importDqeFile, type DqeImportReport } from '../../engine/import-dqe';
import { libraryToBody, libraryTrades } from '../../engine/library-dqe';
import { Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Tabs } from '../../ui';
import { Allowed } from '../../ui/guard';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function QuotesPage({ kind }: { kind: 'dqe' | 'devis' }) {
  const { org } = useOrg();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [sub, setSub] = useState<'dqe' | 'bpu'>('dqe');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [project, setProject] = useState(params.get('projet') ?? '');
  const [creating, setCreating] = useState(false);
  const rows = useRows<Quote>('quotes', org?.id, { select: 'id, kind, reference, title, status, version, locked, total_ht, total_ttc, incomplete_lines, issue_date, valid_until, project_id, client_id, settings, archived_at, updated_at', order: ['updated_at', false] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, client_id, archived_at' });
  const contacts = useRows<Contact>('contacts', org?.id, { select: 'id, name' });
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const cname = useMemo(() => new Map((contacts.data ?? []).map((c) => [c.id, c.name])), [contacts.data]);
  const wanted = kind === 'devis' ? 'devis' : sub;
  const list = (rows.data ?? []).filter((x) => x.kind === wanted && !x.archived_at && (!status || x.status === status) && (!project || x.project_id === project)
    && (!q || norm([x.reference, x.title, pname.get(x.project_id ?? ''), cname.get(x.client_id ?? '')].join(' ')).includes(norm(q))));
  const module = kind === 'devis' ? 'devis' : 'dqe';
  return (
    <>
      <PageHeader title={kind === 'devis' ? 'Devis et propositions commerciales' : 'DQE et BPU'}
        subtitle={kind === 'devis' ? 'Numérotation contrôlée, remises, taxes, versions verrouillées, PDF à votre en-tête.' : 'Détail quantitatif estimatif et bordereau des prix unitaires, reliés entre eux.'}
        actions={<Allowed module={module} action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>{kind === 'devis' ? 'Nouveau devis' : sub === 'bpu' ? 'Nouveau BPU' : 'Nouveau DQE'}</Button></Allowed>} />
      {kind === 'dqe' && <Tabs value={sub} onChange={setSub} items={[{ id: 'dqe', label: 'DQE' }, { id: 'bpu', label: 'BPU' }]} />}
      <Card bodyClass="p-0">
        <div className="flex flex-col gap-2 border-b border-line-2 p-3 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Référence, titre, projet, client…" className="sm:max-w-sm sm:flex-1" />
          <Select value={project} onChange={(e) => setProject(e.target.value)} className="sm:w-64"><option value="">Tous les projets</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-56"><option value="">Tous les statuts</option>
            {Object.entries(QUOTE_STATUS).filter(([k]) => (kind === 'devis' ? !['verifie', 'approuve'].includes(k) : ['brouillon', 'verifie', 'approuve', 'annule'].includes(k))).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={list} onRowClick={(x) => nav(`/app/documents-chiffres/${x.id}`)}
            empty={<EmptyState icon={kind === 'devis' ? <FileText size={22} /> : <FileSpreadsheet size={22} />} title="Aucun document">{kind === 'devis' ? 'Créez un devis manuellement, depuis un DQE, un métré ou un devis existant.' : 'Créez un DQE, générez-le depuis un métré ou importez votre fichier Excel.'}</EmptyState>}
            columns={[
              { key: 'ref', label: 'Référence', sort: (x) => x.reference, render: (x) => <span className="tabular text-muted">{x.reference} <span className="text-faint">v{x.version}</span></span> },
              { key: 'title', label: 'Titre', sort: (x) => norm(x.title), render: (x) => <div><div className="font-semibold text-navy-900">{x.title}</div><div className="text-[12px] text-muted">{[pname.get(x.project_id ?? ''), cname.get(x.client_id ?? '')].filter(Boolean).join(' · ')}</div></div> },
              { key: 'date', label: 'Date', sort: (x) => x.issue_date, render: (x) => fmtDate(x.issue_date), hideOnMobile: true },
              { key: 'amount', label: kind === 'devis' ? 'Total TTC' : 'Total HT', align: 'right', sort: (x) => (kind === 'devis' ? x.total_ttc : x.total_ht), render: (x) => <span>{formatMoney(kind === 'devis' ? x.total_ttc : x.total_ht, x.settings?.currency)}{x.incomplete_lines > 0 && <span className="block text-[11px] font-semibold text-warn-600">{x.incomplete_lines} ligne(s) à compléter</span>}</span> },
              { key: 'status', label: 'Statut', sort: (x) => x.status, render: (x) => <span className="flex flex-wrap gap-1"><Badge tone={QUOTE_STATUS[x.status]?.tone}>{QUOTE_STATUS[x.status]?.label}</Badge>{x.locked && <Badge tone="navy">verrouillé</Badge>}</span> },
            ]} />
        )}
      </Card>
      {creating && <NewQuote kind={kind === 'devis' ? 'devis' : sub} projectId={project} all={rows.data ?? []} onClose={() => setCreating(false)} />}
    </>
  );
}

type Source = 'manuel' | 'dqe' | 'devis' | 'metre' | 'import' | 'bibliotheque';

function NewQuote({ kind, projectId, all, onClose }: { kind: 'dqe' | 'bpu' | 'devis'; projectId: string; all: Quote[]; onClose: () => void }) {
  const { org } = useOrg();
  const nav = useNavigate();
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, client_id, archived_at' });
  const contacts = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind, archived_at' });
  const metres = useRows<MetreDoc>('metres', org?.id, { select: 'id, reference, title, archived_at' });
  const [source, setSource] = useState<Source>('manuel');
  const [title, setTitle] = useState('');
  const [pid, setPid] = useState(projectId);
  const [cid, setCid] = useState(() => (projects.data ?? []).find((p) => p.id === projectId)?.client_id ?? '');
  const [from, setFrom] = useState('');
  const [withLots, setWithLots] = useState(true);
  const [imported, setImported] = useState<DqeImportReport | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', pid), order: ['sort'], key: [pid], enabled: !!pid });
  const library = useRows<PriceItem>('price_items', org?.id, { order: ['designation'], enabled: source === 'bibliotheque' });
  const [trades, setTrades] = useState<string[]>([]);
  const [includeToVerify, setIncludeToVerify] = useState(true);
  const [withSections, setWithSections] = useState(true);
  const tradeList = useMemo(() => libraryTrades(library.data ?? []), [library.data]);
  const libPlan = useMemo(() => (source === 'bibliotheque' && trades.length ? libraryToBody(library.data ?? [], { trades, includeToVerify, withSections, currency: org?.currency ?? 'XOF' }) : null), [source, library.data, trades, includeToVerify, withSections, org?.currency]);

  const sources: [Source, string][] = kind === 'devis'
    ? [['manuel', 'Saisie manuelle'], ['dqe', 'À partir d’un DQE'], ['devis', 'À partir d’un devis existant ou d’un modèle'], ['metre', 'À partir d’un métré']]
    : kind === 'dqe' ? [['manuel', 'Saisie manuelle'], ['import', 'Importer un DQE Excel / CSV'], ['dqe', 'À partir d’un DQE existant'], ['metre', 'À partir d’un métré'], ['bibliotheque', 'À partir de la bibliothèque des travaux']]
    : [['manuel', 'Saisie manuelle'], ['dqe', 'À partir d’un DQE (reprend les ouvrages et leurs prix)'], ['bibliotheque', 'À partir de la bibliothèque des travaux']];
  const fromList = source === 'dqe' ? all.filter((x) => x.kind === 'dqe') : source === 'devis' ? all.filter((x) => x.kind === 'devis') : [];

  const create = useAction(async () => {
    let body: DocBody = { lots: [] };
    let sourceId: string | null = null;
    let settings = { currency: org!.currency, taxes: kind === 'devis' ? org!.default_taxes : [], discountPct: 0 } as Quote['settings'];
    if (source === 'manuel') {
      body = { lots: withLots && lots.data?.length ? lots.data.map((l, i) => newLot(l.name, i)) : [newLot('Travaux', 0)] };
    } else if (source === 'import') {
      body = imported!.body;
    } else if (source === 'bibliotheque') {
      body = libPlan!.body;
    } else if (source === 'dqe' || source === 'devis') {
      const { supabase } = await import('../../lib/supabase');
      const { data, error } = await supabase.from('quotes').select('body, settings').eq('id', from).single();
      if (error) throw new Error(errorMessage(error));
      body = cloneBody(data.body as DocBody);
      if (kind === 'bpu') body = { lots: body.lots.map((l) => ({ ...l, lines: l.lines.map((x) => ({ ...x, qty: null })) })) };
      if (source === 'devis') settings = data.settings as Quote['settings'];
      sourceId = from;
    }
    return insertRow<Quote>('quotes', {
      org_id: org!.id, kind, title: title.trim(), project_id: pid || null, client_id: cid || null, body, settings,
      source_kind: source === 'manuel' ? 'manuel' : source, source_id: sourceId,
      payment_terms: kind === 'devis' ? org!.payment_terms : null,
      valid_until: kind === 'devis' ? new Date(Date.now() + org!.quote_validity_days * 86400000).toISOString().slice(0, 10) : null,
    });
  }, { success: (x) => `${x.reference} créé.`, invalidate: [['quotes']] });

  const readFile = async (f: File) => {
    setImportErr(null);
    setImporting(true);
    try {
      const r = await importDqeFile(f.name, new Uint8Array(await f.arrayBuffer()));
      if (!r.lines) throw new Error('Aucune ligne d’ouvrage reconnue : vérifiez que le fichier contient un en-tête « Désignation, Unité, Quantité, Prix unitaire ».');
      setImported(r);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      setImportErr(errorMessage(e));
      setImported(null);
    } finally {
      setImporting(false);
    }
  };

  if (source === 'metre') {
    return (
      <Modal title="À partir d’un métré" onClose={onClose}>
        <p className="text-[14px] text-ink-2">Ouvrez le métré, puis cliquez sur <b>Générer un DQE</b> : les ouvrages sont regroupés par lot avec leurs quantités et leur source.</p>
        <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
          {(metres.data ?? []).filter((m) => !m.archived_at).map((m) => <button key={m.id} className="block w-full rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-navy-50" onClick={() => nav(`/app/metres/${m.id}`)}><span className="text-muted">{m.reference}</span> · <b>{m.title}</b></button>)}
          {!(metres.data ?? []).length && <p className="text-muted">Aucun métré.</p>}
        </div>
        <Button className="mt-4" onClick={() => setSource('manuel')}>Retour</Button>
      </Modal>
    );
  }

  const ready = title.trim() && (source === 'manuel' || (source === 'import' ? !!imported : source === 'bibliotheque' ? !!libPlan?.stats.ouvrages : !!from));
  return (
    <Modal title={kind === 'devis' ? 'Nouveau devis' : kind === 'dqe' ? 'Nouveau DQE' : 'Nouveau BPU'} onClose={onClose} wide
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!ready} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (x) => nav(`/app/documents-chiffres/${x.id}`) })}>Créer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Point de départ" className="sm:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.map(([k, label]) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13.5px] ${source === k ? 'border-signal-500 bg-signal-50' : 'border-line hover:bg-navy-50'}`}>
                <input type="radio" className="accent-[var(--color-signal-500)]" checked={source === k} onChange={() => setSource(k)} /> {label}
              </label>
            ))}
          </div>
        </Field>
        {(source === 'dqe' || source === 'devis') && (
          <Field label={source === 'dqe' ? 'DQE de départ' : 'Devis de départ'} className="sm:col-span-2">
            <Select value={from} onChange={(e) => { setFrom(e.target.value); const s = all.find((x) => x.id === e.target.value); if (s) { if (!title) setTitle(`${kind === 'devis' ? 'Devis' : kind.toUpperCase()} — ${s.title}`); if (!pid && s.project_id) setPid(s.project_id); if (!cid && s.client_id) setCid(s.client_id); } }}>
              <option value="">— Choisir —</option>
              {fromList.map((x) => <option key={x.id} value={x.id}>{x.reference} v{x.version} · {x.title}</option>)}
            </Select>
          </Field>
        )}
        {source === 'import' && (
          <div className="sm:col-span-2">
            <input ref={file} type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
            <Button icon={<Upload size={16} />} loading={importing} onClick={() => file.current?.click()}>Choisir le fichier Excel ou CSV</Button>
            {importErr && <Notice tone="bad" className="mt-3">{importErr}</Notice>}
            {imported && (
              <Notice tone={imported.missingQty || imported.missingPrice ? 'warn' : 'ok'} className="mt-3" title={`${imported.lots} lot(s), ${imported.lines} ligne(s) reconnue(s)`}>
                {imported.missingQty > 0 && <div>{imported.missingQty} ligne(s) sans quantité, laissée(s) « à compléter ».</div>}
                {imported.missingPrice > 0 && <div>{imported.missingPrice} ligne(s) sans prix unitaire, laissée(s) « à compléter ».</div>}
                {imported.alerts.slice(0, 6).map((a, i) => <div key={i}>• {a}</div>)}
                <div className="mt-1 text-[12px]">Les totaux seront recalculés par PLANORA à partir des lignes ; les formules du fichier sont gardées en note pour la traçabilité.</div>
              </Notice>
            )}
          </div>
        )}
        {source === 'bibliotheque' && (
          <div className="sm:col-span-2">
            {library.isLoading ? <Spinner /> : !tradeList.length ? <Notice tone="warn">La bibliothèque ne contient aucun ouvrage utilisable. Importez un DQE de l’entreprise ou saisissez des ouvrages.</Notice> : (
              <>
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-navy-900">Corps d’état à reprendre (un lot chacun)</span>
                  <button className="font-semibold text-signal-600 underline" onClick={() => setTrades(trades.length === tradeList.length ? [] : tradeList.map((t) => t.name))}>{trades.length === tradeList.length ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
                </div>
                <div className="grid max-h-[30vh] gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
                  {tradeList.map((t) => (
                    <Checkbox key={t.name} label={<>{t.name} <span className="text-muted">({t.count}{t.toVerify ? `, dont ${t.toVerify} à vérifier` : ''})</span></>} checked={trades.includes(t.name)} onChange={(on) => setTrades(on ? [...trades, t.name] : trades.filter((x) => x !== t.name))} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <Checkbox label="Inclure les ouvrages « à vérifier » (signalés sur leur ligne)" checked={includeToVerify} onChange={setIncludeToVerify} />
                  <Checkbox label="Reprendre les sections du DQE d’origine" checked={withSections} onChange={setWithSections} />
                </div>
                {libPlan && (
                  <Notice tone={libPlan.stats.aVerifier || libPlan.stats.sansPrix ? 'warn' : 'ok'} className="mt-3" title={`${libPlan.body.lots.length} lot(s), ${libPlan.stats.ouvrages} ouvrage(s)`}>
                    <div>{libPlan.stats.chiffres} ouvrage(s) chiffré(s) avec le prix de la bibliothèque.</div>
                    {libPlan.stats.sansPrix > 0 && <div>{libPlan.stats.sansPrix} ouvrage(s) sans prix, laissé(s) « à compléter ».</div>}
                    {libPlan.stats.autreDevise > 0 && <div>{libPlan.stats.autreDevise} prix dans une autre devise, non repris.</div>}
                    {libPlan.stats.aVerifier > 0 && <div>{libPlan.stats.aVerifier} prix « à vérifier », signalé(s) sur leur ligne.</div>}
                    {libPlan.stats.ecartes > 0 && <div>{libPlan.stats.ecartes} ouvrage(s) « à vérifier » écarté(s).</div>}
                    {kind === 'dqe' && <div className="mt-1 text-[12px]">Les quantités restent à saisir : aucune quantité n’est reprise d’un autre projet.</div>}
                  </Notice>
                )}
              </>
            )}
          </div>
        )}
        <Field label="Titre" required className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Construction d’une villa R+1" /></Field>
        <Field label="Projet"><Select value={pid} onChange={(e) => { setPid(e.target.value); const p = (projects.data ?? []).find((x) => x.id === e.target.value); if (p?.client_id) setCid(p.client_id); }}><option value="">— Aucun —</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
        <Field label="Client"><Select value={cid} onChange={(e) => setCid(e.target.value)}><option value="">— Aucun —</option>{(contacts.data ?? []).filter((c) => c.kind === 'client' && !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        {source === 'manuel' && pid && (lots.data?.length ?? 0) > 0 && <div className="sm:col-span-2"><Checkbox label={`Reprendre les ${lots.data!.length} lots du projet`} checked={withLots} onChange={setWithLots} /></div>}
      </div>
    </Modal>
  );
}
