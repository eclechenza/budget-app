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
import { CURRENCIES, fmt, sym } from '../utils/storage'
import { CUR_COLORS, convertCurrency, xAxisOpts, yAxisOpts, hasRatesForMixedCurrency } from '../utils/analytics'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler)

export default function NetWorthChart({ monthlyData: allMonthlyData, tab, period }) {
  const monthlyData = allMonthlyData.slice(-period)
  const labels = monthlyData.map((d) => d.shortLabel)
  const needsRates = tab !== 'by_cur'
  const ratesOk    = hasRatesForMixedCurrency(monthlyData)

  let datasets
  let growthPct = null
  let avgMonthlyChange = null

  if (tab === 'by_cur') {
    // Три отдельные линии — без конвертации
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
    // Одна линия — суммарный капитал в выбранной валюте по курсу КАЖДОГО месяца
    const toCur = tab
    const values = monthlyData.map((d) =>
      Math.round(
        CURRENCIES.reduce(
          (s, c) => s + convertCurrency(d.balances[c] || 0, c, toCur, d.rates || {}),
          0
        )
      )
    )

    if (values.length >= 2) {
      const first = values[0]
      const last  = values[values.length - 1]
      avgMonthlyChange = Math.round((last - first) / (values.length - 1))
      growthPct = first !== 0 ? Math.round(((last - first) / Math.abs(first)) * 100) : null
    }

    datasets = [
      {
        label: `Капитал, ${sym(toCur)}`,
        data: values,
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

  return (
    <div className="card">
      <div className="chart-card-header">
        <div className="section-title">Капитал</div>
      </div>
      {growthPct !== null && (
        <div className="cur-tabs-row">
          <div className="dash-legend">
            <span className="dash-legend-item">
              <span className="dash-legend-text">
                в среднем {avgMonthlyChange >= 0 ? '+' : ''}{fmt(avgMonthlyChange)} {sym(tab)} в месяц · {growthPct >= 0 ? '+' : ''}{growthPct}% за период
              </span>
            </span>
          </div>
        </div>
      )}
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
