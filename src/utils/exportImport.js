const EXPORT_VERSION = 1
const ROUTE_KEY = 'budget_route'
const RATES_KEY = 'budget_rates_history'

function buildExportData(budgetState) {
  let routeData = null
  let ratesData = null
  try {
    const raw = localStorage.getItem(ROUTE_KEY)
    if (raw) routeData = JSON.parse(raw)
  } catch {}
  try {
    const raw = localStorage.getItem(RATES_KEY)
    if (raw) ratesData = JSON.parse(raw)
  } catch {}
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    budgetState,
    routeData,
    ratesData,
  }
}

export function validateImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Неверный формат файла')
  }
  if (typeof data.version !== 'number') {
    throw new Error('Файл не содержит поле version — возможно, это старый экспорт')
  }
  if (data.version !== EXPORT_VERSION) {
    throw new Error(`Несовместимая версия: ${data.version} (ожидается ${EXPORT_VERSION})`)
  }
  if (!data.budgetState || typeof data.budgetState !== 'object') {
    throw new Error('Файл не содержит данные budgetState')
  }
}

// Returns budgetState after writing routeData/ratesData to localStorage
export function applyImport(data) {
  validateImport(data)
  if (data.routeData && typeof data.routeData === 'object') {
    try {
      localStorage.setItem(ROUTE_KEY, JSON.stringify(data.routeData))
    } catch {}
  }
  if (data.ratesData && typeof data.ratesData === 'object') {
    try {
      localStorage.setItem(RATES_KEY, JSON.stringify(data.ratesData))
    } catch {}
  }
  return data.budgetState
}

export function downloadExport(budgetState) {
  const payload = buildExportData(budgetState)
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `budget-export-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Summary for the confirmation dialog
export function importSummary(data) {
  const s = data.budgetState
  const accounts = (s.accounts || []).length
  const months = Object.keys(s.entries || {}).length
  const hasRoute = !!data.routeData
  return { accounts, months, hasRoute, exportedAt: data.exportedAt }
}
