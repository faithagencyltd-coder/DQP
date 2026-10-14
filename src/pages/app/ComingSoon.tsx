// Modules prévus mais pas encore développés : rien n'est simulé (§36.1, §36.6).
import { Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '../../ui';

const CONTENT: Record<string, { title: string; phase: string; items: string[]; meanwhile?: { label: string; to: string } }> = {
  plans: {
    title: 'Plans techniques', phase: 'Phase 3',
    items: ['Import de PDF, PNG, JPG et images scannées', 'Visualiseur : zoom, déplacement, rotation', 'Calibration de l’échelle sur une cote connue (mesures « à vérifier » tant qu’elle n’est pas faite)', 'Mesures de distances et de surfaces, annotations, calques', 'Comparaison de versions', 'Premiers outils de dessin 2D et export PDF / DXF'],
    meanwhile: { label: 'Déposer vos plans dans les documents', to: '/app/documents' },
  },
  achats: { title: 'Commandes et achats', phase: 'Phase 5', items: ['Demandes d’achat par projet et par lot', 'Bons de commande fournisseurs avec validation', 'Réception totale ou partielle', 'Rapprochement avec la facture fournisseur'] },
  stocks: { title: 'Stocks et matériaux', phase: 'Phase 5', items: ['Entrées, sorties, transferts entre dépôts', 'Affectation au chantier, inventaires, ajustements justifiés', 'Stock minimum et alertes de réapprovisionnement', 'Conversions d’unités uniquement si le facteur est validé'] },
  factures: { title: 'Facturation et paiements', phase: 'Phase 5', items: ['Factures d’acompte, intermédiaires, finales, avoirs', 'Numérotation contrôlée et échéances', 'Paiements partiels et soldes', 'Relances configurables', 'Mobile Money et paiement en ligne via un prestataire autorisé'] },
  depenses: { title: 'Dépenses et rentabilité', phase: 'Phase 5', items: ['Dépenses par projet, lot et fournisseur avec justificatif', 'Budget initial, révisé, réel', 'Montants engagés, facturés, payés, encaissés', 'Marges prévisionnelle et constatée, alertes de dépassement'] },
  planning: { title: 'Planning et équipes', phase: 'Phase 5', items: ['Tâches avec dépendances : vue calendrier et chronologique', 'Statuts : à faire, en cours, en attente, bloqué, terminé, validé', 'Rapports journaliers avec photos', 'Avancement calculé selon une méthode transparente'] },
  assistant: {
    title: 'Assistant IA PLANORA', phase: 'Phase 4',
    items: ['Lecture de texte et de dimensions sur les plans et documents', 'Préparation d’un premier quantitatif, toujours à valider', 'Repérage des lignes sans prix ou des valeurs manquantes', 'Explication des formules, descriptions d’ouvrages', 'Quotas par abonnement et suivi de consommation'],
  },
};

export function ComingSoon({ module }: { module: keyof typeof CONTENT }) {
  const c = CONTENT[module];
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-[24px] font-bold text-navy-900">{c.title}</h1>
        <Badge tone="warn"><Clock size={12} /> {c.phase}</Badge>
      </div>
      <Card title="Ce module n’est pas encore disponible">
        <p className="text-[14px] text-ink-2">Il sera livré lors de la {c.phase.toLowerCase()} du cahier des charges. Aucune fonction de ce module n’est simulée en attendant. Il comprendra :</p>
        <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2">
          {c.items.map((i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-500" />{i}</li>)}
        </ul>
        {c.meanwhile && <Link to={c.meanwhile.to} className="mt-5 inline-block"><Button>{c.meanwhile.label}</Button></Link>}
      </Card>
    </div>
  );
}
