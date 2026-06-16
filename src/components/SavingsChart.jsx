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

function pctOfIncome(saved, income) {
  return income > 0 ? Math.round((saved / income) * 100) : null
}

export default function SavingsChart({ monthlyData, tab, period, permanentOnly }) {
  function incForCur(d, c) {
    return permanentOnly
      ? ((d.permanentIncome || d.income)[c] || 0)
      : (d.income[c] || 0)
  }

  function savedForCur(d, c) {
    return incForCur(d, c) - (d.netExpensesMapped[c] || 0)
  }

  const pctLabel = permanentOnly ? '% от постоянного дохода' : '% от дохода'

  const needsRates = tab !== 'by_cur'
  const ratesOk    = hasRatesForMixedCurrency(monthlyData)

  // ── Среднее за период ───────────────────────────────────────────────────────
  const lastN = monthlyData.slice(-period)
  const avgSaved = {}
  CURRENCIES.forEach((c) => {
    avgSaved[c] = lastN.length
      ? Math.round(lastN.map((d) => savedForCur(d, c)).reduce((s, v) => s + v, 0) / lastN.length)
      : 0
  })

  // Для вкладок ₸/₽/$: средние сбережения + среднее арифметическое помесячных %
  // Каждый месяц конвертируется по СВОЕМУ зафиксированному курсу.
  function avgInCur(toCur) {
    if (!lastN.length) return null
    const saved = Math.round(
      lastN.map((d) =>
        CURRENCIES.reduce((s, c) => s + convertCurrency(savedForCur(d, c), c, toCur, d.rates || {}), 0)
      ).reduce((s, v) => s + v, 0) / lastN.length
    )
    const monthlyPcts = lastN
      .map((d) => {
        const s   = CURRENCIES.reduce((sum, c) => sum + convertCurrency(savedForCur(d, c), c, toCur, d.rates || {}), 0)
        const inc = CURRENCIES.reduce((sum, c) => sum + convertCurrency(incForCur(d, c), c, toCur, d.rates || {}), 0)
        return inc > 0 ? (s / inc) * 100 : null
      })
      .filter((p) => p !== null)
    const avgPct = monthlyPcts.length > 0
      ? Math.round(monthlyPcts.reduce((s, v) => s + v, 0) / monthlyPcts.length)
      : null
    return { saved, avgPct }
  }

  function avgLabel(c) {
    const monthlyPcts = lastN
      .map((d) => {
        const saved = savedForCur(d, c)
        const inc   = incForCur(d, c)
        return inc > 0 ? (saved / inc) * 100 : null
      })
      .filter((p) => p !== null)
    const p = monthlyPcts.length > 0
      ? Math.round(monthlyPcts.reduce((s, v) => s + v, 0) / monthlyPcts.length)
      : null
    return `${fmt(avgSaved[c])}${sym(c)}${p !== null ? ` (${p}${pctLabel})` : ''}`
  }

  const labels = lastN.map((d) => d.shortLabel)

  let datasets
  let tooltipCallback

  if (tab === 'by_cur') {
    const mainDatasets = CURRENCIES.map((c) => {
      const saved = lastN.map((d) => savedForCur(d, c))
      return {
        label: sym(c),
        data: saved,
        borderColor: CUR_COLORS[c],
        backgroundColor: CUR_COLORS[c] + '15',
        tension: 0.35,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: CUR_COLORS[c],
        pointBorderColor:     CUR_COLORS[c],
      }
    })

    const avgDatasets = CURRENCIES.map((c) => ({
      label: `Среднее ${sym(c)}`,
      data: lastN.map(() => avgSaved[c]),
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
      const c     = CURRENCIES[ctx.datasetIndex]
      const d     = lastN[ctx.dataIndex]
      const saved = savedForCur(d, c)
      const pct   = pctOfIncome(saved, incForCur(d, c))
      const lines = [` ${fmt(saved)} ${sym(c)}`]
      if (pct !== null) lines.push(` ${pct}${pctLabel}`)
      return lines
    }
  } else {
    const toCur = tab
    const avg   = avgInCur(toCur)

    const savedConverted = lastN.map((d) =>
      Math.round(
        CURRENCIES.reduce(
          (s, c) => s + convertCurrency(savedForCur(d, c), c, toCur, d.rates || {}),
          0
        )
      )
    )
    const incConverted = lastN.map((d) =>
      Math.round(
        CURRENCIES.reduce(
          (s, c) => s + convertCurrency(incForCur(d, c), c, toCur, d.rates || {}),
          0
        )
      )
    )

    datasets = [
      {
        data: savedConverted,
        borderColor: CUR_COLORS[toCur],
        backgroundColor: CUR_COLORS[toCur] + '15',
        tension: 0.35,
        fill: 'origin',
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: CUR_COLORS[toCur],
        pointBorderColor:     CUR_COLORS[toCur],
      },
      {
        label: 'Среднее за период',
        data: lastN.map(() => avg?.saved ?? null),
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
      const saved = savedConverted[ctx.dataIndex]
      const inc   = incConverted[ctx.dataIndex]
      const pct   = pctOfIncome(saved, inc)
      const lines = [` ${fmt(saved)} ${sym(toCur)}`]
      if (pct !== null) lines.push(` ${pct}${pctLabel}`)
      return lines
    }
  }

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

  const avgConverted = tab !== 'by_cur' ? avgInCur(tab) : null

  return (
    <div className="card">
      <div className="chart-card-header">
        <div className="section-title">Сбережения</div>
      </div>
      <div className="cur-tabs-row">
        <div className="dash-legend">
          {tab === 'by_cur' ? (
            CURRENCIES.map((c) => (
              <span key={c} className="dash-legend-item">
                <span className="dash-legend-line" style={{ borderColor: CUR_COLORS[c] }} />
                <span className="dash-legend-text" style={{ color: CUR_COLORS[c] }}>
                  {fmt(avgSaved[c])} {sym(c)}
                </span>
              </span>
            ))
          ) : (
            <span className="dash-legend-item">
              <span className="dash-legend-line" style={{ borderColor: CUR_COLORS[tab] }} />
              <span className="dash-legend-text">
                {avgConverted != null
                  ? `в среднем ${fmt(avgConverted.saved)} ${sym(tab)}${avgConverted.avgPct != null ? ` (${avgConverted.avgPct}%)` : ''}`
                  : '—'}
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
