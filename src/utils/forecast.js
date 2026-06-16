import { CURRENCIES, closedMonths } from './storage'
import { getMonthlyData } from './analytics'

export function fmtInput(val) {
  if (val === '' || val == null) return ''
  const s = String(val)
  const [int, dec] = s.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return dec !== undefined ? formatted + '.' + dec : formatted
}

export function parseInput(str) {
  return str.replace(/[ \s]/g, '')
}

export const DEFAULTS = {
  KZT: { rate: 14.1, inflation: 11 },
  RUB: { rate: 13.5, inflation: 11 },
  USD: { rate: 0,    inflation: 3  },
}

export const CUR_TABS = [
  { id: 'KZT', label: '₸' },
  { id: 'RUB', label: '₽' },
  { id: 'USD', label: '$' },
]

export function pluralYears(n) {
  if (n === 1) return 'год'
  if (n < 5)  return 'года'
  return 'лет'
}

export function getInitialCapital(state) {
  const months = closedMonths(state)
  const r = { KZT: 0, RUB: 0, USD: 0 }
  if (!months.length) return r
  const lastE = state.entries[months[months.length - 1]]
  state.accounts.forEach((a) => {
    const t = (state.accountType || {})[a]
    if (t !== 'Вклад' && t !== 'Инвестиция') return
    const cur = (state.accountCur || {})[a] || 'KZT'
    r[cur] += +(lastE.balances || {})[a] || 0
  })
  return r
}

export function getAvgSavings(state) {
  const lastSix = getMonthlyData(state).slice(-6)
  const r = { KZT: 0, RUB: 0, USD: 0 }
  if (!lastSix.length) return r

  const freelanceSources = new Set(state.sources.filter((s) => s === 'Фриланс'))

  lastSix.forEach((md) => {
    const e = state.entries[md.key]
    const inc = { KZT: 0, RUB: 0, USD: 0 }
    state.sources.forEach((s) => {
      if (freelanceSources.has(s)) return
      const c = (state.sourceCur || {})[s] || 'KZT'
      inc[c] += +(e.income || {})[s] || 0
    })
    CURRENCIES.forEach((c) => {
      r[c] += inc[c] - (md.netExpensesMapped[c] || 0)
    })
  })

  CURRENCIES.forEach((c) => { r[c] = Math.round(r[c] / lastSix.length) })
  return r
}

export function calcProjection(capital, savings, annualRate, annualInflation, years, compound) {
  const monthlyRate = annualRate / 100 / 12
  const monthlyInfl = annualInflation / 100 / 12
  const totalMonths = years * 12

  const nominals = []
  const reals    = []
  const labels   = []

  let cap = capital
  const initCap = capital

  for (let m = 1; m <= totalMonths; m++) {
    if (compound) {
      cap = cap * (1 + monthlyRate) + savings
    } else {
      cap = cap + initCap * monthlyRate + savings
    }
    const real = monthlyInfl > 0
      ? cap / Math.pow(1 + monthlyInfl, m)
      : cap

    if (m % 12 === 0) {
      const y = m / 12
      nominals.push(Math.round(cap))
      reals.push(Math.round(real))
      labels.push(`${y} ${pluralYears(y)}`)
    }
  }

  const finalNominal = nominals[nominals.length - 1] ?? capital
  const finalReal    = reals[reals.length - 1]    ?? capital
  return { nominals, reals, labels, finalNominal, finalReal }
}
