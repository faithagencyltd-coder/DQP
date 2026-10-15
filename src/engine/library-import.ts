// Bibliothèque des travaux construite à partir d'un DQE Excel de l'entreprise (§D) : on garde
// les désignations, unités, prix, corps d'état et la place de chaque ligne dans le DQE, avec sa
// cellule d'origine. Rien n'est corrigé en silence : doublons, prix manquants ou nuls, unités
// harmonisées et formules cassées sont signalés, et tout ouvrage importé reste « à vérifier ».

import type { ImportResult } from './dqp/import/dqe-parser';
import { normalizeUnit } from './units';
import { formatNumber } from './money';

export type CandidateFlag = 'prix_manquant' | 'prix_nul' | 'prix_divergents' | 'doublon_fusionne' | 'quantite_a_verifier' | 'deja_en_bibliotheque' | 'prix_different_en_bibliotheque';

export interface CandidateSource { cell: string | null; number: string; section: string; quantity: number | null; price: number | null; quantityFormula?: string }

export interface LibraryCandidate {
  key: string;
  code: string;
  trade: string;
  category: string;
  section: string;
  designation: string;
  unit: string;
  price: number | null;
  sources: CandidateSource[];
  flags: CandidateFlag[];
  notes: string[];
  /** Ouvrage déjà présent dans la bibliothèque (même désignation et même unité). */
  existingId?: string;
  selected: boolean;
}

export interface LibraryImportPlan {
  fileName: string;
  sheet: string | null;
  trades: { name: string; code: string; lines: number }[];
  candidates: LibraryCandidate[];
  fileAlerts: string[];
  stats: { lignes: number; ouvrages: number; prixManquants: number; prixNuls: number; prixDivergents: number; doublonsFusionnes: number; dejaPresents: number };
}

export const FLAG_LABEL: Record<CandidateFlag, string> = {
  prix_manquant: 'Prix manquant',
  prix_nul: 'Prix à 0',
  prix_divergents: 'Même ouvrage, prix différents',
  doublon_fusionne: 'Plusieurs occurrences dans le fichier',
  quantite_a_verifier: 'Quantité du fichier à vérifier',
  deja_en_bibliotheque: 'Déjà dans la bibliothèque',
  prix_different_en_bibliotheque: 'Prix différent de la bibliothèque',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Code court d'un corps d'état (GO, CC, PS…), stable et lisible. */
export function tradeCode(name: string): string {
  const n = norm(name);
  const known: [RegExp, string][] = [
    [/macon|gros.?oeuvre|beton|terrass/, 'GO'], [/charpente|couverture/, 'CC'], [/plomberie|sanitaire/, 'PS'], [/electric/, 'EL'],
    [/revet|carreau|carrelage/, 'RV'], [/menuiserie/, 'MN'], [/peinture|badigeon/, 'PT'], [/etanche/, 'ET'], [/climati|cvc|ventil/, 'CV'],
    [/plafond/, 'FP'], [/vrd|voirie/, 'VR'], [/install/, 'IC'],
  ];
  for (const [re, c] of known) if (re.test(n)) return c;
  return n.replace(/[^a-z ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'OUV';
}

/** Catégorie de la bibliothèque correspondant au corps d'état. */
export function tradeCategory(name: string): string {
  const c = tradeCode(name);
  return ({ GO: 'Gros œuvre', CC: 'Charpente', PS: 'Plomberie', EL: 'Électricité', RV: 'Carrelage', MN: 'Menuiserie bois', PT: 'Peinture', ET: 'Étanchéité', CV: 'Climatisation', FP: 'Faux plafonds' } as Record<string, string>)[c] ?? 'Autre';
}

/** Construit la proposition d'import à partir du DQE analysé, sans rien écrire. */
export function planLibraryImport(fileName: string, result: ImportResult, existing: { id: string; code?: string; designation: string; unit: string; sale_price: number | null; archived_at?: string | null }[] = []): LibraryImportPlan {
  const candidates: LibraryCandidate[] = [];
  const trades: LibraryImportPlan['trades'] = [];
  let lignes = 0;
  let sheet: string | null = null;
  const byExisting = new Map(existing.filter((e) => !e.archived_at).map((e) => [`${norm(e.designation)}|${normalizeUnit(e.unit)}`, e]));

  for (const lot of result.lots) {
    const tcode = tradeCode(lot.name);
    let count = 0;
    const groups = new Map<string, LibraryCandidate[]>();
    for (const sec of lot.sections) {
      const section = [...sec.path, sec.title].filter(Boolean).join(' › ');
      for (const l of sec.lines) {
        if (!l.designation.trim()) continue;
        lignes++; count++;
        sheet ??= l.source?.sheet ?? null;
        const price = l.unitPrice.value;
        const src: CandidateSource = {
          cell: l.source?.cell ?? null, number: l.number, section, quantity: l.quantity.value, price,
          quantityFormula: l.quantity.source?.formula,
        };
        const key = `${norm(l.designation)}|${l.unit}`;
        const group = groups.get(key) ?? [];
        // Même ouvrage, même prix (ou sans prix des deux côtés) : une seule entrée, plusieurs sources.
        const same = group.find((c) => c.price === price);
        if (same) {
          same.sources.push(src);
          if (!same.flags.includes('doublon_fusionne')) same.flags.push('doublon_fusionne');
        } else {
          const c: LibraryCandidate = {
            key: `${tcode}|${key}|${price ?? 'x'}`, code: '', trade: lot.name, category: tradeCategory(lot.name), section,
            designation: l.designation.trim(), unit: l.unit, price, sources: [src], flags: [], notes: [], selected: true,
          };
          group.push(c);
          groups.set(key, group);
          candidates.push(c);
        }
        if (l.quantity.status === 'to_verify') {
          const c = group.find((x) => x.price === price)!;
          if (!c.flags.includes('quantite_a_verifier')) c.flags.push('quantite_a_verifier');
        }
      }
    }
    for (const group of groups.values()) {
      // Occurrence sans prix d'un ouvrage chiffré ailleurs dans le même corps d'état : rattachée à
      // l'ouvrage chiffré (et signalée), plutôt que de créer un second ouvrage « sans prix ».
      const firstPriced = group.find((c) => c.price !== null);
      for (const c of group.filter((x) => x.price === null && firstPriced)) {
        firstPriced!.sources.push(...c.sources);
        firstPriced!.notes.push(`Occurrence(s) sans prix : ${c.sources.map((s) => `${s.cell ?? '?'} (${s.section || 'section non nommée'})`).join(' ; ')}`);
        if (!firstPriced!.flags.includes('doublon_fusionne')) firstPriced!.flags.push('doublon_fusionne');
        for (const f of c.flags) if (!firstPriced!.flags.includes(f)) firstPriced!.flags.push(f);
        candidates.splice(candidates.indexOf(c), 1);
        group.splice(group.indexOf(c), 1);
      }
      const priced = group.filter((c) => c.price !== null && c.price > 0);
      if (priced.length > 1) {
        for (const c of group) {
          if (!c.flags.includes('prix_divergents')) c.flags.push('prix_divergents');
          const others = group.filter((o) => o !== c).map((o) => `${o.price === null ? 'sans prix' : formatNumber(o.price, 0)} (${o.sources[0].section || 'section non nommée'}${o.sources[0].cell ? `, ${o.sources[0].cell}` : ''})`);
          c.notes.push(`Autre(s) prix dans le fichier : ${others.join(' ; ')}`);
        }
      }
    }
    trades.push({ name: lot.name, code: tcode, lines: count });
  }

  // Codes : corps d'état + numéro d'ordre (le N° d'origine reste dans la source, il n'est pas unique).
  // La numérotation reprend après les codes déjà présents dans la bibliothèque (GO-012 → GO-013…).
  const seq = new Map<string, number>();
  for (const e of existing) {
    const m = /^([A-Z]{1,3})-(\d+)$/.exec(e.code ?? '');
    if (m) seq.set(m[1], Math.max(seq.get(m[1]) ?? 0, Number(m[2])));
  }
  for (const c of candidates) {
    const t = tradeCode(c.trade);
    const n = (seq.get(t) ?? 0) + 1;
    seq.set(t, n);
    c.code = `${t}-${String(n).padStart(3, '0')}`;
    if (c.price === null) c.flags.push('prix_manquant');
    else if (c.price === 0) c.flags.push('prix_nul');
    const ex = byExisting.get(`${norm(c.designation)}|${normalizeUnit(c.unit)}`);
    if (ex) {
      c.existingId = ex.id;
      if (ex.sale_price === c.price || c.price === null) { c.flags.push('deja_en_bibliotheque'); c.selected = false; }
      else { c.flags.push('prix_different_en_bibliotheque'); c.notes.push(`Prix en bibliothèque : ${ex.sale_price === null ? 'non renseigné' : formatNumber(ex.sale_price, 0)}`); c.selected = false; }
    }
  }

  return {
    fileName, sheet, trades, candidates,
    fileAlerts: result.analysis.fileAlerts.map((a) => a.message),
    stats: {
      lignes, ouvrages: candidates.length,
      prixManquants: candidates.filter((c) => c.flags.includes('prix_manquant')).length,
      prixNuls: candidates.filter((c) => c.flags.includes('prix_nul')).length,
      prixDivergents: candidates.filter((c) => c.flags.includes('prix_divergents')).length,
      doublonsFusionnes: candidates.filter((c) => c.flags.includes('doublon_fusionne')).length,
      dejaPresents: candidates.filter((c) => c.existingId).length,
    },
  };
}

/** Ligne à insérer dans la bibliothèque pour un ouvrage retenu (toujours « à vérifier »). */
export function candidateToRow(c: LibraryCandidate, ctx: { orgId: string; currency: string; country: string | null; fileName: string; sheet: string | null; importId: string; date: string }) {
  const flags = c.flags.filter((f) => f !== 'deja_en_bibliotheque').map((f) => FLAG_LABEL[f]);
  return {
    org_id: ctx.orgId, kind: 'article', code: c.code, designation: c.designation, unit: c.unit, category: c.category,
    sale_price: c.price, purchase_price: null, currency: ctx.currency, country: ctx.country,
    price_date: c.price === null ? null : ctx.date,
    source: `DQE « ${ctx.fileName} »${ctx.sheet ? `, feuille ${ctx.sheet}` : ''}${c.sources[0].cell ? `, cellule ${c.sources[0].cell}` : ''}`,
    trade: c.trade, section: c.section || null,
    observations: [...flags, ...c.notes].join(' · ') || null,
    validation_status: 'a_verifier',
    source_ref: { file: ctx.fileName, sheet: ctx.sheet, sources: c.sources },
    import_id: ctx.importId,
  };
}
