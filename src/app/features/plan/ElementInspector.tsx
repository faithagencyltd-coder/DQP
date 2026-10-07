// Propriétés d'un élément sélectionné (§8) : type, dimensions, niveau, source, quantité,
// confiance, historique — avec validation, correction et rejet tracés.

import { Check, ExternalLink, RotateCcw, X } from 'lucide-react';
import { acceptElement, correctElement, effectiveStatus, rejectElement, restoreElement } from '../../../core/elements/ops';
import { formatNumber } from '../../../core/format';
import type { BuildingElement, Confidence } from '../../../core/types';
import { StatusBadge } from '../../ds/legacy';
import { Button, IconButton } from '../../ds/primitives';
import { useStore } from '../../stores/app-store';
import { STATUS_COLOR } from './PlanCanvas';

const KIND: Record<string, string> = { level: 'Niveau', room: 'Pièce', equipment: 'Équipement', opening: 'Menuiserie', surface_total: 'Surface totale' };
const PROP: Record<string, string> = { surface: 'Surface', largeur: 'Largeur', hauteur: 'Hauteur', code: 'Repère' };

export function ElementInspector({ e, onClose, onDetail }: { e: BuildingElement; onClose?: () => void; onDetail?: () => void }) {
  const s = useStore();
  const st = effectiveStatus(e);
  // Quantité : nombre d'éléments identiques (même catégorie et même repère) dans le projet.
  const same = s.project!.elements.filter((x) => x.validation?.state !== 'rejected' && x.kind === e.kind && x.category === e.category && (e.kind !== 'opening' || x.props.code?.value === e.props.code?.value));
  const dims = e.props.largeur && e.props.hauteur;
  return (
    <div className="anim-slide-left flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b border-line-2 px-4 py-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-[3px]" style={{ background: STATUS_COLOR[st] }} />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{KIND[e.kind]} · {e.category}</div>
          <div className="truncate text-[15px] font-bold text-fg">{e.name}</div>
        </div>
        {onClose && <IconButton label="Fermer" size="sm" onClick={onClose}><X size={15} /></IconButton>}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[12.5px]">
        <dl className="kv">
          <dt>Confiance</dt><dd>{st === 'rejected' ? <span className="badge grey">Rejeté</span> : <StatusBadge status={st as Confidence} />}</dd>
          <dt>Type</dt><dd><input className="in w-full" defaultValue={e.category} key={e.id + e.category} onBlur={(ev) => s.update((p) => correctElement(p, e.id, 'category', ev.target.value))} /></dd>
          <dt>Niveau</dt><dd><input className="in w-full" defaultValue={e.level ?? ''} placeholder="non déterminé" key={e.id + (e.level ?? '')} onBlur={(ev) => s.update((p) => correctElement(p, e.id, 'level', ev.target.value))} /></dd>
          {dims && (
            <>
              <dt>Dimensions</dt>
              <dd className="text-fg">{e.props.largeur.value !== null && e.props.hauteur.value !== null ? `${formatNumber((e.props.largeur.value as number) / 100)} × ${formatNumber((e.props.hauteur.value as number) / 100)} m` : <span className="text-[var(--bad)]">non déterminées</span>}</dd>
            </>
          )}
          {Object.entries(e.props).map(([k, v]) => {
            const shown = v.value === null ? '' : typeof v.value === 'number' ? String(v.value).replace('.', ',') : v.value;
            return (
              <div key={k} className="contents">
                <dt>{PROP[k] ?? k}</dt>
                <dd>
                  <div className="flex items-center gap-1.5">
                    <input className="in w-[100px]" defaultValue={shown} placeholder="—" key={e.id + k + shown} onBlur={(ev) => ev.target.value !== shown && s.update((p) => correctElement(p, e.id, k, ev.target.value))} />
                    <span className="text-muted">{v.unit}</span>
                    <StatusBadge status={v.status} short />
                  </div>
                  {v.note && <div className="mt-0.5 text-[11px] text-muted">{v.note}</div>}
                </dd>
              </div>
            );
          })}
          <dt>Quantité</dt>
          <dd className="text-fg"><b>{same.length}</b> {e.kind === 'opening' ? `repère(s) ${e.props.code?.value ?? ''}` : `${e.category.toLowerCase()}(s)`} dans le projet</dd>
          <dt>Source</dt>
          <dd>
            {e.source.fileName} · page {e.source.page}
            <div className="mt-0.5 rounded-[5px] bg-bg-2 px-2 py-1 font-mono text-[11px] text-fg-2">« {e.source.text} »</div>
          </dd>
          {e.note && <><dt>Remarque</dt><dd className="text-muted">{e.note}</dd></>}
        </dl>
        {e.edits.length > 0 && (
          <div>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Corrections</div>
            {e.edits.map((x, i) => <div key={i} className="text-[11.5px] text-muted">{new Date(x.at).toLocaleString('fr-FR')} — {PROP[x.prop] ?? x.prop} : <s>{String(x.before ?? '—')}</s> → <b className="text-fg">{String(x.after ?? '—')}</b></div>)}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line-2 px-4 py-3">
        {st !== 'rejected' ? (
          <>
            <Button size="sm" variant="primary" icon={<Check size={13} />} disabled={st === 'confirmed' && e.validation?.state === 'accepted'} onClick={() => { s.update((p) => acceptElement(p, e.id)); s.toast('success', `${e.category} « ${e.name} » validé.`); }}>Valider</Button>
            <Button size="sm" variant="danger" icon={<X size={13} />} onClick={() => s.update((p) => rejectElement(p, e.id))}>Rejeter</Button>
          </>
        ) : (
          <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => s.update((p) => restoreElement(p, e.id))}>Rétablir</Button>
        )}
        {onDetail && <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} className="ml-auto" onClick={onDetail}>Voir le détail</Button>}
      </div>
    </div>
  );
}
