// Conditions d'utilisation et politique de confidentialité : versions de travail, à faire
// valider par un juriste avant la commercialisation (§27.5).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from '../../ui';
import { Logo } from '../../ui/Logo';

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white">
      <header className="border-b border-line"><div className="mx-auto flex h-16 max-w-3xl items-center px-4"><Link to="/"><Logo size={30} /></Link></div></header>
      <article className="mx-auto max-w-3xl px-4 py-10 text-[14.5px] leading-relaxed text-ink-2 [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-bold [&_h2]:text-navy-900 [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3">
        <h1 className="text-[26px] font-bold text-navy-900">{title}</h1>
        <Notice tone="warn" className="mt-4" title="Version de travail">Ce texte doit être relu et validé par un juriste pour le Bénin et la Côte d’Ivoire avant la commercialisation.</Notice>
        {children}
      </article>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Conditions d’utilisation de PLANORA BTP">
      <h2>1. Objet</h2>
      <p>PLANORA BTP est une plateforme en ligne d’aide à la préparation technique et à la gestion de projets de construction : métrés, bibliothèques de prix, DQE, BPU, devis et documents de chantier.</p>
      <h2>2. Compte et entreprise</h2>
      <p>L’utilisateur crée un compte personnel avec une adresse e-mail confirmée. Il peut créer une entreprise, dont il devient propriétaire, ou rejoindre une entreprise sur invitation. Chaque entreprise dispose d’un espace de données isolé.</p>
      <h2>3. Responsabilité des résultats</h2>
      <p>Les calculs sont réalisés par un moteur déterministe et documenté. PLANORA BTP est un outil d’aide : les quantités, prix et documents produits doivent être vérifiés par l’utilisateur. Les calculs structurels, les installations électriques et hydrauliques et les plans d’exécution doivent être validés par des professionnels qualifiés, selon les normes applicables.</p>
      <h2>4. Abonnements</h2>
      <p>L’accès est proposé par abonnement mensuel ou annuel, après une période d’essai. À l’échéance d’un abonnement non renouvelé, les données restent consultables et exportables ; les nouvelles opérations sont bloquées. Aucune donnée n’est supprimée du fait d’un changement d’offre.</p>
      <h2>5. Données de l’entreprise</h2>
      <p>Les données saisies appartiennent à l’entreprise cliente. Elle peut les exporter à tout moment et demander leur suppression.</p>
      <h2>6. Disponibilité</h2>
      <p>Le service est fourni dans un environnement de test pendant la phase de développement. Les modules marqués « bientôt » ne sont pas encore disponibles.</p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <h2>Données collectées</h2>
      <ul>
        <li>Compte : nom, prénom, adresse e-mail, téléphone, date d’acceptation des conditions.</li>
        <li>Entreprise : informations légales et coordonnées saisies par l’entreprise.</li>
        <li>Données métier : clients, projets, prix, métrés, documents, saisis par les utilisateurs.</li>
        <li>Journal d’activité : opérations importantes (création, modification, validation, suppression), avec l’utilisateur et la date.</li>
      </ul>
      <h2>Hébergement et sécurité</h2>
      <p>Les données sont hébergées par Supabase (base PostgreSQL et stockage de fichiers), avec chiffrement des échanges (HTTPS). Les mots de passe sont stockés sous forme de hachages. Chaque entreprise ne peut accéder qu’à ses propres données ; ces règles sont vérifiées par la base de données. Les fichiers sont privés et téléchargés par des liens temporaires.</p>
      <h2>Accès par PLANORA BTP</h2>
      <p>L’administration de la plateforme voit la liste des entreprises et l’état de leurs abonnements, mais pas le contenu des documents des entreprises.</p>
      <h2>Vos droits</h2>
      <p>Vous pouvez demander l’accès, la rectification, l’export ou la suppression de vos données en écrivant à l’équipe PLANORA BTP.</p>
    </LegalLayout>
  );
}
