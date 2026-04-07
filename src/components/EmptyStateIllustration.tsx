interface EmptyStateIllustrationProps {
  type: 'empty-library' | 'no-results' | 'no-activity';
  size?: number;
}

export default function EmptyStateIllustration({ type, size = 120 }: EmptyStateIllustrationProps) {
  if (type === 'empty-library') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="20" y="30" width="16" height="70" rx="3" fill="var(--accent-purple)" fillOpacity="0.25" />
        <rect x="40" y="24" width="14" height="76" rx="3" fill="var(--accent-blue)" fillOpacity="0.3" />
        <rect x="58" y="34" width="16" height="66" rx="3" fill="var(--primary)" fillOpacity="0.2" />
        <rect x="78" y="28" width="14" height="72" rx="3" fill="var(--accent-purple)" fillOpacity="0.15" stroke="var(--accent-purple)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="4 3" />
        <line x1="20" y1="100" x2="92" y2="100" stroke="var(--text-muted)" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="86" cy="22" r="8" fill="var(--accent-blue)" fillOpacity="0.15" stroke="var(--accent-blue)" strokeOpacity="0.4" strokeWidth="1" />
        <path d="M83 22h6M86 19v6" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === 'no-results') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="52" cy="52" r="28" stroke="var(--text-muted)" strokeOpacity="0.3" strokeWidth="2" />
        <circle cx="52" cy="52" r="20" stroke="var(--accent-blue)" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="72" y1="72" x2="96" y2="96" stroke="var(--text-muted)" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" />
        <path d="M44 52h16" stroke="var(--text-muted)" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
        <rect x="16" y="90" width="88" height="8" rx="4" fill="var(--glass-border)" fillOpacity="0.5" />
      </svg>
    );
  }

  /* no-activity */
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect x="25" y="35" width="70" height="55" rx="8" stroke="var(--text-muted)" strokeOpacity="0.25" strokeWidth="1.5" />
      <rect x="35" y="50" width="50" height="6" rx="3" fill="var(--accent-blue)" fillOpacity="0.15" />
      <rect x="35" y="62" width="36" height="6" rx="3" fill="var(--accent-purple)" fillOpacity="0.12" />
      <rect x="35" y="74" width="44" height="6" rx="3" fill="var(--primary)" fillOpacity="0.1" />
      <circle cx="90" cy="35" r="12" fill="var(--accent-blue)" fillOpacity="0.1" stroke="var(--accent-blue)" strokeOpacity="0.25" strokeWidth="1" />
      <path d="M87 35l3 3 6-6" stroke="var(--accent-blue)" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
