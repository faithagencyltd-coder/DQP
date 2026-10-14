import { ArrowRight, Calculator, Check, FileSpreadsheet, FileText, Library, Lock, Map, Smartphone, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/session';
import { formatMoney } from '../../engine/money';
import type { Plan } from '../../lib/types';
import { Badge, Button, cx } from '../../ui';
import { Logo } from '../../ui/Logo';

const AVAILABLE = [
  { icon: Users, title: 'Clients, fournisseurs et projets', text: 'Fiches complètes, historique, import CSV, détection des doublons, projets organisés par lots.' },
  { icon: Calculator, title: 'Métrés vérifiables', text: 'Surfaces, volumes, périmètres, murs nets avec déduction des ouvertures : chaque calcul est détaillé.' },
  { icon: Library, title: 'Bibliothèque de prix', text: 'Prix par pays et par ville, date et source, historique, décomposition déboursé sec → prix de vente.' },
  { icon: FileSpreadsheet, title: 'DQE et BPU', text: 'Lots, sous-totaux, totaux recalculés ; BPU relié au DQE ; import de vos DQE Excel.' },
  { icon: FileText, title: 'Devis professionnels', text: 'Numérotation contrôlée, remise, taxes paramétrables, versions verrouillées, PDF à votre en-tête.' },
  { icon: Lock, title: 'Permissions et sécurité', text: 'Rôles configurables par entreprise, données isolées et vérifiées côté serveur.' },
];

const SOON = [
  ['Plans techniques', 'import PDF/images, calibration, mesures, éditeur 2D — phase 3'],
  ['Assistant IA PLANORA', 'lecture de documents, aide aux métrés — phase 4'],
  ['Facturation, dépenses, achats, stocks, planning', 'phase 5'],
  ['Paiement en ligne Mobile Money et carte', 'phase 6'],
];

export function Landing() {
  const { session } = useAuth();
  const plans = useQuery({
    queryKey: ['public-plans'],
    queryFn: async () => {
      const { data } = await supabase.from('subscription_plans').select('*').eq('active', true).order('sort');
      return (data ?? []) as Plan[];
    },
    retry: false,
  });
  return (
    <div className="min-h-full bg-white">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo size={34} />
          <div className="flex items-center gap-2">
            {session ? (
              <Link to="/app"><Button variant="primary" icon={<ArrowRight size={16} />}>Mon espace</Button></Link>
            ) : (
              <>
                <Link to="/connexion" className="hidden sm:block"><Button variant="ghost">Connexion</Button></Link>
                <Link to="/inscription"><Button variant="primary">Créer un compte</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-navy-900 text-white">
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
          <defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#fff" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <Badge tone="signal" className="mb-5">Bénin · Côte d’Ivoire · FCFA</Badge>
            <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight sm:text-[46px]">
              Du plan au chantier,<br /><span className="text-signal-400">tout devient plus simple.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-white/75">
              PLANORA BTP réunit vos métrés, vos prix, vos DQE/BPU et vos devis dans une seule plateforme, sur ordinateur,
              tablette et téléphone. Des calculs vérifiables, des documents professionnels, des données protégées.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={session ? '/app' : '/inscription'}><Button variant="primary" size="lg" icon={<ArrowRight size={18} />}>{session ? 'Accéder à mon espace' : 'Essayer gratuitement'}</Button></Link>
              {!session && <Link to="/connexion"><Button size="lg" className="!border-white/20 !bg-white/5 !text-white hover:!bg-white/10">J’ai déjà un compte</Button></Link>}
            </div>
            <p className="mt-4 text-[13px] text-white/50">Essai gratuit, sans carte bancaire. Vos données restent les vôtres.</p>
          </div>
          <div className="hidden lg:block">
            <div className="rounded-2xl bg-white p-5 text-ink shadow-pop">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-bold text-navy-900">Exemple de calcul de métré</span>
                <Badge tone="grey">exemple</Badge>
              </div>
              <table className="w-full text-[13px]">
                <tbody>
                  {[['Dalle séjour', 'L × l', '5,00 × 4,00', '20,00 m²'], ['Semelles filantes', 'L × l × H', '32,40 × 0,60 × 0,40', '7,78 m³'], ['Mur façade', 'L × H − ouvertures', '8,00 × 3,00 − 3,78', '20,22 m²']].map((r) => (
                    <tr key={r[0]} className="border-b border-line-2 last:border-0">
                      <td className="py-2 font-medium">{r[0]}</td><td className="py-2 text-muted">{r[1]}</td><td className="tabular py-2 text-muted">{r[2]}</td><td className="tabular py-2 text-right font-bold text-navy-900">{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[12px] text-muted">Chaque quantité garde sa formule et ses dimensions. Une dimension manquante reste « à confirmer » : PLANORA ne l’invente jamais.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-[26px] font-bold tracking-tight text-navy-900">Disponible dès aujourd’hui</h2>
        <p className="mt-2 text-muted">Ces modules fonctionnent réellement, avec une base de données et des calculs testés.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AVAILABLE.map((f) => (
            <div key={f.title} className="rounded-xl border border-line p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-signal-50 text-signal-600"><f.icon size={20} /></div>
              <div className="font-bold text-navy-900">{f.title}</div>
              <p className="mt-1.5 text-[14px] text-muted">{f.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-dashed border-line bg-canvas p-5">
          <div className="flex items-center gap-2 font-bold text-navy-900"><Map size={18} className="text-signal-500" /> En préparation</div>
          <ul className="mt-3 grid gap-2 text-[14px] text-ink-2 sm:grid-cols-2">
            {SOON.map(([t, d]) => <li key={t}><b>{t}</b> <span className="text-muted">— {d}</span></li>)}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Ces modules sont signalés « bientôt » dans l’application et ne sont pas simulés.</p>
        </div>
      </section>

      <section className="border-y border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[26px] font-bold tracking-tight text-navy-900">Offres</h2>
          <p className="mt-2 text-muted">Tarifs indicatifs en FCFA, susceptibles d’évoluer avant la commercialisation.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {(plans.data ?? []).map((p) => (
              <div key={p.id} className={cx('flex flex-col rounded-xl border bg-white p-5', p.id === 'pro' ? 'border-signal-500 ring-2 ring-signal-100' : 'border-line')}>
                <div className="flex items-center justify-between">
                  <span className="text-[16px] font-bold text-navy-900">{p.name}</span>
                  {p.id === 'pro' && <Badge tone="signal">Recommandée</Badge>}
                </div>
                <div className="mt-3 text-[26px] font-extrabold text-navy-900">{p.price_month ? formatMoney(p.price_month, p.currency) : 'Gratuit'}</div>
                <div className="text-[12.5px] text-muted">{p.price_month ? `par mois · ${formatMoney(p.price_year, p.currency)} par an` : `${p.trial_days} jours d’essai`}</div>
                <p className="mt-3 text-[13.5px] text-ink-2">{p.description}</p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-ink-2">
                  <li className="flex gap-2"><Check size={15} className="mt-0.5 text-ok-600" />{p.max_users ? `${p.max_users} utilisateur(s)` : 'Utilisateurs illimités'}</li>
                  <li className="flex gap-2"><Check size={15} className="mt-0.5 text-ok-600" />{p.max_projects ? `${p.max_projects} projets actifs` : 'Projets illimités'}</li>
                  <li className="flex gap-2"><Check size={15} className="mt-0.5 text-ok-600" />{p.max_storage_mb >= 1000 ? `${p.max_storage_mb / 1000} Go` : `${p.max_storage_mb} Mo`} de stockage</li>
                </ul>
              </div>
            ))}
            {plans.isError && <p className="text-muted">Offres momentanément indisponibles.</p>}
          </div>
          <p className="mt-6 flex items-center gap-2 text-[13px] text-muted"><Smartphone size={15} /> Paiement Mobile Money et carte : en cours d’intégration. Activation en attendant par l’équipe PLANORA BTP.</p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo size={26} subtitle={false} />
        <div className="flex gap-4">
          <Link className="link" to="/conditions">Conditions d’utilisation</Link>
          <Link className="link" to="/confidentialite">Confidentialité</Link>
        </div>
        <span>© {new Date().getFullYear()} PLANORA BTP</span>
      </footer>
    </div>
  );
}
