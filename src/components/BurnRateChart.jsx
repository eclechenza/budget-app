import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js'
import { CURRENCIES, fmt, sym } from '../utils/storage'
import { CUR_COLORS, convertCurrency, xAxisOpts, yAxisOpts, hasRatesForMixedCurrency } from '../utils/analytics'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Filler, Legend)

function pctOfIncome(exp, inc) {
  return inc > 0 ? Math.round((exp / inc) * 100) : null
}

function permInc(d, c) {
  return ((d.permanentIncome || d.income)[c] || 0)
}

export default function BurnRateChart({ monthlyData, tab, period, permanentOnly }) {
  const hasExpenses = monthlyData.some((d) =>
    CURRENCIES.some((c) => d.expenses[c] > 0)
  )
  if (!hasExpenses) return null

  function incForPct(d, c) {
    return permanentOnly ? permInc(d, c) : (d.income[c] || 0)
  }

  const pctLabel = permanentOnly ? '% от постоянного дохода' : '% от дохода'

  const needsRates = tab !== 'by_cur'
  const ratesOk    = hasRatesForMixedCurrency(monthlyData)

  // ── Срез по периоду ────────────────────────────────────────────────────────
  const lastN = monthlyData.slice(-period)
  const labels = lastN.map((d) => d.shortLabel)

  const avgExp = {}
  CURRENCIES.forEach((c) => {
    avgExp[c] = lastN.length
      ? Math.round(lastN.map((d) => d.netExpensesMapped[c] || 0).reduce((s, v) => s + v, 0) / lastN.length)
      : 0
  })

  function avgExpInCur(toCur) {
    if (!lastN.length) return null
    return Math.round(
      lastN.map((d) =>
        CURRENCIES.reduce((s, c) => s + convertCurrency(d.netExpensesMapped[c] || 0, c, toCur, d.rates || {}), 0)
      ).reduce((s, v) => s + v, 0) / lastN.length
    )
  }

  let datasets
  let tooltipCallback

  if (tab === 'by_cur') {
    const mainDatasets = CURRENCIES.map((c) => ({
      label: sym(c),
      data: lastN.map((d) => d.netExpensesMapped[c] || 0),
      borderColor: CUR_COLORS[c],
      backgroundColor: CUR_COLORS[c] + '15',
      tension: 0.35,
      fill: false,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: CUR_COLORS[c],
      pointBorderColor: CUR_COLORS[c],
    }))

    const avgDatasets = CURRENCIES.map((c) => ({
      label: `Среднее ${sym(c)}`,
      data: lastN.map(() => avgExp[c]),
      borderColor: CUR_COLORS[c],
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      tooltip: { enabled: false },
    }))

    datasets = [...mainDatasets, ...avgDatasets]

    tooltipCallback = (ctx) => {
      if (ctx.datasetIndex >= CURRENCIES.length) return null
      const c   = CURRENCIES[ctx.datasetIndex]
      const d   = lastN[ctx.dataIndex]
      const exp = d.netExpensesMapped[c] || 0
      const pct = pctOfIncome(exp, incForPct(d, c))
      const lines = [` ${fmt(exp)} ${sym(c)}`]
      if (pct !== null) lines.push(` ${pct}${pctLabel}`)
      return lines
    }
  } else {
    const toCur = tab
    const avg   = avgExpInCur(toCur)

    const expConverted = lastN.map((d) =>
      Math.round(
        CURRENCIES.reduce(
          (s, c) => s + convertCurrency(d.netExpensesMapped[c] || 0, c, toCur, d.rates || {}),
          0
        )
      )
    )
    const incForPctConverted = lastN.map((d) =>
      Math.round(
        CURRENCIES.reduce(
          (s, c) => s + convertCurrency(incForPct(d, c), c, toCur, d.rates || {}),
          0
        )
      )
    )

    datasets = [
      {
        data: expConverted,
        borderColor: CUR_COLORS[toCur],
        backgroundColor: CUR_COLORS[toCur] + '15',
        tension: 0.35,
        fill: 'origin',
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: CUR_COLORS[toCur],
        pointBorderColor: CUR_COLORS[toCur],
      },
      {
        label: 'Среднее за период',
        data: lastN.map(() => avg),
        borderColor: CUR_COLORS[toCur],
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        tooltip: { enabled: false },
      },
    ]

    tooltipCallback = (ctx) => {
      if (ctx.datasetIndex === 1) return null
      const exp = expConverted[ctx.dataIndex]
      const inc = incForPctConverted[ctx.dataIndex]
      const pct = pctOfIncome(exp, inc)
      const lines = [` ${fmt(exp)} ${sym(toCur)}`]
      if (pct !== null) lines.push(` ${pct}${pctLabel}`)
      return lines
    }
  }

  const avgConverted = tab !== 'by_cur' ? (() => {
    const toCur = tab
    const avg = avgExpInCur(toCur)
    if (avg == null) return null
    const monthlyPcts = lastN
      .map((d) => {
        const exp = CURRENCIES.reduce((s, c) => s + convertCurrency(d.netExpensesMapped[c] || 0, c, toCur, d.rates || {}), 0)
        const inc = CURRENCIES.reduce((s, c) => s + convertCurrency(incForPct(d, c), c, toCur, d.rates || {}), 0)
        return inc > 0 ? (exp / inc) * 100 : null
      })
      .filter((p) => p !== null)
    const pct = monthlyPcts.length > 0
      ? Math.round(monthlyPcts.reduce((s, v) => s + v, 0) / monthlyPcts.length)
      : null
    return { avg, pct }
  })() : null

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: tab === 'by_cur',
        position: 'top',
        labels: {
          font: { size: 11 },
          boxWidth: 10,
          padding: 12,
          filter: (item) => !item.text?.startsWith('Среднее'),
        },
      },
      tooltip: {
        callbacks: { label: (ctx) => tooltipCallback(ctx) ?? undefined },
        filter: (item) => item.datasetIndex < (tab === 'by_cur' ? CURRENCIES.length : 1),
      },
    },
    scales: {
      x: xAxisOpts(),
      y: yAxisOpts((v) => fmt(v)),
    },
  }

  return (
    <div className="card">
      <div className="chart-card-header">
        <div className="section-title">Расходы</div>
      </div>
      <div className="cur-tabs-row">
        <div className="dash-legend">
          {tab === 'by_cur' ? (
            CURRENCIES.map((c) => (
              <span key={c} className="dash-legend-item">
                <span className="dash-legend-line" style={{ borderColor: CUR_COLORS[c] }} />
                <span className="dash-legend-text" style={{ color: CUR_COLORS[c] }}>
                  {fmt(avgExp[c])} {sym(c)}
                </span>
              </span>
            ))
          ) : (
            <span className="dash-legend-item">
              <span className="dash-legend-line" style={{ borderColor: CUR_COLORS[tab] }} />
              <span className="dash-legend-text">
                {avgConverted != null ? `в среднем ${fmt(avgConverted.avg)} ${sym(tab)}${avgConverted.pct != null ? ` (${avgConverted.pct}%)` : ''}` : '—'}
              </span>
            </span>
          )}
        </div>
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
