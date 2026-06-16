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
import { CURRENCIES, fmt, sym } from '../utils/storage'
import { convertCurrency } from '../utils/analytics'
import {
  fmtInput, parseInput, DEFAULTS, CUR_TABS, pluralYears,
  getInitialCapital, getAvgSavings, calcProjection,
} from '../utils/forecast'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)


export default function Forecast({ state }) {
  const initCapital = useMemo(() => getInitialCapital(state), [])
  const initSavings = useMemo(() => getAvgSavings(state),     [])

  const [mode,       setMode]      = useState('split')
  const [cur,        setCur]       = useState('KZT')
  const [years,      setYears]     = useState(5)
  const [compound,   setCompound]  = useState(true)
  const [rates, setRates] = useState({ KZT: 1, RUB: 6, USD: 460 })

  useEffect(() => {
    fetch('https://api.exchangerate-api.com/v4/latest/KZT')
      .then((r) => r.json())
      .then((data) => {
        setRates({
          KZT: 1,
          RUB: data.rates.RUB ? 1 / data.rates.RUB : 6,
          USD: data.rates.USD ? 1 / data.rates.USD : 460,
        })
      })
      .catch(() => {})
  }, [])

  const [params, setParams] = useState(() => {
    const p = {}
    CURRENCIES.forEach((c) => {
      p[c] = {
        capital:   initCapital[c],
        savings:   Math.max(0, initSavings[c]),
        rate:      DEFAULTS[c].rate,
        inflation: DEFAULTS[c].inflation,
      }
    })
    return p
  })

  function setParam(c, key, value) {
    setParams((prev) => ({ ...prev, [c]: { ...prev[c], [key]: value } }))
  }

  const splitResult = useMemo(() => {
    const p = params[cur]
    return calcProjection(p.capital, p.savings, p.rate, p.inflation, years, compound)
  }, [params, cur, years, compound])

  const combinedResult = useMemo(() => {
    const proj = {}
    CURRENCIES.forEach((c) => {
      const p = params[c]
      proj[c] = calcProjection(p.capital, p.savings, p.rate, p.inflation, years, compound)
    })
    const labels = proj.KZT.labels
    const nominals = labels.map((_, i) =>
      Math.round(CURRENCIES.reduce((sum, c) => sum + convertCurrency(proj[c].nominals[i], c, cur, rates), 0))
    )
    const reals = labels.map((_, i) =>
      Math.round(CURRENCIES.reduce((sum, c) => sum + convertCurrency(proj[c].reals[i], c, cur, rates), 0))
    )
    const finalNominal = nominals[nominals.length - 1] ?? 0
    const finalReal    = reals[reals.length - 1]    ?? 0
    const totalContributed = Math.round(
      CURRENCIES.reduce((sum, c) => {
        return sum + convertCurrency(params[c].capital + params[c].savings * years * 12, c, cur, rates)
      }, 0)
    )
    return { nominals, reals, labels, finalNominal, finalReal, totalContributed }
  }, [params, cur, years, compound, rates])

  const result = mode === 'split' ? splitResult : combinedResult
  const p = params[cur]

  const totalContributed = mode === 'split'
    ? p.capital + p.savings * years * 12
    : combinedResult.totalContributed

  const interestEarned = result.finalNominal - totalContributed
  const realYield      = mode === 'split' ? p.rate - p.inflation : null

  const chartData = {
    labels: result.labels,
    datasets: [
      {
        label: 'Номинальный',
        data: result.nominals,
        borderColor: '#5B6FE6',
        backgroundColor: '#5B6FE610',
        tension: 0.35,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
      },
      {
        label: 'Реальный (−инфляция)',
        data: result.reals,
        borderColor: '#aaa',
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        tension: 0.35,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 1.5,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: { font: { size: 11 }, boxWidth: 12, padding: 12 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${fmt(ctx.parsed.y)} ${sym(cur)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 11 } },
        grid:  { display: false },
      },
      y: {
        ticks: {
          font: { size: 11 },
          callback: (v) => {
            if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
            if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
            return fmt(v)
          },
        },
        grid: { color: 'rgba(128,128,128,.1)' },
      },
    },
  }

  return (
    <div>
      {/* Tabs row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="cur-tabs" style={{ marginBottom: 0 }}>
          {CUR_TABS.map((t) => (
            <button
              key={t.id}
              className={`cur-tab${cur === t.id ? ' active' : ''}`}
              onClick={() => setCur(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="cur-tabs" style={{ marginBottom: 0 }}>
          <button
            className={`cur-tab${mode === 'split' ? ' active' : ''}`}
            onClick={() => setMode('split')}
          >
            По валютам
          </button>
          <button
            className={`cur-tab${mode === 'combined' ? ' active' : ''}`}
            onClick={() => setMode('combined')}
          >
            Суммарно
          </button>
        </div>
      </div>

      {/* Params */}
      <div className="card">
        {mode === 'split' ? (
          <div className="forecast-grid">
            <div className="forecast-param">
              <label className="forecast-label">Начальный капитал</label>
              <div className="forecast-input-row">
                <input
                  type="text"
                  inputMode="numeric"
                  value={fmtInput(p.capital)}
                  onChange={(e) => setParam(cur, 'capital', +parseInput(e.target.value) || 0)}
                />
                <span className="cur-label">{sym(cur)}</span>
              </div>
            </div>
            <div className="forecast-param">
              <label className="forecast-label">Ежемесячные сбережения</label>
              <div className="forecast-input-row">
                <input
                  type="text"
                  inputMode="numeric"
                  value={fmtInput(p.savings)}
                  onChange={(e) => setParam(cur, 'savings', +parseInput(e.target.value) || 0)}
                />
                <span className="cur-label">{sym(cur)}</span>
              </div>
            </div>
            <div className="forecast-param">
              <label className="forecast-label">Ставка вклада, % год.</label>
              <div className="forecast-input-row">
                <input
                  type="number"
                  step="0.1"
                  value={p.rate || ''}
                  min={0}
                  onChange={(e) => setParam(cur, 'rate', +e.target.value)}
                />
                <span className="cur-label">%</span>
              </div>
            </div>
            <div className="forecast-param">
              <label className="forecast-label">Инфляция, % год.</label>
              <div className="forecast-input-row">
                <input
                  type="number"
                  step="0.1"
                  value={p.inflation || ''}
                  min={0}
                  onChange={(e) => setParam(cur, 'inflation', +e.target.value)}
                />
                <span className="cur-label">%</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Exchange rates inputs */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="forecast-label" style={{ marginBottom: 0 }}>Курс:</span>
              <div className="forecast-input-row">
                <span className="cur-label" style={{ marginRight: 4 }}>1&nbsp;$&nbsp;=</span>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={Math.round(rates.USD)}
                  style={{ width: 72 }}
                  onChange={(e) => setRates((r) => ({ ...r, USD: +e.target.value || 1 }))}
                />
                <span className="cur-label">₸</span>
              </div>
              <div className="forecast-input-row">
                <span className="cur-label" style={{ marginRight: 4 }}>1&nbsp;₽&nbsp;=</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={+rates.RUB.toFixed(2)}
                  style={{ width: 72 }}
                  onChange={(e) => setRates((r) => ({ ...r, RUB: +e.target.value || 1 }))}
                />
                <span className="cur-label">₸</span>
              </div>
            </div>

            {/* Per-currency params table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingBottom: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }} />
                    {CUR_TABS.map((t) => (
                      <th key={t.id} style={{ textAlign: 'left', paddingBottom: 8, paddingLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {t.label}
                      </th>
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
                      <td style={{ paddingRight: 12, paddingBottom: 8, fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>
                        {row.label}
                      </td>
                      {CURRENCIES.map((c) => (
                        <td key={c} style={{ paddingLeft: 8, paddingBottom: 8 }}>
                          <div className="forecast-input-row">
                            {row.numeric ? (
                              <input
                                type="number"
                                step={row.step}
                                value={params[c][row.key]}
                                min={0}
                                style={{ width: 60 }}
                                onChange={(e) => setParam(c, row.key, +e.target.value || 0)}
                              />
                            ) : (
                              <input
                                type="text"
                                inputMode="numeric"
                                value={fmtInput(params[c][row.key])}
                                style={{ width: 80 }}
                                onChange={(e) => setParam(c, row.key, +parseInput(e.target.value) || 0)}
                              />
                            )}
                            <span className="cur-label">{row.unit || sym(c)}</span>
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
          <span className="forecast-slider-label">Срок прогноза</span>
          <input
            type="range"
            min={1}
            max={10}
            value={years}
            onChange={(e) => setYears(+e.target.value)}
            className="forecast-slider"
          />
          <span className="forecast-slider-value">{years} {pluralYears(years)}</span>
        </div>

        <label className="forecast-checkbox">
          <input
            type="checkbox"
            checked={compound}
            onChange={(e) => setCompound(e.target.checked)}
          />
          Сложный процент (реинвестирование)
        </label>
      </div>

      {/* Chart */}
      <div className="card">
        <div style={{ position: 'relative', height: 240 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Metrics */}
      <div className="metric-grid">
        <div className="forecast-metric">
          <div className="forecast-metric-label">Номинальный капитал</div>
          <div className="forecast-metric-value">{fmt(result.finalNominal)} {sym(cur)}</div>
        </div>
        <div className="forecast-metric">
          <div className="forecast-metric-label">Реальный капитал</div>
          <div className="forecast-metric-value">{fmt(result.finalReal)} {sym(cur)}</div>
        </div>
        <div className="forecast-metric">
          <div className="forecast-metric-label">Заработано процентами</div>
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
    </div>
  )
}
