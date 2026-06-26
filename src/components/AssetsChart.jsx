import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { CURRENCIES, fmt, sym, closedMonths, monthLabel } from '../utils/storage'
import { CUR_COLORS, convertCurrency, xAxisOpts, yAxisOpts } from '../utils/analytics'
import { getRatesForMonth, monthFromKey, loadRatesStore } from '../utils/rates'
import { ASSET_TYPES } from './ItemList'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler)

const TABS = [
  { id: 'KZT',    label: '₸' },
  { id: 'RUB',    label: '₽' },
  { id: 'USD',    label: '$' },
  { id: 'by_cur', label: 'По валютам' },
]

export default function AssetsChart({ state, liveRates }) {
  const [tab, setTab] = useState('KZT')

  const { accounts, accountType, accountCur, entries } = state
  const assetAccounts = accounts.filter((a) => ASSET_TYPES.has(accountType[a]))
  const months = closedMonths(state)
  const ratesStore = loadRatesStore()

  // Per-month asset balances by currency
  // Для каждого месяца берём исторический курс; если нет — фолбэк на liveRates
  const monthlyData = months.map((mk) => {
    const e = entries[mk]
    const balances = { KZT: 0, RUB: 0, USD: 0 }
    assetAccounts.forEach((a) => {
      const c = accountCur[a] || 'KZT'
      balances[c] += +(e.balances || {})[a] || 0
    })
    const { year, month } = monthFromKey(mk)
    const historicalRates = getRatesForMonth(year, month, ratesStore)
    const rates = historicalRates || liveRates || null
    return { label: monthLabel(mk).split(' ')[0], balances, rates, hasHistorical: !!historicalRates }
  })

  const labels = monthlyData.map((d) => d.label)

  // Нужны ли курсы?
  const needsRates = tab !== 'by_cur'
  const hasMixed = assetAccounts.some((a) => (accountCur[a] || 'KZT') !== 'KZT')
  const ratesOk = !hasMixed || monthlyData.every((d) => d.rates != null)

  let datasets
  if (tab === 'by_cur') {
    datasets = CURRENCIES.map((c) => ({
      label: sym(c),
      data: monthlyData.map((d) => d.balances[c] || 0),
      borderColor: CUR_COLORS[c],
      backgroundColor: CUR_COLORS[c] + '18',
      tension: 0.35,
      fill: false,
      pointRadius: 3,
      pointHoverRadius: 5,
    }))
  } else {
    const toCur = tab
    datasets = [
      {
        label: `Активы, ${sym(toCur)}`,
        data: monthlyData.map((d) =>
          Math.round(
            CURRENCIES.reduce(
              (s, c) => s + convertCurrency(d.balances[c] || 0, c, toCur, d.rates || {}),
              0
            )
          )
        ),
        borderColor: CUR_COLORS[toCur],
        backgroundColor: CUR_COLORS[toCur] + '18',
        tension: 0.35,
        fill: 'origin',
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: tab === 'by_cur',
        position: 'top',
        labels: { font: { size: 11 }, boxWidth: 10, padding: 12 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: xAxisOpts(),
      y: yAxisOpts((v) => fmt(v)),
    },
  }

  if (months.length === 0) return null

  const singleDataset = tab !== 'by_cur' ? datasets[0].data : null
  const growthPct = (() => {
    if (!singleDataset || singleDataset.length < 2) return null
    const first = singleDataset[0]
    const last = singleDataset[singleDataset.length - 1]
    if (!first) return null
    return Math.round(((last - first) / first) * 100)
  })()

  return (
    <div className="card">
      <div className="section-title-row">
        <div className="section-title">Динамика активов</div>
        {growthPct !== null && (
          <span className={`tile-delta-inline ${growthPct >= 0 ? 'pos' : 'neg'}`}>
            {growthPct >= 0 ? '+' : ''}{growthPct}%
          </span>
        )}
      </div>
      <div className="chips">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`chip${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {needsRates && !ratesOk && (
        <p className="rates-hint">
          ⚠ Открой вкладку «Курс валют», чтобы зафиксировать исторические курсы
        </p>
      )}

      <div style={{ position: 'relative', height: 220 }}>
        <Line data={{ labels, datasets }} options={options} />
      </div>
    </div>
  )
}
