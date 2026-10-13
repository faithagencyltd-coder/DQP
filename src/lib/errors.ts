// Messages d'erreur compréhensibles (§2.3) : on traduit les erreurs techniques.

export function errorMessage(e: unknown): string {
  const raw = (e as { message?: string })?.message ?? String(e ?? 'Erreur inconnue');
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Adresse e-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail.';
  if (m.includes('user already registered')) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (m.includes('password should be') || m.includes('weak password')) return 'Mot de passe trop faible : au moins 8 caractères, avec lettres et chiffres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Action non autorisée pour votre rôle, ou abonnement à renouveler.';
  if (m.includes('duplicate key')) return 'Cet élément existe déjà (référence ou nom en double).';
  if (m.includes('violates check constraint')) return 'Une valeur saisie n’est pas valide.';
  if (m.includes('violates foreign key')) return 'Cet élément est utilisé ailleurs : archivez-le plutôt que de le supprimer.';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) return 'Connexion au serveur impossible. Vérifiez votre accès à Internet.';
  if (m.includes('jwt expired')) return 'Votre session a expiré : reconnectez-vous.';
  return raw;
}
