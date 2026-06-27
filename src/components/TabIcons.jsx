const common = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function OverviewIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

function AssetsIcon() {
  return (
    <svg {...common}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      <rect x="16" y="11" width="6" height="5" rx="1" />
    </svg>
  )
}

function AnalysisIcon() {
  return (
    <svg {...common}>
      <path d="M21 12A9 9 0 1 1 12 3v9z" />
      <path d="M21 12a9 9 0 0 1-9 9" />
    </svg>
  )
}

function RouteIcon() {
  return (
    <svg {...common}>
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M8.5 16 15.5 8" />
    </svg>
  )
}

function RatesIcon() {
  return (
    <svg {...common}>
      <path d="M16 3 20 7l-4 4" />
      <path d="M20 7H8a4 4 0 0 0-4 4" />
      <path d="M8 21 4 17l4-4" />
      <path d="M4 17h12a4 4 0 0 0 4-4" />
    </svg>
  )
}

function EntryIcon() {
  return (
    <svg {...common}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function PortfolioIcon() {
  return (
    <svg {...common}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

export const TAB_ICONS = {
  portfolio: PortfolioIcon,
  overview: OverviewIcon,
  assets: AssetsIcon,
  analysis: AnalysisIcon,
  route: RouteIcon,
  rates: RatesIcon,
  entry: EntryIcon,
  settings: SettingsIcon,
}
