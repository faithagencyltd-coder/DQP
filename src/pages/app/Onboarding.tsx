import { useQueryClient } from '@tanstack/react-query';
import { Building2, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rpc } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { COUNTRIES } from '../../lib/labels';
import { useAuth, useOrg } from '../../lib/session';
import { Button, Card, Field, Input, Notice, Select } from '../../ui';

export function Onboarding() {
  const { profile, signOut } = useAuth();
  const { memberships, switchOrg, refresh } = useOrg();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', legal: '', country: 'BJ', city: '', phone: profile?.phone ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await rpc<string>('create_organization', { p_name: f.name.trim(), p_country: f.country, p_city: f.city.trim() || null, p_phone: f.phone.trim() || null, p_legal_name: f.legal.trim() || null });
      await qc.invalidateQueries({ queryKey: ['memberships'] });
      refresh();
      switchOrg(id);
      nav('/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-bold text-navy-900">Bienvenue{profile?.first_name ? `, ${profile.first_name}` : ''} !</h1>
      <p className="mt-1 text-muted">{memberships.length && !params.get('nouvelle') ? 'Vous faites déjà partie d’une entreprise.' : 'Pour commencer, créez votre entreprise ou rejoignez celle qui vous a invité.'}</p>
      <div className="mt-6 grid gap-4">
        <Card title={<span className="flex items-center gap-2"><Building2 size={18} className="text-signal-500" /> Créer mon entreprise</span>} subtitle="Vous en serez le propriétaire. Essai gratuit de l’offre Découverte.">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            {error && <Notice tone="bad" className="sm:col-span-2">{error}</Notice>}
            <Field label="Nom commercial" required className="sm:col-span-2"><Input required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex. Bâtir Plus" /></Field>
            <Field label="Raison sociale" hint="Facultatif" className="sm:col-span-2"><Input value={f.legal} onChange={(e) => setF({ ...f, legal: e.target.value })} placeholder="Ex. BÂTIR PLUS SARL" /></Field>
            <Field label="Pays" required>
              <Select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
                {Object.entries(COUNTRIES).filter(([k]) => k !== 'AUTRE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Ville"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Ex. Cotonou" /></Field>
            <Field label="Téléphone" className="sm:col-span-2"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy}>Créer l’entreprise</Button></div>
          </form>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Mail size={18} className="text-navy-700" /> Rejoindre une entreprise</span>}>
          <p className="text-[14px] text-ink-2">Demandez à l’administrateur de votre entreprise de vous inviter avec l’adresse <b>{profile?.email}</b>. Il vous transmettra un lien d’invitation : ouvrez-le une fois connecté.</p>
        </Card>
        <div><Button variant="ghost" onClick={() => void signOut()}>Se déconnecter</Button></div>
      </div>
    </div>
  );
}
