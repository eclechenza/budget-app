import { CURRENCIES, sumByCur, monthLabel, closedMonths } from './storage'
import { getRatesForMonth, monthFromKey, loadRatesStore } from './rates'

// ─── Цвета валют — единые для всех графиков ────────────────────────────────
export const CUR_COLORS = {
  KZT: '#1D9E75',
  RUB: '#5B6FE6',
  USD: '#E6A435',
}

// ─── Конвертация ────────────────────────────────────────────────────────────
// rates: { KZT: 1, RUB: <кол-во KZT за 1 RUB>, USD: <кол-во KZT за 1 USD> }
export function convertCurrency(amount, from, to, rates) {
  if (!amount) return 0
  if (from === to) return amount
  if (!rates || rates[from] == null || rates[to] == null) return 0
  const kzt = amount * rates[from]        // → KZT
  return kzt / rates[to]                  // → целевая валюта
}

// ─── Вспомогательные суммы ──────────────────────────────────────────────────
export function sumExpensesByCur(expObj, state) {
  const r = { KZT: 0, RUB: 0, USD: 0 }
  ;(state.expenseCategories || []).forEach((cat) => {
    const cur = (state.expenseCur || {})[cat] || 'KZT'
    r[cur] += +expObj[cat] || 0
  })
  return r
}

// Возвраты хранятся по имени категории, аналогично расходам
export function sumRefundsByCur(refundsObj, state) {
  const r = { KZT: 0, RUB: 0, USD: 0 }
  ;(state.refundCategories || []).forEach((cat) => {
    const cur = (state.refundCur || {})[cat] || 'KZT'
    r[cur] += +refundsObj[cat] || 0
  })
  return r
}

// Чистые расходы = расходы − возвраты
export function netExpensesByCur(expObj, refundsObj) {
  const exp = typeof expObj.KZT === 'number' ? expObj : { KZT: 0, RUB: 0, USD: 0 }
  const ref = typeof refundsObj.KZT === 'number' ? refundsObj : { KZT: 0, RUB: 0, USD: 0 }
  return { KZT: exp.KZT - ref.KZT, RUB: exp.RUB - ref.RUB, USD: exp.USD - ref.USD }
}

// ─── Агрегация по месяцам ───────────────────────────────────────────────────
export function getMonthlyData(state) {
  const months = closedMonths(state)
  const permanentSources = state.sources.filter((s) => {
    const t = (state.sourceType || {})[s]
    return !t || t === 'Постоянный'
  })
  const refundMapping     = state.refundMapping || {}
  const mappedRefundCats  = (state.refundCategories || []).filter((rc) => refundMapping[rc])
  const ratesStore        = loadRatesStore()

  return months.map((mk, i) => {
    const e = state.entries[mk]
    const prev = i > 0 ? state.entries[months[i - 1]] : null
    const { year, month } = monthFromKey(mk)
    const rates = getRatesForMonth(year, month, ratesStore)

    const hiddenAccounts = e.hiddenAccounts || []
    const hiddenSources  = e.hiddenSources  || []
    const hiddenExpenses = e.hiddenExpenses || []
    const hiddenRefunds  = e.hiddenRefunds  || []

    const visibleAccounts       = state.accounts.filter(a => !hiddenAccounts.includes(a))
    const visibleSources        = state.sources.filter(s => !hiddenSources.includes(s))
    const visiblePermanent      = permanentSources.filter(s => !hiddenSources.includes(s))
    const visibleExpCats        = (state.expenseCategories || []).filter(c => !hiddenExpenses.includes(c))
    const visibleRefCats        = (state.refundCategories  || []).filter(c => !hiddenRefunds.includes(c))
    const visibleMappedRefCats  = mappedRefundCats.filter(rc => !hiddenRefunds.includes(rc))

    const visStateForExp = { ...state, expenseCategories: visibleExpCats }
    const visStateForRef = { ...state, refundCategories: visibleRefCats }
    const visStateForMappedRef = { ...state, refundCategories: visibleMappedRefCats }

    const expenses      = sumExpensesByCur(e.expenses || {}, visStateForExp)
    const refunds       = sumRefundsByCur(e.refunds  || {}, visStateForRef)
    const mappedRefunds = sumRefundsByCur(e.refunds  || {}, visStateForMappedRef)

    const netExpensesMapped = { KZT: 0, RUB: 0, USD: 0 }
    visibleExpCats.forEach((cat) => {
      const expCur = (state.expenseCur || {})[cat] || 'KZT'
      const expVal = +(e.expenses || {})[cat] || 0
      const refVal = visibleRefCats
        .filter((rc) => refundMapping[rc] === cat)
        .reduce((sum, rc) => {
          const refCur = (state.refundCur || {})[rc] || 'KZT'
          const refAmt = +(e.refunds || {})[rc] || 0
          return sum + convertCurrency(refAmt, refCur, expCur, rates || {})
        }, 0)
      netExpensesMapped[expCur] += expVal - refVal
    })

    return {
      key: mk,
      label: monthLabel(mk),
      shortLabel: monthLabel(mk).split(' ')[0],
      rates,
      balances:         sumByCur(e.balances || {}, visibleAccounts,  'account', state),
      income:           sumByCur(e.income   || {}, visibleSources,   'source',  state),
      permanentIncome:  sumByCur(e.income   || {}, visiblePermanent, 'source',  state),
      expenses,
      refunds,
      mappedRefunds,
      netExpensesMapped,
      netExpenses:  netExpensesByCur(expenses, refunds),
      prevBalances: prev
        ? sumByCur(prev.balances || {}, state.accounts.filter(a => !(prev.hiddenAccounts || []).includes(a)), 'account', state)
        : null,
    }
  })
}

// Сводный признак: есть ли курсы хотя бы для одного месяца с не-KZT валютой.
// Используется чартами, чтобы показать подсказку «открой вкладку Курс валют»,
// когда зафиксированных курсов нет, но они нужны для конвертации.
export function hasRatesForMixedCurrency(monthlyData) {
  const needsRates = monthlyData.some((d) =>
    CURRENCIES.some((c) => c !== 'KZT' && (
      (d.balances[c] || 0) || (d.income[c] || 0) ||
      (d.expenses[c] || 0) || (d.netExpensesMapped[c] || 0)
    ))
  )
  if (!needsRates) return true
  return monthlyData.every((d) => d.rates != null)
}

// ─── Расчёт сбережений за месяц ─────────────────────────────────────────────
// Возвращает всё в KZT для единого сравнения
export function calculateSavings(monthData, rates) {
  const toKZT = (v, c) => convertCurrency(v, c, 'KZT', rates)

  const incKZT    = CURRENCIES.reduce((s, c) => s + toKZT(monthData.income[c]      || 0, c), 0)
  const expKZT    = CURRENCIES.reduce((s, c) => s + toKZT(monthData.expenses[c]    || 0, c), 0)
  const refKZT    = CURRENCIES.reduce((s, c) => s + toKZT((monthData.refunds  || { KZT: 0, RUB: 0, USD: 0 })[c] || 0, c), 0)
  const netExpKZT = expKZT - refKZT
  const savedKZT  = incKZT - netExpKZT
  const rate = incKZT > 0 ? Math.round((savedKZT / incKZT) * 100) : null

  return {
    incKZT:    Math.round(incKZT),
    expKZT:    Math.round(expKZT),
    refKZT:    Math.round(refKZT),
    netExpKZT: Math.round(netExpKZT),
    savedKZT:  Math.round(savedKZT),
    rate,
  }
}

// ─── Общие опции для осей (переиспользуются в компонентах) ──────────────────
export function xAxisOpts() {
  return {
    ticks: { font: { size: 11 }, maxRotation: 45, autoSkip: true },
    grid: { display: false },
  }
}

export function yAxisOpts(fmtFn) {
  return {
    ticks: { callback: fmtFn, font: { size: 11 } },
    grid: { color: 'rgba(128,128,128,.1)' },
  }
}
