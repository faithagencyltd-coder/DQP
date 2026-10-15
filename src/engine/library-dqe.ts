// DQE ou BPU type construit directement à partir de la bibliothèque des travaux : un lot par corps
// d'état, les sections et l'ordre du DQE d'origine repris quand ils sont connus. Les quantités ne
// sont jamais reprises d'un autre projet : elles restent à saisir. Les prix viennent de la
// bibliothèque, avec leur source ; un prix « à vérifier » le reste sur la ligne.

import { newLine, newLot, type DocBody, type DocLine } from './dqe';

export interface LibraryDqeItem {
  id: string;
  code: string;
  designation: string;
  description?: string | null;
  unit: string;
  kind: 'article' | 'ouvrage';
  category: string;
  trade?: string | null;
  section?: string | null;
  sale_price: number | null;
  currency: string;
  price_date: string | null;
  validation_status?: 'a_verifier' | 'valide' | 'rejete';
  archived_at?: string | null;
  source_ref?: { sources?: { cell: string | null }[] } | null;
}

export interface LibraryDqeOptions {
  /** Corps d'état retenus (vide : tous). */
  trades: string[];
  /** Reprendre les ouvrages encore « à vérifier » (signalés sur leur ligne). */
  includeToVerify: boolean;
  /** Titres de section du DQE d'origine. */
  withSections: boolean;
  currency: string;
}

export interface LibraryDqeStats { ouvrages: number; chiffres: number; aVerifier: number; sansPrix: number; autreDevise: number; ecartes: number }

/** Corps d'état d'un ouvrage (à défaut : sa catégorie). */
export const tradeOf = (i: Pick<LibraryDqeItem, 'trade' | 'category'>) => i.trade?.trim() || i.category || 'Autre';

/** Ligne du fichier d'origine (B133 → 133), pour garder l'ordre du DQE importé. */
function originRow(i: LibraryDqeItem): number {
  const cell = i.source_ref?.sources?.[0]?.cell;
  const m = cell ? /(\d+)$/.exec(cell) : null;
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/** Ouvrages utilisables (non archivés, non rejetés) et leurs corps d'état, dans l'ordre d'origine. */
export function libraryTrades(items: LibraryDqeItem[]): { name: string; count: number; toVerify: number }[] {
  const usable = items.filter((i) => !i.archived_at && i.validation_status !== 'rejete');
  const map = new Map<string, { name: string; count: number; toVerify: number; row: number }>();
  for (const i of usable) {
    const t = tradeOf(i);
    const e = map.get(t) ?? { name: t, count: 0, toVerify: 0, row: Number.POSITIVE_INFINITY };
    e.count++;
    if (i.validation_status === 'a_verifier') e.toVerify++;
    e.row = Math.min(e.row, originRow(i));
    map.set(t, e);
  }
  return [...map.values()].sort((a, b) => a.row - b.row || a.name.localeCompare(b.name, 'fr')).map(({ name, count, toVerify }) => ({ name, count, toVerify }));
}

export function libraryToBody(items: LibraryDqeItem[], opts: LibraryDqeOptions): { body: DocBody; stats: LibraryDqeStats } {
  const stats: LibraryDqeStats = { ouvrages: 0, chiffres: 0, aVerifier: 0, sansPrix: 0, autreDevise: 0, ecartes: 0 };
  const order = libraryTrades(items).map((t) => t.name).filter((t) => !opts.trades.length || opts.trades.includes(t));
  const lots = order.map((trade, li) => {
    const lot = newLot(trade, li);
    const chosen = items
      .filter((i) => !i.archived_at && i.validation_status !== 'rejete' && tradeOf(i) === trade)
      .filter((i) => {
        if (i.validation_status === 'a_verifier' && !opts.includeToVerify) { stats.ecartes++; return false; }
        return true;
      })
      .sort((a, b) => originRow(a) - originRow(b) || a.code.localeCompare(b.code, 'fr', { numeric: true }) || a.designation.localeCompare(b.designation, 'fr'));
    let section: string | null = null;
    for (const i of chosen) {
      const sec = i.section?.trim() || '';
      if (opts.withSections && sec && sec !== section) lot.lines.push(newLine({ kind: 'titre', designation: sec, unit: '' }));
      section = sec;
      const sameCurrency = i.currency === opts.currency;
      const toVerify = i.validation_status === 'a_verifier';
      const notes: string[] = [];
      if (toVerify) notes.push('Prix de bibliothèque « à vérifier »');
      if (i.sale_price !== null && !sameCurrency) notes.push(`Prix en ${i.currency} non repris`);
      const line: DocLine = newLine({
        ref: i.code, designation: i.designation, description: i.description ?? undefined, unit: i.unit, qty: null,
        unitPrice: sameCurrency ? i.sale_price : null,
        ...(sameCurrency && i.sale_price !== null
          ? { priceSource: { kind: i.kind === 'ouvrage' ? 'deboursé' as const : 'bibliotheque' as const, id: i.id, label: `${i.code || i.designation} · ${i.price_date ? i.price_date.slice(0, 10).split('-').reverse().join('/') : 'date inconnue'}${toVerify ? ' · à vérifier' : ''}`, ...(toVerify ? { toVerify: true } : {}) } }
          : {}),
        ...(notes.length ? { note: notes.join(' · ') } : {}),
      });
      lot.lines.push(line);
      stats.ouvrages++;
      if (toVerify) stats.aVerifier++;
      if (i.sale_price === null) stats.sansPrix++;
      else if (!sameCurrency) stats.autreDevise++;
      else stats.chiffres++;
    }
    return lot;
  }).filter((l) => l.lines.some((x) => x.kind === 'ouvrage'));
  return { body: { lots: lots.map((l, i) => ({ ...l, code: `LOT ${String(i + 1).padStart(2, '0')}` })) }, stats };
}
