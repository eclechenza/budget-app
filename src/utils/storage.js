const KEY = 'budget_app'
const OLD_KEYS = ['budget_v3', 'budget_v2']
const CURRENCIES = ['KZT', 'RUB', 'USD']
const SYM = { KZT: '₸', RUB: '₽', USD: '$' }

function defaults() {
  return {
    accounts: [],
    accountCur: {},
    accountType: {},
    accountMeta: {},
    archivedAccounts: [],
    sources: [],
    archivedSources: [],
    sourceCur: {},
    sourceType: {},
    expenseCategories: [],
    expenseCur: {},
    archivedExpenses: [],
    refundCategories: [],
    refundCur: {},
    archivedRefunds: [],
    refundMapping: {},
    inflationRates: { KZT: '', RUB: '', USD: '' },
    entries: {},
  }
}

function migrate(data) {
  const d = defaults()
  if (Array.isArray(data.accounts)) d.accounts = data.accounts
  if (data.accountCur && typeof data.accountCur === 'object') d.accountCur = data.accountCur
  if (data.accountType && typeof data.accountType === 'object') {
    d.accountType = Object.fromEntries(
      Object.entries(data.accountType).map(([k, v]) => [k, v === 'Актив' ? 'Вклад' : v])
    )
  }
  if (data.accountMeta && typeof data.accountMeta === 'object') d.accountMeta = data.accountMeta
  if (Array.isArray(data.archivedAccounts)) d.archivedAccounts = data.archivedAccounts
  if (Array.isArray(data.sources)) d.sources = data.sources
  if (Array.isArray(data.archivedSources)) d.archivedSources = data.archivedSources
  if (data.sourceCur && typeof data.sourceCur === 'object') d.sourceCur = data.sourceCur
  if (data.sourceType && typeof data.sourceType === 'object') d.sourceType = data.sourceType
  if (Array.isArray(data.expenseCategories)) d.expenseCategories = data.expenseCategories
  if (data.expenseCur && typeof data.expenseCur === 'object') d.expenseCur = data.expenseCur
  if (Array.isArray(data.archivedExpenses)) d.archivedExpenses = data.archivedExpenses
  if (Array.isArray(data.refundCategories)) d.refundCategories = data.refundCategories
  if (data.refundCur && typeof data.refundCur === 'object') d.refundCur = data.refundCur
  if (Array.isArray(data.archivedRefunds)) d.archivedRefunds = data.archivedRefunds
  if (data.refundMapping && typeof data.refundMapping === 'object') d.refundMapping = data.refundMapping
  if (data.entries && typeof data.entries === 'object') d.entries = data.entries
  if (data.inflationRates && typeof data.inflationRates === 'object') d.inflationRates = data.inflationRates
  return d
}

export function loadState() {
  try {
    const r = localStorage.getItem(KEY)
    if (r) return migrate(JSON.parse(r))
  } catch (e) {}
  for (const ok of OLD_KEYS) {
    try {
      const r = localStorage.getItem(ok)
      if (r) {
        const m = migrate(JSON.parse(r))
        localStorage.setItem(KEY, JSON.stringify(m))
        return m
      }
    } catch (e) {}
  }
  return defaults()
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {}
}

export function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export function monthLabel(k) {
  const [y, m] = k.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('ru', { month: 'long', year: 'numeric' })
}

export function genMonths(count = 24, future = 0) {
  const result = []
  const now = new Date()
  for (let i = -future; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push({
      k: monthKey(d.getFullYear(), d.getMonth()),
      label: d.toLocaleString('ru', { month: 'long', year: 'numeric' }),
    })
  }
  return result
}

export function fmt(n) {
  return Number(n || 0).toLocaleString('ru')
}

export function curOf(name, type, state) {
  return (type === 'account' ? state.accountCur : state.sourceCur)[name] || 'KZT'
}

export function sym(c) {
  return SYM[c] || c
}

export function sumByCur(obj, names, type, state) {
  const r = { KZT: 0, RUB: 0, USD: 0 }
  names.forEach((n) => {
    r[curOf(n, type, state)] += +obj[n] || 0
  })
  return r
}

export function closedMonths(state) {
  return Object.keys(state.entries)
    .filter((k) => state.entries[k].closed)
    .sort()
}

export { CURRENCIES, SYM }
