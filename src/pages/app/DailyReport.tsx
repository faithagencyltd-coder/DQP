// Rapport journalier de chantier (§19.3) : conditions, travaux exécutés, effectifs, matériaux,
// matériels, incidents, retards, observations et photos ; soumission puis validation ; PDF.

import { CheckCircle2, FileText, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatNumber } from '../../engine/money';
import { workforceTotal } from '../../engine/planning';
import { deleteRow, rpc, updateRow, useAction, useRow, useRows } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { REPORT_STATUS, fmtDate, fmtDateTime } from '../../lib/labels';
import { blobToDataUrl, photoBlob, removePhotos } from '../../lib/photos';
import { useAuth, useOrg } from '../../lib/session';
import { personName, useTeam } from '../../lib/team';
import type { DailyReport, Photo, PriceItem, Project, StockMovement } from '../../lib/types';
import { Badge, Button, Card, Confirm, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Textarea, useToast } from '../../ui';
import { PhotoGrid } from './PhotoGrid';

const WEATHER = ['Ensoleillé', 'Nuageux', 'Pluie', 'Orage', 'Vent fort', 'Harmattan', 'Chaleur forte'];
type Form = Pick<DailyReport, 'weather' | 'conditions' | 'work_done' | 'workforce' | 'materials' | 'equipment' | 'incidents' | 'delays' | 'observations'>;
const pick = (r: DailyReport): Form => ({ weather: r.weather, conditions: r.conditions, work_done: r.work_done, workforce: r.workforce, materials: r.materials, equipment: r.equipment, incidents: r.incidents, delays: r.delays, observations: r.observations });

export function DailyReportEditor() {
  const { id } = useParams();
  const { org, can } = useOrg();
  const { session } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const row = useRow<DailyReport>('daily_reports', id);
  const r = row.data;
  const project = useRow<Project>('projects', r?.project_id);
  const team = useTeam(org?.id);
  const [f, setF] = useState<Form | null>(null);
  const [dialog, setDialog] = useState<'valider' | 'renvoyer' | 'supprimer' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (r) setF(pick(r)); }, [r]);
  const dirty = !!r && !!f && JSON.stringify(pick(r)) !== JSON.stringify(f);
  const editable = !!r && r.status !== 'valide' && can('planning', 'modifier');
  const refresh = () => row.refetch();
  const clean = (x: Form) => ({ ...x, workforce: x.workforce.filter((w) => w.role.trim()).map((w) => ({ role: w.role.trim(), count: Math.max(0, Math.round(Number(w.count) || 0)) })) });
  const save = useAction(() => updateRow('daily_reports', id!, clean(f!)), { success: 'Rapport enregistré.', invalidate: [['daily_reports']] });
  const status = useAction((a: { s: string; note?: string }) => rpc('set_report_status', { p_report: id, p_status: a.s, p_note: a.note ?? null }), { success: 'Statut mis à jour.', invalidate: [['daily_reports']] });
  const savePhotos = (photos: Photo[]) => updateRow('daily_reports', id!, { photos }).then(refresh);
  const people = useMemo(() => new Map((team.data ?? []).map((m) => [m.user_id, personName(m.profile)])), [team.data]);
  if (row.isLoading || (r && !f)) return <Spinner />;
  if (!r || !f) return <Notice tone="bad">Rapport introuvable ou accès non autorisé.</Notice>;
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null });
  const submit = async () => {
    try {
      if (dirty) await save.mutateAsync(undefined);
      await status.mutateAsync({ s: 'soumis' });
      refresh();
    } catch (e) { toast('bad', errorMessage(e)); }
  };
  const pdf = async () => {
    setBusy(true);
    try {
      const photos = new Map<string, string>();
      for (const p of r.photos) { try { photos.set(p.path, await blobToDataUrl(await photoBlob(p.path))); } catch { /* photo absente : signalée dans le PDF */ } }
      const { dailyReportPdf } = await import('../../docs/suivi-pdf');
      await dailyReportPdf(org!, r, { project: project.data!, photos, people });
    } catch (e) { toast('bad', errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader
        back={<Link className="link" to={`/app/planning?projet=${r.project_id}&onglet=rapports`}>← Rapports journaliers</Link>}
        title={<span className="flex flex-wrap items-center gap-2">Rapport du {fmtDate(r.report_date)} <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge></span>}
        subtitle={`${r.reference}${project.data ? ` · ${project.data.reference} · ${project.data.name}` : ''}`}
        actions={<>
          {can('planning', 'exporter') && <Button icon={<FileText size={16} />} loading={busy} disabled={!project.data} onClick={pdf}>PDF</Button>}
          {editable && <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: refresh })}>Enregistrer</Button>}
          {r.status === 'brouillon' && can('planning', 'creer') && <Button variant="primary" icon={<Send size={16} />} loading={status.isPending} onClick={submit}>Soumettre</Button>}
          {r.status === 'soumis' && can('planning', 'valider') && <>
            <Button variant="primary" icon={<CheckCircle2 size={16} />} onClick={() => setDialog('valider')}>Valider</Button>
            <Button icon={<Undo2 size={16} />} onClick={() => setDialog('renvoyer')}>Renvoyer</Button>
          </>}
          {r.status === 'brouillon' && (can('planning', 'supprimer') || (r.created_by === session?.user.id && can('planning', 'creer'))) && <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDialog('supprimer')}>Supprimer</Button>}
        </>}
      />
      {r.status === 'valide' && <Notice tone="ok" className="mb-3">Validé le {fmtDateTime(r.validated_at)} par {people.get(r.validated_by ?? '') ?? '—'}{r.validation_note ? ` : « ${r.validation_note} »` : ''}. Le rapport est figé.</Notice>}
      {r.status === 'soumis' && <Notice tone="warn" className="mb-3">Soumis le {fmtDateTime(r.submitted_at)} par {people.get(r.submitted_by ?? '') ?? '—'} : en attente de validation.</Notice>}
      {r.status === 'brouillon' && r.validation_note && <Notice tone="warn" className="mb-3">Renvoyé pour correction : « {r.validation_note} »</Notice>}
      <fieldset disabled={!editable} className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-4">
          <Card title="Conditions et travaux">
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <Field label="Météo"><Select value={f.weather ?? ''} onChange={set('weather')}><option value="">—</option>{WEATHER.map((w) => <option key={w}>{w}</option>)}</Select></Field>
              <Field label="Conditions observées"><Input value={f.conditions ?? ''} onChange={set('conditions')} placeholder="Accès, état du terrain, livraisons…" /></Field>
              <Field label="Travaux exécutés" className="sm:col-span-2"><Textarea rows={4} value={f.work_done ?? ''} onChange={set('work_done')} /></Field>
              <Field label="Incidents" className="sm:col-span-2"><Textarea rows={2} value={f.incidents ?? ''} onChange={set('incidents')} /></Field>
              <Field label="Retards" className="sm:col-span-2"><Textarea rows={2} value={f.delays ?? ''} onChange={set('delays')} /></Field>
              <Field label="Observations" className="sm:col-span-2"><Textarea rows={2} value={f.observations ?? ''} onChange={set('observations')} /></Field>
            </div>
          </Card>
          <Card title={`Photos (${r.photos.length})`}>
            <PhotoGrid projectId={r.project_id} photos={r.photos} editable={editable} onChange={savePhotos} />
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card title={`Effectifs présents : ${workforceTotal(f.workforce)}`}>
            <div className="grid gap-2">
              {f.workforce.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label="Fonction" value={w.role} placeholder="Maçons" onChange={(e) => setF({ ...f, workforce: f.workforce.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} />
                  <Input aria-label="Nombre" inputMode="numeric" className="!w-20 text-right" value={String(w.count)} onChange={(e) => setF({ ...f, workforce: f.workforce.map((x, j) => (j === i ? { ...x, count: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)) })} />
                  {editable && <button type="button" aria-label="Retirer cette ligne d’effectif" className="p-1 text-faint hover:text-bad-600" onClick={() => setF({ ...f, workforce: f.workforce.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                </div>
              ))}
              {editable && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setF({ ...f, workforce: [...f.workforce, { role: '', count: 0 }] })}>Ajouter une fonction</Button>}
            </div>
          </Card>
          <Card title="Matériaux et matériels">
            <div className="grid gap-3">
              <Field label="Matériaux utilisés"><Textarea rows={3} value={f.materials ?? ''} onChange={set('materials')} /></Field>
              <StockOutputs report={r} onUse={(txt) => setF({ ...f, materials: [f.materials, txt].filter(Boolean).join('\n') })} editable={editable} />
              <Field label="Matériels mobilisés"><Textarea rows={2} value={f.equipment ?? ''} onChange={set('equipment')} placeholder="Bétonnière, vibreur, échafaudage…" /></Field>
            </div>
          </Card>
        </div>
      </fieldset>
      {(dialog === 'valider' || dialog === 'renvoyer') && <DecisionDialog validate={dialog === 'valider'} onClose={() => setDialog(null)} onConfirm={(note) => status.mutateAsync({ s: dialog === 'valider' ? 'valide' : 'brouillon', note }).then(() => { refresh(); setDialog(null); })} />}
      {dialog === 'supprimer' && <Confirm danger title="Supprimer ce brouillon ?" confirmLabel="Supprimer" onClose={() => setDialog(null)} onConfirm={async () => {
        await deleteRow('daily_reports', r.id);
        await removePhotos(r.photos.map((p) => p.path)).catch(() => {});
        nav(`/app/planning?projet=${r.project_id}&onglet=rapports`);
      }}>Le rapport et ses photos seront supprimés.</Confirm>}
    </>
  );
}

function DecisionDialog({ validate, onClose, onConfirm }: { validate: boolean; onClose: () => void; onConfirm: (note: string) => Promise<unknown> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal title={validate ? 'Valider le rapport' : 'Renvoyer pour correction'} onClose={onClose} footer={<>
      <Button onClick={onClose}>Annuler</Button>
      <Button variant="primary" disabled={!validate && !note.trim()} loading={busy} onClick={() => { setBusy(true); onConfirm(note).catch((e) => toast('bad', errorMessage(e))).finally(() => setBusy(false)); }}>{validate ? 'Valider' : 'Renvoyer'}</Button>
    </>}>
      {validate && <p className="mb-3 text-[14px]">Une fois validé, le rapport ne pourra plus être modifié.</p>}
      <Field label={validate ? 'Commentaire (facultatif)' : 'Motif du renvoi'} required={!validate}><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

/** Sorties de stock réellement enregistrées ce jour pour ce chantier (aucune quantité devinée). */
function StockOutputs({ report, onUse, editable }: { report: DailyReport; onUse: (txt: string) => void; editable: boolean }) {
  const { org, can } = useOrg();
  const allowed = can('stocks', 'consulter');
  const moves = useRows<StockMovement>('stock_movements', org?.id, { filter: (q) => q.eq('project_id', report.project_id).eq('moved_on', report.report_date).eq('kind', 'sortie'), key: ['rapport', report.id], enabled: allowed });
  const items = useRows<PriceItem>('price_items', org?.id, { select: 'id, designation, unit', filter: (q) => q.eq('kind', 'article'), key: ['articles-min'], enabled: allowed && !!moves.data?.length });
  if (!allowed || !moves.data?.length) return null;
  const name = new Map((items.data ?? []).map((i) => [i.id, i]));
  const lines = moves.data.map((m) => `${name.get(m.item_id)?.designation ?? 'Article'} : ${formatNumber(-m.qty, 3)} ${name.get(m.item_id)?.unit ?? ''}`.trim());
  return (
    <div className="rounded-lg bg-navy-50/60 p-2.5 text-[12.5px]">
      <b className="text-navy-900">Sorties de stock de ce jour pour ce chantier</b>
      <ul className="mt-1">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {editable && <Button size="sm" variant="ghost" className="mt-1" onClick={() => onUse(lines.join('\n'))}>Reprendre dans « Matériaux utilisés »</Button>}
    </div>
  );
}
