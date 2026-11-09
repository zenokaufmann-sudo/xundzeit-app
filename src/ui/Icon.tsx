export type IconName = 'heute' | 'kopf' | 'verlauf' | 'analyse' | 'einstellungen'

const PFADE: Record<IconName, React.ReactNode> = {
  heute: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  kopf: (
    <path d="M8 21v-3.6C5.6 16 4 13.500 4 10.700 4 6.300 7.600 3 12 3s8 3.300 8 7.500l1.500 3.200-1.900.8v2.200c0 1.300-1 2.300-2.300 2.300H15v2" />
  ),
  verlauf: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3.5v4M15 3.5v4" />
    </>
  ),
  analyse: <path d="M4 20V4M4 20h16M8.5 16v-4M13 16V8M17.5 16v-6" />,
  einstellungen: (
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5" />
  ),
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PFADE[name]}
    </svg>
  )
}
