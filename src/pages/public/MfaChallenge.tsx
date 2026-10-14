import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useAuth } from '../../lib/session';
import { Button, Field, Input, Notice, Spinner } from '../../ui';
import { Logo } from '../../ui/Logo';

/** Si l'utilisateur a activé la double authentification, on exige le code avant tout accès. */
export function MfaGate({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const qc = useQueryClient();
  const aal = useQuery({
    queryKey: ['aal', session?.access_token],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) return { needed: false };
      return { needed: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' };
    },
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (aal.isLoading) return <Spinner />;
  if (!aal.data?.needed) return <>{children}</>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp?.find((f) => f.status === 'verified');
    if (!factor) { setBusy(false); return setError('Aucun facteur vérifié trouvé.'); }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await qc.invalidateQueries();
  };
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-10">
      <Logo size={36} />
      <form onSubmit={submit} className="mt-8 w-full max-w-[380px] space-y-4 rounded-2xl border border-line bg-white p-6 shadow-card">
        <h1 className="text-[19px] font-bold text-navy-900">Double authentification</h1>
        <p className="text-[13.5px] text-muted">Saisissez le code à 6 chiffres affiché par votre application d’authentification.</p>
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Code"><Input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
        <Button type="submit" variant="primary" className="w-full" disabled={code.length !== 6} loading={busy}>Vérifier</Button>
        <Button variant="ghost" className="w-full" onClick={() => void signOut()}>Se déconnecter</Button>
      </form>
    </div>
  );
}
