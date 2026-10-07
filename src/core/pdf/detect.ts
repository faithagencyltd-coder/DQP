// Détection dans un plan PDF (§4, §6) à partir du texte réellement écrit :
// type de page, niveau, échelle, cartouche, pièces et surfaces, surfaces totales,
// équipements annotés, repères de menuiseries, cotes. Chaque résultat garde sa page,
// sa zone et le texte lu. Ce qui est déduit est « à vérifier », ce qui manque reste vide.

import { formatNumber, newId, normalizeText } from '../format';
import type { Alert, BuildingElement, Confidence, DetectedInfo, DetectedValue, PlanPage, PlanPageKind, SourceFile, SourceRef } from '../types';
import { groupLines, type PdfRaw, type TextLine } from './extract';

export interface PlanAnalysis {
  pages: PlanPage[];
  elements: BuildingElement[];
  detected: DetectedInfo[];
  alerts: Alert[];
}

const NUM = String.raw`\d{1,4}(?:[.,]\d{1,2})?`;
const SURFACE_IN = new RegExp(String.raw`(?:\bS(?:urf\.?|urface)?\s*[=:]\s*)?(${NUM})\s*m\s*[²2](?!\d)`, 'i');
const SURFACE_S = new RegExp(String.raw`\bS\s*[=:]\s*(${NUM})\b`, 'i');
const SURFACE_ONLY = new RegExp(String.raw`^(?:S(?:urf\.?|urface)?\s*[=:]?\s*)?(${NUM})\s*(?:m\s*[²2])?$`, 'i');

/** Vocabulaire des pièces → catégorie. L'ordre compte (le plus précis d'abord). */
const ROOMS: [RegExp, string][] = [
  [/\bsalle a manger\b|\bs a m\b/, 'Salle à manger'],
  [/\bsalle de bains?\b|\bs ?d ?b\b|\bsalle d eau\b|\bs ?d ?e\b/, 'Salle de bain'],
  [/\bsuite parentale\b/, 'Chambre'],
  [/\bchambres?\b|\bch\s?\d+\b/, 'Chambre'],
  [/\bsejour\b|\bsalon\b|\bliving\b/, 'Séjour'],
  [/\bcuisine\b|\bkitchenette\b|\boffice\b/, 'Cuisine'],
  [/\bw ?c\b|\btoilettes?\b/, 'WC'],
  [/\bdouches?\b/, 'Douche'],
  [/\bdressing\b|\bplacard\b/, 'Dressing'],
  [/\bbureau\b|\bbibliotheque\b/, 'Bureau'],
  [/\bmagasin\b|\breserve\b|\bcellier\b|\bdepot\b/, 'Rangement'],
  [/\bbuanderie\b/, 'Buanderie'],
  [/\bgarage\b|\bparking\b/, 'Garage'],
  [/\bterrasse\b/, 'Terrasse'],
  [/\bbalcon\b|\bloggia\b/, 'Balcon'],
  [/\bveranda\b|\bvarangue\b|\bpreau\b/, 'Véranda'],
  [/\bhall\b|\bentree\b|\baccueil\b|\bvestibule\b/, 'Hall / entrée'],
  [/\bdegagement\b|\bcirculation\b|\bcouloir\b|\bpalier\b/, 'Circulation'],
  [/\bescaliers?\b|\bcage d escalier\b/, 'Escalier'],
  [/\blocal technique\b|\blocal poubelles?\b|\bguerite\b/, 'Local technique'],
  [/\bsalle de (?:jeux|sport|reunion|classe|cours)\b/, 'Salle'],
  [/\bpatio\b|\bcour\b/, 'Cour'],
];

/** Étiquettes d'appareils écrites sur le plan. */
const EQUIPMENT: [RegExp, string][] = [
  [/\blavabos?\b|\blav\b|\bvasques?\b/, 'Lavabo'],
  [/\beviers?\b/, 'Évier'],
  [/\bbaignoires?\b/, 'Baignoire'],
  [/\bbac a douche\b|\bdouches?\b/, 'Douche'],
  [/\bw ?c\b|\bcuvettes?\b/, 'WC'],
  [/\burinoirs?\b/, 'Urinoir'],
  [/\bchauffe eau\b|\bballon\b/, 'Chauffe-eau'],
  [/\bclim\b|\bsplit\b|\bclimatiseurs?\b/, 'Climatiseur'],
];

const LEVEL = /(rez\s*de\s*chaussee|\brdc\b|\br\s*\+\s*\d+\b|\b\d+\s*(?:er|e|eme)\s*etage\b|\bsous\s*sol\b|\bmezzanine\b|\btoiture\b)/;
const MONTH_YEAR = /^(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4}$/;

function norm(s: string) {
  return normalizeText(s).replace(/\+/g, ' + ').replace(/\s+/g, ' ').trim();
}

export function normalizeLevel(text: string): string | undefined {
  const n = norm(text);
  const m = LEVEL.exec(n);
  if (!m) return undefined;
  const v = m[1];
  if (/rez|rdc/.test(v)) return 'Rez-de-chaussée';
  const r = /r \+ ?(\d+)/.exec(v);
  if (r) return `R+${r[1]}`;
  const e = /(\d+) ?(er|e|eme) etage/.exec(v);
  if (e) return `R+${e[1]}`;
  if (/sous sol/.test(v)) return 'Sous-sol';
  if (/mezzanine/.test(v)) return 'Mezzanine';
  if (/toiture/.test(v)) return 'Toiture';
  return undefined;
}

function pageKind(title: string): PlanPageKind {
  const n = norm(title);
  if (/\bmasse\b|situation|implantation/.test(n)) return 'masse';
  if (/fondation|semelle/.test(n)) return 'fondation';
  if (/electri|eclairage|courant fort/.test(n)) return 'electricite';
  if (/plomberie|sanitaire|assainissement|evacuation/.test(n)) return 'plomberie';
  if (/structure|coffrage|ferraillage|charpente/.test(n)) return 'structure';
  if (/toiture/.test(n)) return 'toiture';
  if (/\bcoupe\b/.test(n)) return 'coupe';
  if (/facade|elevation/.test(n)) return 'facade';
  if (/\bplan\b|\bvue en plan\b/.test(n)) return 'plan';
  return 'autre';
}

const toNum = (s: string) => Number(s.replace(',', '.'));

/** Dimension de menuiserie en cm (« 90 », « 0,90 » → 90). */
function cm(s: string): number {
  const v = toNum(s);
  return v < 10 ? Math.round(v * 100) : v;
}

export function analyzePlan(raw: PdfRaw, file: SourceFile): PlanAnalysis {
  const pages: PlanPage[] = [];
  const elements: BuildingElement[] = [];
  const detected: DetectedInfo[] = [];
  const alerts: Alert[] = [];
  const alert = (severity: Alert['severity'], code: string, message: string, source?: SourceRef) =>
    alerts.push({ id: newId('a'), severity, code, message, source });
  const ref = (page: number, l: Pick<TextLine, 'x' | 'y' | 'w' | 'h' | 'text'>): SourceRef => ({
    fileId: file.id,
    fileName: file.name,
    page,
    bbox: [round1(l.x), round1(l.y), round1(l.w), round1(l.h)],
    text: l.text,
  });
  const seenInfo = new Set<string>();
  const info = (key: DetectedInfo['key'], value: string, status: Confidence, source: SourceRef, note?: string) => {
    const v = value.trim().replace(/\s+/g, ' ');
    if (!v || seenInfo.has(key + '|' + norm(v))) return;
    seenInfo.add(key + '|' + norm(v));
    detected.push({ key, value: v, status, source, note });
  };
  const scannedPages: number[] = [];

  for (const p of raw.pages) {
    const lines = groupLines(p.texts);
    const scanned = p.texts.length === 0 && p.images > 0;
    if (scanned) scannedPages.push(p.number);

    // --- Titre, type de page, niveau, échelle ---
    const titleLine = lines
      .filter((l) => /^(plan|vue|coupe|fa[cç]ade|elevation|élévation)\b/i.test(l.text) && l.text.length < 80)
      .sort((a, b) => b.h - a.h)[0];
    const kind = titleLine ? pageKind(titleLine.text) : 'autre';
    const levelLine = (titleLine && normalizeLevel(titleLine.text) ? titleLine : undefined) ?? lines.find((l) => l.text.length < 40 && normalizeLevel(l.text));
    const level = levelLine ? normalizeLevel(levelLine.text) : undefined;
    let scale: number | undefined;
    for (const l of lines) {
      const m = /[ée]chelle\s*[:=]?\s*1\s*[/:]\s*(\d{1,4})\b/i.exec(l.text) ?? /\b(?:ech|éch|scale)\.?\s*1\s*[/:]\s*(\d{1,4})\b/i.exec(l.text);
      if (m) {
        scale = Number(m[1]);
        break;
      }
    }
    if (level && !elements.some((e) => e.kind === 'level' && e.category === level)) {
      elements.push({
        id: newId('e'),
        kind: 'level',
        name: levelLine!.text,
        category: level,
        props: {},
        status: levelLine === titleLine ? 'confirmed' : 'to_verify',
        note: levelLine === titleLine ? 'Niveau lu dans le titre de la planche' : 'Niveau lu dans un texte de la planche',
        source: ref(p.number, levelLine!),
        edits: [],
      });
    }

    // --- Cartouche et informations de projet ---
    lines.forEach((l, i) => {
      const t = l.text;
      const next = () => {
        const below = lines.filter((o) => o !== lines[i] && o.y > l.y && o.y - (l.y + l.h) < l.h * 1.6 && Math.abs(o.x - l.x) < l.h * 6);
        return below.sort((a, b) => a.y - b.y)[0]?.text ?? '';
      };
      const field = (re: RegExp) => {
        const m = re.exec(t);
        if (!m) return null;
        const v = (m[1] ?? '').trim().replace(/^[:\-–]\s*/, '');
        return v || next();
      };
      let v: string | null;
      if ((v = field(/ma[iî]tre\s+d['’ ]\s*ouvrage\s*[:\-–]?\s*(.*)$/i)) || (v = field(/^(?:client|propri[ée]taire)\s*[:\-–]\s*(.*)$/i))) info('client', v, 'confirmed', ref(p.number, l));
      else if ((v = field(/^architecte\s*[:\-–]?\s*(.*)$/i)) || (v = field(/ma[iî]tre\s+d['’ ]\s*[œo]e?uvre\s*[:\-–]?\s*(.*)$/i))) info('architect', v, 'confirmed', ref(p.number, l));
      else if ((v = field(/^projet\s*[:\-–]\s*(.*)$/i))) info('title', v, 'confirmed', ref(p.number, l));
      else if (/^projet de construction\b/i.test(t)) info('title', t, 'confirmed', ref(p.number, l));
      else if ((v = field(/^(?:lieu|localisation|site|adresse|situation)\s*[:\-–]\s*(.*)$/i))) info('location', v, 'confirmed', ref(p.number, l));
      else if ((v = field(/^date\s*[:\-–]\s*(.*)$/i))) info('date', v, 'confirmed', ref(p.number, l));
      else if (MONTH_YEAR.test(norm(t))) info('date', t, 'confirmed', ref(p.number, l));
    });

    // --- Surfaces totales écrites ---
    for (const l of lines) {
      const n = norm(l.text);
      const key = /(surface|superficie)\s+(habitable|batie|totale|utile|de plancher|hors oeuvre( nette| brute)?|du terrain|de la parcelle)|\bshon\b|\bshob\b|\bemprise( au sol)?\b/.exec(n);
      if (!key) continue;
      const m = SURFACE_IN.exec(l.text) ?? new RegExp(String.raw`[:=]\s*(${NUM})`).exec(l.text);
      const name = l.text.replace(SURFACE_IN, '').replace(/[:=]\s*[\d.,]+\s*$/, '').replace(/[:=\s]+$/, '').trim();
      elements.push({
        id: newId('e'),
        kind: 'surface_total',
        name: name || key[0],
        category: key[0].replace(/\b\w/g, (c) => c.toUpperCase()),
        level,
        props: { surface: m ? { value: toNum(m[1]), unit: 'm²', status: 'confirmed', source: ref(p.number, l) } : { value: null, unit: 'm²', status: 'undetermined', note: 'Valeur non écrite à côté du libellé' } },
        status: 'confirmed',
        source: ref(p.number, l),
        edits: [],
      });
    }

    // --- Pièces, surfaces, équipements, menuiseries, cotes ---
    const used = new Set<TextLine>();
    const surfaceOnly = lines.filter((l) => l.angle === 0 && SURFACE_ONLY.test(l.text) && /m\s*[²2]|^S/i.test(l.text));
    let dimensions = 0;

    for (const l of lines) {
      if (used.has(l) || l.text.length > 40) continue;
      const n = norm(l.text);
      if (/(surface|superficie|shon|shob|emprise|echelle|plan |projet|architecte|ouvrage)/.test(n)) continue;
      if (/^\d{1,2}[.,]\d{2}$/.test(l.text) || /^\d{2,4}$/.test(l.text)) {
        dimensions++;
        continue;
      }

      // Repères de menuiseries : P1, F2, PF1… éventuellement suivis de leurs dimensions.
      const op = /^(PF|PE|PO|CF|FP|BV|P|F)\s*-?\s*(\d{1,2})\b\s*(?:[:(\-]?\s*(\d{2,3}|\d[.,]\d{1,2})\s*[x×*]\s*(\d{2,3}|\d[.,]\d{1,2})\s*\)?)?$/.exec(l.text.trim());
      if (op) {
        const code = `${op[1]}${op[2]}`;
        const cat = op[1] === 'PF' ? 'Porte-fenêtre' : /^(F|FP|BV)$/.test(op[1]) ? 'Fenêtre' : 'Porte';
        const props: Record<string, DetectedValue> = { code: { value: code, status: 'confirmed', source: ref(p.number, l) } };
        if (op[3] && op[4]) {
          props.largeur = { value: cm(op[3]), unit: 'cm', status: 'confirmed', source: ref(p.number, l) };
          props.hauteur = { value: cm(op[4]), unit: 'cm', status: 'confirmed', source: ref(p.number, l) };
        } else {
          props.largeur = { value: null, unit: 'cm', status: 'undetermined', note: 'Dimension non écrite à côté du repère' };
          props.hauteur = { value: null, unit: 'cm', status: 'undetermined', note: 'Dimension non écrite à côté du repère' };
        }
        elements.push({ id: newId('e'), kind: 'opening', name: l.text, category: cat, level, props, status: 'to_verify', note: 'Repère de menuiserie lu sur le plan ; le symbole graphique n’est pas encore reconnu (phase 3).', source: ref(p.number, l), edits: [] });
        used.add(l);
        continue;
      }

      const room = ROOMS.find(([re]) => re.test(n));
      const equip = EQUIPMENT.find(([re]) => re.test(n));
      const inline = SURFACE_IN.exec(l.text) ?? SURFACE_S.exec(l.text);

      // Surface : sur la même ligne (🟢), sinon le texte de surface le plus proche (🟠).
      let surface: DetectedValue | undefined;
      if (room || (equip && inline)) {
        if (inline) {
          surface = { value: toNum(inline[1]), unit: 'm²', status: 'confirmed', source: ref(p.number, l) };
        } else {
          const near = surfaceOnly
            .filter((s) => !used.has(s) && s !== l)
            .map((s) => ({ s, d: Math.hypot(s.x + s.w / 2 - (l.x + l.w / 2), s.y + s.h / 2 - (l.y + l.h / 2)), below: s.y >= l.y - l.h * 0.5 }))
            .filter((c) => c.below && c.d < l.h * 5)
            .sort((a, b) => a.d - b.d)[0];
          if (near) {
            used.add(near.s);
            const m = SURFACE_ONLY.exec(near.s.text)!;
            surface = { value: toNum(m[1]), unit: 'm²', status: 'to_verify', source: ref(p.number, near.s), note: `Surface « ${near.s.text} » rattachée à « ${l.text} » par proximité` };
          }
        }
      }

      if (room && (surface || !equip)) {
        const name = l.text.replace(SURFACE_IN, '').replace(SURFACE_S, '').trim() || l.text;
        elements.push({
          id: newId('e'),
          kind: 'room',
          name,
          category: room[1],
          level,
          props: { surface: surface ?? { value: null, unit: 'm²', status: 'undetermined', note: 'Aucune surface écrite pour cette pièce' } },
          status: 'confirmed',
          note: 'Nom de pièce lu sur le plan',
          source: ref(p.number, l),
          edits: [],
        });
        used.add(l);
      } else if (equip) {
        elements.push({
          id: newId('e'),
          kind: 'equipment',
          name: l.text,
          category: equip[1],
          level,
          props: {},
          status: 'to_verify',
          note: equip[1] === 'WC' || equip[1] === 'Douche' ? `Étiquette « ${l.text} » : appareil ou pièce, à vérifier` : 'Étiquette lue sur le plan ; le symbole graphique n’est pas encore reconnu (phase 3).',
          source: ref(p.number, l),
          edits: [],
        });
        used.add(l);
      }
    }

    const roomsHere = elements.filter((e) => e.kind === 'room' && e.source.page === p.number);
    pages.push({
      number: p.number,
      kind: kind === 'autre' && roomsHere.length ? 'plan' : kind,
      title: titleLine?.text,
      level,
      scale,
      width: round1(p.width),
      height: round1(p.height),
      textLines: lines.length,
      vectorOps: p.vectorOps,
      images: p.images,
      scanned,
      dimensions,
    });

    // Contrôle : somme des surfaces des pièces / surface totale écrite sur la même planche.
    const totals = elements.filter((e) => e.kind === 'surface_total' && e.source.page === p.number && /habitable|utile/i.test(e.name) && typeof e.props.surface?.value === 'number');
    const known = roomsHere.filter((r) => typeof r.props.surface.value === 'number');
    if (totals.length && known.length) {
      const sum = known.reduce((s, r) => s + (r.props.surface.value as number), 0);
      const t = totals[0].props.surface.value as number;
      if (Math.abs(sum - t) > Math.max(0.5, t * 0.02)) {
        alert(
          'warning',
          'ROOM_SURFACES',
          `Page ${p.number} : la somme des surfaces des pièces (${formatNumber(sum)} m², ${known.length} pièce(s)) diffère de la « ${totals[0].name} » écrite (${formatNumber(t)} m²). ` +
            (known.length < roomsHere.length ? `${roomsHere.length - known.length} pièce(s) n’ont pas de surface écrite.` : 'Vérifier les surfaces ou le périmètre de la surface totale.'),
          totals[0].source,
        );
      }
    }
  }

  // --- Alertes globales ---
  if (scannedPages.length) {
    alert('error', 'SCANNED', `Page(s) scannée(s) (image sans texte) : ${scannedPages.join(', ')}. Leur contenu n’est pas lu dans cette version : la reconnaissance de texte (OCR) est prévue. Rien n’est déduit de ces pages.`);
  }
  if (raw.pages.length && raw.pages.every((p) => p.texts.length === 0 && p.images === 0)) {
    alert('error', 'EMPTY', 'Aucun texte ni image trouvé dans ce PDF.');
  }
  const rooms = elements.filter((e) => e.kind === 'room');
  const planPages = pages.filter((p) => p.kind === 'plan');
  if (planPages.length && !rooms.length) {
    alert('warning', 'NO_ROOMS', 'Aucune pièce reconnue sur les planches de plan : les noms de pièces sont peut-être dessinés comme des tracés et non comme du texte.');
  }
  const noSurface = rooms.filter((r) => r.props.surface.value === null);
  if (noSurface.length) {
    alert('info', 'ROOM_NO_SURFACE', `${noSurface.length} pièce(s) sans surface écrite sur le plan : ${noSurface.map((r) => r.name).join(', ')}. Surface « non déterminée ».`);
  }
  const proximity = rooms.filter((r) => r.props.surface.status === 'to_verify');
  if (proximity.length) {
    alert('info', 'ROOM_PROXIMITY', `${proximity.length} surface(s) rattachée(s) à leur pièce par proximité du texte : à vérifier sur l’aperçu du plan.`);
  }
  const dupes = new Map<string, number>();
  for (const r of rooms) {
    const k = `${r.level ?? ''}|${norm(r.name)}`;
    dupes.set(k, (dupes.get(k) ?? 0) + 1);
  }
  for (const [k, c] of dupes) if (c > 1) alert('info', 'ROOM_DUPLICATE', `La pièce « ${k.split('|')[1].toUpperCase()} » apparaît ${c} fois${k.split('|')[0] ? ` au niveau ${k.split('|')[0]}` : ''}.`);
  const dims = pages.reduce((s, p) => s + p.dimensions, 0);
  if (dims) alert('info', 'DIMENSIONS', `${dims} cote(s) lue(s) sur les plans. Elles seront exploitées par le métré intelligent (phase 3) ; elles ne sont pas utilisées pour l’instant.`);
  const noScale = planPages.filter((p) => !p.scale);
  if (noScale.length) alert('info', 'NO_SCALE', `Échelle non écrite sur la/les planche(s) ${noScale.map((p) => p.number).join(', ')} : « non déterminée ».`);

  return { pages, elements, detected, alerts };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
