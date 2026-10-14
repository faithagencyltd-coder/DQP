// Photos de chantier (§19.3) : vérification du type réel, réduction à 1600 px (JPEG) avant envoi
// pour ménager les forfaits mobiles et le stockage, dépôt privé « <entreprise>/suivi/<chantier>/ ».

import { useQuery } from '@tanstack/react-query';
import { checkFile } from '../pages/app/Documents';
import { errorMessage } from './errors';
import { supabase } from './supabase';
import type { Photo } from './types';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];
export const PHOTO_ACCEPT = IMAGE_EXT.map((e) => '.' + e).join(',');

export async function compressImage(file: Blob, max = 1600, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', quality));
}

/** Dépose des photos ; renvoie les entrées à enregistrer (chemin + légende vide). */
export async function uploadPhotos(orgId: string, projectId: string, files: File[]): Promise<Photo[]> {
  const out: Photo[] = [];
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!IMAGE_EXT.includes(ext)) throw new Error(`« ${f.name} » : seules les photos JPG, PNG ou WebP sont acceptées.`);
    const chk = await checkFile(f);
    if ('error' in chk) throw new Error(`« ${f.name} » : ${chk.error}`);
    const blob = await compressImage(f);
    const path = `${orgId}/suivi/${projectId}/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from('documents').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) {
      if (out.length) await supabase.storage.from('documents').remove(out.map((p) => p.path));
      throw new Error(errorMessage(up.error));
    }
    out.push({ path, caption: null });
  }
  return out;
}

export async function removePhotos(paths: string[]) {
  if (paths.length) await supabase.storage.from('documents').remove(paths);
}

export async function photoBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('documents').download(path);
  if (error || !data) throw new Error(errorMessage(error ?? 'Photo indisponible'));
  return data;
}

export const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Lecture impossible'));
  r.readAsDataURL(b);
});

/** Images des photos (téléchargement authentifié, jamais de lien public), en data URL. */
export function usePhotoUrls(paths: string[]) {
  const q = useQuery({
    queryKey: ['photos', ...paths],
    enabled: paths.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(paths.map((p) => photoBlob(p).then(blobToDataUrl).then((u) => [p, u] as const).catch(() => null)));
      return new Map(entries.filter((e): e is readonly [string, string] => !!e));
    },
  });
  return q.data ?? new Map<string, string>();
}
