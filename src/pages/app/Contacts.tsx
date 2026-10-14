import { Archive, ArchiveRestore, Download, Plus, Star, Upload, Users } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { insertRow, updateRow, useAction, useRow, useRows } from '../../lib/api';
import { CLIENT_TYPES, COUNTRIES, PROJECT_STATUS, QUOTE_STATUS, fmtDate } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, Project, Quote } from '../../lib/types';
import { downloadBlob } from '../../lib/download';
import { mapHeaders, parseCsv, toCsv } from '../../engine/csv';
import { findDuplicates } from '../../engine/dedupe';
import { formatMoney } from '../../engine/money';
import { Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, KeyValue, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Tabs, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ContactsPage() {
  const { org } = useOrg();
  const nav = useNavigate();
  const [kind, setKind] = useState<'client' | 'fournisseur'>('client');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [importing, setImporting] = useState(false);
  const rows = useRows<Contact>('contacts', org?.id, { order: ['name'] });
  const list = useMemo(() => {
    const n = norm(q);
    return (rows.data ?? []).filter((c) => c.kind === kind && !!c.archived_at === archived && (!type || c.client_type === type || c.categories.includes(type))
      && (!n || norm([c.name, c.legal_name, c.phone, c.email, c.city, c.contact_person].join(' ')).includes(n)));
  }, [rows.data, kind, q, type, archived]);

  const exportCsv = () => {
    const head = ['Type', 'Nom', 'Raison sociale', 'Catégorie', 'Contact', 'Téléphone', 'E-mail', 'Adresse', 'Ville', 'Pays', 'Identifiants légaux', 'Notes'];
    const data = list.map((c) => [c.kind, c.name, c.legal_name, c.kind === 'client' ? CLIENT_TYPES[c.client_type ?? ''] ?? '' : c.categories.join(', '), c.contact_person, c.phone, c.email, c.address, c.city, c.country, c.legal_ids, c.notes]);
    downloadBlob(new Blob([toCsv([head, ...data])], { type: 'text/csv;charset=utf-8' }), `${kind === 'client' ? 'clients' : 'fournisseurs'}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <>
      <PageHeader
        title="Clients et fournisseurs"
        subtitle="Fiches, historique des projets et devis, import CSV, détection des doublons."
        actions={
          <>
            <Allowed module="clients" action="creer"><Button icon={<Upload size={16} />} onClick={() => setImporting(true)}>Importer CSV</Button></Allowed>
            <Allowed module="clients" action="exporter"><Button icon={<Download size={16} />} onClick={exportCsv} disabled={!list.length}>Exporter</Button></Allowed>
            <Allowed module="clients" action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ kind, client_type: kind === 'client' ? 'particulier' : null, country: org?.country })}>{kind === 'client' ? 'Nouveau client' : 'Nouveau fournisseur'}</Button></Allowed>
          </>
        }
      />
      <Tabs value={kind} onChange={(k) => { setKind(k); setType(''); }} items={[{ id: 'client', label: 'Clients' }, { id: 'fournisseur', label: 'Fournisseurs' }]} />
      <Card bodyClass="p-0">
        <div className="flex flex-col gap-2 border-b border-line-2 p-3 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Nom, téléphone, e-mail, ville…" className="sm:max-w-sm sm:flex-1" />
          {kind === 'client' && (
            <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-56">
              <option value="">Tous les types</option>
              {Object.entries(CLIENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
          <div className="sm:ml-auto"><Checkbox label="Afficher les archives" checked={archived} onChange={setArchived} /></div>
        </div>
        {rows.isLoading ? <Spinner /> : (
          <DataTable
            rows={list}
            onRowClick={(c) => nav(`/app/clients/${c.id}`)}
            initialSort={{ key: 'name', dir: 1 }}
            empty={<EmptyState icon={<Users size={22} />} title={archived ? 'Aucune fiche archivée' : q ? 'Aucun résultat' : kind === 'client' ? 'Aucun client pour le moment' : 'Aucun fournisseur pour le moment'}>{!q && !archived && 'Créez une fiche ou importez un fichier CSV.'}</EmptyState>}
            columns={[
              { key: 'name', label: 'Nom', sort: (c) => norm(c.name), render: (c) => <div><div className="font-semibold text-navy-900">{c.name}</div>{c.contact_person && <div className="text-[12px] text-muted">{c.contact_person}</div>}</div> },
              kind === 'client'
                ? { key: 'type', label: 'Type', sort: (c) => c.client_type ?? '', render: (c) => CLIENT_TYPES[c.client_type ?? ''] ?? '—', hideOnMobile: true }
                : { key: 'cat', label: 'Catégories', render: (c) => c.categories.join(', ') || '—', hideOnMobile: true },
              { key: 'phone', label: 'Téléphone', render: (c) => c.phone ?? '—' },
              { key: 'email', label: 'E-mail', render: (c) => c.email ?? '—', hideOnMobile: true },
              { key: 'city', label: 'Ville', sort: (c) => c.city ?? '', render: (c) => [c.city, c.country && COUNTRIES[c.country]].filter(Boolean).join(', ') || '—', hideOnMobile: true },
            ]}
          />
        )}
      </Card>
      {edit && <ContactForm initial={edit} existing={rows.data ?? []} onClose={() => setEdit(null)} onSaved={(c) => nav(`/app/clients/${c.id}`)} />}
      {importing && <ContactImport kind={kind} existing={rows.data ?? []} onClose={() => setImporting(false)} />}
    </>
  );
}

export function ContactForm({ initial, existing, onClose, onSaved }: { initial: Partial<Contact>; existing: Contact[]; onClose: () => void; onSaved?: (c: Contact) => void }) {
  const { org } = useOrg();
  const [f, setF] = useState<Partial<Contact>>(initial);
  const [forceDup, setForceDup] = useState(false);
  const set = (k: keyof Contact) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null });
  const dups = useMemo(() => (f.name ? findDuplicates({ id: f.id, name: f.name, phone: f.phone, email: f.email }, existing.filter((c) => c.kind === f.kind)) : []), [f.name, f.phone, f.email, f.id, f.kind, existing]);
  const save = useAction(async () => {
    const values = {
      kind: f.kind, client_type: f.kind === 'client' ? f.client_type ?? 'particulier' : null, name: (f.name ?? '').trim(), legal_name: f.legal_name,
      contact_person: f.contact_person, phone: f.phone, email: f.email?.trim() || null, address: f.address, city: f.city, country: f.country,
      legal_ids: f.legal_ids, categories: f.categories ?? [], lead_time_days: f.lead_time_days ?? null, rating: f.rating ?? null, notes: f.notes,
    };
    return f.id ? updateRow<Contact>('contacts', f.id, values) : insertRow<Contact>('contacts', { ...values, org_id: org!.id });
  }, { success: f.id ? 'Fiche enregistrée.' : 'Fiche créée.', invalidate: [['contacts']] });
  const blocked = dups.length > 0 && !forceDup && !f.id;
  return (
    <Modal
      title={f.id ? `Modifier « ${initial.name} »` : f.kind === 'client' ? 'Nouveau client' : 'Nouveau fournisseur'}
      onClose={onClose}
      wide
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" loading={save.isPending} disabled={!f.name?.trim() || blocked} onClick={() => save.mutate(undefined, { onSuccess: (c) => { onClose(); onSaved?.(c); } })}>Enregistrer</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom ou raison sociale" required className="sm:col-span-2"><Input value={f.name ?? ''} onChange={set('name')} autoFocus /></Field>
        {dups.length > 0 && (
          <Notice tone="warn" className="sm:col-span-2" title="Doublon possible">
            {dups.map((d) => <div key={d.contact.id}>« {d.contact.name} » : {d.reasons.join(', ')}</div>)}
            {!f.id && <div className="mt-2"><Checkbox label="Créer quand même cette fiche" checked={forceDup} onChange={setForceDup} /></div>}
          </Notice>
        )}
        {f.kind === 'client' ? (
          <Field label="Type de client">
            <Select value={f.client_type ?? 'particulier'} onChange={set('client_type')}>{Object.entries(CLIENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
        ) : (
          <Field label="Catégories de produits ou services" hint="Séparées par des virgules"><Input value={(f.categories ?? []).join(', ')} onChange={(e) => setF({ ...f, categories: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Ciment, Fer à béton" /></Field>
        )}
        <Field label="Personne de contact"><Input value={f.contact_person ?? ''} onChange={set('contact_person')} /></Field>
        <Field label="Téléphone"><Input type="tel" value={f.phone ?? ''} onChange={set('phone')} /></Field>
        <Field label="E-mail"><Input type="email" value={f.email ?? ''} onChange={set('email')} /></Field>
        <Field label="Adresse" className="sm:col-span-2"><Input value={f.address ?? ''} onChange={set('address')} /></Field>
        <Field label="Ville"><Input value={f.city ?? ''} onChange={set('city')} /></Field>
        <Field label="Pays"><Select value={f.country ?? ''} onChange={set('country')}><option value="">—</option>{Object.entries(COUNTRIES).filter(([k]) => k !== 'AUTRE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Raison sociale complète" hint="Si différente du nom"><Input value={f.legal_name ?? ''} onChange={set('legal_name')} /></Field>
        <Field label="Identifiants légaux" hint="IFU, RCCM, NCC… si nécessaires"><Input value={f.legal_ids ?? ''} onChange={set('legal_ids')} /></Field>
        {f.kind === 'fournisseur' && (
          <>
            <Field label="Délai habituel (jours)"><Input type="number" min={0} value={f.lead_time_days ?? ''} onChange={(e) => setF({ ...f, lead_time_days: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            <Field label="Évaluation interne">
              <div className="flex h-10 items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} sur 5`} onClick={() => setF({ ...f, rating: f.rating === n ? null : n })}><Star size={22} className={(f.rating ?? 0) >= n ? 'fill-signal-500 text-signal-500' : 'text-line'} /></button>
                ))}
              </div>
            </Field>
          </>
        )}
        <Field label="Notes internes" className="sm:col-span-2"><Textarea value={f.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function ContactImport({ kind, existing, onClose }: { kind: 'client' | 'fournisseur'; existing: Contact[]; onClose: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<{ name: string; phone: string; email: string; city: string; address: string; contact: string; notes: string; dup: string[]; keep: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useAction(async () => {
    const chosen = rows!.filter((r) => r.keep);
    let done = 0;
    for (const r of chosen) {
      await insertRow('contacts', { org_id: org!.id, kind, client_type: kind === 'client' ? 'particulier' : null, name: r.name, phone: r.phone || null, email: r.email || null, city: r.city || null, address: r.address || null, contact_person: r.contact || null, notes: r.notes || null, country: org!.country });
      done++;
    }
    return done;
  }, { success: (n) => `${n} fiche(s) importée(s).`, invalidate: [['contacts']] });

  const read = async (f: File) => {
    setError(null);
    const text = await f.text();
    const data = parseCsv(text);
    if (data.length < 2) return setError('Le fichier ne contient pas de lignes.');
    const map = mapHeaders(data[0], {
      name: ['nom', 'name', 'raison sociale', 'client', 'fournisseur', 'societe'], phone: ['telephone', 'tel', 'phone', 'mobile'], email: ['email', 'e-mail', 'mail', 'courriel'],
      city: ['ville', 'city'], address: ['adresse', 'address'], contact: ['contact', 'personne de contact', 'interlocuteur'], notes: ['notes', 'note', 'commentaire', 'observations'],
    });
    if (map.name === undefined) return setError('Colonne « Nom » introuvable dans l’en-tête du fichier.');
    const seen: Contact[] = [...existing.filter((c) => c.kind === kind)];
    const out = data.slice(1).map((r) => {
      const g = (k: keyof typeof map) => (map[k] !== undefined ? (r[map[k]!] ?? '').trim() : '');
      const row = { name: g('name'), phone: g('phone'), email: g('email'), city: g('city'), address: g('address'), contact: g('contact'), notes: g('notes') };
      const dup = row.name ? findDuplicates({ name: row.name, phone: row.phone, email: row.email }, seen).map((d) => `${d.contact.name} (${d.reasons.join(', ')})`) : [];
      if (row.name) seen.push({ id: 'csv' + seen.length, name: row.name, phone: row.phone, email: row.email } as Contact);
      return { ...row, dup, keep: !!row.name && !dup.length };
    }).filter((r) => r.name || r.phone || r.email);
    setRows(out);
  };

  return (
    <Modal title={`Importer des ${kind === 'client' ? 'clients' : 'fournisseurs'} (CSV)`} onClose={onClose} size="lg"
      footer={<><Button onClick={onClose}>Annuler</Button>{rows && <Button variant="primary" loading={run.isPending} disabled={!rows.some((r) => r.keep)} onClick={() => run.mutate(undefined, { onSuccess: onClose })}>Importer {rows.filter((r) => r.keep).length} fiche(s)</Button>}</>}>
      <p className="text-[13.5px] text-ink-2">Fichier CSV (séparateur « ; » ou « , ») avec une ligne d’en-tête : <b>Nom</b> (obligatoire), Téléphone, E-mail, Ville, Adresse, Contact, Notes. Les doublons détectés sont décochés.</p>
      <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0]).catch((er) => toast('bad', String(er)))} />
      <Button className="mt-3" icon={<Upload size={16} />} onClick={() => file.current?.click()}>Choisir le fichier</Button>
      {error && <Notice tone="bad" className="mt-3">{error}</Notice>}
      {rows && (
        <div className="mt-4 max-h-[50vh] overflow-auto rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-navy-50 text-left text-[12px] text-muted"><tr><th className="p-2">Importer</th><th className="p-2">Nom</th><th className="p-2">Téléphone</th><th className="p-2">E-mail</th><th className="p-2">Remarque</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line-2">
                  <td className="p-2"><input type="checkbox" className="accent-[var(--color-signal-500)]" disabled={!r.name} checked={r.keep} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} /></td>
                  <td className="p-2 font-medium">{r.name || <span className="text-bad-600">nom manquant</span>}</td>
                  <td className="p-2">{r.phone}</td>
                  <td className="p-2">{r.email}</td>
                  <td className="p-2 text-warn-600">{r.dup.length ? `Doublon possible : ${r.dup.join(' ; ')}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export function ContactDetail() {
  const { id } = useParams();
  const { org } = useOrg();
  const c = useRow<Contact>('contacts', id);
  const all = useRows<Contact>('contacts', org?.id);
  const projects = useRows<Project>('projects', org?.id, { filter: (q) => q.eq('client_id', id), key: ['client', id] });
  const quotes = useRows<Quote>('quotes', org?.id, { select: 'id, reference, title, kind, status, total_ttc, total_ht, issue_date, settings', filter: (q) => q.eq('client_id', id), key: ['client', id] });
  const [edit, setEdit] = useState(false);
  const archive = useAction(() => updateRow('contacts', id!, { archived_at: c.data?.archived_at ? null : new Date().toISOString() }), { success: c.data?.archived_at ? 'Fiche restaurée.' : 'Fiche archivée.', invalidate: [['contacts']] });
  if (c.isLoading) return <Spinner />;
  if (!c.data) return <Notice tone="bad">Fiche introuvable ou accès non autorisé.</Notice>;
  const x = c.data;
  return (
    <>
      <PageHeader
        back={<Link className="link" to="/app/clients">← Clients et fournisseurs</Link>}
        title={<span className="flex items-center gap-2">{x.name} {x.archived_at && <Badge>Archivé</Badge>}</span>}
        subtitle={x.kind === 'client' ? `Client · ${CLIENT_TYPES[x.client_type ?? ''] ?? ''}` : `Fournisseur${x.categories.length ? ' · ' + x.categories.join(', ') : ''}`}
        actions={
          <>
            <Allowed module="clients" action="modifier"><Button icon={x.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />} loading={archive.isPending} onClick={() => archive.mutate(undefined)}>{x.archived_at ? 'Restaurer' : 'Archiver'}</Button></Allowed>
            <Allowed module="clients" action="modifier"><Button variant="primary" onClick={() => setEdit(true)}>Modifier</Button></Allowed>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card title="Coordonnées">
          <KeyValue items={[
            ['Personne de contact', x.contact_person], ['Téléphone', x.phone && <a className="link" href={`tel:${x.phone}`}>{x.phone}</a>],
            ['E-mail', x.email && <a className="link" href={`mailto:${x.email}`}>{x.email}</a>], ['Adresse', x.address],
            ['Ville et pays', [x.city, x.country && COUNTRIES[x.country]].filter(Boolean).join(', ') || null], ['Identifiants légaux', x.legal_ids],
            ...(x.kind === 'fournisseur' ? [['Délai habituel', x.lead_time_days !== null ? `${x.lead_time_days} jour(s)` : null], ['Évaluation', x.rating ? '★'.repeat(x.rating) : null]] as [string, React.ReactNode][] : []),
            ['Notes internes', x.notes && <span className="whitespace-pre-wrap">{x.notes}</span>], ['Créée le', fmtDate(x.created_at)],
          ]} />
        </Card>
        <div className="space-y-4">
          <Card title={`Projets (${projects.data?.length ?? 0})`} bodyClass="p-0">
            {(projects.data ?? []).length === 0 ? <p className="p-4 text-[13.5px] text-muted">Aucun projet pour ce contact.</p> : (projects.data ?? []).map((p) => (
              <Link key={p.id} to={`/app/projets/${p.id}`} className="flex items-center justify-between gap-2 border-b border-line-2 px-4 py-2.5 text-[13.5px] last:border-0 hover:bg-navy-50/50">
                <span><span className="text-muted">{p.reference}</span> · <b className="text-navy-900">{p.name}</b></span>
                <Badge tone={PROJECT_STATUS[p.status]?.tone}>{PROJECT_STATUS[p.status]?.label}</Badge>
              </Link>
            ))}
          </Card>
          <Card title={`Devis et DQE (${quotes.data?.length ?? 0})`} bodyClass="p-0">
            {(quotes.data ?? []).length === 0 ? <p className="p-4 text-[13.5px] text-muted">Aucun document chiffré.</p> : (quotes.data ?? []).map((qq) => (
              <Link key={qq.id} to={`/app/documents-chiffres/${qq.id}`} className="flex items-center justify-between gap-2 border-b border-line-2 px-4 py-2.5 text-[13.5px] last:border-0 hover:bg-navy-50/50">
                <span><span className="text-muted">{qq.reference}</span> · <b className="text-navy-900">{qq.title}</b></span>
                <span className="flex items-center gap-2"><span className="tabular">{formatMoney(qq.total_ttc ?? qq.total_ht, qq.settings?.currency)}</span><Badge tone={QUOTE_STATUS[qq.status]?.tone}>{QUOTE_STATUS[qq.status]?.label}</Badge></span>
              </Link>
            ))}
          </Card>
          <Notice tone="navy" title="Factures et paiements">L’historique des factures et des soldes s’affichera ici avec le module Facturation (phase 5).</Notice>
        </div>
      </div>
      {edit && <ContactForm initial={x} existing={all.data ?? []} onClose={() => setEdit(false)} />}
    </>
  );
}
