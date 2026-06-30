import { useState, useMemo, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { fmt, sym, CURRENCIES, closedMonths } from '../utils/storage'
import { convertCurrency } from '../utils/analytics'
import { getRatesForMonth, monthFromKey, listStoredMonths } from '../utils/rates'
import {
  fmtInput, parseInput, DEFAULTS, CUR_TABS,
  getInitialCapital, getAvgSavings,
} from '../utils/forecast'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)

const ROUTE_KEY = 'budget_route'
const BIRTH_KEY = 'budget_birthdate'
const GOAL_COLORS = ['#1D9E75', '#9B59B6', '#E6A435', '#E74C3C', '#2980B9']

function calcAgeAt(birthDateStr, reachDate) {
  if (!birthDateStr) return null
  const [by, bm, bd] = birthDateStr.split('-').map(Number)
  let age = reachDate.getFullYear() - by
  if (reachDate.getMonth() + 1 < bm || (reachDate.getMonth() + 1 === bm && reachDate.getDate() < (bd || 1))) age--
  return age
}

function ageLabel(age) {
  const mod100 = age % 100
  const mod10 = age % 10
  if (mod100 >= 11 && mod100 <= 14) return `${age} лет`
  if (mod10 === 1) return `${age} год`
  if (mod10 >= 2 && mod10 <= 4) return `${age} года`
  return `${age} лет`
}

function loadRoute() {
  try { return JSON.parse(localStorage.getItem(ROUTE_KEY) || '{}') } catch { return {} }
}
function saveRoute(data) {
  try { localStorage.setItem(ROUTE_KEY, JSON.stringify(data)) } catch {}
}

function monthsLabel(n) {
  if (n % 12 === 0) {
    const y = n / 12
    if (y === 1) return '1 год'
    if (y < 5) return `${y} года`
    return `${y} лет`
  }
  if (n % 10 === 1 && n !== 11) return `${n} месяц`
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return `${n} месяца`
  return `${n} месяцев`
}

function monthDateLabel(dateStr) {
  if (!dateStr) return ''
  const [y, m] = dateStr.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('ru', { month: 'long', year: 'numeric' })
}

function defaultDate(offsetMonths = 6) {
  const d = new Date()
  d.setMonth(d.getMonth() + offsetMonths)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function calcRoute(capital, savings, annualRate, annualInflation, compound, totalMonths, expenses, savingsSteps, cur) {
  const monthlyRate = annualRate / 100 / 12
  const annualInflFrac = (annualInflation || 0) / 100
  const now = new Date()

  const expenseMap = {}
  expenses
    .filter((e) => e.currency === cur && e.amount > 0 && e.date)
    .forEach((e) => {
      const [y, m] = e.date.split('-').map(Number)
      const offset = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
      if (offset >= 1 && offset <= totalMonths) {
        expenseMap[offset] = (expenseMap[offset] || 0) + e.amount
      }
    })

  const steps = (savingsSteps || [])
    .filter((s) => s.currency === cur && s.amount > 0 && s.fromDate)
    .map((s) => {
      const [y, m] = s.fromDate.split('-').map(Number)
      const offset = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
      return { startOffset: offset, amount: s.amount }
    })
    .filter((s) => s.startOffset >= 1 && s.startOffset <= totalMonths)
    .sort((a, b) => a.startOffset - b.startOffset)

  const stepStartOffsets = new Set(steps.map((s) => s.startOffset))

  const nominals = []
  const reals = []
  const labels = []
  const expenseIdxs = new Set()
  const stepIdxs = new Set()
  let cap = capital
  const initCap = capital

  for (let m = 1; m <= totalMonths; m++) {
    const activeStep = steps.filter((s) => s.startOffset <= m).pop()
    const monthlySavings = activeStep ? activeStep.amount : savings
    cap = compound
      ? cap * (1 + monthlyRate) + monthlySavings
      : cap + initCap * monthlyRate + monthlySavings
    if (expenseMap[m]) { cap -= expenseMap[m]; expenseIdxs.add(m - 1) }
    if (stepStartOffsets.has(m)) stepIdxs.add(m - 1)
    const real = annualInflFrac > 0 ? cap / Math.pow(1 + annualInflFrac, m / 12) : cap
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1)
    nominals.push(Math.round(cap))
    reals.push(Math.round(real))
    labels.push(d.toLocaleString('ru', { month: 'short', year: '2-digit' }))
  }

  return { nominals, reals, labels, expenseIdxs, savingsIdxs: stepIdxs }
}

function calcRouteCombined(params, compound, totalMonths, expenses, savingsSteps, displayCur, rates) {
  const projs = {}
  CURRENCIES.forEach((c) => {
    const p = params[c]
    projs[c] = calcRoute(p.capital, p.savings, p.rate, p.inflation || 0, compound, totalMonths, expenses, savingsSteps, c)
  })
  const labels = projs.KZT.labels
  const nominals = labels.map((_, i) =>
    Math.round(CURRENCIES.reduce((sum, c) =>
      sum + convertCurrency(projs[c].nominals[i], c, displayCur, rates), 0))
  )
  const annualInflFrac = (params[displayCur]?.inflation || 0) / 100
  const reals = nominals.map((nom, i) =>
    annualInflFrac > 0 ? Math.round(nom / Math.pow(1 + annualInflFrac, (i + 1) / 12)) : nom
  )
  const expenseIdxs = new Set()
  const savingsIdxs = new Set()
  CURRENCIES.forEach((c) => {
    projs[c].expenseIdxs.forEach((idx) => expenseIdxs.add(idx))
    projs[c].savingsIdxs.forEach((idx) => savingsIdxs.add(idx))
  })
  return { nominals, reals, labels, expenseIdxs, savingsIdxs }
}

function migrateGoals(saved) {
  if (!saved) return []
  if (Array.isArray(saved)) return saved
  // migrate old format { KZT: { name, amount }, ... }
  const result = []
  CURRENCIES.forEach((c) => {
    if (saved[c]?.amount > 0) {
      result.push({ id: Date.now() + Math.random(), name: saved[c].name || '', amount: saved[c].amount, currency: c })
    }
  })
  return result
}

export default function FinancialRoute({ state }) {
  const [cur, setCur] = useState('USD')
  const [months, setMonths] = useState(() => loadRoute().months ?? 36)
  const [compound, setCompound] = useState(() => loadRoute().compound ?? true)

  // Прогноз идёт от «сейчас» в будущее — берём САМЫЙ ПОЗДНИЙ зафиксированный курс
  // (а не текущий с API). Если хранилище курсов пустое, фолбэк на последний закрытый месяц
  // через nearest-механизм. Пользователь может переопределить значения вручную.
  const [rates, setRates] = useState(() => {
    const stored = listStoredMonths()
    if (stored.length) {
      const lastKey = stored[stored.length - 1]
      const { year, month } = monthFromKey(lastKey)
      const r = getRatesForMonth(year, month)
      if (r) return r
    }
    const closed = closedMonths(state)
    if (closed.length) {
      const { year, month } = monthFromKey(closed[closed.length - 1])
      const r = getRatesForMonth(year, month)
      if (r) return r
    }
    return { KZT: 1, RUB: 6, USD: 460 }
  })

  function defaultParams() {
    const initCapital = getInitialCapital(state)
    const initSavings = getAvgSavings(state)
    const p = {}
    CURRENCIES.forEach((c) => {
      p[c] = { capital: initCapital[c], savings: Math.max(0, initSavings[c]), rate: DEFAULTS[c].rate, inflation: DEFAULTS[c].inflation }
    })
    return p
  }

  const [params, setParams] = useState(() => {
    const saved = loadRoute().params
    const defaults = defaultParams()
    if (!saved) return defaults
    const merged = {}
    CURRENCIES.forEach((c) => { merged[c] = { ...defaults[c], ...saved[c] } })
    return merged
  })

  function setParam(c, key, val) {
    setParams((prev) => ({ ...prev, [c]: { ...prev[c], [key]: val } }))
  }

  useEffect(() => { saveRoute({ ...loadRoute(), params }) }, [params])
  useEffect(() => { saveRoute({ ...loadRoute(), months }) }, [months])
  useEffect(() => { saveRoute({ ...loadRoute(), compound }) }, [compound])

  function handleResetParams() {
    const p = defaultParams()
    setParams(p)
    setMonths(36)
    setCompound(true)
    const r = loadRoute()
    delete r.params
    delete r.months
    delete r.compound
    saveRoute(r)
  }

  // ── Goals ────────────────────────────────────────────────────────────────────
  const [goals, setGoals] = useState(() => migrateGoals(loadRoute().goals))

  function persistGoals(next) {
    saveRoute({ ...loadRoute(), goals: next })
    return next
  }

  function addGoal() {
    setGoals((prev) => persistGoals([...prev, { id: Date.now(), name: '', amount: 0, currency: cur }]))
  }

  function removeGoal(id) {
    setGoals((prev) => persistGoals(prev.filter((g) => g.id !== id)))
  }

  function updateGoal(id, key, val) {
    setGoals((prev) => persistGoals(prev.map((g) => g.id === id ? { ...g, [key]: val } : g)))
  }

  // ── Savings steps ────────────────────────────────────────────────────────────
  const [savingsSteps, setSavingsSteps] = useState(() => loadRoute().savingsSteps || [])

  useEffect(() => { saveRoute({ ...loadRoute(), savingsSteps }) }, [savingsSteps])

  function addSavingsStep() {
    setSavingsSteps((prev) => [...prev, { id: Date.now(), amount: 0, currency: cur, fromDate: defaultDate() }])
  }

  function removeSavingsStep(id) { setSavingsSteps((prev) => prev.filter((s) => s.id !== id)) }

  function updateSavingsStep(id, key, val) {
    setSavingsSteps((prev) => prev.map((s) => s.id === id ? { ...s, [key]: val } : s))
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState(() => loadRoute().expenses || [])

  useEffect(() => { saveRoute({ ...loadRoute(), expenses }) }, [expenses])

  function addExpense() {
    setExpenses((prev) => [...prev, { id: Date.now(), name: '', amount: 0, currency: cur, date: defaultDate() }])
  }

  function removeExpense(id) { setExpenses((prev) => prev.filter((e) => e.id !== id)) }

  function updateExpense(id, key, val) {
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, [key]: val } : e))
  }

  // ── Projection ───────────────────────────────────────────────────────────────
  const p = params[cur]

  const { nominals, reals, labels, expenseIdxs, savingsIdxs } = useMemo(
    () => calcRoute(p.capital, p.savings, p.rate, p.inflation || 0, compound, months, expenses, savingsSteps, cur),
    [p, compound, months, expenses, savingsSteps, cur]
  )

  const finalNominal = nominals[nominals.length - 1] ?? 0
  const totalContributed = p.capital + p.savings * months
  const interestEarned = finalNominal - totalContributed

  const longNominals = useMemo(
    () => calcRoute(p.capital, p.savings, p.rate, p.inflation || 0, compound, 1200, expenses, savingsSteps, cur).nominals,
    [p, compound, expenses, savingsSteps, cur]
  )

  const goalsWithReach = useMemo(() =>
    goals.map((g) => {
      const convertedAmount = Math.round(convertCurrency(g.amount, g.currency || 'KZT', cur, rates))
      return {
        ...g,
        convertedAmount,
        reachedIdx: longNominals.findIndex((v) => v >= convertedAmount),
      }
    }),
    [goals, longNominals, cur, rates]
  )

  // ── Chart ────────────────────────────────────────────────────────────────────
  const pointColors = nominals.map((_, i) => expenseIdxs.has(i) ? '#D85A30' : savingsIdxs.has(i) ? '#1D9E75' : '#5B6FE6')
  const pointSizes  = nominals.map((_, i) => (expenseIdxs.has(i) || savingsIdxs.has(i)) ? 7 : 3)

  const datasets = [
    {
      label: 'Капитал',
      data: nominals,
      borderColor: '#5B6FE6',
      backgroundColor: '#5B6FE610',
      tension: 0.3,
      fill: false,
      pointRadius: pointSizes,
      pointHoverRadius: 6,
      pointBackgroundColor: pointColors,
      pointBorderColor: pointColors,
      borderWidth: 2,
    },
    ...goalsWithReach.map((g, i) => ({
      label: g.currency !== cur
        ? `${g.name || `Цель ${i + 1}`} (${sym(g.currency)})`
        : (g.name || `Цель ${i + 1}`),
      data: nominals.map((_, idx) => (g.reachedIdx !== -1 && idx > g.reachedIdx) ? null : g.convertedAmount),
      borderColor: GOAL_COLORS[i % GOAL_COLORS.length],
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0,
    })),
  ]

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
      tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y)} ${sym(cur)}` } },
    },
    scales: {
      x: { ticks: { font: { size: 10 }, maxTicksLimit: 12, autoSkip: true }, grid: { display: false } },
      y: {
        ticks: {
          font: { size: 11 },
          callback: (v) => {
            if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
            if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`
            return fmt(v)
          },
        },
        grid: { color: 'rgba(128,128,128,.1)' },
      },
    },
  }

  const curExpenses = expenses.filter((e) => e.currency === cur)

  return (
    <div>
      {/* График */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Прогноз капитала</div>
          <div className="chips" style={{ margin: 0 }}>
            {CUR_TABS.map((t) => (
              <button key={t.id} className={`chip${cur === t.id ? ' active' : ''}`} onClick={() => setCur(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', height: 240 }}>
          <Line data={{ labels, datasets }} options={chartOptions} />
        </div>

        {(expenseIdxs.size > 0 || savingsIdxs.size > 0) && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {expenseIdxs.size > 0 && (
              <div style={{ fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#D85A30', flexShrink: 0 }} />
                Месяцы с запланированными тратами
              </div>
            )}
            {savingsIdxs.size > 0 && (
              <div style={{ fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', flexShrink: 0 }} />
                Месяцы смены ступени сбережений
              </div>
            )}
          </div>
        )}

        <div className="route-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 14 }}>
          {/* Tile 1: итоги */}
          <div style={{ background: 'var(--bg-tile)', border: '0.5px solid rgba(128,128,128,.15)', borderRadius: 12, padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#999' }}>Капитал</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(finalNominal)} {sym(cur)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#999' }}>Заработано %</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{interestEarned >= 0 ? '+' : ''}{fmt(Math.round(interestEarned))} {sym(cur)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: '#999' }}>Внесено средств</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(Math.round(totalContributed))} {sym(cur)}</span>
            </div>
          </div>
          {/* Tile 2: цели */}
          {goalsWithReach.length > 0 && (() => {
            const now = new Date()
            const birthDate = localStorage.getItem(BIRTH_KEY) || ''
            return (
              <div style={{ background: 'var(--bg-tile)', border: '0.5px solid rgba(128,128,128,.15)', borderRadius: 12, padding: '0.875rem 1rem' }}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Достижение целей</div>
                {[...goalsWithReach].sort((a, b) => {
                  if (a.reachedIdx < 0 && b.reachedIdx < 0) return 0
                  if (a.reachedIdx < 0) return 1
                  if (b.reachedIdx < 0) return -1
                  return a.reachedIdx - b.reachedIdx
                }).map((g, i) => {
                  let datePart
                  if (g.reachedIdx >= 0) {
                    const reachDate = new Date(now.getFullYear(), now.getMonth() + g.reachedIdx + 1, 1)
                    const dateLabel = reachDate.toLocaleString('ru', { month: 'long', year: '2-digit' })
                    const age = calcAgeAt(birthDate, reachDate)
                    datePart = <span>{dateLabel}{age !== null ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({ageLabel(age)})</span> : null}</span>
                  } else {
                    datePart = <span style={{ color: 'var(--text-muted)' }}>не достигается</span>
                  }
                  return (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: i < goalsWithReach.length - 1 ? 6 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: GOAL_COLORS[i % GOAL_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name || `Цель ${i + 1}`}</span>
                        <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{fmt(g.amount)}&nbsp;{sym(g.currency)}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{datePart}</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      <div className="route-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'flex-start' }}>
      {/* Параметры + Ступени сбережений */}
      <div className="card" style={{ minWidth: 0 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Входные данные</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.75fr) minmax(0, 0.75fr) auto', gap: '6px 12px', alignItems: 'center' }}>
          {/* Labels row */}
          <label className="forecast-label">Начальный капитал</label>
          <label className="forecast-label">Ставка вклада, % год.</label>
          <div />

          {/* Inputs row */}
          <div className="forecast-input-row">
            <input className="field-input" type="text" inputMode="numeric" value={fmtInput(p.capital)}
              onChange={(e) => setParam(cur, 'capital', +parseInput(e.target.value) || 0)} />
            <span className="inp-cur">{sym(cur)}</span>
          </div>
          <div className="forecast-input-row">
            <input className="field-input" type="number" step="0.1" min={0} value={p.rate || ''}
              onChange={(e) => setParam(cur, 'rate', +e.target.value)} />
            <span className="inp-cur">%</span>
          </div>
          <div />

          {/* Slider row under capital */}
          <div style={{ gridColumn: '1 / 3', marginTop: 2 }}>
            <label className="forecast-label" style={{ marginBottom: 4 }}>Горизонт — {monthsLabel(months)}</label>
            <div className="forecast-slider-wrap" style={{ position: 'relative' }}>
              <input type="range" min={12} max={360} step={12} value={months}
                onChange={(e) => setMonths(+e.target.value)} className="forecast-slider" />
              <div className="forecast-slider-ruler">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((year) => {
                  const isMajor = year % 5 === 0
                  return (
                    <div key={year} className={`forecast-tick${isMajor ? ' forecast-tick--major' : ''}`}
                      style={{ left: `${(year - 1) / 29 * 100}%` }}>
                      {isMajor && <span className="forecast-tick-label">{year}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div />

          {/* Savings header */}
          <div style={{ gridColumn: '1 / -1', marginTop: 10 }} className="forecast-label">Сбережения / мес</div>

          {/* Сейчас row */}
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Сейчас</span>
          <div className="forecast-input-row">
            <input className="field-input" type="text" inputMode="numeric"
              value={fmtInput(p.savings)}
              onChange={(e) => setParam(cur, 'savings', +parseInput(e.target.value) || 0)} />
            <span className="inp-cur">{sym(cur)}/мес</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-icon btn-icon--positive" onClick={addSavingsStep}>+</button>
          </div>

          {/* Step rows */}
          {savingsSteps
            .filter((s) => s.currency === cur)
            .map((s) => (
              <div key={s.id} style={{ display: 'contents' }}>
                <input type="month" className="field-input"
                  value={s.fromDate}
                  onChange={(e) => updateSavingsStep(s.id, 'fromDate', e.target.value)} />
                <div className="forecast-input-row">
                  <input className="field-input" type="text" inputMode="numeric"
                    value={fmtInput(s.amount) || ''}
                    onChange={(e) => updateSavingsStep(s.id, 'amount', +parseInput(e.target.value) || 0)} />
                  <span className="inp-cur">{sym(cur)}/мес</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-icon" onClick={() => removeSavingsStep(s.id)}>×</button>
                </div>
              </div>
            ))
          }
        </div>

      </div>


      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Финансовые цели */}
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: goals.length > 0 ? 12 : 0 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Финансовые цели</div>
          <button className="btn-icon btn-icon--positive" onClick={addGoal}>+</button>
        </div>

        {goals.map((g, i) => (
          <div key={g.id} className="route-goal-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: GOAL_COLORS[i % GOAL_COLORS.length], flexShrink: 0 }} />
            <input
              className="field-input"
              style={{ flex: 2, minWidth: 0 }}
              placeholder="Название"
              value={g.name}
              onChange={(e) => updateGoal(g.id, 'name', e.target.value)}
            />
            <div className="forecast-input-row" style={{ width: 130, flexShrink: 0 }}>
              <input
                className="field-input"
                type="text" inputMode="numeric"
                placeholder="Сумма"
                value={fmtInput(g.amount) || ''}
                onChange={(e) => updateGoal(g.id, 'amount', +parseInput(e.target.value) || 0)}
              />
              <span className="inp-cur">{sym(cur)}</span>
            </div>
            <button className="btn-icon" onClick={() => removeGoal(g.id)} style={{ marginLeft: 'auto' }}>×</button>
          </div>
        ))}
      </div>

      {/* Запланированные траты */}
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: curExpenses.length > 0 ? 12 : 0 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Запланированные траты</div>
          <button className="btn-icon btn-icon--positive" onClick={addExpense}>+</button>
        </div>

        {curExpenses.map((e) => (
          <div key={e.id} className="route-expense-form-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              className="field-input"
              style={{ flex: 2, minWidth: 0 }}
              placeholder="Название"
              value={e.name}
              onChange={(ev) => updateExpense(e.id, 'name', ev.target.value)}
            />
            <div className="forecast-input-row" style={{ width: 130, flexShrink: 0 }}>
              <input
                className="field-input"
                type="text" inputMode="numeric"
                placeholder="Сумма"
                value={fmtInput(e.amount) || ''}
                onChange={(ev) => updateExpense(e.id, 'amount', +parseInput(ev.target.value) || 0)}
              />
              <span className="inp-cur">{sym(cur)}</span>
            </div>
            <input
              type="month"
              className="field-input field-input--sm"
              value={e.date}
              onChange={(ev) => updateExpense(e.id, 'date', ev.target.value)}
            />
            <button className="btn-icon" onClick={() => removeExpense(e.id)} style={{ marginLeft: 'auto' }}>×</button>
          </div>
        ))}
      </div>
      </div>{/* end flex-column (goals + expenses) */}
      </div>{/* end flex-row */}


    </div>
  )
}
