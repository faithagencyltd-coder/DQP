import { useMemo, useState } from 'react';
import { useRows } from '../../lib/api';
import { fmtDateTime } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import { personName, useTeam } from '../../lib/team';
import type { ActivityRow } from '../../lib/types';
import { Card, EmptyState, PageHeader, SearchInput, Select, Spinner } from '../../ui';

const ENTITY: Record<string, string> = {
  contacts: 'Contact', projects: 'Projet', documents: 'Document', price_items: 'Prix', metres: 'Métré', quotes: 'Document chiffré',
  entreprise: 'Entreprise', membre: 'Membre', 'rôle': 'Rôle', abonnement: 'Abonnement',
};

const isoDate = /^\d{4}-\d{2}-\d{2}T/;
function detailText(d: Record<string, unknown> | null): string {
  if (!d) return '';
  const fmt = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'string' && isoDate.test(v) ? new Date(v).toLocaleDateString('fr-FR') : typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v));
  return Object.entries(d).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k} : ${Array.isArray(v) ? v.map(fmt).join(' → ') : fmt(v)}`).join(' ; ');
}

export function ActivityList({ projectId, entityId, limit = 300, compact }: { projectId?: string; entityId?: string; limit?: number; compact?: boolean }) {
  const { org } = useOrg();
  const team = useTeam(org?.id);
  const rows = useRows<ActivityRow>('activity_log', org?.id, { order: ['at', false], filter: entityId ? (q) => q.eq('entity_id', entityId) : projectId ? (q) => q.eq('project_id', projectId) : undefined, limit, key: [entityId ?? projectId ?? 'all', limit] });
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const who = useMemo(() => new Map((team.data ?? []).map((m) => [m.user_id, personName(m.profile)])), [team.data]);
  const list = (rows.data ?? []).filter((r) => (!entity || r.entity === entity) && (!q || [r.action, r.label, who.get(r.user_id ?? '')].join(' ').toLowerCase().includes(q.toLowerCase())));
  if (rows.isLoading) return <Spinner />;
  return (
    <div>
      {!projectId && !entityId && !compact && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Action, élément, utilisateur…" className="sm:max-w-sm sm:flex-1" />
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="sm:w-56"><option value="">Tous les éléments</option>{Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </div>
      )}
      {list.length === 0 ? <EmptyState title="Aucune opération enregistrée" /> : (
        <ol className="relative space-y-3 border-l border-line pl-5">
          {list.map((r) => (
            <li key={r.id} className="relative text-[13.5px]">
              <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-signal-500 ring-1 ring-line" />
              <div><b className="text-navy-900">{r.action.charAt(0).toUpperCase() + r.action.slice(1)}</b> · {ENTITY[r.entity] ?? r.entity}{r.label ? <> « {r.label} »</> : null}</div>
              <div className="text-[12px] text-muted">{fmtDateTime(r.at)} · {who.get(r.user_id ?? '') ?? (r.entity === 'abonnement' && r.user_id ? 'Administration PLANORA' : r.user_id ? 'Ancien membre' : 'Système')}
                {!compact && detailText(r.detail) && <span> · {detailText(r.detail)}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function JournalPage() {
  return (
    <>
      <PageHeader title="Journal d’activité" subtitle="Opérations importantes : qui, quand, quoi (créations, modifications, validations, versions, permissions)." />
      <Card><ActivityList /></Card>
    </>
  );
}
