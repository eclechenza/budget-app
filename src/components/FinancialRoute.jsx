import { useState, useMemo, useEffect, useRef } from 'react'
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
const GOAL_COLORS = ['#1D9E75', '#9B59B6', '#E6A435', '#E74C3C', '#2980B9']

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

function calcRoute(capital, savings, annualRate, annualInflation, compound, totalMonths, expenses, plannedSavings, cur) {
  const monthlyRate = annualRate / 100 / 12
  const monthlyInfl = (annualInflation || 0) / 100 / 12
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

  const savingsOnceMap = {}
  const savingsRecurring = []
  ;(plannedSavings || [])
    .filter((s) => s.currency === cur && s.amount > 0 && s.date)
    .forEach((s) => {
      const [y, m] = s.date.split('-').map(Number)
      const offset = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
      if (offset >= 1 && offset <= totalMonths) {
        if (s.type === 'once') {
          savingsOnceMap[offset] = (savingsOnceMap[offset] || 0) + s.amount
        } else {
          savingsRecurring.push({ startOffset: offset, amount: s.amount })
        }
      }
    })

  const nominals = []
  const reals = []
  const labels = []
  const expenseIdxs = new Set()
  const savingsIdxs = new Set()
  let cap = capital
  const initCap = capital

  for (let m = 1; m <= totalMonths; m++) {
    const extraSavings = savingsRecurring.filter((r) => m >= r.startOffset).reduce((s, r) => s + r.amount, 0)
    const monthlySavings = savings + extraSavings
    cap = compound
      ? cap * (1 + monthlyRate) + monthlySavings
      : cap + initCap * monthlyRate + monthlySavings
    if (expenseMap[m]) { cap -= expenseMap[m]; expenseIdxs.add(m - 1) }
    if (savingsOnceMap[m]) { cap += savingsOnceMap[m]; savingsIdxs.add(m - 1) }
    const real = monthlyInfl > 0 ? cap / Math.pow(1 + monthlyInfl, m) : cap
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1)
    nominals.push(Math.round(cap))
    reals.push(Math.round(real))
    labels.push(d.toLocaleString('ru', { month: 'short', year: '2-digit' }))
  }

  return { nominals, reals, labels, expenseIdxs, savingsIdxs }
}

function calcRouteCombined(params, compound, totalMonths, expenses, plannedSavings, displayCur, rates) {
  const projs = {}
  CURRENCIES.forEach((c) => {
    const p = params[c]
    projs[c] = calcRoute(p.capital, p.savings, p.rate, p.inflation || 0, compound, totalMonths, expenses, plannedSavings, c)
  })
  const labels = projs.KZT.labels
  const nominals = labels.map((_, i) =>
    Math.round(CURRENCIES.reduce((sum, c) =>
      sum + convertCurrency(projs[c].nominals[i], c, displayCur, rates), 0))
  )
  const reals = labels.map((_, i) =>
    Math.round(CURRENCIES.reduce((sum, c) =>
      sum + convertCurrency(projs[c].reals[i], c, displayCur, rates), 0))
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
  const [mode, setMode] = useState('combined')
  const [cur, setCur] = useState('KZT')
  const [months, setMonths] = useState(36)
  const [compound, setCompound] = useState(true)

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

  const [toast, setToast] = useState(false)
  const toastTimer = useRef(null)

  function handleSaveParams() {
    saveRoute({ ...loadRoute(), params })
    setToast(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(false), 2500)
  }

  function handleResetParams() {
    const p = defaultParams()
    setParams(p)
    const r = loadRoute()
    delete r.params
    saveRoute(r)
  }

  // ── Goals ────────────────────────────────────────────────────────────────────
  const [goals, setGoals] = useState(() => migrateGoals(loadRoute().goals))

  function persistGoals(next) {
    saveRoute({ ...loadRoute(), goals: next })
    return next
  }

  const [newGoalName, setNewGoalName] = useState('')
  const [newGoalAmount, setNewGoalAmount] = useState('')
  const [newGoalCur, setNewGoalCur] = useState('KZT')

  const [editingGoalId, setEditingGoalId] = useState(null)
  const [editGoalDraft, setEditGoalDraft] = useState({})

  function addGoal() {
    const amount = +parseInput(newGoalAmount) || 0
    if (!newGoalName.trim() || !amount) return
    setGoals((prev) => persistGoals([...prev, { id: Date.now(), name: newGoalName.trim(), amount, currency: newGoalCur }]))
    setNewGoalName('')
    setNewGoalAmount('')
  }

  function removeGoal(id) {
    setGoals((prev) => persistGoals(prev.filter((g) => g.id !== id)))
  }

  function startEditGoal(g) {
    setEditingGoalId(g.id)
    setEditGoalDraft({ name: g.name, amount: fmtInput(g.amount), currency: g.currency || 'KZT' })
  }

  function saveEditGoal(id) {
    const amount = +parseInput(editGoalDraft.amount) || 0
    if (!editGoalDraft.name.trim() || !amount) return
    setGoals((prev) => persistGoals(prev.map((g) =>
      g.id === id ? { ...g, name: editGoalDraft.name.trim(), amount, currency: editGoalDraft.currency } : g
    )))
    setEditingGoalId(null)
  }

  function cancelEditGoal() { setEditingGoalId(null) }

  // ── Planned savings ──────────────────────────────────────────────────────────
  const [plannedSavings, setPlannedSavings] = useState(() => loadRoute().plannedSavings || [])

  useEffect(() => { saveRoute({ ...loadRoute(), plannedSavings }) }, [plannedSavings])

  const [newSavName, setNewSavName] = useState('')
  const [newSavAmount, setNewSavAmount] = useState('')
  const [newSavDate, setNewSavDate] = useState(defaultDate)
  const [newSavType, setNewSavType] = useState('once')
  const [newSavCur, setNewSavCur] = useState('KZT')

  const [editingSavId, setEditingSavId] = useState(null)
  const [editSavDraft, setEditSavDraft] = useState({})

  function addPlannedSaving() {
    const amount = +parseInput(newSavAmount) || 0
    if (!newSavName.trim() || !amount || !newSavDate) return
    setPlannedSavings((prev) => [...prev, { id: Date.now(), name: newSavName.trim(), amount, currency: newSavCur, date: newSavDate, type: newSavType }])
    setNewSavName('')
    setNewSavAmount('')
  }

  function removePlannedSaving(id) { setPlannedSavings((prev) => prev.filter((s) => s.id !== id)) }

  function startEditSav(s) {
    setEditingSavId(s.id)
    setEditSavDraft({ name: s.name, amount: fmtInput(s.amount), date: s.date, type: s.type, currency: s.currency || 'KZT' })
  }

  function saveEditSav(id) {
    const amount = +parseInput(editSavDraft.amount) || 0
    if (!editSavDraft.name.trim() || !amount || !editSavDraft.date) return
    setPlannedSavings((prev) => prev.map((s) =>
      s.id === id ? { ...s, name: editSavDraft.name.trim(), amount, date: editSavDraft.date, type: editSavDraft.type, currency: editSavDraft.currency || 'KZT' } : s
    ))
    setEditingSavId(null)
  }

  function cancelEditSav() { setEditingSavId(null) }

  // ── Expenses ─────────────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState(() => loadRoute().expenses || [])

  useEffect(() => { saveRoute({ ...loadRoute(), expenses }) }, [expenses])

  const [newExpName, setNewExpName] = useState('')
  const [newExpAmount, setNewExpAmount] = useState('')
  const [newExpDate, setNewExpDate] = useState(defaultDate)

  const [editingExpId, setEditingExpId] = useState(null)
  const [editExpDraft, setEditExpDraft] = useState({})

  function addExpense() {
    const amount = +parseInput(newExpAmount) || 0
    if (!newExpName.trim() || !amount || !newExpDate) return
    setExpenses((prev) => [...prev, { id: Date.now(), name: newExpName.trim(), amount, currency: cur, date: newExpDate }])
    setNewExpName('')
    setNewExpAmount('')
  }

  function removeExpense(id) { setExpenses((prev) => prev.filter((e) => e.id !== id)) }

  function startEditExp(e) {
    setEditingExpId(e.id)
    setEditExpDraft({ name: e.name, amount: fmtInput(e.amount), date: e.date })
  }

  function saveEditExp(id) {
    const amount = +parseInput(editExpDraft.amount) || 0
    if (!editExpDraft.name.trim() || !amount || !editExpDraft.date) return
    setExpenses((prev) => prev.map((e) =>
      e.id === id ? { ...e, name: editExpDraft.name.trim(), amount, date: editExpDraft.date } : e
    ))
    setEditingExpId(null)
  }

  function cancelEditExp() { setEditingExpId(null) }

  // ── Projection ───────────────────────────────────────────────────────────────
  const p = params[cur]

  const splitResult = useMemo(
    () => calcRoute(p.capital, p.savings, p.rate, p.inflation || 0, compound, months, expenses, plannedSavings, cur),
    [p, compound, months, expenses, plannedSavings, cur]
  )
  const combinedResult = useMemo(
    () => calcRouteCombined(params, compound, months, expenses, plannedSavings, cur, rates),
    [params, compound, months, expenses, plannedSavings, cur, rates]
  )
  const { nominals, reals, labels, expenseIdxs, savingsIdxs } = mode === 'split' ? splitResult : combinedResult

  const finalNominal = nominals[nominals.length - 1] ?? 0
  const finalReal    = reals[reals.length - 1]       ?? 0
  const totalContributed = mode === 'split'
    ? p.capital + p.savings * months
    : Math.round(CURRENCIES.reduce((sum, c) =>
        sum + convertCurrency(params[c].capital + params[c].savings * months, c, cur, rates), 0))
  const interestEarned = finalNominal - totalContributed
  const realYield = mode === 'split' ? (p.rate || 0) - (p.inflation || 0) : null

  const goalsWithReach = useMemo(() =>
    goals.map((g) => {
      const convertedAmount = Math.round(convertCurrency(g.amount, g.currency || 'KZT', cur, rates))
      return {
        ...g,
        convertedAmount,
        reachedIdx: nominals.findIndex((v) => v >= convertedAmount),
      }
    }),
    [goals, nominals, cur, rates]
  )

  // ── Chart ────────────────────────────────────────────────────────────────────
  const pointColors = nominals.map((_, i) => expenseIdxs.has(i) ? '#D85A30' : savingsIdxs.has(i) ? '#1D9E75' : '#5B6FE6')
  const pointSizes  = nominals.map((_, i) => (expenseIdxs.has(i) || savingsIdxs.has(i)) ? 7 : 3)

  const datasets = [
    {
      label: 'Номинальный',
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
    {
      label: 'Реальный (−инфляция)',
      data: reals,
      borderColor: '#aaa',
      backgroundColor: 'transparent',
      borderDash: [6, 4],
      tension: 0.3,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 1.5,
    },
    ...goalsWithReach.map((g, i) => ({
      label: g.currency !== cur
        ? `${g.name || `Цель ${i + 1}`} (${sym(g.currency)})`
        : (g.name || `Цель ${i + 1}`),
      data: nominals.map(() => g.convertedAmount),
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

  const curExpenses  = expenses.filter((e) => e.currency === cur)
  const otherExpenses = expenses.filter((e) => e.currency !== cur)

  return (
    <div>
      {/* Tabs row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="chips" style={{ marginBottom: 0 }}>
          {CUR_TABS.map((t) => (
            <button key={t.id} className={`chip${cur === t.id ? ' active' : ''}`} onClick={() => setCur(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="chips" style={{ marginBottom: 0 }}>
          <button className={`chip${mode === 'combined' ? ' active' : ''}`} onClick={() => setMode('combined')}>Суммарно</button>
          <button className={`chip${mode === 'split' ? ' active' : ''}`} onClick={() => setMode('split')}>По валютам</button>
        </div>
      </div>

      {/* Параметры */}
      <div className="card">
        {mode === 'split' ? (
          <div className="forecast-grid">
            <div className="forecast-param">
              <label className="forecast-label">Начальный капитал</label>
              <div className="forecast-input-row">
                <input className="field-input" type="text" inputMode="numeric" value={fmtInput(p.capital)}
                  onChange={(e) => setParam(cur, 'capital', +parseInput(e.target.value) || 0)} />
                <span className="inp-cur">{sym(cur)}</span>
              </div>
            </div>
            <div className="forecast-param">
              <label className="forecast-label">Ежемесячные сбережения</label>
              <div className="forecast-input-row">
                <input className="field-input" type="text" inputMode="numeric" value={fmtInput(p.savings)}
                  onChange={(e) => setParam(cur, 'savings', +parseInput(e.target.value) || 0)} />
                <span className="inp-cur">{sym(cur)}</span>
              </div>
            </div>
            <div className="forecast-param">
              <label className="forecast-label">Ставка вклада, % год.</label>
              <div className="forecast-input-row">
                <input className="field-input" type="number" step="0.1" min={0} value={p.rate || ''}
                  onChange={(e) => setParam(cur, 'rate', +e.target.value)} />
                <span className="inp-cur">%</span>
              </div>
            </div>
            <div className="forecast-param">
              <label className="forecast-label">Инфляция, % год.</label>
              <div className="forecast-input-row">
                <input className="field-input" type="number" step="0.1" min={0} value={p.inflation || ''}
                  onChange={(e) => setParam(cur, 'inflation', +e.target.value)} />
                <span className="inp-cur">%</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="forecast-label" style={{ marginBottom: 0 }}>Курс:</span>
              <div className="forecast-input-row">
                <span className="cur-label" style={{ marginRight: 4 }}>1&nbsp;$&nbsp;=</span>
                <input className="field-input" type="number" step="1" min={0} value={Math.round(rates.USD)} style={{ width: 72 }}
                  onChange={(e) => setRates((r) => ({ ...r, USD: +e.target.value || 1 }))} />
                <span className="inp-cur">₸</span>
              </div>
              <div className="forecast-input-row">
                <span className="cur-label" style={{ marginRight: 4 }}>1&nbsp;₽&nbsp;=</span>
                <input className="field-input" type="number" step="0.01" min={0} value={+rates.RUB.toFixed(2)} style={{ width: 72 }}
                  onChange={(e) => setRates((r) => ({ ...r, RUB: +e.target.value || 1 }))} />
                <span className="inp-cur">₸</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: '#999', fontWeight: 500 }} />
                    {CUR_TABS.map((t) => (
                      <th key={t.id} style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 8, fontSize: 12, color: '#999', fontWeight: 500 }}>{t.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'capital',   label: 'Капитал',    numeric: false },
                    { key: 'savings',   label: 'Сбережения', numeric: false },
                    { key: 'rate',      label: 'Ставка %',   numeric: true, step: '0.1', unit: '%' },
                    { key: 'inflation', label: 'Инфляция %', numeric: true, step: '0.1', unit: '%' },
                  ].map((row) => (
                    <tr key={row.key}>
                      <td style={{ paddingRight: 12, paddingBottom: 8, fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>{row.label}</td>
                      {CURRENCIES.map((c) => (
                        <td key={c} style={{ paddingLeft: 8, paddingBottom: 8 }}>
                          <div className="forecast-input-row">
                            {row.numeric ? (
                              <input className="field-input" type="number" step={row.step} value={params[c][row.key] || ''} min={0} style={{ width: 60 }}
                                onChange={(e) => setParam(c, row.key, +e.target.value)} />
                            ) : (
                              <input className="field-input" type="text" inputMode="numeric" value={fmtInput(params[c][row.key])} style={{ width: 80 }}
                                onChange={(e) => setParam(c, row.key, +parseInput(e.target.value) || 0)} />
                            )}
                            <span className="inp-cur">{row.unit || sym(c)}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="forecast-slider-row">
          <span className="forecast-slider-label">Горизонт</span>
          <div className="forecast-slider-wrap">
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
          <span className="forecast-slider-value">{monthsLabel(months)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="forecast-checkbox">
            <input type="checkbox" checked={compound} onChange={(e) => setCompound(e.target.checked)} />
            Сложный процент
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-ghost" onClick={handleSaveParams}>Сохранить</button>
            <button className="btn-ghost btn-ghost btn-ghost--muted" onClick={handleResetParams}>Сбросить</button>
          </div>
        </div>
      </div>

      {/* График */}
      <div className="card">
        {goalsWithReach.map((g, i) => (
          <div key={g.id} style={{ marginBottom: 6, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 20, height: 2, background: GOAL_COLORS[i % GOAL_COLORS.length], flexShrink: 0, borderRadius: 1 }} />
            {g.reachedIdx >= 0
              ? <span>
                  <span className="muted">{g.name}</span>
                  {' '}<span className="muted" style={{ fontSize: 11 }}>({fmt(g.amount)}&nbsp;{sym(g.currency)})</span>
                  {' '}— достигается в <strong className="pos">{labels[g.reachedIdx]}</strong>
                </span>
              : <span className="muted">
                  {g.name}
                  {' '}<span style={{ fontSize: 11 }}>({fmt(g.amount)}&nbsp;{sym(g.currency)})</span>
                  {' '}— не достигается за выбранный период
                </span>
            }
          </div>
        ))}
        {goalsWithReach.length > 0 && <div style={{ marginBottom: 10 }} />}

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
                Месяцы с единоразовыми сбережениями
              </div>
            )}
          </div>
        )}
      </div>

      {/* Метрики */}
      <div className="metric-grid">
        <div className="forecast-metric">
          <div className="forecast-metric-label">Номин. капитал</div>
          <div className="forecast-metric-value">{fmt(finalNominal)} {sym(cur)}</div>
        </div>
        <div className="forecast-metric">
          <div className="forecast-metric-label">Реальный капитал</div>
          <div className="forecast-metric-value">{fmt(finalReal)} {sym(cur)}</div>
        </div>
        <div className="forecast-metric">
          <div className="forecast-metric-label">Заработано %</div>
          <div className={`forecast-metric-value ${interestEarned >= 0 ? 'pos' : 'neg'}`}>
            {interestEarned >= 0 ? '+' : ''}{fmt(Math.round(interestEarned))} {sym(cur)}
          </div>
        </div>
        {realYield !== null && (
          <div className="forecast-metric">
            <div className="forecast-metric-label">Реальная доходность</div>
            <div className={`forecast-metric-value ${realYield >= 0 ? 'pos' : 'neg'}`}>
              {realYield >= 0 ? '+' : ''}{realYield.toFixed(1)}% год.
            </div>
          </div>
        )}
      </div>

      {/* Финансовые цели */}
      <div className="card">
        <div className="section-title">Финансовые цели</div>

        {goals.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {goals.map((g, i) =>
              editingGoalId === g.id ? (
                <div key={g.id} className="route-expense-row route-expense-editing">
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: GOAL_COLORS[i % GOAL_COLORS.length], flexShrink: 0 }} />
                  <input
                    className="field-input"
                    style={{ flex: 2, minWidth: 0 }}
                    value={editGoalDraft.name}
                    onChange={(ev) => setEditGoalDraft((d) => ({ ...d, name: ev.target.value }))}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') saveEditGoal(g.id); if (ev.key === 'Escape') cancelEditGoal() }}
                    autoFocus
                  />
                  <div className="forecast-input-row" style={{ flex: 1, minWidth: 90 }}>
                    <input
                      className="field-input" type="text" inputMode="numeric"
                      value={editGoalDraft.amount}
                      onChange={(ev) => setEditGoalDraft((d) => ({ ...d, amount: ev.target.value }))}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') saveEditGoal(g.id); if (ev.key === 'Escape') cancelEditGoal() }}
                    />
                    <span className="inp-cur">{sym(editGoalDraft.currency || 'KZT')}</span>
                  </div>
                  <select
                    value={editGoalDraft.currency || 'KZT'}
                    onChange={(ev) => setEditGoalDraft((d) => ({ ...d, currency: ev.target.value }))}
                    className="select-inline"
                  >
                    <option value="KZT">₸ Тенге</option>
                    <option value="RUB">₽ Рубли</option>
                    <option value="USD">$ Доллары</option>
                  </select>
                  <button className="btn-icon btn-icon--positive" onClick={() => saveEditGoal(g.id)} title="Сохранить">✓</button>
                  <button className="btn-icon" onClick={cancelEditGoal} title="Отмена">×</button>
                </div>
              ) : (
                <div key={g.id} className="route-expense-row" onClick={() => startEditGoal(g)} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: GOAL_COLORS[i % GOAL_COLORS.length], flexShrink: 0 }} />
                  <span className="route-expense-name">{g.name}</span>
                  <span className="route-expense-amount">{fmt(g.amount)} {sym(g.currency)}</span>
                  <button className="btn-icon" onClick={(ev) => { ev.stopPropagation(); removeGoal(g.id) }}>×</button>
                </div>
              )
            )}
          </div>
        )}

        <div className="route-expense-form">
          <input
            type="text"
            placeholder="Название цели"
            value={newGoalName}
            onChange={(e) => setNewGoalName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addGoal() }}
            className="field-input route-expense-input-name"
          />
          <div className="forecast-input-row" style={{ flex: 1, minWidth: 120 }}>
            <input
              className="field-input" type="text" inputMode="numeric"
              placeholder="Сумма"
              value={newGoalAmount}
              onChange={(e) => setNewGoalAmount(fmtInput(parseInput(e.target.value)))}
              onKeyDown={(e) => { if (e.key === 'Enter') addGoal() }}
            />
            <span className="inp-cur">{sym(newGoalCur)}</span>
          </div>
          <select value={newGoalCur} onChange={(e) => setNewGoalCur(e.target.value)} className="select-inline">
            <option value="KZT">₸ Тенге</option>
            <option value="RUB">₽ Рубли</option>
            <option value="USD">$ Доллары</option>
          </select>
          <button className="btn-primary" onClick={addGoal} style={{ flexShrink: 0 }}>+</button>
        </div>
      </div>

      {/* Запланированные траты */}
      <div className="card">
        <div className="section-title">Запланированные траты</div>

        {curExpenses.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {curExpenses
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((e) =>
                editingExpId === e.id ? (
                  <div key={e.id} className="route-expense-row route-expense-editing">
                    <input
                      className="field-input"
                      style={{ flex: 2, minWidth: 0 }}
                      value={editExpDraft.name}
                      onChange={(ev) => setEditExpDraft((d) => ({ ...d, name: ev.target.value }))}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') saveEditExp(e.id); if (ev.key === 'Escape') cancelEditExp() }}
                      autoFocus
                    />
                    <div className="forecast-input-row" style={{ flex: 1, minWidth: 90 }}>
                      <input
                        className="field-input" type="text" inputMode="numeric"
                        value={editExpDraft.amount}
                        onChange={(ev) => setEditExpDraft((d) => ({ ...d, amount: ev.target.value }))}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') saveEditExp(e.id); if (ev.key === 'Escape') cancelEditExp() }}
                      />
                      <span className="inp-cur">{sym(e.currency)}</span>
                    </div>
                    <input
                      type="month"
                      value={editExpDraft.date}
                      onChange={(ev) => setEditExpDraft((d) => ({ ...d, date: ev.target.value }))}
                      className="field-input field-input--sm"
                    />
                    <button className="btn-icon btn-icon--positive" onClick={() => saveEditExp(e.id)} title="Сохранить">✓</button>
                    <button className="btn-icon" onClick={cancelEditExp} title="Отмена">×</button>
                  </div>
                ) : (
                  <div key={e.id} className="route-expense-row" onClick={() => startEditExp(e)} style={{ cursor: 'pointer' }}>
                    <span className="route-expense-name">{e.name}</span>
                    <span className="route-expense-date muted">{monthDateLabel(e.date)}</span>
                    <span className="route-expense-amount neg">−{fmt(e.amount)} {sym(e.currency)}</span>
                    <button className="btn-icon" onClick={(ev) => { ev.stopPropagation(); removeExpense(e.id) }}>×</button>
                  </div>
                )
              )}
          </div>
        )}

        {otherExpenses.length > 0 && curExpenses.length === 0 && (
          <p className="empty small" style={{ marginBottom: 12 }}>
            Нет трат в {sym(cur)}. Переключи валюту, чтобы увидеть остальные.
          </p>
        )}

        <div className="route-expense-form">
          <input
            type="text"
            placeholder="Название"
            value={newExpName}
            onChange={(e) => setNewExpName(e.target.value)}
            className="field-input route-expense-input-name"
          />
          <div className="forecast-input-row" style={{ flex: 1, minWidth: 120 }}>
            <input
              className="field-input" type="text" inputMode="numeric"
              placeholder="Сумма"
              value={newExpAmount}
              onChange={(e) => setNewExpAmount(fmtInput(parseInput(e.target.value)))}
            />
            <span className="inp-cur">{sym(cur)}</span>
          </div>
          <input type="month" value={newExpDate} onChange={(e) => setNewExpDate(e.target.value)} className="field-input field-input--sm" />
          <button className="btn-primary" onClick={addExpense} style={{ flexShrink: 0 }}>+</button>
        </div>
      </div>
      {/* Запланированные сбережения */}
      <div className="card">
        <div className="section-title">Запланированные сбережения</div>

        {plannedSavings.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {plannedSavings
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((s) =>
                editingSavId === s.id ? (
                  <div key={s.id} className="route-expense-row route-expense-editing">
                    <input
                      className="field-input"
                      style={{ flex: 2, minWidth: 0 }}
                      value={editSavDraft.name}
                      onChange={(ev) => setEditSavDraft((d) => ({ ...d, name: ev.target.value }))}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') saveEditSav(s.id); if (ev.key === 'Escape') cancelEditSav() }}
                      autoFocus
                    />
                    <div className="forecast-input-row" style={{ flex: 1, minWidth: 90 }}>
                      <input
                        className="field-input" type="text" inputMode="numeric"
                        value={editSavDraft.amount}
                        onChange={(ev) => setEditSavDraft((d) => ({ ...d, amount: ev.target.value }))}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') saveEditSav(s.id); if (ev.key === 'Escape') cancelEditSav() }}
                      />
                      <span className="inp-cur">{sym(editSavDraft.currency || 'KZT')}</span>
                    </div>
                    <select
                      value={editSavDraft.currency || 'KZT'}
                      onChange={(ev) => setEditSavDraft((d) => ({ ...d, currency: ev.target.value }))}
                      className="select-inline"
                    >
                      <option value="KZT">₸ Тенге</option>
                      <option value="RUB">₽ Рубли</option>
                      <option value="USD">$ Доллары</option>
                    </select>
                    <input
                      type="month"
                      value={editSavDraft.date}
                      onChange={(ev) => setEditSavDraft((d) => ({ ...d, date: ev.target.value }))}
                      className="field-input field-input--sm"
                    />
                    <select
                      value={editSavDraft.type}
                      onChange={(ev) => setEditSavDraft((d) => ({ ...d, type: ev.target.value }))}
                      className="select-inline"
                    >
                      <option value="once">Единоразово</option>
                      <option value="recurring">Постоянное</option>
                    </select>
                    <button className="btn-icon btn-icon--positive" onClick={() => saveEditSav(s.id)} title="Сохранить">✓</button>
                    <button className="btn-icon" onClick={cancelEditSav} title="Отмена">×</button>
                  </div>
                ) : (
                  <div key={s.id} className="route-expense-row" onClick={() => startEditSav(s)} style={{ cursor: 'pointer' }}>
                    <span className="route-expense-name">{s.name}</span>
                    <span className="route-expense-date muted">{monthDateLabel(s.date)}</span>
                    <span className="route-expense-amount pos">+{fmt(s.amount)} {sym(s.currency)}</span>
                    <span className="route-type-badge">{s.type === 'once' ? 'Раз' : '∞'}</span>
                    <button className="btn-icon" onClick={(ev) => { ev.stopPropagation(); removePlannedSaving(s.id) }}>×</button>
                  </div>
                )
              )}
          </div>
        )}


        <div className="route-expense-form">
          <input
            type="text"
            placeholder="Название"
            value={newSavName}
            onChange={(e) => setNewSavName(e.target.value)}
            className="field-input route-expense-input-name"
          />
          <div className="forecast-input-row" style={{ flex: 1, minWidth: 100 }}>
            <input
              className="field-input" type="text" inputMode="numeric"
              placeholder="Сумма"
              value={newSavAmount}
              onChange={(e) => setNewSavAmount(fmtInput(parseInput(e.target.value)))}
            />
            <span className="inp-cur">{sym(newSavCur)}</span>
          </div>
          <select value={newSavCur} onChange={(e) => setNewSavCur(e.target.value)} className="select-inline">
            <option value="KZT">₸ Тенге</option>
            <option value="RUB">₽ Рубли</option>
            <option value="USD">$ Доллары</option>
          </select>
          <input type="month" value={newSavDate} onChange={(e) => setNewSavDate(e.target.value)} className="field-input field-input--sm" />
          <select value={newSavType} onChange={(e) => setNewSavType(e.target.value)} className="select-inline">
            <option value="once">Единоразово</option>
            <option value="recurring">Постоянное</option>
          </select>
          <button className="btn-primary" onClick={addPlannedSaving} style={{ flexShrink: 0 }}>+</button>
        </div>
      </div>

      {toast && (
        <div className="toast">
          <span className="toast-check">✓</span> Параметры сохранены
        </div>
      )}
    </div>
  )
}
