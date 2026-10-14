// Logo PLANORA BTP : un « P » tracé comme un plan, souligné d'une ligne de cote orange.
// Lisible en petit, sur fond clair comme sur fond sombre (§2.2).

export function LogoMark({ size = 32, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill={dark ? '#ffffff' : '#0f1f38'} />
      <path d="M21 47V15h14.5a10.5 10.5 0 0 1 0 21H21" fill="none" stroke={dark ? '#0f1f38' : '#ffffff'} strokeWidth="5.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M21 53.5h22M21 51v5M43 51v5" stroke="#f26a1b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ dark = false, size = 32, subtitle = true }: { dark?: boolean; size?: number; subtitle?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} dark={dark} />
      <span className="leading-none">
        <span className={`block text-[17px] font-extrabold tracking-[0.06em] ${dark ? 'text-white' : 'text-navy-900'}`}>
          PLANORA <span className="text-signal-500">BTP</span>
        </span>
        {subtitle && <span className={`mt-1 block text-[10.5px] font-medium ${dark ? 'text-white/60' : 'text-muted'}`}>Du plan au chantier</span>}
      </span>
    </span>
  );
}
