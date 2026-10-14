// Réserves et observations (§19, fiche chantier §8) : constat avec photos, intervenant, échéance,
// levée, puis validation de la levée par un responsable ; liste PDF pour la réception.

import { CheckCircle2, Download, FileText, Plus, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toCsv } from '../../engine/csv';
import { deleteRow, insertRow, updateRow, useAction, useRows } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { RESERVE_STATUS, fmtDate, today } from '../../lib/labels';
import { blobToDataUrl, photoBlob, removePhotos } from '../../lib/photos';
import { useOrg } from '../../lib/session';
import type { Photo, Project, ProjectLot, Reserve } from '../../lib/types';
import { Badge, Button, Card, Confirm, DataTable, EmptyState, Field, Input, Modal, Select, Spinner, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';
import { PhotoGrid } from './PhotoGrid';

export function ReservesView({ project }: { project: Project }) {
  const { org } = useOrg();
  const toast = useToast();
  const rows = useRows<Reserve>('reserves', org?.id, { filter: (q) => q.eq('project_id', project.id), order: ['created_at', false], key: [project.id] });
  const [filter, setFilter] = useState<'non_levees' | 'toutes'>('non_levees');
  const [open, setOpen] = useState<Partial<Reserve> | null>(null);
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => rows.data ?? [], [rows.data]);
  const list = filter === 'toutes' ? all : all.filter((r) => r.status === 'ouverte' || r.status === 'en_cours');
  const now = today();
  const exportCsv = () => {
    const csv = toCsv([['Référence', 'Réserve', 'Description', 'Localisation', 'Lot', 'Intervenant', 'Constatée le', 'Échéance', 'Statut', 'Levée le', 'Note de levée', 'Photos'],
      ...all.map((r) => [r.reference, r.title, r.description ?? '', r.location ?? '', r.lot ?? '', r.assignee_label ?? '', r.raised_on, r.due_date ?? '', RESERVE_STATUS[r.status].label, r.lifted_on ?? '', r.lift_note ?? '', r.photos.length])]);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `reserves_${project.reference}_${now}.csv`);
  };
  const pdf = async () => {
    setBusy(true);
    try {
      const photos = new Map<string, string>();
      for (const p of all.flatMap((r) => r.photos)) { try { photos.set(p.path, await blobToDataUrl(await photoBlob(p.path))); } catch { /* signalée dans le PDF */ } }
      const { reservesPdf } = await import('../../docs/suivi-pdf');
      await reservesPdf(org!, all, { project, photos });
    } catch (e) { toast('bad', errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Card bodyClass="p-0" title="Réserves et observations" actions={
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filtre des réserves" value={filter} onChange={(e) => setFilter(e.target.value as 'non_levees' | 'toutes')} className="!w-40 !py-1 text-[13px]"><option value="non_levees">Non levées</option><option value="toutes">Toutes</option></Select>
          <Allowed module="planning" action="exporter"><Button size="sm" icon={<Download size={15} />} onClick={exportCsv} disabled={!all.length}>CSV</Button></Allowed>
          <Allowed module="planning" action="exporter"><Button size="sm" icon={<FileText size={15} />} loading={busy} onClick={pdf} disabled={!all.length}>PDF</Button></Allowed>
          <Allowed module="planning" action="creer"><Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setOpen({})}>Nouvelle réserve</Button></Allowed>
        </div>}>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={list} onRowClick={setOpen}
            empty={<EmptyState icon={<ShieldAlert size={22} />} title={filter === 'toutes' ? 'Aucune réserve' : 'Aucune réserve non levée'}>Consignez les défauts constatés (photo, localisation, intervenant, échéance) puis suivez leur levée.</EmptyState>}
            columns={[
              { key: 'ref', label: 'Réf.', render: (r) => <span className="tabular text-muted">{r.reference}</span>, hideOnMobile: true },
              { key: 'title', label: 'Réserve', render: (r) => <span><b className="text-navy-900">{r.title}</b>{r.location && <span className="block text-[12px] text-muted">{r.location}</span>}</span> },
              { key: 'who', label: 'Intervenant', render: (r) => r.assignee_label ?? '—', hideOnMobile: true },
              { key: 'due', label: 'Échéance', sort: (r) => r.due_date ?? '', render: (r) => r.due_date ? <span className={r.due_date < now && (r.status === 'ouverte' || r.status === 'en_cours') ? 'font-semibold text-bad-600' : ''}>{fmtDate(r.due_date)}</span> : '—' },
              { key: 'photos', label: 'Photos', align: 'right', render: (r) => r.photos.length || '—', hideOnMobile: true },
              { key: 'status', label: 'Statut', render: (r) => <Badge tone={RESERVE_STATUS[r.status].tone}>{RESERVE_STATUS[r.status].label}</Badge> },
            ]} />
        )}
      </Card>
      {open && <ReserveForm project={project} reserve={open} onClose={() => setOpen(null)} onSaved={(r) => setOpen(r)} />}
    </>
  );
}

function ReserveForm({ project, reserve, onClose, onSaved }: { project: Project; reserve: Partial<Reserve>; onClose: () => void; onSaved: (r: Reserve) => void }) {
  const { org, can } = useOrg();
  const toast = useToast();
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', project.id), order: ['sort'], key: [project.id] });
  const [v, setV] = useState({ title: reserve.title ?? '', description: reserve.description ?? '', location: reserve.location ?? '', lot: reserve.lot ?? '', assignee_label: reserve.assignee_label ?? '', due_date: reserve.due_date ?? '', raised_on: reserve.raised_on ?? today() });
  const [photos, setPhotos] = useState<Photo[]>(reserve.photos ?? []);
  const [status, setStatus] = useState(reserve.status ?? 'ouverte');
  const [liftNote, setLiftNote] = useState(reserve.lift_note ?? '');
  const [del, setDel] = useState(false);
  const locked = status === 'validee';
  const editable = !locked && (reserve.id ? can('planning', 'modifier') : can('planning', 'creer'));
  const values = { title: v.title.trim(), description: v.description.trim() || null, location: v.location.trim() || null, lot: v.lot || null, assignee_label: v.assignee_label.trim() || null, due_date: v.due_date || null, raised_on: v.raised_on };
  const save = useAction(() => reserve.id ? updateRow<Reserve>('reserves', reserve.id, values) : insertRow<Reserve>('reserves', { org_id: org!.id, project_id: project.id, ...values, photos }), { success: 'Réserve enregistrée.', invalidate: [['reserves']] });
  const move = useAction((s: Reserve['status']) => updateRow<Reserve>('reserves', reserve.id!, { status: s, lift_note: s === 'levee' ? liftNote.trim() || null : reserve.lift_note ?? null }), { success: 'Statut mis à jour.', invalidate: [['reserves']] });
  const remove = useAction(async () => { await deleteRow('reserves', reserve.id!); await removePhotos(photos.map((p) => p.path)).catch(() => {}); }, { success: 'Réserve supprimée.', invalidate: [['reserves']] });
  const savePhotos = async (p: Photo[]) => {
    if (reserve.id) await updateRow('reserves', reserve.id, { photos: p });
    setPhotos(p);
  };
  const doMove = (s: Reserve['status']) => move.mutate(s, { onSuccess: (r) => { setStatus(r.status); onSaved(r); }, onError: (e) => toast('bad', errorMessage(e)) });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  // Photos ajoutées à une réserve jamais enregistrée : retirées du stockage.
  const close = () => { if (!reserve.id && photos.length) removePhotos(photos.map((p) => p.path)).catch(() => {}); onClose(); };
  return (
    <Modal size="lg" title={reserve.id ? `Réserve ${reserve.reference}` : 'Nouvelle réserve'} onClose={close} footer={<>
      {reserve.id && status === 'ouverte' && can('planning', 'supprimer') && <Button variant="ghost" className="mr-auto" onClick={() => setDel(true)}>Supprimer</Button>}
      <Button onClick={close}>Fermer</Button>
      {editable && <Button variant="primary" disabled={!values.title} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: (r) => (reserve.id ? onClose() : onSaved(r)), onError: (e) => toast('bad', errorMessage(e)) })}>Enregistrer</Button>}
    </>}>
      {reserve.id && <div className="mb-3 flex items-center gap-2"><Badge tone={RESERVE_STATUS[status].tone}>{RESERVE_STATUS[status].label}</Badge>{reserve.lifted_on && status !== 'ouverte' && <span className="text-[12.5px] text-muted">Levée le {fmtDate(reserve.lifted_on)}</span>}</div>}
      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
        <Field label="Réserve" required className="sm:col-span-2"><Input value={v.title} onChange={set('title')} placeholder="Fissure sur l’enduit de la façade nord" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={v.description} onChange={set('description')} /></Field>
        <Field label="Localisation"><Input value={v.location} onChange={set('location')} placeholder="Chambre 2, mur est" /></Field>
        <Field label="Lot"><Select value={v.lot} onChange={set('lot')}><option value="">—</option>{(lots.data ?? []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</Select></Field>
        <Field label="Intervenant chargé de la levée"><Input value={v.assignee_label} onChange={set('assignee_label')} /></Field>
        <Field label="Échéance"><Input type="date" value={v.due_date} onChange={set('due_date')} /></Field>
        <Field label="Constatée le"><Input type="date" value={v.raised_on} onChange={set('raised_on')} /></Field>
      </fieldset>
      <div className="mt-4">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Photos</span>
        <PhotoGrid projectId={project.id} photos={photos} editable={editable} onChange={savePhotos} />
      </div>
      {reserve.id && !locked && can('planning', 'modifier') && (
        <div className="mt-4 grid gap-2 rounded-lg bg-navy-50/60 p-3">
          {(status === 'ouverte' || status === 'en_cours') && <>
            <Field label="Note de levée (travaux réalisés)"><Input value={liftNote} onChange={(e) => setLiftNote(e.target.value)} /></Field>
            <div className="flex flex-wrap gap-2">
              {status === 'ouverte' && <Button size="sm" onClick={() => doMove('en_cours')}>Levée en cours</Button>}
              <Button size="sm" variant="primary" icon={<CheckCircle2 size={15} />} onClick={() => doMove('levee')}>Marquer levée</Button>
            </div>
          </>}
          {status === 'levee' && (
            <div className="flex flex-wrap items-center gap-2">
              {can('planning', 'valider') ? <Button size="sm" variant="primary" icon={<CheckCircle2 size={15} />} onClick={() => doMove('validee')}>Valider la levée</Button> : <span className="text-[12.5px] text-muted">La validation de la levée demande le droit « valider ».</span>}
              <Button size="sm" variant="ghost" onClick={() => doMove('ouverte')}>Rouvrir</Button>
            </div>
          )}
        </div>
      )}
      {locked && reserve.validated_at && <p className="mt-3 text-[12.5px] text-muted">Levée validée le {fmtDate(reserve.validated_at)} : la réserve est close.</p>}
      {del && <Confirm danger title="Supprimer cette réserve ?" confirmLabel="Supprimer" onClose={() => setDel(false)} onConfirm={() => remove.mutateAsync(undefined).then(onClose)}>Ses photos seront aussi supprimées.</Confirm>}
    </Modal>
  );
}
