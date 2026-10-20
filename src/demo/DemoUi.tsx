// Éléments visibles de la version autonome (démonstration dans le navigateur ou logiciel installé) :
// comptes d'essai, bandeau, sauvegarde et restauration des données, réinitialisation.
import { Download, FlaskConical, HardDrive, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { isDesktop } from '../lib/config';
import { downloadBlob } from '../lib/download';
import { Button, Notice, useToast } from '../ui';

export const DEMO_LOGINS = [
  { email: 'demo@planora.bj', password: 'Demo2026', label: 'Propriétaire et administrateur de la plateforme' },
  { email: 'conducteur@planora.bj', password: 'Demo2026', label: 'Conducteur de travaux (droits limités)' },
];

export function DemoLogins({ onPick }: { onPick: (email: string, password: string) => void }) {
  return (
    <Notice tone="navy" title={isDesktop ? 'Logiciel PLANORA BTP (version d’essai)' : 'Version de démonstration'}>
      <span className="block">Comptes d’essai (mot de passe <b>Demo2026</b>) :</span>
      {DEMO_LOGINS.map((d) => (
        <button key={d.email} type="button" className="mt-1 block text-left underline" onClick={() => onPick(d.email, d.password)}>{d.email} — {d.label}</button>
      ))}
      <span className="mt-1 block text-[12px]">Vous pouvez aussi créer votre propre compte : il est validé tout de suite, sans e-mail.</span>
    </Notice>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function DemoBanner() {
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'save' | 'restore' | 'reset'>(null);
  const file = useRef<HTMLInputElement>(null);
  const where = isDesktop ? 'sur cet ordinateur' : 'dans ce navigateur';
  const reset = async () => {
    if (!confirm(`Effacer toutes les données enregistrées ${where} et repartir de la base de départ ? Pensez à faire une sauvegarde avant.`)) return;
    setBusy('reset');
    const { resetDemo } = await import('./db');
    await resetDemo();
  };
  const save = async () => {
    setBusy('save');
    try {
      const { exportBackup } = await import('./db');
      downloadBlob(await exportBackup(), `planora-btp-sauvegarde-${today()}.planora`);
      toast('ok', 'Sauvegarde créée : conservez ce fichier en lieu sûr (clé USB, autre ordinateur).');
    } catch (e) {
      toast('bad', `Sauvegarde impossible : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const restore = async (f: File) => {
    if (!confirm(`Remplacer toutes les données actuelles ${where} par celles de la sauvegarde « ${f.name} » ? Les données actuelles seront perdues si vous ne les avez pas sauvegardées.`)) return;
    setBusy('restore');
    try {
      const { restoreBackup } = await import('./db');
      await restoreBackup(f);
    } catch (e) {
      toast('bad', (e as Error).message);
      setBusy(null);
    }
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b border-signal-200 bg-signal-50 px-4 py-1.5 text-[12.5px] text-ink-2">
      {isDesktop ? <HardDrive size={14} className="text-signal-600" /> : <FlaskConical size={14} className="text-signal-600" />}
      <span>{isDesktop
        ? <><b>Logiciel installé (version d’essai)</b> : vos données sont enregistrées sur cet ordinateur, sans Internet. Faites des sauvegardes régulières. Rendu IA et envoi d’e-mails indisponibles.</>
        : <><b>Version de démonstration</b> : données d’exemple fictives, enregistrées uniquement dans ce navigateur, sans Internet. Rendu IA et envoi d’e-mails indisponibles.</>}</span>
      <span className="ml-auto flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" className="!h-7" icon={<Download size={14} />} loading={busy === 'save'} onClick={() => void save()}>Sauvegarder les données</Button>
        <Button size="sm" variant="ghost" className="!h-7" icon={<Upload size={14} />} loading={busy === 'restore'} onClick={() => file.current?.click()}>Restaurer une sauvegarde</Button>
        <Button size="sm" variant="ghost" className="!h-7" loading={busy === 'reset'} onClick={() => void reset()}>{isDesktop ? 'Repartir de zéro' : 'Réinitialiser la démonstration'}</Button>
      </span>
      <input ref={file} type="file" accept=".planora,.gz,.tgz" className="hidden" aria-label="Fichier de sauvegarde" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f); }} />
    </div>
  );
}
