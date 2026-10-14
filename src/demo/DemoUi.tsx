// Éléments visibles de la version de démonstration : comptes d'essai, bandeau, réinitialisation.
import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { Button, Notice } from '../ui';

export const DEMO_LOGINS = [
  { email: 'demo@planora.bj', password: 'Demo2026', label: 'Propriétaire et administrateur de la plateforme' },
  { email: 'conducteur@planora.bj', password: 'Demo2026', label: 'Conducteur de travaux (droits limités)' },
];

export function DemoLogins({ onPick }: { onPick: (email: string, password: string) => void }) {
  return (
    <Notice tone="navy" title="Version de démonstration">
      <span className="block">Comptes d’essai (mot de passe <b>Demo2026</b>) :</span>
      {DEMO_LOGINS.map((d) => (
        <button key={d.email} type="button" className="mt-1 block text-left underline" onClick={() => onPick(d.email, d.password)}>{d.email} — {d.label}</button>
      ))}
      <span className="mt-1 block text-[12px]">Vous pouvez aussi créer votre propre compte : il est validé tout de suite, sans e-mail.</span>
    </Notice>
  );
}

export function DemoBanner() {
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!confirm('Effacer toutes les données de démonstration de ce navigateur et repartir de zéro ?')) return;
    setBusy(true);
    const { resetDemo } = await import('./db');
    await resetDemo();
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b border-signal-200 bg-signal-50 px-4 py-1.5 text-[12.5px] text-ink-2">
      <FlaskConical size={14} className="text-signal-600" />
      <span><b>Version de démonstration</b> : données d’exemple fictives, enregistrées uniquement dans ce navigateur, sans Internet. Rendu IA et envoi d’e-mails indisponibles.</span>
      <Button size="sm" variant="ghost" className="ml-auto !h-7" loading={busy} onClick={reset}>Réinitialiser la démonstration</Button>
    </div>
  );
}
