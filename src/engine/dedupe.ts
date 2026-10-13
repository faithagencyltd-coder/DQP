// Détection des doublons de contacts (§7.3) : même nom normalisé, même téléphone
// (chiffres seuls, sans indicatif) ou même e-mail.

export interface ContactLike {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(sarl|sa|sas|ets|etablissements?|ste|societe)\b/g, '').replace(/[^a-z0-9]/g, '');

export const normPhone = (s?: string | null) => {
  const d = (s ?? '').replace(/\D/g, '');
  // Bénin (+229) et Côte d'Ivoire (+225) : on compare les 8 derniers chiffres.
  return d.length >= 8 ? d.slice(-8) : '';
};

export const normEmail = (s?: string | null) => (s ?? '').trim().toLowerCase();

export function findDuplicates<T extends ContactLike>(candidate: ContactLike, existing: T[]): { contact: T; reasons: string[] }[] {
  const n = normName(candidate.name), p = normPhone(candidate.phone), e = normEmail(candidate.email);
  const out: { contact: T; reasons: string[] }[] = [];
  for (const c of existing) {
    if (candidate.id && c.id === candidate.id) continue;
    const reasons: string[] = [];
    if (n && normName(c.name) === n) reasons.push('même nom');
    if (p && normPhone(c.phone) === p) reasons.push('même téléphone');
    if (e && normEmail(c.email) === e) reasons.push('même e-mail');
    if (reasons.length) out.push({ contact: c, reasons });
  }
  return out;
}
