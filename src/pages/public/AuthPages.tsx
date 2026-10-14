import { ArrowLeft, MailCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useAuth } from '../../lib/session';
import { isDemo } from '../../lib/config';
import { DemoLogins } from '../../demo/DemoUi';
import { Button, Checkbox, Field, Input, Notice } from '../../ui';
import { Logo } from '../../ui/Logo';

const redirectBase = () => `${window.location.origin}${window.location.pathname}`;

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-10">
      <Link to="/" className="mb-8"><Logo size={38} /></Link>
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <h1 className="text-[21px] font-bold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-[14px] text-muted">{footer}</div>}
    </div>
  );
}

/** Règles de mot de passe : 8 caractères minimum, lettres et chiffres. */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'Au moins 8 caractères.';
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) return 'Mélangez lettres et chiffres.';
  return null;
}

export function LoginPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('suite') || '/app';
  useEffect(() => { if (session) nav(next, { replace: true }); }, [session, nav, next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(errorMessage(error));
  };
  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre espace PLANORA BTP." footer={<>Pas encore de compte ? <Link className="link" to="/inscription">Créer un compte</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {params.get('confirme') && <Notice tone="ok" title="Adresse e-mail confirmée">Vous pouvez vous connecter.</Notice>}
        {isDemo && <DemoLogins onPick={(e, p) => { setEmail(e); setPassword(p); }} />}
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Adresse e-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Mot de passe"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <div className="flex justify-end"><Link className="link text-[13px]" to="/mot-de-passe-oublie">Mot de passe oublié ?</Link></div>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>Se connecter</Button>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState({ first: '', last: '', email: params.get('email') ?? '', phone: '', password: '', password2: '' });
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pwdProblem = f.password ? passwordProblem(f.password) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pwdProblem) return setError(`Mot de passe : ${pwdProblem}`);
    if (f.password !== f.password2) return setError('Les deux mots de passe ne correspondent pas.');
    if (!terms) return setError('Vous devez accepter les conditions d’utilisation et la politique de confidentialité.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: {
        emailRedirectTo: `${redirectBase()}#/connexion?confirme=1${params.get('invitation') ? `&suite=${encodeURIComponent('/invitation/' + params.get('invitation'))}` : ''}`,
        data: { first_name: f.first.trim(), last_name: f.last.trim(), phone: f.phone.trim(), accepted_terms: 'true' },
      },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    // Supabase ne révèle pas si l'adresse existe déjà (identités vides) : on reste neutre.
    if (data.user && !data.session) setSent(f.email.trim());
    // Confirmation automatique (version de test locale) : la session est ouverte d'emblée.
    else if (data.session) nav(params.get('invitation') ? `/invitation/${params.get('invitation')}` : '/app', { replace: true });
  };

  if (sent) {
    return (
      <AuthLayout title="Confirmez votre adresse e-mail">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-signal-50 text-signal-600"><MailCheck size={28} /></div>
          <p className="text-[14.5px] text-ink-2">Un lien de confirmation a été envoyé à <b>{sent}</b>. Ouvrez-le pour activer votre compte, puis connectez-vous.</p>
          <p className="mt-3 text-[13px] text-muted">Pensez à vérifier vos courriers indésirables. Le lien expire au bout de 24 heures.</p>
          <Link to="/connexion" className="mt-6 w-full"><Button className="w-full">Aller à la connexion</Button></Link>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Créer un compte" subtitle="Essai gratuit, sans carte bancaire." footer={<>Déjà inscrit ? <Link className="link" to="/connexion">Se connecter</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required><Input autoComplete="given-name" required value={f.first} onChange={set('first')} /></Field>
          <Field label="Nom" required><Input autoComplete="family-name" required value={f.last} onChange={set('last')} /></Field>
        </div>
        <Field label="Adresse e-mail" required><Input type="email" autoComplete="email" required value={f.email} onChange={set('email')} /></Field>
        <Field label="Téléphone" hint="Avec l’indicatif, par exemple +229 01 97 00 00 00"><Input type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Mot de passe" required error={pwdProblem} hint="8 caractères minimum, lettres et chiffres."><Input type="password" autoComplete="new-password" required value={f.password} onChange={set('password')} /></Field>
        <Field label="Confirmer le mot de passe" required><Input type="password" autoComplete="new-password" required value={f.password2} onChange={set('password2')} /></Field>
        <Checkbox checked={terms} onChange={setTerms} label={<>J’accepte les <Link className="link" to="/conditions" target="_blank">conditions d’utilisation</Link> et la <Link className="link" to="/confidentialite" target="_blank">politique de confidentialité</Link>.</>} />
        <Button type="submit" variant="primary" className="w-full" loading={busy}>Créer mon compte</Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${redirectBase()}#/nouveau-mot-de-passe` });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else setDone(true);
  };
  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe." footer={<Link className="link inline-flex items-center gap-1" to="/connexion"><ArrowLeft size={14} /> Retour à la connexion</Link>}>
      {done ? (
        <Notice tone="ok" title="Demande enregistrée">Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="bad">{error}</Notice>}
          <Field label="Adresse e-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>Envoyer le lien</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pb = passwordProblem(p1);
    if (pb) return setError(pb);
    if (p1 !== p2) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    nav('/app', { replace: true });
  };
  return (
    <AuthLayout title="Nouveau mot de passe">
      {!session ? (
        <Notice tone="warn" title="Lien invalide ou expiré">Ouvrez le lien reçu par e-mail sur cet appareil, ou faites une nouvelle demande. <Link className="link" to="/mot-de-passe-oublie">Nouvelle demande</Link></Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="bad">{error}</Notice>}
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, lettres et chiffres."><Input type="password" autoComplete="new-password" required value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
          <Field label="Confirmer"><Input type="password" autoComplete="new-password" required value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>Enregistrer</Button>
        </form>
      )}
    </AuthLayout>
  );
}
