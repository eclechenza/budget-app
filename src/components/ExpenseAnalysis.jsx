import { useState, useMemo } from 'react'
import { Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { fmt, monthLabel, sym } from '../utils/storage'
import { convertCurrency } from '../utils/analytics'
import { getRatesForMonth, monthFromKey } from '../utils/rates'

ChartJS.register(ArcElement, Tooltip, Legend)

const PALETTE = [
  '#1D9E75', '#5B6FE6', '#E6A435', '#D85A30', '#9B59B6',
  '#2980B9', '#27AE60', '#E74C3C', '#F39C12', '#16A085',
  '#8E44AD', '#2C3E50', '#C0392B', '#1ABC9C', '#D35400',
]
const SAVINGS_COLOR = '#2ECC71'

const CUR_TABS = [
  { id: 'KZT', label: '₸' },
  { id: 'RUB', label: '₽' },
  { id: 'USD', label: '$' },
]

export default function ExpenseAnalysis({ state }) {
  const months = Object.keys(state.entries).sort().filter((k) => state.entries[k]?.closed)
  const [monthIdx, setMonthIdx] = useState(Math.max(0, months.length - 1))
  const [curTab,   setCurTab]   = useState('KZT')

  if (!state.accounts.length)
    return (
      <div className="card">
        <div className="empty-state">
          <svg className="empty-state-icon" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="36" cy="36" r="26"/>
            <line x1="36" y1="10" x2="36" y2="36"/>
            <line x1="57" y1="25" x2="36" y2="36"/>
            <line x1="36" y1="36" x2="15" y2="49"/>
            <line x1="36" y1="10" x2="57" y2="25" strokeDasharray="3 3"/>
            <line x1="57" y1="25" x2="15" y2="49" strokeDasharray="3 3"/>
            <line x1="15" y1="49" x2="36" y2="36" strokeDasharray="3 3"/>
          </svg>
          <div className="empty-state-title">Нет данных для анализа</div>
          <div className="empty-state-text">Перейди в <strong>Настройки</strong> и добавь счета, категории расходов и источники дохода.</div>
        </div>
      </div>
    )

  if (!months.length)
    return (
      <div className="card">
        <div className="empty-state">
          <svg className="empty-state-icon" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="10" y="14" width="52" height="46" rx="5"/>
            <line x1="10" y1="28" x2="62" y2="28"/>
            <line x1="24" y1="8" x2="24" y2="22"/>
            <line x1="48" y1="8" x2="48" y2="22"/>
            <polyline points="24,43 31,50 48,36"/>
          </svg>
          <div className="empty-state-title">Нет закрытых месяцев</div>
          <div className="empty-state-text">Введи расходы во вкладке <strong>Ввод данных</strong> и отметь «Месяц закрыт» — после этого появится разбивка по категориям.</div>
        </div>
      </div>
    )

  const safeIdx   = Math.min(Math.max(0, monthIdx), months.length - 1)
  const selKey    = months[safeIdx]
  const selEntry  = state.entries[selKey]
  const expenses  = selEntry.expenses || {}
  const refunds   = selEntry.refunds  || {}
  const cats      = state.expenseCategories || []

  // Курсы для выбранного месяца — из хранилища, без обращения к текущему курсу.
  const monthRates = useMemo(() => {
    const { year, month } = monthFromKey(selKey)
    return getRatesForMonth(year, month)
  }, [selKey])

  const hasNonKZT  = cats.some((cat) => ((state.expenseCur || {})[cat] || 'KZT') !== 'KZT')
  const needsRates = curTab === 'RUB' || curTab === 'USD' || hasNonKZT
  const ratesMissing = needsRates && !monthRates

  const safeRates = monthRates || { KZT: 1, RUB: null, USD: null }
  function cvt(amount, from, to) {
    return convertCurrency(amount, from, to, safeRates)
  }

  const displayCur = curTab

  // Средний доход за последние 12 закрытых месяцев (все источники), в KZT
  const avgIncomeKZT = useMemo(() => {
    const recent = months.slice(-12)
    if (!recent.length) return 0
    let total = 0
    for (const mk of recent) {
      const e = state.entries[mk]
      const { year, month } = monthFromKey(mk)
      const rates = getRatesForMonth(year, month) || { KZT: 1, RUB: null, USD: null }
      const inc = e.income || {}
      ;(state.sources || []).forEach((src) => {
        const cur = (state.sourceCur || {})[src] || 'KZT'
        const val = +inc[src] || 0
        total += convertCurrency(val, cur, 'KZT', rates)
      })
    }
    return recent.length > 0 ? total / recent.length : 0
  }, [months, state])

  const totalIncome = cvt(avgIncomeKZT, 'KZT', displayCur)

  // Фактический доход выбранного месяца (для расчёта сбережений)
  const selectedMonthIncomeKZT = useMemo(() => {
    const inc = selEntry.income || {}
    let total = 0
    ;(state.sources || []).forEach((src) => {
      const cur = (state.sourceCur || {})[src] || 'KZT'
      total += convertCurrency(+inc[src] || 0, cur, 'KZT', safeRates)
    })
    return total
  }, [selKey, state, monthRates]) // eslint-disable-line react-hooks/exhaustive-deps

  const refundMapping = state.refundMapping || {}

  const allItems = cats
    .map((cat) => {
      const expCur = (state.expenseCur || {})[cat] || 'KZT'
      const expVal = +expenses[cat] || 0
      const expKZT = cvt(expVal, expCur, 'KZT')

      // Sum all refund categories mapped to this expense category
      const refKZT = (state.refundCategories || [])
        .filter((rcat) => refundMapping[rcat] === cat)
        .reduce((sum, rcat) => {
          const refCur = (state.refundCur || {})[rcat] || 'KZT'
          return sum + cvt(+refunds[rcat] || 0, refCur, 'KZT')
        }, 0)

      const netKZT    = expKZT - refKZT
      const netDisplay = cvt(netKZT, 'KZT', curTab)
      const nativeCur  = curTab

      return { cat, netKZT, netDisplay, nativeCur }
    })

  // Общий итог — без обрезки по 0, чтобы совпадать с «чистыми расходами» в Обзоре
  // (если возврат за месяц больше расхода по категории, разница уменьшает итог).
  const totalKZT     = allItems.reduce((s, it) => s + it.netKZT, 0)
  const totalDisplay = allItems.reduce((s, it) => s + it.netDisplay, 0)

  const savingsKZT     = Math.max(0, selectedMonthIncomeKZT - totalKZT)
  const savingsDisplay = cvt(savingsKZT, 'KZT', displayCur)

  // На пай-чарт и в легенду попадают только категории с положительным чистым расходом
  const items = allItems.filter((it) => it.netKZT > 0).sort((a, b) => b.netKZT - a.netKZT)

  const catColorIndex = useMemo(() => {
    const map = {}
    cats.forEach((cat, i) => { map[cat] = i })
    return map
  }, [cats])

  const totalPieKZT = totalKZT + savingsKZT

  const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#ffffff'

  const chartLabels = [...items.map((it) => it.cat), ...(savingsKZT > 0 ? ['Сбережения'] : [])]
  const chartValues = [...items.map((it) => Math.round(it.netKZT)), ...(savingsKZT > 0 ? [Math.round(savingsKZT)] : [])]
  const chartColors = [...items.map((it) => PALETTE[catColorIndex[it.cat] % PALETTE.length]), ...(savingsKZT > 0 ? [SAVINGS_COLOR] : [])]

  const chartData = {
    labels: chartLabels,
    datasets: [{
      data: chartValues,
      backgroundColor: chartColors,
      borderWidth: 2,
      borderColor: cardBg,
      hoverOffset: 6,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const isSavings = savingsKZT > 0 && ctx.dataIndex === items.length
            if (isSavings) {
              const pct = totalPieKZT > 0 ? Math.round((savingsKZT / totalPieKZT) * 100) : 0
              return ` ${fmt(Math.round(savingsDisplay))} ${sym(displayCur)} (${pct}%)`
            }
            const it  = items[ctx.dataIndex]
            const val = Math.round(it.netDisplay)
            const pct = totalPieKZT > 0 ? Math.round((it.netKZT / totalPieKZT) * 100) : 0
            return ` ${fmt(val)} ${sym(it.nativeCur)} (${pct}%)`
          },
        },
      },
    },
  }

  return (
    <div>
      <div className="card">
        <div className="summary-header">
          <div className="section-title">Распределение</div>
          <div className="month-switcher">
            <button
              className="month-arrow"
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={safeIdx === 0}
            >‹</button>
            <span className="month-switcher-label">{monthLabel(selKey)}</span>
            <button
              className="month-arrow"
              onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
              disabled={safeIdx === months.length - 1}
            >›</button>
          </div>
        </div>

        <div className="chips">
          {CUR_TABS.map((t) => (
            <button
              key={t.id}
              className={`chip${curTab === t.id ? ' active' : ''}`}
              onClick={() => setCurTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {needsRates && monthRates && (
          <p className="rates-hint">
            {`Курс ${monthLabel(selKey)}: 1 $ = ${fmt(Math.round(monthRates.USD))} ₸ · 1 ₽ = ${monthRates.RUB.toFixed(2)} ₸`}
          </p>
        )}
        {ratesMissing && (
          <p className="rates-hint" style={{ color: '#D85A30' }}>
            ⚠ Нет зафиксированного курса для этого месяца. Открой вкладку «Курс валют».
          </p>
        )}

        {items.length === 0 ? (
          <p className="empty small" style={{ padding: '3rem 0' }}>Нет расходов за этот месяц.</p>
        ) : (
          <div className="expense-chart-layout">
              <div className="expense-chart-pie">
                <Pie data={chartData} options={options} />
              </div>
              <div className="expense-legend-columns">
                {/* ── Колонка: Расходы ── */}
                <div className="expense-legend-col">
                  <div className="expense-legend-col-header">Расходы</div>
                  <div className="expense-legend">
                    {items.map((it) => {
                      const pct = totalPieKZT > 0 ? Math.round((it.netKZT / totalPieKZT) * 100) : 0
                      return (
                        <div key={it.cat} className="expense-legend-row">
                          <span className="expense-legend-dot" style={{ background: PALETTE[catColorIndex[it.cat] % PALETTE.length] }} />
                          <span className="expense-legend-name">{it.cat}</span>
                          <span className="expense-legend-amount">{fmt(Math.round(it.netDisplay))} {sym(it.nativeCur)}</span>
                          <span className="expense-legend-pct">{pct}%</span>
                        </div>
                      )
                    })}
                    <div className="expense-legend-total">
                      <span className="expense-legend-dot" style={{ visibility: 'hidden' }} />
                      <span className="expense-legend-name">Итого</span>
                      <span className="expense-legend-amount">{fmt(Math.round(totalDisplay))} {sym(displayCur)}</span>
                      <span className="expense-legend-pct" />
                    </div>
                  </div>
                </div>

                {/* ── Колонка: Сбережения ── */}
                <div className="expense-legend-col expense-legend-col--savings">
                  <div className="expense-legend-col-header">Сбережения</div>
                  <div className="expense-legend">
                    <div className="expense-legend-row">
                      <span className="expense-legend-dot" style={{ background: SAVINGS_COLOR }} />
                      <span className="expense-legend-name">Сохранил</span>
                      <span className="expense-legend-amount">
                        {fmt(Math.round(savingsDisplay))} {sym(displayCur)}
                      </span>
                      <span className="expense-legend-pct">
                        {selectedMonthIncomeKZT > 0 ? `${Math.round((savingsKZT / selectedMonthIncomeKZT) * 100)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        )}
      </div>
    </div>
  )
}
