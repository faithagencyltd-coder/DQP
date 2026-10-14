import { Map as MapIcon, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteRow, insertRow, updateRow, useAction, useRows } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { WORK_STATUS, fmtDateTime } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { safeFileName } from '../../lib/download';
import type { PlanDoc, Project } from '../../lib/types';
import { emptyPlan } from '../../engine/plan/model';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Spinner } from '../../ui';
import { Allowed } from '../../ui/guard';

export const PLAN_TYPES: Record<PlanDoc['plan_type'], string> = {
  architecture: 'Architecture', structure: 'Structure', electricite: 'Électricité', plomberie: 'Plomberie', vrd: 'VRD', amenagement: 'Aménagement', autre: 'Autre',
};

const ACCEPT: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const MAX_MB = 25;

export function PlansPage() {
  const { org } = useOrg();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [projectFilter, setProjectFilter] = useState(params.get('projet') ?? '');
  const [creating, setCreating] = useState(false);
  const rows = useRows<PlanDoc>('plans', org?.id, { select: 'id, reference, name, level, plan_type, project_id, status, scale_verified, source_name, updated_at, archived_at', order: ['updated_at', false] });
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const pname = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, `${p.reference} · ${p.name}`])), [projects.data]);
  const list = (rows.data ?? []).filter((p) => !p.archived_at && (!projectFilter || p.project_id === projectFilter));
  return (
    <>
      <PageHeader title="Plans techniques" subtitle="Importez un plan (PDF, image) ou dessinez-le, vérifiez l’échelle, puis produisez un rendu de présentation et vos quantités."
        actions={<Allowed module="plans" action="creer"><Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouveau plan</Button></Allowed>} />
      <Card bodyClass="p-0">
        <div className="border-b border-line-2 p-3">
          <Select aria-label="Projet" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="sm:w-80"><option value="">Tous les projets</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select>
        </div>
        {rows.isLoading ? <Spinner /> : (
          <DataTable rows={list} onRowClick={(p) => nav(`/app/plans/${p.id}`)}
            empty={<EmptyState icon={<MapIcon size={22} />} title="Aucun plan">Importez le plan d’un client (PDF, photo, scan) ou dessinez-le directement : murs, portes, pièces, mobilier.</EmptyState>}
            columns={[
              { key: 'ref', label: 'Référence', sort: (p) => p.reference, render: (p) => <span className="tabular text-muted">{p.reference}</span> },
              { key: 'name', label: 'Plan', sort: (p) => p.name, render: (p) => <span><b className="text-navy-900">{p.name}</b>{p.level ? <span className="text-muted"> · {p.level}</span> : null}</span> },
              { key: 'project', label: 'Projet', render: (p) => pname.get(p.project_id ?? '') ?? '—', hideOnMobile: true },
              { key: 'type', label: 'Type', render: (p) => PLAN_TYPES[p.plan_type], hideOnMobile: true },
              { key: 'scale', label: 'Échelle', render: (p) => p.scale_verified ? <Badge tone="ok">Vérifiée</Badge> : <Badge tone="warn">À vérifier</Badge> },
              { key: 'status', label: 'Statut', render: (p) => <Badge tone={WORK_STATUS[p.status]?.tone}>{WORK_STATUS[p.status]?.label}</Badge>, hideOnMobile: true },
              { key: 'upd', label: 'Modifié', sort: (p) => p.updated_at, render: (p) => fmtDateTime(p.updated_at), hideOnMobile: true },
            ]} />
        )}
      </Card>
      {creating && <NewPlan projectId={projectFilter} onClose={() => setCreating(false)} />}
    </>
  );
}

async function fileProblem(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ACCEPT[ext]) return `Format « .${ext} » non pris en charge. Formats acceptés : PDF, PNG, JPG, WEBP. (DWG et DXF : exportez d’abord le plan en PDF.)`;
  if (file.size > MAX_MB * 1048576) return `Fichier trop volumineux : maximum ${MAX_MB} Mo.`;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const ok = ext === 'pdf' ? head[0] === 0x25 && head[1] === 0x50 : ext === 'png' ? head[0] === 0x89 : ext === 'webp' ? head[0] === 0x52 : head[0] === 0xff;
  return ok ? null : 'Le contenu du fichier ne correspond pas à son extension.';
}

function NewPlan({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { org } = useOrg();
  const nav = useNavigate();
  const projects = useRows<Project>('projects', org?.id, { select: 'id, reference, name, archived_at' });
  const [name, setName] = useState('');
  const [level, setLevel] = useState('RDC');
  const [type, setType] = useState<PlanDoc['plan_type']>('architecture');
  const [pid, setPid] = useState(projectId);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const create = useAction(async () => {
    if (file) {
      const p = await fileProblem(file);
      if (p) throw new Error(p);
    }
    const plan = await insertRow<PlanDoc>('plans', { org_id: org!.id, name: name.trim(), level: level.trim(), plan_type: type, project_id: pid || null, data: emptyPlan() });
    if (!file) return plan;
    const ext = file.name.split('.').pop()!.toLowerCase();
    const path = `${org!.id}/plans-techniques/${plan.id}/source-${safeFileName(file.name)}`;
    const up = await supabase.storage.from('documents').upload(path, file, { contentType: ACCEPT[ext], upsert: false });
    if (up.error) {
      await deleteRow('plans', plan.id).catch(() => undefined);
      throw new Error(`Envoi du fichier impossible : ${errorMessage(up.error)}`);
    }
    return updateRow<PlanDoc>('plans', plan.id, { source_path: path, source_name: file.name, source_mime: ACCEPT[ext], scale_verified: false });
  }, { success: (p) => `Plan ${p.reference} créé.`, invalidate: [['plans']] });
  return (
    <Modal title="Nouveau plan" onClose={onClose} footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (p) => nav(`/app/plans/${p.id}`) })}>Créer</Button></>}>
      <div className="grid gap-4">
        <Field label="Nom du plan" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Villa R+1 — vue en plan" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Niveau"><Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="RDC, R+1, sous-sol…" /></Field>
          <Field label="Type de plan"><Select value={type} onChange={(e) => setType(e.target.value as PlanDoc['plan_type'])}>{Object.entries(PLAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="Projet"><Select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">— Aucun —</option>{(projects.data ?? []).filter((p) => !p.archived_at).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}</Select></Field>
        <Field label="Plan existant à importer (facultatif)" hint="PDF, PNG, JPG ou WEBP, 25 Mo maximum. Sans fichier, vous dessinez le plan de zéro.">
          <input aria-label="Fichier du plan" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="input py-2" onChange={async (e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setErr(f ? await fileProblem(f) : null);
          }} />
        </Field>
        {err && <Notice tone="bad">{err}</Notice>}
        {file && !err && <Notice tone="warn">Après l’import, vérifiez l’échelle (outil « Échelle ») : tant qu’elle n’est pas vérifiée, les mesures restent indicatives.</Notice>}
      </div>
    </Modal>
  );
}
