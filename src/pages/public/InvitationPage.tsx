import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { ROLE_LABEL } from '../../lib/labels';
import { useAuth, useOrg } from '../../lib/session';
import type { Role } from '../../lib/types';
import { Button, Notice, Spinner } from '../../ui';
import { Logo } from '../../ui/Logo';

export function InvitationPage() {
  const { token = '' } = useParams();
  const { session } = useAuth();
  const { switchOrg, refresh } = useOrg();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invitation_preview', { p_token: token });
      if (error) throw error;
      return (data as { org_name: string; role: Role; email: string; expired: boolean; accepted: boolean }[])[0] ?? null;
    },
  });
  const accept = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await qc.invalidateQueries();
    refresh();
    switchOrg(data as string);
    nav('/app', { replace: true });
  };
  const inv = preview.data;
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-10">
      <Link to="/" className="mb-8"><Logo size={38} /></Link>
      <div className="w-full max-w-[460px] rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <h1 className="text-[21px] font-bold text-navy-900">Invitation</h1>
        {preview.isLoading ? <Spinner /> : !inv ? (
          <Notice tone="bad" className="mt-4" title="Invitation introuvable">Le lien est incomplet ou a été supprimé. Demandez un nouveau lien à votre entreprise.</Notice>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-[14.5px] text-ink-2">
              <b>{inv.org_name}</b> vous invite à rejoindre son espace PLANORA BTP en tant que <b>{ROLE_LABEL[inv.role]}</b>.
            </p>
            {inv.accepted && <Notice tone="warn">Cette invitation a déjà été utilisée.</Notice>}
            {inv.expired && !inv.accepted && <Notice tone="warn">Cette invitation a expiré. Demandez un nouveau lien.</Notice>}
            {error && <Notice tone="bad">{error}</Notice>}
            {!inv.accepted && !inv.expired && (session ? (
              <>
                {session.user.email?.toLowerCase() !== inv.email.toLowerCase() && (
                  <Notice tone="warn">Vous êtes connecté avec <b>{session.user.email}</b> mais l’invitation est adressée à <b>{inv.email}</b>. Connectez-vous avec la bonne adresse.</Notice>
                )}
                <Button variant="primary" className="w-full" loading={busy} onClick={() => void accept()}>Rejoindre {inv.org_name}</Button>
              </>
            ) : (
              <div className="grid gap-2">
                <Link to={`/inscription?email=${encodeURIComponent(inv.email)}&invitation=${token}`}><Button variant="primary" className="w-full">Créer mon compte ({inv.email})</Button></Link>
                <Link to={`/connexion?suite=${encodeURIComponent('/invitation/' + token)}`}><Button className="w-full">J’ai déjà un compte</Button></Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
