import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { isConfigured } from './lib/config';
import { useAuth, useOrg } from './lib/session';
import { Notice, Spinner } from './ui';
import { Logo } from './ui/Logo';
import { Landing } from './pages/public/Landing';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from './pages/public/AuthPages';
import { InvitationPage } from './pages/public/InvitationPage';
import { PrivacyPage, TermsPage } from './pages/public/LegalPages';
import { MfaGate } from './pages/public/MfaChallenge';
import { Onboarding } from './pages/app/Onboarding';
import { ComingSoon } from './pages/app/ComingSoon';

const Dashboard = lazy(() => import('./pages/app/Dashboard').then((m) => ({ default: m.Dashboard })));
const ContactsPage = lazy(() => import('./pages/app/Contacts').then((m) => ({ default: m.ContactsPage })));
const ContactDetail = lazy(() => import('./pages/app/Contacts').then((m) => ({ default: m.ContactDetail })));
const ProjectsPage = lazy(() => import('./pages/app/Projects').then((m) => ({ default: m.ProjectsPage })));
const ProjectDetail = lazy(() => import('./pages/app/Projects').then((m) => ({ default: m.ProjectDetail })));
const DocumentsPage = lazy(() => import('./pages/app/Documents').then((m) => ({ default: m.DocumentsPage })));
const PricesPage = lazy(() => import('./pages/app/Prices').then((m) => ({ default: m.PricesPage })));
const MetresPage = lazy(() => import('./pages/app/Metres').then((m) => ({ default: m.MetresPage })));
const MetreEditor = lazy(() => import('./pages/app/Metres').then((m) => ({ default: m.MetreEditor })));
const QuotesPage = lazy(() => import('./pages/app/Quotes').then((m) => ({ default: m.QuotesPage })));
const QuoteEditor = lazy(() => import('./pages/app/QuoteEditor').then((m) => ({ default: m.QuoteEditor })));
const SettingsPage = lazy(() => import('./pages/app/Settings').then((m) => ({ default: m.SettingsPage })));
const SubscriptionPage = lazy(() => import('./pages/app/Subscription').then((m) => ({ default: m.SubscriptionPage })));
const JournalPage = lazy(() => import('./pages/app/Journal').then((m) => ({ default: m.JournalPage })));
const PlansPage = lazy(() => import('./pages/app/Plans').then((m) => ({ default: m.PlansPage })));
const PlanEditor = lazy(() => import('./pages/app/plan/PlanEditor').then((m) => ({ default: m.PlanEditor })));
const AdminPage = lazy(() => import('./pages/app/Admin').then((m) => ({ default: m.AdminPage })));

function NotConfigured() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Logo size={36} />
      <Notice tone="warn" className="mt-6" title="Serveur non configuré">
        Les variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY ne sont pas définies pour cette version. Voir docs/DEPLOIEMENT.md.
      </Notice>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to={`/connexion?suite=${encodeURIComponent(loc.pathname)}`} replace />;
  return <MfaGate>{children}</MfaGate>;
}

/** Sans entreprise, l'utilisateur est dirigé vers la création ou l'invitation. */
function RequireOrg({ children }: { children: ReactNode }) {
  const { memberships, loading } = useOrg();
  if (loading) return <Spinner />;
  if (!memberships.length) return <Navigate to="/app/bienvenue" replace />;
  return <>{children}</>;
}

const page = (el: ReactNode) => <RequireOrg><Suspense fallback={<Spinner />}>{el}</Suspense></RequireOrg>;

export function App() {
  if (!isConfigured()) return <NotConfigured />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/inscription" element={<SignupPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
      <Route path="/nouveau-mot-de-passe" element={<ResetPasswordPage />} />
      <Route path="/invitation/:token" element={<InvitationPage />} />
      <Route path="/conditions" element={<TermsPage />} />
      <Route path="/confidentialite" element={<PrivacyPage />} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={page(<Dashboard />)} />
        <Route path="bienvenue" element={<Onboarding />} />
        <Route path="clients" element={page(<ContactsPage />)} />
        <Route path="clients/:id" element={page(<ContactDetail />)} />
        <Route path="projets" element={page(<ProjectsPage />)} />
        <Route path="projets/:id" element={page(<ProjectDetail />)} />
        <Route path="documents" element={page(<DocumentsPage />)} />
        <Route path="prix" element={page(<PricesPage />)} />
        <Route path="metres" element={page(<MetresPage />)} />
        <Route path="metres/:id" element={page(<MetreEditor />)} />
        <Route path="dqe" element={page(<QuotesPage kind="dqe" />)} />
        <Route path="devis" element={page(<QuotesPage kind="devis" />)} />
        <Route path="documents-chiffres/:id" element={page(<QuoteEditor />)} />
        <Route path="parametres" element={page(<SettingsPage />)} />
        <Route path="abonnement" element={page(<SubscriptionPage />)} />
        <Route path="journal" element={page(<JournalPage />)} />
        <Route path="admin" element={<Suspense fallback={<Spinner />}><AdminPage /></Suspense>} />
        <Route path="plans" element={page(<PlansPage />)} />
        <Route path="plans/:id" element={page(<PlanEditor />)} />
        <Route path="achats" element={page(<ComingSoon module="achats" />)} />
        <Route path="stocks" element={page(<ComingSoon module="stocks" />)} />
        <Route path="factures" element={page(<ComingSoon module="factures" />)} />
        <Route path="depenses" element={page(<ComingSoon module="depenses" />)} />
        <Route path="planning" element={page(<ComingSoon module="planning" />)} />
        <Route path="assistant" element={page(<ComingSoon module="assistant" />)} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
