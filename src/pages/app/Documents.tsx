import { Download, Eye, FilePlus2, FolderOpen, History, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { deleteRow, insertRow, updateRow, useAction, useRows } from '../../lib/api';
import { fileUrl, supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { DOC_TYPES, WORK_STATUS, fmtDateTime, fmtSize } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { personName, useTeam } from '../../lib/team';
import type { DocumentRow, Project, ProjectLot } from '../../lib/types';
import { safeFileName } from '../../lib/download';
import { Badge, Button, Card, Confirm, DataTable, EmptyState, Field, Modal, Notice, PageHeader, SearchInput, Select, Spinner, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';

const MAX_MB = 50;
const ACCEPT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', dxf: 'image/vnd.dxf', txt: 'text/plain',
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Vérifie le type réel (signature) et la taille d'un fichier avant dépôt (§27.3). */
export async function checkFile(file: File): Promise<{ mime: string } | { error: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = ACCEPT[ext];
  if (!mime) return { error: `Format « .${ext} » non accepté. Formats acceptés : ${Object.keys(ACCEPT).join(', ')}.` };
  if (file.size > MAX_MB * 1048576) return { error: `Fichier trop volumineux (${fmtSize(file.size)}). Maximum ${MAX_MB} Mo.` };
  if (file.size === 0) return { error: 'Fichier vide.' };
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const sig = (bytes: number[]) => bytes.every((b, i) => head[i] === b);
  const real =
    ext === 'pdf' ? sig([0x25, 0x50, 0x44, 0x46]) :
    ext === 'png' ? sig([0x89, 0x50, 0x4e, 0x47]) :
    ext === 'jpg' || ext === 'jpeg' ? sig([0xff, 0xd8, 0xff]) :
    ext === 'webp' ? sig([0x52, 0x49, 0x46, 0x46]) :
    ['xlsx', 'docx'].includes(ext) ? sig([0x50, 0x4b, 0x03, 0x04]) :
    ['xls', 'doc'].includes(ext) ? sig([0xd0, 0xcf, 0x11, 0xe0]) : true;
  if (!real) return { error: `Le contenu ne correspond pas à un fichier .${ext} (fichier renommé ou endommagé).` };
  return { mime };
}

export async function openSigned(path: string, download?: string) {
  let url: string;
  try { url = await fileUrl(path, 120, download); } catch (e) { throw new Error(errorMessage(e)); }
  if (download && url.startsWith('blob:')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = download;
    a.click();
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function UploadForm({ projectId, previous, onClose }: { projectId?: string; previous?: DocumentRow; onClose: () => void }) {
  const { org } = useOrg();
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at', order: ['created_at', false] });
  const [pid, setPid] = useState(previous?.project_id ?? projectId ?? '');
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', pid), order: ['sort'], key: [pid], enabled: !!pid });
  const [type, setType] = useState(previous?.doc_type ?? 'autre');
  const [lot, setLot] = useState(previous?.lot ?? '');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const upload = useAction(async () => {
    const done: string[] = [];
    const errs: string[] = [];
    for (const file of files) {
      const chk = await checkFile(file);
      if ('error' in chk) { errs.push(`${file.name} : ${chk.error}`); continue; }
      const path = `${org!.id}/${pid || 'general'}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from('documents').upload(path, file, { contentType: chk.mime, upsert: false });
      if (up.error) { errs.push(`${file.name} : ${errorMessage(up.error)}`); continue; }
      try {
        await insertRow('documents', {
          org_id: org!.id, project_id: pid || null, lot: lot || null, doc_type: type, name: previous?.name ?? file.name, storage_path: path,
          size_bytes: file.size, mime: chk.mime, version: previous ? previous.version + 1 : 1, previous_id: previous?.id ?? null, comment: comment || null,
        });
        done.push(file.name);
      } catch (e) {
        await supabase.storage.from('documents').remove([path]);
        errs.push(`${file.name} : ${errorMessage(e)}`);
      }
    }
    setErrors(errs);
    if (errs.length) throw new Error(`${errs.length} fichier(s) non déposé(s).`);
    return done.length;
  }, { success: (n) => `${n} fichier(s) déposé(s).`, invalidate: [['documents']] });
  return (
    <Modal title={previous ? `Nouvelle version de « ${previous.name} »` : 'Déposer des documents'} onClose={onClose} wide
      footer={<><Button onClick={onClose}>Fermer</Button><Button variant="primary" icon={<Upload size={16} />} loading={upload.isPending} disabled={!files.length} onClick={() => upload.mutate(undefined, { onSuccess: onClose })}>Déposer {files.length ? `(${files.length})` : ''}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <input ref={input} type="file" multiple={!previous} className="hidden" accept={Object.keys(ACCEPT).map((e) => '.' + e).join(',')} onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-line px-4 py-8 text-center hover:border-signal-400 hover:bg-signal-50/40">
            <Upload size={26} className="text-signal-500" />
            <span className="mt-2 text-[14px] font-semibold text-navy-900">{files.length ? files.map((f) => f.name).join(', ') : 'Choisir des fichiers'}</span>
            <span className="mt-1 text-[12px] text-muted">PDF, images (PNG, JPG), Excel, Word, CSV, DXF · {MAX_MB} Mo maximum par fichier</span>
          </button>
        </div>
        {!previous && (
          <>
            <Field label="Projet"><Select value={pid} onChange={(e) => { setPid(e.target.value); setLot(''); }}><option value="">— Documents généraux —</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
            <Field label="Lot"><Select value={lot} onChange={(e) => setLot(e.target.value)} disabled={!pid}><option value="">—</option>{(lots.data ?? []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</Select></Field>
            <Field label="Type de document"><Select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </>
        )}
        <Field label="Commentaire" className="sm:col-span-2"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></Field>
        {errors.length > 0 && <Notice tone="bad" className="sm:col-span-2" title="Fichiers refusés">{errors.map((e) => <div key={e}>{e}</div>)}</Notice>}
      </div>
    </Modal>
  );
}

export function DocumentsPanel({ projectId }: { projectId?: string }) {
  const { org } = useOrg();
  const toast = useToast();
  const docs = useRows<DocumentRow>('documents', org?.id, { order: ['created_at', false], filter: projectId ? (q) => q.eq('project_id', projectId) : undefined, key: [projectId ?? 'all'] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name' });
  const team = useTeam(org?.id);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [upload, setUpload] = useState<{ previous?: DocumentRow } | null>(null);
  const [del, setDel] = useState<DocumentRow | null>(null);
  const [history, setHistory] = useState<DocumentRow | null>(null);
  const projectName = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const who = useMemo(() => new Map((team.data ?? []).map((m) => [m.user_id, personName(m.profile)])), [team.data]);
  // Une seule ligne par document : sa dernière version.
  const latest = useMemo(() => {
    const all = docs.data ?? [];
    const replaced = new Set(all.map((d) => d.previous_id).filter(Boolean));
    return all.filter((d) => !replaced.has(d.id));
  }, [docs.data]);
  const list = latest.filter((d) => (!type || d.doc_type === type) && (!status || d.status === status) && (!q || norm([d.name, d.lot, d.comment, projectName.get(d.project_id ?? '')].join(' ')).includes(norm(q))));
  const setSt = useAction((a: { id: string; status: string }) => updateRow('documents', a.id, { status: a.status }), { success: 'Statut mis à jour.', invalidate: [['documents']] });
  const remove = useAction(async (d: DocumentRow) => {
    const chain = (docs.data ?? []).filter((x) => x.id === d.id || versionsOf(docs.data ?? [], d).some((v) => v.id === x.id));
    for (const x of chain) {
      await deleteRow('documents', x.id);
      await supabase.storage.from('documents').remove([x.storage_path]);
    }
  }, { success: 'Document supprimé.', invalidate: [['documents']] });
  const open = (d: DocumentRow, dl?: boolean) => openSigned(d.storage_path, dl ? d.name : undefined).catch((e) => toast('bad', errorMessage(e)));

  return (
    <Card bodyClass="p-0" title={projectId ? 'Documents du projet' : undefined}
      actions={projectId ? <Allowed module="documents" action="creer"><Button size="sm" variant="primary" icon={<Upload size={15} />} onClick={() => setUpload({})}>Déposer</Button></Allowed> : undefined}>
      <div className="flex flex-col gap-2 border-b border-line-2 p-3 sm:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Nom, lot, projet, commentaire…" className="sm:max-w-sm sm:flex-1" />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-56"><option value="">Tous les types</option>{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-52"><option value="">Tous les statuts</option>{Object.entries(WORK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      </div>
      {docs.isLoading ? <Spinner /> : (
        <DataTable rows={list}
          empty={<EmptyState icon={<FolderOpen size={22} />} title="Aucun document">Déposez vos plans, photos, contrats et procès-verbaux. Les fichiers sont privés.</EmptyState>}
          columns={[
            { key: 'name', label: 'Document', sort: (d) => norm(d.name), render: (d) => <div><button className="text-left font-semibold text-navy-900 hover:underline" onClick={() => void open(d)}>{d.name}</button><div className="text-[12px] text-muted">{DOC_TYPES[d.doc_type]}{d.lot ? ` · ${d.lot}` : ''} · v{d.version} · {fmtSize(d.size_bytes)}</div></div> },
            ...(projectId ? [] : [{ key: 'project', label: 'Projet', render: (d: DocumentRow) => projectName.get(d.project_id ?? '') ?? 'Général', hideOnMobile: true }]),
            { key: 'status', label: 'Statut', render: (d) => (
              <Allowed module="documents" action="valider">
                <select className="cell-input w-auto" value={d.status} onChange={(e) => setSt.mutate({ id: d.id, status: e.target.value })} aria-label="Statut">
                  {Object.entries(WORK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Allowed>
            ) },
            { key: 'date', label: 'Déposé', sort: (d) => d.created_at, render: (d) => <div className="text-[12.5px]"><div>{fmtDateTime(d.created_at)}</div><div className="text-muted">{who.get(d.uploaded_by ?? '') ?? ''}</div></div>, hideOnMobile: true },
            { key: 'act', label: '', align: 'right', render: (d) => (
              <div className="flex justify-end gap-0.5">
                <button className="rounded p-1.5 text-ink-2 hover:bg-navy-50" title="Prévisualiser" aria-label="Prévisualiser" onClick={() => void open(d)}><Eye size={16} /></button>
                <button className="rounded p-1.5 text-ink-2 hover:bg-navy-50" title="Télécharger" aria-label="Télécharger" onClick={() => void open(d, true)}><Download size={16} /></button>
                {d.version > 1 && <button className="rounded p-1.5 text-ink-2 hover:bg-navy-50" title="Versions" aria-label="Versions" onClick={() => setHistory(d)}><History size={16} /></button>}
                <Allowed module="documents" action="creer" hide><button className="rounded p-1.5 text-ink-2 hover:bg-navy-50" title="Nouvelle version" aria-label="Nouvelle version" onClick={() => setUpload({ previous: d })}><FilePlus2 size={16} /></button></Allowed>
                <Allowed module="documents" action="supprimer" hide><button className="rounded p-1.5 text-faint hover:bg-bad-50 hover:text-bad-600" title="Supprimer" aria-label="Supprimer" onClick={() => setDel(d)}><Trash2 size={16} /></button></Allowed>
              </div>
            ) },
          ]} />
      )}
      {upload && <UploadForm projectId={projectId} previous={upload.previous} onClose={() => setUpload(null)} />}
      {del && <Confirm title="Supprimer définitivement ce document ?" danger confirmLabel="Supprimer" onClose={() => setDel(null)} onConfirm={() => remove.mutateAsync(del)}>
        « {del.name} » et ses {del.version} version(s) seront supprimés définitivement. Pour simplement le retirer de la circulation, choisissez plutôt le statut « Archivé ».
      </Confirm>}
      {history && (
        <Modal title={`Versions de « ${history.name} »`} onClose={() => setHistory(null)}>
          <ul className="divide-y divide-line-2">
            {[history, ...versionsOf(docs.data ?? [], history)].map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2.5 text-[13.5px]">
                <span><b>v{v.version}</b> · {fmtDateTime(v.created_at)} · {who.get(v.uploaded_by ?? '') ?? ''}{v.comment ? ` — ${v.comment}` : ''}</span>
                <span className="flex items-center gap-2"><Badge tone={WORK_STATUS[v.status]?.tone}>{WORK_STATUS[v.status]?.label}</Badge><Button size="sm" onClick={() => void open(v, true)}>Télécharger</Button></span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </Card>
  );
}

function versionsOf(all: DocumentRow[], d: DocumentRow): DocumentRow[] {
  const out: DocumentRow[] = [];
  let cur = d.previous_id;
  while (cur) {
    const prev = all.find((x) => x.id === cur);
    if (!prev) break;
    out.push(prev);
    cur = prev.previous_id;
  }
  return out;
}

export function DocumentsPage() {
  const [upload, setUpload] = useState(false);
  return (
    <>
      <PageHeader title="Documents" subtitle="Fichiers privés, classés par projet, lot, type et statut, avec historique des versions."
        actions={<Allowed module="documents" action="creer"><Button variant="primary" icon={<Upload size={16} />} onClick={() => setUpload(true)}>Déposer des documents</Button></Allowed>} />
      <DocumentsPanel />
      {upload && <UploadForm onClose={() => setUpload(false)} />}
      <Notice tone="navy" className="mt-4" title="Rapports">Les rapports PDF/Excel (chantier, financier, dépenses, avancement…) arrivent avec les modules de gestion (phase 5). Les DQE, BPU et devis s’exportent déjà en PDF et Excel depuis leur page.</Notice>
    </>
  );
}

