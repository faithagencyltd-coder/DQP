import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Alert, Confidence, DetectedInfo } from '../../core/types';

export const INFO_LABEL: Record<DetectedInfo['key'], string> = {
  title: 'Intitulé',
  location: 'Localisation',
  country: 'Pays',
  date: 'Date',
  phase: 'Phase',
  projectType: 'Type de projet',
  client: 'Maître d’ouvrage',
  architect: 'Architecte',
};

export const STATUS_LABEL: Record<Confidence, string> = {
  confirmed: 'Confirmé',
  to_verify: 'À vérifier',
  undetermined: 'Non déterminé',
};
const STATUS_CLS: Record<Confidence, string> = { confirmed: 'ok', to_verify: 'warn', undetermined: 'bad' };
const STATUS_ICON: Record<Confidence, string> = { confirmed: '🟢', to_verify: '🟠', undetermined: '🔴' };

export function StatusBadge({ status, short }: { status: Confidence; short?: boolean }) {
  return (
    <span className={`badge ${STATUS_CLS[status]}`} title={STATUS_LABEL[status]}>
      {STATUS_ICON[status]} {short ? '' : STATUS_LABEL[status]}
    </span>
  );
}

export function StatusDot({ status, title }: { status: Confidence; title?: string }) {
  return <span className={`sdot ${status}`} title={title ?? STATUS_LABEL[status]} />;
}

export function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const map = { error: ['bad', 'Erreur'], warning: ['warn', 'À vérifier'], info: ['info', 'Info'] } as const;
  return <span className={`badge ${map[severity][0]}`}>{map[severity][1]}</span>;
}

export function Modal(props: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header>
          <span style={{ flex: 1 }}>{props.title}</span>
          <button className="icon-btn" onClick={props.onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </header>
        <div className="content">{props.children}</div>
        {props.footer && <footer>{props.footer}</footer>}
      </div>
    </div>
  );
}

/** Saisie d'un texte (remplace window.prompt, indisponible dans Electron). */
export function PromptDialog(props: { title: string; label: string; initial?: string; confirm?: string; onCancel: () => void; onSubmit: (v: string) => void }) {
  const [v, setV] = useState(props.initial ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const ok = () => v.trim() && props.onSubmit(v.trim());
  return (
    <Modal
      title={props.title}
      onClose={props.onCancel}
      footer={
        <>
          <button className="btn" onClick={props.onCancel}>Annuler</button>
          <button className="btn primary" disabled={!v.trim()} onClick={ok}>{props.confirm ?? 'Valider'}</button>
        </>
      }
    >
      <label className="f">
        <span>{props.label}</span>
        <input ref={ref} className="in" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} autoFocus />
      </label>
    </Modal>
  );
}

export function ConfirmDialog(props: { title: string; children: ReactNode; confirm: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal
      title={props.title}
      onClose={props.onCancel}
      footer={
        <>
          <button className="btn" onClick={props.onCancel}>Annuler</button>
          <button className={`btn ${props.danger ? 'danger' : 'primary'}`} onClick={props.onConfirm} autoFocus>{props.confirm}</button>
        </>
      }
    >
      {props.children}
    </Modal>
  );
}

export function Panel(props: { title: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <div className="panel">
      <header>
        <span className="grow">{props.title}</span>
        {props.actions}
      </header>
      <div className={props.flush ? '' : 'content'}>{props.children}</div>
    </div>
  );
}

export function PhaseNotice({ phase, children }: { phase: string; children: ReactNode }) {
  return (
    <div className="notice">
      <b>
        Module prévu — <span className="phase">{phase}</span>
      </b>
      {children}
    </div>
  );
}

export function useDialog<T>() {
  const [state, setState] = useState<T | null>(null);
  return { state, open: (v: T) => setState(v), close: () => setState(null) };
}
