import { ArrowDown, ArrowUp, BookOpen, Copy, Download, FileSpreadsheet, GitBranch, Heading, History, Lock, Mail, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { insertRow, rpc, updateRow, useAction, useRow, useRows } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { QUOTE_STATUS, fmtDate, fmtDateTime } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, PriceItem, Project, Quote, QuoteSettings, QuoteVersion } from '../../lib/types';
import { applyBpu, cloneBody, computeDoc, missingLines, newLine, newLot, renumberLots, type DocBody, type DocLine } from '../../engine/dqe';
import { amountInWords, formatMoney, formatNumber, parseNumber } from '../../engine/money';
import { UNITS } from '../../engine/units';
import { Badge, Button, Card, Confirm, EmptyState, Field, Input, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';
import { priceAge } from './Prices';

const KIND_LABEL = { dqe: 'DQE', bpu: 'BPU', devis: 'Devis' };

function Num({ value, onChange, disabled, label, decimals = 3, wide, boxed }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; label: string; decimals?: number; wide?: boolean; boxed?: boolean }) {
  const show = (v: number | null) => (v === null ? '' : formatNumber(v, decimals).replace(/ /g, ' '));
  const [txt, setTxt] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(show(value)); }, [value, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const bad = txt.trim() !== '' && parseNumber(txt) === null;
  return (
    <input aria-label={label} disabled={disabled} inputMode="decimal"
      className={`${boxed ? 'input' : 'cell-input'} text-right ${wide ? 'w-32' : 'w-24'} ${bad ? '!border-bad-600' : value === null ? 'bg-warn-50' : ''}`}
      value={txt} onFocus={() => setFocus(true)} onChange={(e) => setTxt(e.target.value)}
      onBlur={() => { setFocus(false); if (!bad) onChange(parseNumber(txt)); }} />
  );
}

export function QuoteEditor() {
  const { id } = useParams();
  const { org, can } = useOrg();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const row = useRow<Quote>('quotes', id);
  const contacts = useRows<Contact>('contacts', org?.id, { order: ['name'] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, location, city, client_id, archived_at' });
  const [doc, setDoc] = useState<Quote | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{ lotId: string; lineId: string } | null>(null);
  const [bpuOpen, setBpuOpen] = useState(false);
  const [versions, setVersions] = useState(false);
  const [confirm, setConfirm] = useState<null | 'lock' | 'version' | 'delete'>(null);
  const [decision, setDecision] = useState<null | 'accepte' | 'refuse'>(null);

  useEffect(() => { if (row.data && (!doc || doc.id !== row.data.id || (!dirty && row.data.updated_at !== doc.updated_at))) setDoc(row.data); }, [row.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const module = doc?.kind === 'devis' ? 'devis' : 'dqe';
  const editable = !!doc && !doc.locked && can(module, 'modifier');
  const isBpu = doc?.kind === 'bpu';
  const isDevis = doc?.kind === 'devis';
  const result = useMemo(() => (doc ? computeDoc(doc.body, isDevis ? doc.settings : { ...doc.settings, taxes: doc.settings.taxes ?? [] }) : null), [doc, isDevis]);

  // Sauvegarde automatique : le document et ses totaux calculés par le moteur.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = async (d: Quote) => {
    setSaving(true);
    try {
      const r = computeDoc(d.body, d.settings);
      const saved = await updateRow<Quote>('quotes', d.id, {
        title: d.title, client_id: d.client_id, project_id: d.project_id, issue_date: d.issue_date, valid_until: d.valid_until,
        payment_terms: d.payment_terms, execution_delay: d.execution_delay, notes: d.notes, body: d.body, settings: d.settings,
        total_ht: d.kind === 'devis' ? r.netHT : r.totalHT, total_ttc: r.totalTTC, incomplete_lines: r.incomplete,
      });
      setDoc((cur) => (cur ? { ...cur, updated_at: saved.updated_at } : cur));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['quotes'] });
    } catch (e) {
      toast('bad', `Sauvegarde impossible : ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };
  const change = (patch: Partial<Quote>) => {
    if (!doc || !editable) return;
    const next = { ...doc, ...patch };
    setDoc(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), 1200);
  };
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty && doc) await persist(doc);
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setBody = (body: DocBody) => change({ body });
  const setLine = (lotId: string, lineId: string, patch: Partial<DocLine>) =>
    setBody({ lots: doc!.body.lots.map((l) => (l.id !== lotId ? l : { ...l, lines: l.lines.map((x) => (x.id === lineId ? { ...x, ...patch } : x)) })) });
  const moveLine = (lotId: string, lineId: string, d: -1 | 1) => setBody({ lots: doc!.body.lots.map((l) => {
    if (l.id !== lotId) return l;
    const i = l.lines.findIndex((x) => x.id === lineId);
    const j = i + d;
    if (j < 0 || j >= l.lines.length) return l;
    const lines = [...l.lines];
    [lines[i], lines[j]] = [lines[j], lines[i]];
    return { ...l, lines };
  }) });
  const moveLot = (lotId: string, d: -1 | 1) => {
    const lots = [...doc!.body.lots];
    const i = lots.findIndex((l) => l.id === lotId);
    const j = i + d;
    if (j < 0 || j >= lots.length) return;
    [lots[i], lots[j]] = [lots[j], lots[i]];
    setBody(renumberLots({ lots }));
  };

  const client = (contacts.data ?? []).find((c) => c.id === doc?.client_id);
  const project = (projects.data ?? []).find((p) => p.id === doc?.project_id);

  const lock = useAction(async () => { await flush(); await rpc('lock_quote', { p_quote: id }); }, { success: 'Version validée et verrouillée.', invalidate: [['quotes']] });
  const newVersion = useAction(async (reason: string) => rpc<number>('new_quote_version', { p_quote: id, p_reason: reason || null }), { success: (v) => `Version ${v} créée : modifiable.`, invalidate: [['quotes'], ['quote_versions']] });
  const setStatus = useAction(async (a: { status: string; note?: string }) => {
    await flush();
    return updateRow<Quote>('quotes', id!, { status: a.status, ...(a.status === 'accepte' || a.status === 'refuse' ? { decision_at: new Date().toISOString(), decision_note: a.note ?? null } : {}) });
  }, { success: 'Statut mis à jour.', invalidate: [['quotes']] });
  const duplicate = useAction(async () => {
    await flush();
    return insertRow<Quote>('quotes', {
      org_id: org!.id, kind: doc!.kind, title: `${doc!.title} (copie)`, project_id: doc!.project_id, client_id: doc!.client_id, body: cloneBody(doc!.body), settings: doc!.settings,
      payment_terms: doc!.payment_terms, execution_delay: doc!.execution_delay, notes: doc!.notes, source_kind: doc!.kind === 'devis' ? 'devis' : 'dqe', source_id: doc!.id,
      valid_until: doc!.kind === 'devis' ? new Date(Date.now() + org!.quote_validity_days * 86400000).toISOString().slice(0, 10) : null,
    });
  }, { success: (q) => `Copie ${q.reference} créée.`, invalidate: [['quotes']] });
  const derive = useAction(async (kind: 'devis' | 'bpu') => {
    await flush();
    const body = kind === 'bpu' ? { lots: cloneBody(doc!.body).lots.map((l) => ({ ...l, lines: l.lines.map((x) => ({ ...x, qty: null })) })) } : cloneBody(doc!.body);
    return insertRow<Quote>('quotes', {
      org_id: org!.id, kind, title: `${kind === 'bpu' ? 'BPU' : 'Devis'} — ${doc!.title}`, project_id: doc!.project_id, client_id: doc!.client_id, body,
      settings: kind === 'devis' ? { currency: doc!.settings.currency, taxes: org!.default_taxes, discountPct: 0 } : { ...doc!.settings, taxes: [] },
      source_kind: 'dqe', source_id: doc!.id, payment_terms: kind === 'devis' ? org!.payment_terms : null,
      valid_until: kind === 'devis' ? new Date(Date.now() + org!.quote_validity_days * 86400000).toISOString().slice(0, 10) : null,
    });
  }, { success: (q) => `${q.reference} créé.`, invalidate: [['quotes']] });
  const remove = useAction(async () => {
    const { error, count } = await supabase.from('quotes').delete({ count: 'exact' }).eq('id', id!);
    if (error) throw new Error(errorMessage(error));
    if (!count) throw new Error('Suppression refusée : seuls les brouillons non verrouillés peuvent être supprimés, avec le droit « supprimer ».');
  }, { success: 'Document supprimé.', invalidate: [['quotes']] });

  const exportPdf = async () => {
    await flush();
    const { quotePdf } = await import('../../docs/pdf');
    await quotePdf(org!, doc!, client, project as Project | undefined);
  };
  const exportXlsx = async () => {
    await flush();
    const { exportQuoteXlsx } = await import('../../docs/xlsx');
    await exportQuoteXlsx(org!, doc!, client, project as Project | undefined);
  };
  const mail = () => {
    if (!doc || !result) return;
    const subject = `${doc.reference} — ${doc.title}`;
    const text = `Bonjour,\n\nVeuillez trouver ci-joint notre devis ${doc.reference} (version ${doc.version}) d’un montant de ${formatMoney(result.totalTTC, doc.settings.currency).replace(/ /g, ' ')} TTC${doc.valid_until ? `, valable jusqu’au ${fmtDate(doc.valid_until)}` : ''}.\n\nCordialement,\n${org?.name ?? ''}`;
    window.location.href = `mailto:${client?.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };

  if (row.isLoading || (!doc && row.data)) return <Spinner />;
  if (!doc || !result) return <Notice tone="bad">Document introuvable ou accès non autorisé.</Notice>;
  const cur = doc.settings.currency;
  const missing = missingLines(doc.body);
  const st = QUOTE_STATUS[doc.status];

  return (
    <>
      <PageHeader
        back={<Link className="link" to={isDevis ? '/app/devis' : '/app/dqe'}>← {isDevis ? 'Devis' : 'DQE et BPU'}</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{doc.title} <Badge tone={st?.tone}>{st?.label}</Badge>{doc.locked && <Badge tone="navy"><Lock size={11} /> v{doc.version} verrouillée</Badge>}</span>}
        subtitle={<>{KIND_LABEL[doc.kind]} {doc.reference} · version {doc.version} · <span className={dirty ? 'text-warn-600' : 'text-ok-600'}>{saving ? 'Enregistrement…' : dirty ? 'Modifications en cours…' : `Enregistré ${fmtDateTime(doc.updated_at)}`}</span></>}
        actions={<>
          <Allowed module={module} action="exporter"><Button icon={<Download size={16} />} onClick={() => void exportPdf().catch((e) => toast('bad', errorMessage(e)))}>PDF</Button></Allowed>
          <Allowed module={module} action="exporter"><Button icon={<FileSpreadsheet size={16} />} onClick={() => void exportXlsx().catch((e) => toast('bad', errorMessage(e)))}>Excel</Button></Allowed>
          <Button icon={<History size={16} />} onClick={() => setVersions(true)}>Versions</Button>
          {doc.locked ? (
            <Allowed module={module} action="modifier"><Button variant="primary" icon={<GitBranch size={16} />} onClick={() => setConfirm('version')}>Nouvelle version</Button></Allowed>
          ) : (
            <Allowed module={module} action="valider"><Button variant="navy" icon={<Lock size={16} />} onClick={() => setConfirm('lock')}>Valider et verrouiller</Button></Allowed>
          )}
        </>}
      />

      {doc.locked && <Notice tone="navy" className="mb-4" title={`Version ${doc.version} validée le ${fmtDateTime(doc.validated_at)}`}>Elle n’est plus modifiable. Pour changer le contenu, créez une nouvelle version : celle-ci restera consultable dans l’historique.</Notice>}
      {!can(module, 'modifier') && !doc.locked && <Notice tone="warn" className="mb-4">Lecture seule : votre rôle ou votre abonnement ne permet pas de modifier ce document.</Notice>}

      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <div className="min-w-0 space-y-4">
          <Card title="Informations">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Titre" className="sm:col-span-2 lg:col-span-3"><Input disabled={!editable} value={doc.title} onChange={(e) => change({ title: e.target.value })} /></Field>
              <Field label="Client"><Select disabled={!editable} value={doc.client_id ?? ''} onChange={(e) => change({ client_id: e.target.value || null })}><option value="">— Aucun —</option>{(contacts.data ?? []).filter((c) => c.kind === 'client').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Projet"><Select disabled={!editable} value={doc.project_id ?? ''} onChange={(e) => change({ project_id: e.target.value || null })}><option value="">— Aucun —</option>{(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
              <Field label="Date d’émission"><Input type="date" disabled={!editable} value={doc.issue_date} onChange={(e) => change({ issue_date: e.target.value })} /></Field>
              {isDevis && <Field label="Valable jusqu’au"><Input type="date" disabled={!editable} value={doc.valid_until ?? ''} onChange={(e) => change({ valid_until: e.target.value || null })} /></Field>}
              {isDevis && <Field label="Délai d’exécution"><Input disabled={!editable} value={doc.execution_delay ?? ''} placeholder="Ex. 4 mois à compter de l’ordre de service" onChange={(e) => change({ execution_delay: e.target.value || null })} /></Field>}
              {isDevis && <Field label="Conditions de paiement" className="sm:col-span-2 lg:col-span-1"><Input disabled={!editable} value={doc.payment_terms ?? ''} onChange={(e) => change({ payment_terms: e.target.value || null })} /></Field>}
              <Field label="Observations" className="sm:col-span-2 lg:col-span-3"><Textarea rows={2} disabled={!editable} value={doc.notes ?? ''} onChange={(e) => change({ notes: e.target.value || null })} /></Field>
            </div>
          </Card>

          <Card title={isBpu ? 'Bordereau des prix unitaires' : 'Ouvrages par lot'} bodyClass="p-0"
            actions={!isBpu && editable ? <Button size="sm" icon={<BookOpen size={15} />} onClick={() => setBpuOpen(true)}>Reprendre les prix d’un BPU</Button> : undefined}>
            {doc.body.lots.length === 0 && <EmptyState title="Aucun lot">Ajoutez un lot pour commencer.</EmptyState>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-navy-50/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                    <th className="w-12 px-2 py-2">N°</th><th className="w-20 px-1">Réf.</th><th className="px-1">Désignation</th><th className="w-20 px-1">Unité</th>
                    {!isBpu && <th className="px-1 text-right">Quantité</th>}<th className="px-1 text-right">P.U. HT</th>{!isBpu && <th className="px-2 text-right">Montant HT</th>}<th className="w-28" />
                  </tr>
                </thead>
                <tbody>
                  {doc.body.lots.map((lot, li) => (
                    <LotRows key={lot.id} lotIndex={li} lot={lot} editable={editable} isBpu={isBpu} result={result} currency={cur}
                      onRename={(name) => setBody({ lots: doc.body.lots.map((l) => (l.id === lot.id ? { ...l, name } : l)) })}
                      onMoveLot={(d) => moveLot(lot.id, d)}
                      onDeleteLot={() => setBody(renumberLots({ lots: doc.body.lots.filter((l) => l.id !== lot.id) }))}
                      onLine={(lineId, patch) => setLine(lot.id, lineId, patch)}
                      onMoveLine={(lineId, d) => moveLine(lot.id, lineId, d)}
                      onDeleteLine={(lineId) => setBody({ lots: doc.body.lots.map((l) => (l.id === lot.id ? { ...l, lines: l.lines.filter((x) => x.id !== lineId) } : l)) })}
                      onAdd={(kind) => setBody({ lots: doc.body.lots.map((l) => (l.id === lot.id ? { ...l, lines: [...l.lines, newLine({ kind })] } : l)) })}
                      onPick={(lineId) => setPicker({ lotId: lot.id, lineId })} />
                  ))}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="border-t border-line-2 p-3">
                <Button icon={<Plus size={16} />} onClick={() => setBody({ lots: [...doc.body.lots, newLot('Nouveau lot', doc.body.lots.length)] })}>Ajouter un lot</Button>
              </div>
            )}
          </Card>

          {missing.length > 0 && (
            <Card title={`Lignes à compléter (${missing.length})`} subtitle="Sans quantité ou sans prix : elles ne sont pas comptées dans les totaux">
              <ul className="space-y-1 text-[13px]">
                {missing.slice(0, 50).map((m) => <li key={m.line.id}><span className="text-muted">{m.lot}</span> · <b>{m.line.designation || '(sans désignation)'}</b> — <span className="text-warn-600">{m.missing.join(' et ')} manquant(s)</span></li>)}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {!isBpu && (
            <Card title="Totaux">
              <dl className="space-y-1.5 text-[13.5px]">
                <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd className="tabular font-semibold">{formatMoney(result.totalHT, cur)}</dd></div>
                {isDevis && result.discount > 0 && <>
                  <div className="flex justify-between"><dt className="text-muted">Remise {formatNumber(doc.settings.discountPct ?? 0, 2)} %</dt><dd className="tabular">− {formatMoney(result.discount, cur)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Net HT</dt><dd className="tabular font-semibold">{formatMoney(result.netHT, cur)}</dd></div>
                </>}
                {isDevis && result.taxes.map((t, i) => <div key={i} className="flex justify-between"><dt className="text-muted">{t.label} {formatNumber(t.rate, 2)} %</dt><dd className="tabular">{formatMoney(t.amount, cur)}</dd></div>)}
                {isDevis && result.taxes.length > 0 && <div className="mt-2 flex justify-between rounded-lg bg-navy-900 px-3 py-2 text-white"><dt className="font-semibold">Total TTC</dt><dd className="tabular font-bold">{formatMoney(result.totalTTC, cur)}</dd></div>}
              </dl>
              <p className="mt-3 text-[12px] italic text-muted">{amountInWords(isDevis && result.taxes.length ? result.totalTTC : result.netHT, cur)} {isDevis && result.taxes.length ? 'TTC' : 'HT'}</p>
              {result.incomplete > 0 && <Notice tone="warn" className="mt-3">{result.incomplete} ligne(s) sans quantité ou sans prix ne sont pas comptées.</Notice>}
              <p className="mt-3 text-[11.5px] text-faint">Montant de ligne = quantité × prix unitaire, arrondi à {cur === 'XOF' || cur === 'XAF' ? 'l’unité (FCFA)' : 'deux décimales'}. Mêmes montants à l’écran, dans le PDF et dans l’Excel.</p>
            </Card>
          )}

          {isDevis && (
            <Card title="Remise et taxes">
              <div className="space-y-3">
                <Field label="Remise globale (%)"><Num boxed label="Remise" value={doc.settings.discountPct ?? 0} decimals={2} disabled={!editable} onChange={(v) => change({ settings: { ...doc.settings, discountPct: v ?? 0 } })} /></Field>
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Taxes</div>
                  {doc.settings.taxes.map((t, i) => (
                    <div key={i} className="mb-1.5 flex items-center gap-2">
                      <input aria-label="Libellé de la taxe" disabled={!editable} className="input flex-1" value={t.label} onChange={(e) => change({ settings: { ...doc.settings, taxes: doc.settings.taxes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} />
                      <Num boxed label="Taux" value={t.rate} decimals={2} disabled={!editable} onChange={(v) => change({ settings: { ...doc.settings, taxes: doc.settings.taxes.map((x, j) => (j === i ? { ...x, rate: v ?? 0 } : x)) } })} />
                      <span className="text-[12px] text-muted">%</span>
                      {editable && <button aria-label="Retirer la taxe" className="p-1 text-faint hover:text-bad-600" onClick={() => change({ settings: { ...doc.settings, taxes: doc.settings.taxes.filter((_, j) => j !== i) } })}><Trash2 size={14} /></button>}
                    </div>
                  ))}
                  {editable && <Button size="sm" icon={<Plus size={14} />} onClick={() => change({ settings: { ...doc.settings, taxes: [...doc.settings.taxes, { label: 'Taxe', rate: 0 }] } })}>Ajouter une taxe</Button>}
                  {!doc.settings.taxes.length && <p className="text-[12.5px] text-muted">Aucune taxe : le devis est présenté hors taxes (entreprise non assujettie, par exemple).</p>}
                </div>
              </div>
            </Card>
          )}

          {isDevis && (
            <Card title="Suivi commercial">
              <div className="space-y-2 text-[13.5px]">
                <div className="flex items-center justify-between"><span className="text-muted">Statut</span><Badge tone={st?.tone}>{st?.label}</Badge></div>
                {doc.decision_at && <p className="text-[12.5px] text-muted">Décision du client enregistrée le {fmtDateTime(doc.decision_at)}{doc.decision_note ? ` : « ${doc.decision_note} »` : ''}.</p>}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Allowed module="devis" action="modifier"><Button size="sm" disabled={doc.status === 'envoye'} onClick={() => setStatus.mutate({ status: 'envoye' })}>Marquer envoyé</Button></Allowed>
                  <Button size="sm" icon={<Mail size={14} />} onClick={mail}>Préparer un e-mail</Button>
                  <Allowed module="devis" action="modifier"><Button size="sm" onClick={() => setDecision('accepte')}>Accepté</Button></Allowed>
                  <Allowed module="devis" action="modifier"><Button size="sm" onClick={() => setDecision('refuse')}>Refusé</Button></Allowed>
                  <Allowed module="devis" action="modifier"><Button size="sm" onClick={() => setStatus.mutate({ status: 'expire' })}>Expiré</Button></Allowed>
                  <Allowed module="devis" action="modifier"><Button size="sm" onClick={() => setStatus.mutate({ status: 'annule' })}>Annulé</Button></Allowed>
                </div>
                <p className="pt-1 text-[11.5px] text-faint">« Préparer un e-mail » ouvre votre messagerie : joignez le PDF téléchargé. L’envoi direct depuis PLANORA et la conversion en facture arriveront avec les modules Notifications et Facturation.</p>
              </div>
            </Card>
          )}

          <Card title="Actions">
            <div className="grid gap-2">
              <Allowed module={module} action="creer"><Button icon={<Copy size={15} />} loading={duplicate.isPending} onClick={() => duplicate.mutate(undefined, { onSuccess: (q) => nav(`/app/documents-chiffres/${q.id}`) })}>Dupliquer</Button></Allowed>
              {doc.kind === 'dqe' && <Allowed module="devis" action="creer"><Button onClick={() => derive.mutate('devis', { onSuccess: (q) => nav(`/app/documents-chiffres/${q.id}`) })}>Créer un devis depuis ce DQE</Button></Allowed>}
              {doc.kind === 'dqe' && <Allowed module="dqe" action="creer"><Button onClick={() => derive.mutate('bpu', { onSuccess: (q) => nav(`/app/documents-chiffres/${q.id}`) })}>Générer le BPU de ce DQE</Button></Allowed>}
              {!doc.locked && ['brouillon', 'annule'].includes(doc.status) && <Allowed module={module} action="supprimer" hide><Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirm('delete')}>Supprimer</Button></Allowed>}
            </div>
          </Card>
        </div>
      </div>

      {picker && <PricePicker onClose={() => setPicker(null)} onPick={(p) => {
        const line = doc.body.lots.find((l) => l.id === picker.lotId)?.lines.find((x) => x.id === picker.lineId);
        setLine(picker.lotId, picker.lineId, {
          unitPrice: p.sale_price, designation: line?.designation || p.designation, unit: line?.unit || p.unit, ref: line?.ref || p.code,
          priceSource: { kind: p.kind === 'ouvrage' ? 'deboursé' : 'bibliotheque', id: p.id, label: `${p.code || p.designation} · ${p.price_date ? fmtDate(p.price_date) : 'date inconnue'}` },
        });
        setPicker(null);
      }} />}
      {bpuOpen && <BpuApply projectId={doc.project_id} onClose={() => setBpuOpen(false)} onApply={(bpu) => {
        const r = applyBpu(doc.body, (bpu.body.lots.flatMap((l) => l.lines).filter((x) => x.kind !== 'titre')).map((x) => ({ ref: x.ref, designation: x.designation, unit: x.unit, unitPrice: x.unitPrice })));
        setBody(r.body);
        toast(r.applied ? 'ok' : 'navy', `${r.applied} prix repris du ${bpu.reference}. ${r.unmatched.length} ligne(s) sans référence correspondante.`);
        setBpuOpen(false);
      }} />}
      {versions && <VersionsModal quote={doc} onClose={() => setVersions(false)} client={client} project={project as Project | undefined} />}
      {confirm === 'lock' && <Confirm title="Valider et verrouiller cette version ?" confirmLabel="Valider" onClose={() => setConfirm(null)} onConfirm={() => lock.mutateAsync(undefined)}>
        La version {doc.version} sera figée et enregistrée dans l’historique. Toute modification ultérieure passera par une nouvelle version.
        {result.incomplete > 0 && <Notice tone="warn" className="mt-3">{result.incomplete} ligne(s) sont encore incomplètes.</Notice>}
      </Confirm>}
      {confirm === 'version' && <NewVersionDialog onClose={() => setConfirm(null)} onConfirm={(reason) => newVersion.mutateAsync(reason).then(() => undefined)} />}
      {confirm === 'delete' && <Confirm title="Supprimer ce document ?" danger confirmLabel="Supprimer" onClose={() => setConfirm(null)} onConfirm={() => remove.mutateAsync(undefined).then(() => nav(isDevis ? '/app/devis' : '/app/dqe'))}>Le brouillon {doc.reference} sera supprimé définitivement.</Confirm>}
      {decision && <DecisionDialog kind={decision} onClose={() => setDecision(null)} onConfirm={(note) => setStatus.mutateAsync({ status: decision, note }).then(() => undefined)} />}
    </>
  );
}

function LotRows({ lot, lotIndex, editable, isBpu, result, currency, onRename, onMoveLot, onDeleteLot, onLine, onMoveLine, onDeleteLine, onAdd, onPick }: {
  lot: DocBody['lots'][number]; lotIndex: number; editable: boolean; isBpu: boolean; result: ReturnType<typeof computeDoc>; currency: string;
  onRename: (n: string) => void; onMoveLot: (d: -1 | 1) => void; onDeleteLot: () => void; onLine: (id: string, p: Partial<DocLine>) => void;
  onMoveLine: (id: string, d: -1 | 1) => void; onDeleteLine: (id: string) => void; onAdd: (k: 'ouvrage' | 'titre') => void; onPick: (id: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const lr = result.lots[lotIndex];
  const cols = isBpu ? 6 : 8;
  return (
    <>
      <tr className="border-b border-line bg-navy-50">
        <td className="px-2 py-1.5 text-[12px] font-bold text-navy-700">{lot.code.replace('LOT ', '')}</td>
        <td colSpan={cols - 2} className="px-1"><input aria-label="Nom du lot" disabled={!editable} className="cell-input font-bold uppercase text-navy-900" value={lot.name} onChange={(e) => onRename(e.target.value)} /></td>
        <td className="whitespace-nowrap px-1 text-right">
          {editable && <>
            <button aria-label="Monter le lot" className="p-1 text-faint hover:text-ink" onClick={() => onMoveLot(-1)}><ArrowUp size={14} /></button>
            <button aria-label="Descendre le lot" className="p-1 text-faint hover:text-ink" onClick={() => onMoveLot(1)}><ArrowDown size={14} /></button>
            <button aria-label="Supprimer le lot" className="p-1 text-faint hover:text-bad-600" onClick={() => (lot.lines.length ? setConfirmDel(true) : onDeleteLot())}><Trash2 size={14} /></button>
          </>}
        </td>
      </tr>
      {lot.lines.map((l) => {
        const r = result.lines.get(l.id);
        if (l.kind === 'titre') return (
          <tr key={l.id} className="border-b border-line-2">
            <td />
            <td colSpan={cols - 2} className="px-1"><input aria-label="Sous-titre" disabled={!editable} className="cell-input font-semibold italic text-navy-800" value={l.designation} placeholder="Sous-partie (ex. Rez-de-chaussée)" onChange={(e) => onLine(l.id, { designation: e.target.value })} /></td>
            <td className="whitespace-nowrap px-1 text-right">{editable && <LineActions onMove={(d) => onMoveLine(l.id, d)} onDelete={() => onDeleteLine(l.id)} />}</td>
          </tr>
        );
        return (
          <tr key={l.id} className="border-b border-line-2 align-top">
            <td className="tabular px-2 py-2 text-[12px] text-muted">{r?.number}</td>
            <td className="px-1 py-1"><input aria-label="Référence" disabled={!editable} className="cell-input" value={l.ref} onChange={(e) => onLine(l.id, { ref: e.target.value })} /></td>
            <td className="px-1 py-1">
              <textarea aria-label="Désignation" disabled={!editable} rows={1} className="cell-input min-h-[30px] resize-y" value={l.designation} placeholder="Désignation de l’ouvrage" onChange={(e) => onLine(l.id, { designation: e.target.value })} />
              {isBpu && <textarea aria-label="Description détaillée" disabled={!editable} rows={1} className="cell-input mt-0.5 resize-y text-[12px] text-muted" value={l.description ?? ''} placeholder="Description détaillée (BPU)" onChange={(e) => onLine(l.id, { description: e.target.value })} />}
              <div className="flex flex-wrap gap-1 px-1.5">
                {l.qtySource && l.qtySource.kind !== 'saisie' && <span className="text-[10.5px] text-muted" title={l.qtySource.label}>Quantité : {l.qtySource.kind === 'metre' ? 'métré' : l.qtySource.kind === 'import' ? 'fichier importé' : l.qtySource.kind}{l.qtySource.label ? ` (${l.qtySource.label})` : ''}</span>}
                {l.priceSource && l.priceSource.kind !== 'saisie' && <span className="text-[10.5px] text-muted" title={l.priceSource.label}>· Prix : {l.priceSource.label ?? l.priceSource.kind}</span>}
                {l.note && <span className="text-[10.5px] text-muted">· {l.note}</span>}
              </div>
            </td>
            <td className="px-1 py-1">
              <input aria-label="Unité" disabled={!editable} list="planora-units" className="cell-input w-16" value={l.unit} onChange={(e) => onLine(l.id, { unit: e.target.value })} />
            </td>
            {!isBpu && <td className="px-1 py-1 text-right"><Num label="Quantité" value={l.qty} disabled={!editable} onChange={(v) => onLine(l.id, { qty: v, qtySource: v === l.qty ? l.qtySource : { kind: 'saisie' } })} /></td>}
            <td className="px-1 py-1 text-right"><Num label="Prix unitaire" wide value={l.unitPrice} decimals={2} disabled={!editable} onChange={(v) => onLine(l.id, { unitPrice: v, priceSource: v === l.unitPrice ? l.priceSource : { kind: 'saisie' } })} /></td>
            {!isBpu && <td className="tabular px-2 py-2 text-right font-semibold text-navy-900">{r?.amount === null ? <span className="text-[12px] text-warn-600">à compléter</span> : formatMoney(r?.amount, currency, false)}</td>}
            <td className="whitespace-nowrap px-1 py-1 text-right">
              {editable && <button aria-label="Choisir un prix dans la bibliothèque" title="Choisir un prix dans la bibliothèque" className="p-1 text-faint hover:text-signal-600" onClick={() => onPick(l.id)}><Search size={14} /></button>}
              {editable && <LineActions onMove={(d) => onMoveLine(l.id, d)} onDelete={() => onDeleteLine(l.id)} />}
            </td>
          </tr>
        );
      })}
      <tr className="border-b border-line">
        <td />
        <td colSpan={isBpu ? 3 : 4} className="px-1 py-1.5">
          {editable && (
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => onAdd('ouvrage')}>Ligne</Button>
              <Button size="sm" variant="ghost" icon={<Heading size={14} />} onClick={() => onAdd('titre')}>Sous-titre</Button>
            </span>
          )}
        </td>
        {!isBpu && <td colSpan={2} className="px-2 text-right text-[12.5px] font-semibold text-muted">Sous-total {lot.code}{lr?.incomplete ? <span className="block text-[11px] text-warn-600">{lr.incomplete} ligne(s) non comptée(s)</span> : null}</td>}
        {!isBpu && <td className="tabular px-2 text-right font-bold text-navy-900">{formatMoney(lr?.subtotal, currency, false)}</td>}
        <td />
      </tr>
      {confirmDel && <Confirm title={`Supprimer le lot « ${lot.name} » ?`} danger confirmLabel="Supprimer" onClose={() => setConfirmDel(false)} onConfirm={onDeleteLot}>Ses {lot.lines.length} ligne(s) seront retirées du document.</Confirm>}
      <datalist id="planora-units">{UNITS.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}</datalist>
    </>
  );
}

function LineActions({ onMove, onDelete }: { onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  return (
    <>
      <button aria-label="Monter" className="p-1 text-faint hover:text-ink" onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
      <button aria-label="Descendre" className="p-1 text-faint hover:text-ink" onClick={() => onMove(1)}><ArrowDown size={14} /></button>
      <button aria-label="Supprimer la ligne" className="p-1 text-faint hover:text-bad-600" onClick={onDelete}><Trash2 size={14} /></button>
    </>
  );
}

function PricePicker({ onClose, onPick }: { onClose: () => void; onPick: (p: PriceItem) => void }) {
  const { org } = useOrg();
  const items = useRows<PriceItem>('price_items', org?.id, { order: ['designation'] });
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const n = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = (items.data ?? []).filter((p) => !p.archived_at && (all || !p.country || p.country === org?.country) && (!n || [p.code, p.designation, p.category].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(n))).slice(0, 80);
  return (
    <Modal title="Choisir un prix dans la bibliothèque" onClose={onClose} wide>
      <SearchInput value={q} onChange={setQ} placeholder="Code, désignation, catégorie…" />
      <div className="mt-2"><label className="text-[12.5px] text-muted"><input type="checkbox" className="mr-1.5 accent-[var(--color-signal-500)]" checked={all} onChange={(e) => setAll(e.target.checked)} />Afficher aussi les prix d’autres pays</label></div>
      <div className="mt-3 max-h-[55vh] divide-y divide-line-2 overflow-y-auto rounded-lg border border-line">
        {items.isLoading && <Spinner />}
        {list.map((p) => {
          const age = priceAge(p);
          return (
            <button key={p.id} disabled={p.sale_price === null} onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-navy-50 disabled:opacity-50">
              <span className="min-w-0"><span className="block truncate font-semibold text-navy-900">{p.designation}</span><span className="text-[11.5px] text-muted">{p.code || '—'} · {p.unit} · {[p.city, p.country].filter(Boolean).join(', ') || 'zone ?'} · {p.source ?? 'source ?'}</span></span>
              <span className="text-right"><span className="tabular block font-bold">{p.sale_price === null ? 'sans prix de vente' : formatMoney(p.sale_price, p.currency)}</span><Badge tone={age.tone}>{age.label}</Badge></span>
            </button>
          );
        })}
        {!items.isLoading && !list.length && <p className="p-4 text-[13px] text-muted">Aucun article. Alimentez la bibliothèque de prix.</p>}
      </div>
    </Modal>
  );
}

function BpuApply({ projectId, onClose, onApply }: { projectId: string | null; onClose: () => void; onApply: (q: Quote) => void }) {
  const { org } = useOrg();
  const bpus = useRows<Quote>('quotes', org?.id, { filter: (q) => q.eq('kind', 'bpu'), order: ['updated_at', false], key: ['bpu'] });
  const list = (bpus.data ?? []).sort((a, b) => Number(b.project_id === projectId) - Number(a.project_id === projectId));
  return (
    <Modal title="Reprendre les prix d’un BPU" onClose={onClose}>
      <p className="mb-3 text-[13.5px] text-ink-2">Les prix unitaires du BPU sont repris pour les lignes de même <b>référence</b>. Les lignes sans correspondance gardent leur prix.</p>
      {bpus.isLoading ? <Spinner /> : list.length === 0 ? <p className="text-muted">Aucun BPU.</p> : (
        <div className="divide-y divide-line-2 rounded-lg border border-line">
          {list.map((b) => <button key={b.id} className="block w-full px-3 py-2 text-left text-[13.5px] hover:bg-navy-50" onClick={() => onApply(b)}><span className="text-muted">{b.reference} v{b.version}</span> · <b>{b.title}</b>{b.project_id === projectId && <Badge tone="ok" className="ml-2">même projet</Badge>}</button>)}
        </div>
      )}
    </Modal>
  );
}

function VersionsModal({ quote, onClose, client, project }: { quote: Quote; onClose: () => void; client?: Contact; project?: Project }) {
  const { org } = useOrg();
  const toast = useToast();
  const versions = useRows<QuoteVersion>('quote_versions', org?.id, { filter: (q) => q.eq('quote_id', quote.id), order: ['version', false], key: [quote.id] });
  const pdf = async (v: QuoteVersion) => {
    const { quotePdf } = await import('../../docs/pdf');
    await quotePdf(org!, { ...quote, version: v.version, title: v.title, status: v.status, body: v.body, settings: v.settings, locked: true }, client, project);
  };
  return (
    <Modal title={`Historique des versions — ${quote.reference}`} onClose={onClose} wide>
      <ul className="divide-y divide-line-2">
        <li className="flex items-center justify-between py-2.5 text-[13.5px]"><span><b>v{quote.version}</b> · version {quote.locked ? 'validée' : 'en cours'}</span><Badge tone={quote.locked ? 'navy' : 'grey'}>{quote.locked ? 'verrouillée' : 'modifiable'}</Badge></li>
        {(versions.data ?? []).filter((v) => v.version !== quote.version || !quote.locked).map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
            <span><b>v{v.version}</b> · {fmtDateTime(v.created_at)} · {formatMoney(quote.kind === 'devis' ? v.total_ttc : v.total_ht, v.settings.currency)}{v.reason ? ` — ${v.reason}` : ''}</span>
            <Button size="sm" icon={<Download size={14} />} onClick={() => void pdf(v).catch((e) => toast('bad', errorMessage(e)))}>PDF</Button>
          </li>
        ))}
      </ul>
      {versions.isLoading && <Spinner />}
    </Modal>
  );
}

function NewVersionDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  return (
    <Confirm title="Créer une nouvelle version ?" confirmLabel="Créer la version" onClose={onClose} onConfirm={() => onConfirm(reason)}>
      La version actuelle reste figée dans l’historique. La nouvelle version repart en brouillon, modifiable.
      <Field label="Motif de la révision" className="mt-3"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Remise accordée, quantités révisées" /></Field>
    </Confirm>
  );
}

function DecisionDialog({ kind, onClose, onConfirm }: { kind: 'accepte' | 'refuse'; onClose: () => void; onConfirm: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  return (
    <Confirm title={kind === 'accepte' ? 'Enregistrer l’acceptation du client' : 'Enregistrer le refus du client'} confirmLabel="Enregistrer" onClose={onClose} onConfirm={() => onConfirm(note)}>
      <Field label="Commentaire (facultatif)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'accepte' ? 'Ex. Bon pour accord signé le…' : 'Ex. Budget dépassé'} /></Field>
    </Confirm>
  );
}

export type { QuoteSettings };
