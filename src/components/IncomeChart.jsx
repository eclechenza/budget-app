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

export default function IncomeChart({ monthlyData, tab, period, permanentOnly }) {
  const hasAnyIncome = monthlyData.some((d) =>
    CURRENCIES.some((c) => (d.income[c] || 0) > 0)
  )
  if (!hasAnyIncome) return null

  // Если тоггл постоянного дохода включён — берём permanentIncome, иначе весь доход
  function effInc(d, c) {
    if (permanentOnly) return (d.permanentIncome || d.income)[c] || 0
    return d.income[c] || 0
  }

  const needsRates = tab !== 'by_cur'
  const ratesOk    = hasRatesForMixedCurrency(monthlyData)

  // ── Срез по периоду ────────────────────────────────────────────────────────
  const lastN = monthlyData.slice(-period)

  const avgInc6 = {}
  CURRENCIES.forEach((c) => {
    avgInc6[c] = lastN.length
      ? Math.round(lastN.map((d) => effInc(d, c)).reduce((s, v) => s + v, 0) / lastN.length)
      : 0
  })

  function avgIncInCur(toCur) {
    if (!lastN.length) return null
    return Math.round(
      lastN
        .map((d) =>
          CURRENCIES.reduce((s, c) => s + convertCurrency(effInc(d, c), c, toCur, d.rates || {}), 0)
        )
        .reduce((s, v) => s + v, 0) / lastN.length
    )
  }

  const labels = lastN.map((d) => d.shortLabel)

  let datasets
  let tooltipCallback

  if (tab === 'by_cur') {
    const avgDatasets = CURRENCIES.map((c) => {
      const avg = avgInc6[c]
      return {
        label: `Среднее ${sym(c)}`,
        data: lastN.map(() => avg),
        borderColor: CUR_COLORS[c],
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        tooltip: { enabled: false },
      }
    })

    datasets = [
      ...CURRENCIES.map((c) => {
        const inc = lastN.map((d) => effInc(d, c))
        return {
          label: sym(c),
          data: inc,
          borderColor: CUR_COLORS[c],
          backgroundColor: CUR_COLORS[c] + '15',
          tension: 0.35,
          fill: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: CUR_COLORS[c],
          pointBorderColor: CUR_COLORS[c],
        }
      }),
      ...avgDatasets,
    ]

    tooltipCallback = (ctx) => {
      if (ctx.datasetIndex >= CURRENCIES.length) return null
      const c = CURRENCIES[ctx.datasetIndex]
      return ` ${fmt(effInc(lastN[ctx.dataIndex], c))} ${sym(c)}`
    }
  } else {
    const toCur = tab
    const incConverted = lastN.map((d) =>
      Math.round(
        CURRENCIES.reduce(
          (s, c) => s + convertCurrency(effInc(d, c), c, toCur, d.rates || {}),
          0
        )
      )
    )
    const avg = avgIncInCur(toCur)

    datasets = [
      {
        data: incConverted,
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
        label: `Среднее за период`,
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
      return ` ${fmt(incConverted[ctx.dataIndex])} ${sym(toCur)}`
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
        callbacks: {
          label: (ctx) => {
            const result = tooltipCallback(ctx)
            return result ?? undefined
          },
        },
        filter: (item) => item.datasetIndex < (tab === 'by_cur' ? CURRENCIES.length : 1),
      },
    },
    scales: {
      x: xAxisOpts(),
      y: yAxisOpts((v) => fmt(v)),
    },
  }

  const avgConverted = tab !== 'by_cur' ? avgIncInCur(tab) : null

  return (
    <div className="card">
      <div className="chart-card-header">
        <div className="section-title">Доходы</div>
      </div>
      <div className="cur-tabs-row">
        <div className="dash-legend">
          {tab === 'by_cur' ? (
            CURRENCIES.map((c) => (
              <span key={c} className="dash-legend-item">
                <span className="dash-legend-line" style={{ borderColor: CUR_COLORS[c] }} />
                <span className="dash-legend-text" style={{ color: CUR_COLORS[c] }}>
                  {fmt(avgInc6[c])} {sym(c)}
                </span>
              </span>
            ))
          ) : (
            <span className="dash-legend-item">
              <span className="dash-legend-line" style={{ borderColor: CUR_COLORS[tab] }} />
              <span className="dash-legend-text">
                {avgConverted != null ? `в среднем ${fmt(avgConverted)} ${sym(tab)}` : '—'}
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
