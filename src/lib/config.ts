// Configuration publique de l'application (aucun secret : la clé publiable est faite pour
// être exposée, l'accès aux données est protégé par les règles RLS de la base).
export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '',
  appName: 'PLANORA BTP',
  slogan: 'Du plan au chantier, tout devient plus simple.',
  version: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0',
  environment: (import.meta.env.VITE_ENVIRONMENT as string | undefined) ?? 'test',
};

/** Version de démonstration autonome (un seul fichier HTML, base embarquée dans le navigateur). */
export const isDemo = import.meta.env.VITE_DEMO === '1';

/** Logiciel installé sur l'ordinateur (même moteur autonome que la démonstration). */
export const isDesktop = import.meta.env.VITE_DESKTOP === '1';

export const isConfigured = () => isDemo || (!!config.supabaseUrl && !!config.supabaseKey);
