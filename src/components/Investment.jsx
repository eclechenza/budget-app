import { useState, useMemo, useEffect, useRef } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, BarElement, LineElement, PointElement, LinearScale, CategoryScale, Filler } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import data from '../data/investment.json'

ChartJS.register(ArcElement, Tooltip, BarElement, LineElement, PointElement, LinearScale, CategoryScale, Filler)

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function useChartColors() {
  const [colors, setColors] = useState(() => ({
    textMuted: getCssVar('--text-muted') || '#888',
    border: getCssVar('--border') || 'rgba(0,0,0,.1)',
  }))
  const observer = useRef(null)
  useEffect(() => {
    observer.current = new MutationObserver(() => {
      setColors({
        textMuted: getCssVar('--text-muted') || '#888',
        border: getCssVar('--border') || 'rgba(0,0,0,.1)',
      })
    })
    observer.current.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.current.disconnect()
  }, [])
  return colors
}

function fmt(n, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function PnlBadge({ value, suffix = '' }) {
  const pos = value >= 0
  return (
    <span style={{ color: pos ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
      {pos ? '+' : ''}{fmt(value)}{suffix}
    </span>
  )
}

const TICKER_COLORS = ['#4f8ef7', '#a78bfa']

const TICKER_HISTORY = {
  VOO: { close: null, color: '#4f8ef7' },
  VT:  { close: null, color: '#a78bfa' },
}

function getTickerClose(ticker) {
  if (ticker === 'VOO') return data.history.vooClose
  if (ticker === 'VT')  return data.history.vtClose
  return []
}

const PRICE_PERIODS = [
  { id: '1M',  label: '1 мес', days: 30  },
  { id: '3M',  label: '3 мес', days: 90  },
  { id: '6M',  label: '6 мес', days: 180 },
  { id: '1Y',  label: '1 год', days: 252 },
]

function PositionChart({ position }) {
  const { textMuted, border } = useChartColors()
  const [period, setPeriod] = useState('1Y')
  const close = getTickerClose(position.ticker)
  const days  = PRICE_PERIODS.find(p => p.id === period)?.days ?? 252
  const slicedClose  = close.slice(-days)
  const slicedDates  = data.history.dates.slice(-days)
  const color = TICKER_COLORS[data.positions.findIndex(p => p.ticker === position.ticker)]

  const labels = slicedDates.map((d, i) => {
    const [, m, ] = d.split('-')
    const prev = slicedDates[i - 1]
    if (i === 0 || !prev || prev.slice(5, 7) !== m) {
      return ['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][+m]
    }
    return ''
  })

  const isUp = slicedClose[slicedClose.length - 1] >= slicedClose[0]
  const lineColor = isUp ? '#22c55e' : '#ef4444'

  const chartData = {
    labels,
    datasets: [{
      data: slicedClose,
      borderColor: lineColor,
      backgroundColor: lineColor + '18',
      borderWidth: 3,
      pointRadius: 0,
      fill: 'origin',
      tension: 0.35,
    }]
  }

  const yMin = Math.min(...slicedClose)
  const yMax = Math.max(...slicedClose)
  const yPad = (yMax - yMin) * 0.1 || 5

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => slicedDates[items[0].dataIndex],
          label: (item) => ` $${fmt(item.raw)}`,
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: textMuted, font: { size: 10 }, maxRotation: 0, maxTicksLimit: 7 },
        border: { display: false },
      },
      y: {
        position: 'right',
        min: yMin - yPad,
        max: yMax + yPad,
        grid: { color: border },
        ticks: { color: textMuted, font: { size: 10 }, callback: v => '$' + fmt(v, 0) },
        border: { display: false },
      }
    }
  }

  return (
    <div className="position-chart-expand">
      <div style={{ height: 140, position: 'relative' }}>
        <Line data={chartData} options={options} />
      </div>
      <div className="portfolio-periods" style={{ marginTop: 8 }}>
        {PRICE_PERIODS.map(p => (
          <button
            key={p.id}
            className={`period-btn${period === p.id ? ' active' : ''}`}
            onClick={e => { e.stopPropagation(); setPeriod(p.id) }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Build daily portfolio value from purchase date using trade history
function buildNavSeries(positions, history, trades) {
  // Earliest purchase date
  const startDate = trades.reduce((min, t) => t.date < min ? t.date : min, trades[0].date)

  // Current holdings per ticker
  const qty = {}
  positions.forEach(p => { qty[p.ticker] = p.quantity })

  const series = []
  for (let i = 0; i < history.dates.length; i++) {
    const d = history.dates[i]
    if (d < startDate) continue
    const nav = (qty['VOO'] || 0) * history.vooClose[i] + (qty['VT'] || 0) * history.vtClose[i]
    series.push({ date: d, nav: +nav.toFixed(2) })
  }
  return series
}

function groupByMonth(series) {
  const months = {}
  series.forEach(({ date, nav }) => {
    const key = date.slice(0, 7) // YYYY-MM
    months[key] = nav // last day of month wins
  })
  return Object.entries(months).map(([key, nav]) => ({
    label: (() => {
      const [y, m] = key.split('-')
      const names = ['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
      return `${names[+m]} ${y.slice(2)}`
    })(),
    nav,
  }))
}

const PERIODS = [
  { id: '1W',  label: '7 дн',  days: 7   },
  { id: '1M',  label: '1 мес', days: 30  },
  { id: '3M',  label: '3 мес', days: 90  },
  { id: '6M',  label: '6 мес', days: 180 },
  { id: '1Y',  label: '1 год', days: 365 },
]

export default function Investment() {
  const { textMuted, border } = useChartColors()
  const [expandedTicker, setExpandedTicker] = useState(null)
  const allSeries = useMemo(() => buildNavSeries(data.positions, data.history, data.trades), [])

  const filtered = allSeries

  const useMonthly = filtered.length > 60
  const chartPoints = useMonthly ? groupByMonth(filtered) : filtered.map(s => ({
    label: (() => {
      const [, m, d] = s.date.split('-')
      return `${+d} ${['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][+m]}`
    })(),
    nav: s.nav,
  }))

  const startNav = filtered[0]?.nav ?? 0
  const endNav   = filtered[filtered.length - 1]?.nav ?? 0
  const gain     = endNav - startNav
  const gainPct  = startNav > 0 ? gain / startNav * 100 : 0
  const isUp     = gain >= 0
  const accentColor = isUp ? '#22c55e' : '#ef4444'

  const chartData = {
    labels: chartPoints.map(p => p.label),
    datasets: [{
      data: chartPoints.map(p => p.nav),
      backgroundColor: useMonthly ? accentColor + 'cc' : accentColor + '18',
      borderColor: accentColor,
      borderWidth: useMonthly ? 0 : 3,
      borderRadius: useMonthly ? 6 : 0,
      pointRadius: 0,
      fill: useMonthly ? false : 'origin',
      tension: 0.35,
    }]
  }

  const yMin = Math.min(...chartPoints.map(p => p.nav))
  const yMax = Math.max(...chartPoints.map(p => p.nav))
  const yPad = (yMax - yMin) * 0.1 || 100

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => chartPoints[items[0].dataIndex]?.label,
          label: (item) => ` $${fmt(item.raw)}`,
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: textMuted, font: { size: 11 }, maxRotation: 0, maxTicksLimit: 8 },
        border: { display: false },
      },
      y: {
        position: 'right',
        min: yMin - yPad,
        max: yMax + yPad,
        grid: { color: border },
        ticks: { color: textMuted, font: { size: 11 }, callback: v => '$' + fmt(v, 0) },
        border: { display: false },
      }
    }
  }

  const totalCost = data.positions.reduce((s, p) => s + p.averagePrice * p.quantity, 0)
  const totalReturn = totalCost > 0 ? (data.nav - data.cash - totalCost) / totalCost * 100 : 0

  const doughnutData = {
    labels: data.positions.map(p => p.ticker),
    datasets: [{
      data: data.positions.map(p => p.marketValue),
      backgroundColor: TICKER_COLORS,
      borderWidth: 0,
      hoverOffset: 6,
    }]
  }
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: (ctx) => ` $${fmt(ctx.raw)} (${fmt(ctx.raw / (data.nav - data.cash) * 100, 1)}%)`
    }}}
  }

  const updatedStr = new Date(data.updatedAt).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div className="portfolio-page">
      <div className="portfolio-header">
        <div>
          <div className="portfolio-title">Инвестиции · IBKR</div>
          <div className="portfolio-updated">Обновлено {updatedStr}</div>
        </div>
      </div>

      <div className="portfolio-summary-row">
        <div className="tile">
          <div className="tile-label">Стоимость</div>
          <div className="tile-value">${fmt(data.nav)}</div>
          <div className="tile-sub" style={{ color: 'var(--text-muted)' }}>Cash ${fmt(data.cash)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Доходность</div>
          <div className="tile-value"><PnlBadge value={totalReturn} suffix="%" /></div>
          <div className="tile-sub"><PnlBadge value={data.unrealizedPnl} /> USD</div>
        </div>
        <div className="tile">
          <div className="tile-label">Дневной P&L</div>
          <div className="tile-value">
            <PnlBadge value={data.positions.reduce((s, p) => s + p.dailyPnl, 0)} />
          </div>
          <div className="tile-sub" style={{ color: 'var(--text-muted)' }}>USD</div>
        </div>
      </div>

      <div className="portfolio-nav-chart card">
        <div className="portfolio-chart-top">
          <div>
            <div className="tile-value">${fmt(endNav)}</div>
            <div className="tile-sub">
              <PnlBadge value={gain} /> · <PnlBadge value={gainPct} suffix="%" />
              {' '}за период
            </div>
          </div>
        </div>

        <div style={{ height: 200, position: 'relative', marginTop: 12 }}>
          {useMonthly
            ? <Bar  data={chartData} options={commonOptions} />
            : <Line data={chartData} options={commonOptions} />
          }
        </div>

      </div>

      <div className="portfolio-main">
        <div className="portfolio-positions-block">
          <div className="section-title">Позиции</div>
          <div className="portfolio-positions">
          {data.positions.map(p => {
            const isOpen = expandedTicker === p.ticker
            return (
              <div
                key={p.ticker}
                className={`position-card${isOpen ? ' expanded' : ''}`}
                onClick={() => setExpandedTicker(isOpen ? null : p.ticker)}
                style={{ cursor: 'pointer' }}
              >
                <div className="position-card-row">
                  <div className="position-left">
                    <div className="position-ticker">{p.ticker}</div>
                    <div className="position-desc">{p.description}</div>
                    <div className="position-qty">{p.quantity} шт · ср. ${fmt(p.averagePrice)}</div>
                  </div>
                  <div className="position-right">
                    <div className="position-value">${fmt(p.marketValue)}</div>
                    <div className="position-price" style={{ color: 'var(--text-2)' }}>${fmt(p.marketPrice)}</div>
                    <div className="position-pnl"><PnlBadge value={p.unrealizedPnl} /></div>
                    <div className="position-daily" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      день: <PnlBadge value={p.dailyPnl} />
                    </div>
                  </div>
                </div>
                {isOpen && <PositionChart position={p} />}
              </div>
            )
          })}
          </div>
        </div>

        <div className="portfolio-chart-block">
          <div className="section-title">Аллокация</div>
          <div style={{ height: 200, position: 'relative' }}>
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
          <div className="portfolio-legend">
            {data.positions.map((p, i) => (
              <div key={p.ticker} className="portfolio-legend-item">
                <span className="portfolio-legend-dot" style={{ background: TICKER_COLORS[i] }} />
                <span>{p.ticker}</span>
                <span style={{ color: 'var(--text-2)', marginLeft: 'auto' }}>
                  {fmt(p.marketValue / (data.nav - data.cash) * 100, 1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
