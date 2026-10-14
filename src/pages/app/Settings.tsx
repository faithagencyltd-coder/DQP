import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ImageUp, KeyRound, Link2, LogOut, MessageCircle, Plus, RotateCcw, ShieldCheck, Trash2, UserMinus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteRow, insertRow, rpc, updateRow, useAction, useRows } from '../../lib/api';
import { fileUrl, supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { ACTION_LABEL, COUNTRIES, MODULE_LABEL, ROLE_LABEL, fmtDate, fmtDateTime } from '../../lib/labels';
import { useAuth, useOrg } from '../../lib/session';
import { personName, useTeam } from '../../lib/team';
import type { Action, Module, Organization, Role } from '../../lib/types';
import { CURRENCIES, parseNumber } from '../../engine/money';
import { Badge, Button, Card, Confirm, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Tabs, Textarea, useToast } from '../../ui';
import { Allowed } from '../../ui/guard';
import { passwordProblem } from '../public/AuthPages';
import { checkFile } from './Documents';
import { NotificationPrefs } from '../../layouts/Notifications';

type Tab = 'entreprise' | 'equipe' | 'permissions' | 'profil' | 'notifications' | 'securite';

export function SettingsPage() {
  const { can } = useOrg();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('onglet') as Tab) || 'entreprise');
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Entreprise, équipe, permissions, profil, notifications et sécurité." />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'entreprise', label: 'Entreprise' },
        { id: 'equipe', label: 'Équipe', hidden: !can('equipe', 'consulter') },
        { id: 'permissions', label: 'Rôles et permissions', hidden: !can('equipe', 'consulter') },
        { id: 'profil', label: 'Mon profil' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'securite', label: 'Sécurité' },
      ]} />
      {tab === 'entreprise' && <CompanySettings />}
      {tab === 'equipe' && <TeamSettings />}
      {tab === 'permissions' && <PermissionMatrix />}
      {tab === 'profil' && <ProfileSettings />}
      {tab === 'notifications' && <Card title="Notifications" subtitle="Choisissez les événements qui vous sont signalés"><NotificationPrefs /></Card>}
      {tab === 'securite' && <SecuritySettings />}
    </>
  );
}

function CompanySettings() {
  const { org, can, refresh } = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<Organization | null>(org);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  useEffect(() => setF(org), [org]);
  useEffect(() => {
    if (!org?.logo_path) return setLogoUrl(null);
    fileUrl(org.logo_path, 600).then(setLogoUrl, () => setLogoUrl(null));
  }, [org?.logo_path]);
  const editable = can('entreprise', 'modifier');
  const save = useAction(async () => {
    const { error } = await supabase.from('organizations').update({
      name: f!.name.trim(), legal_name: f!.legal_name || null, country: f!.country, currency: f!.currency, city: f!.city || null, address: f!.address || null,
      phone: f!.phone || null, email: f!.email || null, website: f!.website || null, legal_ids: f!.legal_ids.filter((x) => x.label.trim()),
      bank_details: f!.bank_details || null, default_taxes: f!.default_taxes, quote_validity_days: f!.quote_validity_days, payment_terms: f!.payment_terms,
      payment_days: f!.payment_days ?? 30, reminder_before_days: f!.reminder_before_days ?? 7, reminder_every_days: f!.reminder_every_days ?? 15,
      quote_footer: f!.quote_footer || null, metre_rules: f!.metre_rules, pricing_method: f!.pricing_method,
    }).eq('id', f!.id);
    if (error) throw new Error(errorMessage(error));
    await qc.invalidateQueries({ queryKey: ['memberships'] });
    refresh();
  }, { success: 'Paramètres de l’entreprise enregistrés.' });
  const uploadLogo = async (file: File) => {
    const chk = await checkFile(file);
    if ('error' in chk) return toast('bad', chk.error);
    if (!['image/png', 'image/jpeg'].includes(chk.mime)) return toast('bad', 'Le logo doit être une image PNG ou JPG.');
    if (file.size > 2 * 1048576) return toast('bad', 'Logo trop lourd (2 Mo maximum).');
    const path = `${org!.id}/logo/${crypto.randomUUID()}.${chk.mime === 'image/png' ? 'png' : 'jpg'}`;
    const up = await supabase.storage.from('documents').upload(path, file, { contentType: chk.mime });
    if (up.error) return toast('bad', errorMessage(up.error));
    const { error } = await supabase.from('organizations').update({ logo_path: path }).eq('id', org!.id);
    if (error) return toast('bad', errorMessage(error));
    if (org!.logo_path) await supabase.storage.from('documents').remove([org!.logo_path]);
    await qc.invalidateQueries({ queryKey: ['memberships'] });
    refresh();
    toast('ok', 'Logo enregistré : il apparaîtra sur vos devis et DQE.');
  };
  if (!f) return <Spinner />;
  const set = (k: keyof Organization) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const rules = f.metre_rules;
  const pm = f.pricing_method;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {!editable && <Notice tone="warn" className="lg:col-span-2">Lecture seule : seuls les rôles autorisés modifient les informations de l’entreprise.</Notice>}
      <Card title="Identité">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">{logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[12px] text-faint">Aucun logo</span>}</div>
          <div>
            <input ref={logoInput} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadLogo(e.target.files[0])} />
            <Button size="sm" icon={<ImageUp size={15} />} disabled={!editable || !can('documents', 'creer')} onClick={() => logoInput.current?.click()}>Changer le logo</Button>
            <p className="mt-1 text-[12px] text-muted">PNG ou JPG, 2 Mo maximum. Imprimé sur les PDF.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom commercial" required><Input disabled={!editable} value={f.name} onChange={set('name')} /></Field>
          <Field label="Raison sociale"><Input disabled={!editable} value={f.legal_name ?? ''} onChange={set('legal_name')} /></Field>
          <Field label="Pays"><Select disabled={!editable} value={f.country} onChange={set('country')}>{Object.entries(COUNTRIES).filter(([k]) => k !== 'AUTRE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Ville"><Input disabled={!editable} value={f.city ?? ''} onChange={set('city')} /></Field>
          <Field label="Adresse" className="sm:col-span-2"><Input disabled={!editable} value={f.address ?? ''} onChange={set('address')} /></Field>
          <Field label="Téléphone"><Input disabled={!editable} value={f.phone ?? ''} onChange={set('phone')} /></Field>
          <Field label="E-mail professionnel"><Input type="email" disabled={!editable} value={f.email ?? ''} onChange={set('email')} /></Field>
          <Field label="Site Internet" className="sm:col-span-2"><Input disabled={!editable} value={f.website ?? ''} onChange={set('website')} /></Field>
        </div>
      </Card>
      <Card title="Informations légales" subtitle="Libellés adaptés à votre pays : IFU, RCCM, NCC, CC… Ajoutez ou retirez des champs.">
        <div className="space-y-2">
          {f.legal_ids.map((x, i) => (
            <div key={i} className="flex gap-2">
              <Input disabled={!editable} className="!w-40" value={x.label} placeholder="Libellé" onChange={(e) => setF({ ...f, legal_ids: f.legal_ids.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
              <Input disabled={!editable} value={x.value} placeholder="Valeur" onChange={(e) => setF({ ...f, legal_ids: f.legal_ids.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })} />
              {editable && <button aria-label="Retirer" className="p-2 text-faint hover:text-bad-600" onClick={() => setF({ ...f, legal_ids: f.legal_ids.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>}
            </div>
          ))}
          {editable && <Button size="sm" icon={<Plus size={14} />} onClick={() => setF({ ...f, legal_ids: [...f.legal_ids, { label: '', value: '' }] })}>Ajouter un champ légal</Button>}
        </div>
        <Field label="Coordonnées bancaires (imprimées en pied de page)" className="mt-4"><Textarea disabled={!editable} rows={2} value={f.bank_details ?? ''} onChange={set('bank_details')} /></Field>
      </Card>
      <Card title="Devis et facturation">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Devise"><Select disabled={!editable} value={f.currency} onChange={set('currency')}>{Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.label} ({c.symbol})</option>)}</Select></Field>
          <Field label="Validité des devis (jours)"><Input disabled={!editable} type="number" min={1} max={365} value={f.quote_validity_days} onChange={(e) => setF({ ...f, quote_validity_days: Number(e.target.value) || 30 })} /></Field>
          <Field label="Conditions de paiement par défaut" className="sm:col-span-2"><Input disabled={!editable} value={f.payment_terms} onChange={set('payment_terms')} /></Field>
          <Field label="Délai de paiement des factures (jours)"><Input disabled={!editable} type="number" min={0} max={365} value={f.payment_days ?? 30} onChange={(e) => setF({ ...f, payment_days: Number(e.target.value) || 0 })} /></Field>
          <Field label="Alerte d’échéance (jours avant)"><Input disabled={!editable} type="number" min={0} max={90} value={f.reminder_before_days ?? 7} onChange={(e) => setF({ ...f, reminder_before_days: Number(e.target.value) || 0 })} /></Field>
          <Field label="Rappel des factures échues (tous les … jours)"><Input disabled={!editable} type="number" min={1} max={180} value={f.reminder_every_days ?? 15} onChange={(e) => setF({ ...f, reminder_every_days: Number(e.target.value) || 15 })} /></Field>
          <Field label="Mention de pied de page" className="sm:col-span-2"><Input disabled={!editable} value={f.quote_footer ?? ''} onChange={set('quote_footer')} placeholder="Ex. Merci de votre confiance" /></Field>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Taxes appliquées par défaut aux nouveaux devis</div>
            {f.default_taxes.map((t, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <Input disabled={!editable} value={t.label} onChange={(e) => setF({ ...f, default_taxes: f.default_taxes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <Input disabled={!editable} className="!w-24 text-right" inputMode="decimal" defaultValue={String(t.rate).replace('.', ',')} onBlur={(e) => setF({ ...f, default_taxes: f.default_taxes.map((x, j) => (j === i ? { ...x, rate: parseNumber(e.target.value) ?? 0 } : x)) })} /> %
                {editable && <button aria-label="Retirer" className="p-2 text-faint hover:text-bad-600" onClick={() => setF({ ...f, default_taxes: f.default_taxes.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>}
              </div>
            ))}
            {editable && <Button size="sm" icon={<Plus size={14} />} onClick={() => setF({ ...f, default_taxes: [...f.default_taxes, { label: 'Taxe', rate: 0 }] })}>Ajouter une taxe</Button>}
            <p className="mt-2 text-[12px] text-muted">Taux à vérifier selon votre pays et votre statut fiscal (TVA 18 % au Bénin et en Côte d’Ivoire pour les assujettis).</p>
          </div>
        </div>
      </Card>
      <Card title="Règles de calcul" subtitle="Valeurs par défaut des nouveaux métrés et ouvrages composés (§11.4, §14.4)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Arrondi des quantités"><Select disabled={!editable} value={rules.decimals} onChange={(e) => setF({ ...f, metre_rules: { ...rules, decimals: Number(e.target.value) } })}>{[0, 1, 2, 3].map((d) => <option key={d} value={d}>{d} décimale(s)</option>)}</Select></Field>
          <Field label="Seuil de déduction des ouvertures (m²)"><Input disabled={!editable} inputMode="decimal" defaultValue={String(rules.openingThreshold).replace('.', ',')} onBlur={(e) => setF({ ...f, metre_rules: { ...rules, openingThreshold: parseNumber(e.target.value) ?? 0 } })} /></Field>
          <Field label="Méthode de prix"><Select disabled={!editable} value={pm.method} onChange={(e) => setF({ ...f, pricing_method: { ...pm, method: e.target.value as 'additive' | 'coefficient' } })}><option value="additive">Pertes + frais indirects + marge</option><option value="coefficient">Coefficient de vente K</option></Select></Field>
          {pm.method === 'coefficient' ? (
            <Field label="Coefficient K"><Input disabled={!editable} inputMode="decimal" defaultValue={String(pm.coefficient).replace('.', ',')} onBlur={(e) => setF({ ...f, pricing_method: { ...pm, coefficient: parseNumber(e.target.value) ?? 1 } })} /></Field>
          ) : (
            <>
              <Field label="Frais indirects %"><Input disabled={!editable} inputMode="decimal" defaultValue={String(pm.indirectPct)} onBlur={(e) => setF({ ...f, pricing_method: { ...pm, indirectPct: parseNumber(e.target.value) ?? 0 } })} /></Field>
              <Field label="Marge %"><Input disabled={!editable} inputMode="decimal" defaultValue={String(pm.marginPct)} onBlur={(e) => setF({ ...f, pricing_method: { ...pm, marginPct: parseNumber(e.target.value) ?? 0 } })} /></Field>
              <Field label="Marge calculée sur"><Select disabled={!editable} value={pm.marginBase} onChange={(e) => setF({ ...f, pricing_method: { ...pm, marginBase: e.target.value as 'cout' | 'vente' } })}><option value="cout">le prix de revient</option><option value="vente">le prix de vente</option></Select></Field>
            </>
          )}
        </div>
      </Card>
      {editable && <div className="lg:col-span-2"><Button variant="primary" loading={save.isPending} disabled={f.name.trim().length < 2} onClick={() => save.mutate(undefined)}>Enregistrer les paramètres</Button></div>}
    </div>
  );
}

interface Invitation { id: string; email: string; role: Role; token: string; created_at: string; expires_at: string; accepted_at: string | null }

function TeamSettings() {
  const { org, role: myRole, plan, can } = useOrg();
  const { session } = useAuth();
  const team = useTeam(org?.id);
  const qc = useQueryClient();
  const invitations = useRows<Invitation>('invitations', org?.id, { order: ['created_at', false], enabled: can('equipe', 'creer') || can('equipe', 'administrer') });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('metreur');
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const toast = useToast();
  const base = `${window.location.origin}${window.location.pathname}#/invitation/`;
  const invite = useAction(async () => insertRow<Invitation>('invitations', { org_id: org!.id, email: email.trim().toLowerCase(), role, invited_by: session!.user.id }), { success: 'Invitation créée.', invalidate: [['invitations']] });
  const setMemberRole = useAction((a: { user: string; role: Role }) => rpc('set_member_role', { p_org: org!.id, p_user: a.user, p_role: a.role }), { success: 'Rôle modifié.', invalidate: [['team']] });
  const removeMember = useAction((user: string) => rpc('remove_member', { p_org: org!.id, p_user: user }), { success: 'Membre retiré.', invalidate: [['team']] });
  const delInvite = useAction((id: string) => deleteRow('invitations', id), { success: 'Invitation supprimée.', invalidate: [['invitations']] });
  const pending = (invitations.data ?? []).filter((i) => !i.accepted_at);
  const admin = can('equipe', 'administrer');
  const copy = (url: string) => navigator.clipboard.writeText(url).then(() => toast('ok', 'Lien copié.'), () => toast('bad', 'Copie impossible : sélectionnez le lien manuellement.'));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card title={`Membres (${team.data?.length ?? 0}${plan?.max_users ? ` / ${plan.max_users} inclus dans l’offre` : ''})`} bodyClass="p-0">
        {team.isLoading ? <Spinner /> : (team.data ?? []).map((m) => (
          <div key={m.user_id} className="flex flex-wrap items-center gap-3 border-b border-line-2 px-4 py-3 last:border-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-100 text-[13px] font-bold text-navy-700">{personName(m.profile).slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-navy-900">{personName(m.profile)}{m.user_id === session?.user.id && <span className="ml-1 text-[12px] font-normal text-muted">(vous)</span>}</div>
              <div className="truncate text-[12px] text-muted">{m.profile?.email} · depuis le {fmtDate(m.created_at)}</div>
            </div>
            {admin && m.user_id !== session?.user.id && (m.role !== 'proprietaire' || myRole === 'proprietaire') ? (
              <Select className="!h-9 !w-60" value={m.role} onChange={(e) => setMemberRole.mutate({ user: m.user_id, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'proprietaire' || myRole === 'proprietaire').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            ) : <Badge tone={m.role === 'proprietaire' ? 'signal' : 'navy'}>{ROLE_LABEL[m.role]}</Badge>}
            {(admin || m.user_id === session?.user.id) && (
              <button aria-label="Retirer le membre" title={m.user_id === session?.user.id ? 'Quitter l’entreprise' : 'Retirer de l’entreprise'} className="p-2 text-faint hover:text-bad-600" onClick={() => setRemoving(m.user_id)}><UserMinus size={16} /></button>
            )}
          </div>
        ))}
      </Card>
      <div className="space-y-4">
        <Allowed module="equipe" action="creer" hide>
          <Card title="Inviter un collaborateur">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); invite.mutate(undefined, { onSuccess: (i) => { setLink({ email: i.email, url: base + i.token }); setEmail(''); } }); }}>
              <Field label="Adresse e-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Rôle"><Select value={role} onChange={(e) => setRole(e.target.value as Role)}>{(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'proprietaire').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
              <Button type="submit" variant="primary" icon={<Link2 size={16} />} loading={invite.isPending}>Créer le lien d’invitation</Button>
              <p className="text-[12px] text-muted">Le lien est valable 7 jours et ne fonctionne que pour cette adresse e-mail. Transmettez-le par e-mail ou WhatsApp : l’envoi automatique des courriels n’est pas encore activé.</p>
            </form>
          </Card>
        </Allowed>
        {pending.length > 0 && (
          <Card title={`Invitations en attente (${pending.length})`} bodyClass="p-0">
            {pending.map((i) => (
              <div key={i.id} className="flex items-center gap-2 border-b border-line-2 px-4 py-2.5 text-[13px] last:border-0">
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{i.email}</div><div className="text-[12px] text-muted">{ROLE_LABEL[i.role]} · {new Date(i.expires_at) < new Date() ? <span className="text-bad-600">expirée</span> : `expire le ${fmtDate(i.expires_at)}`}</div></div>
                <button aria-label="Copier le lien" title="Copier le lien" className="p-1.5 text-ink-2 hover:bg-navy-50" onClick={() => void copy(base + i.token)}><Copy size={15} /></button>
                <Allowed module="equipe" action="supprimer" hide><button aria-label="Supprimer l’invitation" className="p-1.5 text-faint hover:text-bad-600" onClick={() => delInvite.mutate(i.id)}><Trash2 size={15} /></button></Allowed>
              </div>
            ))}
          </Card>
        )}
      </div>
      {link && (
        <Modal title="Lien d’invitation" onClose={() => setLink(null)}>
          <p className="text-[14px] text-ink-2">Transmettez ce lien à <b>{link.email}</b> :</p>
          <div className="mt-3 break-all rounded-lg bg-navy-50 p-3 font-mono text-[12.5px]">{link.url}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={<Copy size={15} />} onClick={() => void copy(link.url)}>Copier</Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Rejoignez ${org?.name} sur PLANORA BTP : ${link.url}`)}`} target="_blank" rel="noreferrer"><Button icon={<MessageCircle size={15} />}>Partager sur WhatsApp</Button></a>
            <a href={`mailto:${link.email}?subject=${encodeURIComponent(`Invitation PLANORA BTP — ${org?.name}`)}&body=${encodeURIComponent(`Bonjour,\n\nRejoignez l’espace ${org?.name} sur PLANORA BTP : ${link.url}\n\nLe lien est valable 7 jours.`)}`}><Button>Préparer un e-mail</Button></a>
          </div>
        </Modal>
      )}
      {removing && (
        <Confirm title={removing === session?.user.id ? 'Quitter l’entreprise ?' : 'Retirer ce membre ?'} danger confirmLabel={removing === session?.user.id ? 'Quitter' : 'Retirer'} onClose={() => setRemoving(null)}
          onConfirm={() => removeMember.mutateAsync(removing).then(() => qc.invalidateQueries({ queryKey: ['memberships'] }))}>
          {removing === session?.user.id ? 'Vous n’aurez plus accès aux données de cette entreprise.' : 'Il perdra immédiatement l’accès aux données de l’entreprise. Ses contributions restent enregistrées.'}
        </Confirm>
      )}
    </div>
  );
}

const MODULES: Module[] = ['clients', 'projets', 'documents', 'prix', 'metres', 'dqe', 'devis', 'plans', 'factures', 'depenses', 'achats', 'stocks', 'planning', 'rapports', 'equipe', 'entreprise', 'abonnement'];
const ACTIONS: Action[] = ['consulter', 'creer', 'modifier', 'supprimer', 'valider', 'exporter', 'partager', 'administrer'];
const ROLES: Role[] = ['administrateur', 'directeur', 'architecte', 'metreur', 'conducteur', 'comptable', 'commercial', 'lecteur'];

function PermissionMatrix() {
  const { org, can } = useOrg();
  const [role, setRole] = useState<Role>('metreur');
  const perms = useRows<{ org_id: string; role: Role; module: string; actions: Action[] }>('role_permissions', org?.id, { filter: (q) => q.eq('role', role), key: [role] });
  const qc = useQueryClient();
  const admin = can('equipe', 'administrer');
  const toast = useToast();
  const [reset, setReset] = useState(false);
  const toggle = async (module: Module, action: Action, on: boolean) => {
    const row = (perms.data ?? []).find((p) => p.module === module);
    if (!row) return toast('bad', 'Ce module n’est pas configurable pour ce rôle : rétablissez les droits par défaut puis ajustez.');
    let actions = on ? [...new Set([...row.actions, action])] : row.actions.filter((a) => a !== action);
    if (on && action !== 'consulter') actions = [...new Set([...actions, 'consulter' as Action])];
    if (!on && action === 'consulter') actions = [];
    const { error, count } = await supabase.from('role_permissions').update({ actions }, { count: 'exact' }).eq('org_id', org!.id).eq('role', role).eq('module', module);
    if (error || !count) return toast('bad', errorMessage(error ?? 'Modification refusée'));
    qc.invalidateQueries({ queryKey: ['role_permissions'] });
    qc.invalidateQueries({ queryKey: ['role-permissions'] });
  };
  const map = new Map((perms.data ?? []).map((p) => [p.module, p.actions]));
  return (
    <Card title="Matrice des permissions" subtitle="Configurable pour votre entreprise. Le propriétaire a toujours tous les droits. Vérifiées par le serveur à chaque opération."
      actions={<div className="flex gap-2"><Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="!w-64">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>{admin && <Button icon={<RotateCcw size={15} />} onClick={() => setReset(true)}>Droits par défaut</Button>}</div>} bodyClass="p-0">
      {!admin && <Notice tone="navy" className="m-4">Consultation seule : le droit « administrer l’équipe » est nécessaire pour modifier la matrice.</Notice>}
      {perms.isLoading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead><tr className="border-b border-line bg-navy-50/60 text-[11.5px] uppercase text-muted"><th className="px-4 py-2 text-left">Module</th>{ACTIONS.map((a) => <th key={a} className="px-2 text-center">{ACTION_LABEL[a]}</th>)}</tr></thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m} className="border-b border-line-2">
                  <td className="px-4 py-2 font-medium">{MODULE_LABEL[m]}</td>
                  {ACTIONS.map((a) => (
                    <td key={a} className="text-center">
                      <input type="checkbox" aria-label={`${MODULE_LABEL[m]} — ${ACTION_LABEL[a]}`} className="h-4 w-4 accent-[var(--color-signal-500)]" disabled={!admin || !map.has(m)} checked={(map.get(m) ?? []).includes(a)} onChange={(e) => void toggle(m, a, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-3 text-[12px] text-muted">Les cases grisées correspondent aux modules non prévus pour ce rôle par défaut. Les droits par projet viendront avec la gestion des équipes de chantier.</p>
      {reset && <Confirm title={`Rétablir les droits par défaut — ${ROLE_LABEL[role]} ?`} confirmLabel="Rétablir" onClose={() => setReset(false)} onConfirm={() => rpc('reset_role_permissions', { p_org: org!.id, p_role: role }).then(() => { qc.invalidateQueries({ queryKey: ['role_permissions'] }); qc.invalidateQueries({ queryKey: ['role-permissions'] }); })}>Les personnalisations de ce rôle seront perdues.</Confirm>}
    </Card>
  );
}

function ProfileSettings() {
  const { profile, refreshProfile } = useAuth();
  const [f, setF] = useState({ first_name: profile?.first_name ?? '', last_name: profile?.last_name ?? '', phone: profile?.phone ?? '' });
  useEffect(() => { if (profile) setF({ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone ?? '' }); }, [profile]);
  const save = useAction(() => updateRow('profiles', profile!.id, { first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone.trim() || null }), { success: 'Profil enregistré.' });
  return (
    <Card title="Mon profil" className="max-w-xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom"><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
        <Field label="Nom"><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
        <Field label="Téléphone" className="sm:col-span-2"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Adresse e-mail" className="sm:col-span-2" hint="Identifiant de connexion."><Input disabled value={profile?.email ?? ''} /></Field>
      </div>
      <Button className="mt-4" variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: refreshProfile })}>Enregistrer</Button>
    </Card>
  );
}

function SecuritySettings() {
  const toast = useToast();
  const { signOut } = useAuth();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string; created_at: string }[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [globalOut, setGlobalOut] = useState(false);
  const loadFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { setMfaError(errorMessage(error)); setFactors([]); return; }
    setFactors((data?.totp ?? []) as never);
  };
  useEffect(() => { void loadFactors(); }, []);
  const changePassword = async () => {
    const pb = passwordProblem(p1);
    if (pb) return toast('bad', pb);
    if (p1 !== p2) return toast('bad', 'Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return toast('bad', errorMessage(error));
    setP1(''); setP2('');
    toast('ok', 'Mot de passe modifié.');
  };
  const startEnroll = async () => {
    setMfaError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `PLANORA ${new Date().toLocaleDateString('fr-FR')}` });
    if (error) return setMfaError(errorMessage(error));
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const verify = async () => {
    if (!enroll) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    if (error) return setMfaError(errorMessage(error));
    setEnroll(null);
    setCode('');
    toast('ok', 'Double authentification activée.');
    void loadFactors();
  };
  const unenroll = async (id: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast('bad', errorMessage(error));
    toast('ok', 'Double authentification désactivée.');
    void loadFactors();
  };
  const verified = (factors ?? []).filter((f) => f.status === 'verified');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><KeyRound size={17} className="text-signal-500" /> Mot de passe</span>}>
        <div className="grid gap-3">
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, lettres et chiffres."><Input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
          <Field label="Confirmer"><Input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
          <div><Button variant="primary" loading={busy} disabled={!p1} onClick={() => void changePassword()}>Modifier le mot de passe</Button></div>
        </div>
      </Card>
      <Card title={<span className="flex items-center gap-2"><ShieldCheck size={17} className="text-signal-500" /> Double authentification</span>} subtitle="Code à 6 chiffres d’une application (Google Authenticator, Microsoft Authenticator…)">
        {factors === null ? <Spinner /> : verified.length ? (
          <div className="space-y-2">
            <Notice tone="ok" title="Activée">À chaque connexion, le code de votre application est demandé. Les données ne sont accessibles qu’après cette vérification.</Notice>
            {verified.map((f) => <div key={f.id} className="flex items-center justify-between text-[13.5px]"><span>{f.friendly_name ?? 'Application'} · {fmtDateTime(f.created_at)}</span><Button size="sm" variant="danger" onClick={() => void unenroll(f.id)}>Désactiver</Button></div>)}
          </div>
        ) : enroll ? (
          <div className="space-y-3">
            <p className="text-[13.5px] text-ink-2">Scannez ce code avec votre application, puis saisissez le code à 6 chiffres affiché.</p>
            <img src={enroll.qr} alt="Code QR de la double authentification" className="h-44 w-44 rounded-lg border border-line bg-white p-2" />
            <p className="break-all text-[12px] text-muted">Ou saisissez la clé : <span className="font-mono">{enroll.secret}</span></p>
            <Field label="Code à 6 chiffres"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button variant="primary" disabled={code.length !== 6} onClick={() => void verify()}>Vérifier et activer</Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => void startEnroll()}>Activer la double authentification</Button>
        )}
        {mfaError && <Notice tone="bad" className="mt-3">{mfaError}</Notice>}
      </Card>
      <Card title="Sessions" className="lg:col-span-2">
        <p className="text-[13.5px] text-ink-2">Déconnectez votre compte de tous les appareils (téléphone perdu, ordinateur partagé…). Vous devrez vous reconnecter partout.</p>
        <Button className="mt-3" variant="danger" icon={<LogOut size={15} />} onClick={() => setGlobalOut(true)}>Se déconnecter de tous les appareils</Button>
        {globalOut && <Confirm title="Se déconnecter de tous les appareils ?" danger confirmLabel="Déconnecter partout" onClose={() => setGlobalOut(false)} onConfirm={async () => { await supabase.auth.signOut({ scope: 'global' }); await signOut(); }}>Toutes vos sessions ouvertes seront fermées.</Confirm>}
      </Card>
      <Notice tone="navy" className="lg:col-span-2" title="Protection contre les tentatives répétées">Le serveur d’authentification limite le nombre de tentatives de connexion et d’envoi de courriels par adresse et par adresse IP.</Notice>
    </div>
  );
}

