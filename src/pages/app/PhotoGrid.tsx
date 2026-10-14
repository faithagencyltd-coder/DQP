// Galerie de photos de chantier : ajout (réduites avant envoi), légende, retrait, agrandissement.

import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { PHOTO_ACCEPT, removePhotos, uploadPhotos, usePhotoUrls } from '../../lib/photos';
import { useOrg } from '../../lib/session';
import type { Photo } from '../../lib/types';
import { Button, Modal, useToast } from '../../ui';

export function PhotoGrid({ projectId, photos, editable, onChange }: { projectId: string; photos: Photo[]; editable: boolean; onChange: (p: Photo[]) => Promise<unknown> }) {
  const { org } = useOrg();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState<Photo | null>(null);
  const urls = usePhotoUrls(photos.map((p) => p.path));
  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    let added: Photo[] = [];
    try {
      added = await uploadPhotos(org!.id, projectId, files);
      await onChange([...photos, ...added]);
      toast('ok', `${added.length} photo(s) ajoutée(s).`);
    } catch (e) {
      if (added.length) await removePhotos(added.map((p) => p.path)).catch(() => {});
      toast('bad', errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async (p: Photo) => {
    try {
      await onChange(photos.filter((x) => x.path !== p.path));
      await removePhotos([p.path]).catch(() => {});
    } catch (e) { toast('bad', errorMessage(e)); }
  };
  const caption = (p: Photo, c: string) => {
    if ((p.caption ?? '') === c) return;
    onChange(photos.map((x) => (x.path === p.path ? { ...x, caption: c || null } : x))).catch((e) => toast('bad', errorMessage(e)));
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <figure key={p.path} className="overflow-hidden rounded-lg border border-line bg-white">
            <button type="button" className="block aspect-[4/3] w-full bg-navy-50" onClick={() => setBig(p)} aria-label="Agrandir la photo">
              {urls.get(p.path) ? <img src={urls.get(p.path)} alt={p.caption ?? 'Photo du chantier'} className="h-full w-full object-cover" /> : <span className="text-[12px] text-muted">Chargement…</span>}
            </button>
            <figcaption className="flex items-center gap-1 p-1.5">
              {editable ? <input aria-label="Légende de la photo" className="cell-input min-w-0 flex-1 text-[12px]" defaultValue={p.caption ?? ''} placeholder="Légende" onBlur={(e) => caption(p, e.target.value.trim())} />
                : <span className="flex-1 truncate text-[12px] text-muted">{p.caption ?? ''}</span>}
              {editable && <button type="button" aria-label="Retirer la photo" className="p-1 text-faint hover:text-bad-600" onClick={() => remove(p)}><Trash2 size={14} /></button>}
            </figcaption>
          </figure>
        ))}
      </div>
      {!photos.length && !editable && <p className="text-[13px] text-muted">Aucune photo.</p>}
      {editable && (
        <div className="mt-3">
          <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple className="hidden" aria-label="Fichiers photo" onChange={(e) => add([...(e.target.files ?? [])])} />
          <Button size="sm" icon={<Camera size={15} />} loading={busy} onClick={() => input.current?.click()}>Ajouter des photos</Button>
          <span className="ml-2 text-[12px] text-muted">JPG, PNG ou WebP ; réduites à 1600 px avant envoi. 30 photos au plus.</span>
        </div>
      )}
      {big && urls.get(big.path) && (
        <Modal size="xl" title={big.caption || 'Photo du chantier'} onClose={() => setBig(null)}>
          <img src={urls.get(big.path)} alt={big.caption ?? 'Photo du chantier'} className="mx-auto max-h-[75vh] w-auto" />
        </Modal>
      )}
    </div>
  );
}
