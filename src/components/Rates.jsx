import { useState, useEffect, useMemo, Fragment } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
} from 'chart.js'
import { CUR_COLORS, xAxisOpts, yAxisOpts } from '../utils/analytics'
import { closedMonths, monthLabel } from '../utils/storage'
import {
  loadRatesStore,
  setMonthRatesBatch,
  listStoredMonths,
  getUsageMap,
  monthFromKey,
} from '../utils/rates'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Filler)

// ─── Конфиг пар ────────────────────────────────────────────────────────────
const PAIRS = [
  { id: 'RUB_KZT', symbols: '₽ → ₸', flags: '🇷🇺🇰🇿', unit: '₸', fromUnit: '₽', toUnit: '₸', precision: 3, color: CUR_COLORS.KZT, get: (r) => r.rub_kzt },
  { id: 'USD_KZT', symbols: '$ → ₸',  flags: '🇺🇸🇰🇿', unit: '₸', fromUnit: '$',  toUnit: '₸', precision: 2, color: CUR_COLORS.USD, get: (r) => r.usd_kzt },
  { id: 'USD_RUB', symbols: '$ → ₽',  flags: '🇺🇸🇷🇺', unit: '₽', fromUnit: '$',  toUnit: '₽', precision: 2, color: CUR_COLORS.RUB, get: (r) => r.usd_rub },
]

const PERIODS = [
  { id: '1m', label: '1 месяц', days: 30,  step: 1  },
  { id: '1y', label: '12 месяцев', days: 365, step: 30 },
]

// ─── Утилиты дат ───────────────────────────────────────────────────────────
function ymd(d) {
  return d.toISOString().slice(0, 10)
}

function buildDates(period) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const out = []
  // Идём от старого к новому
  for (let i = period.days; i >= 0; i -= period.step) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    out.push(ymd(d))
  }
  return out
}

// ─── Сеть ──────────────────────────────────────────────────────────────────
async function fetchOne(dateStr) {
  // Основной + запасной CDN
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json`,
    `https://${dateStr}.currency-api.pages.dev/v1/currencies/usd.json`,
  ]
  for (const url of urls) {
    try {
      const r = await fetch(url)
      if (!r.ok) continue
      const j = await r.json()
      const usd = j.usd || {}
      const kzt = +usd.kzt
      const rub = +usd.rub
      if (!kzt || !rub) continue
      return { date: j.date || dateStr, usd_kzt: kzt, usd_rub: rub, rub_kzt: kzt / rub }
    } catch (e) {}
  }
  return null
}

async function fetchSeries(period) {
  const dates = buildDates(period)
  const results = await Promise.all(dates.map(fetchOne))
  return results.filter(Boolean)
}

// Текущий курс — сначала NBK (официальный KZT-курс), затем fawazahmed0 как запасной.
// Используется ТОЛЬКО для отображения карточек на этой вкладке.
async function fetchLatest() {
  // 1. exchangerate-api.com — тот же источник что используется в расчётах приложения
  const today = ymd(new Date())
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/KZT', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      const rub_kzt = data.rates?.RUB ? 1 / data.rates.RUB : null
      const usd_kzt = data.rates?.USD ? 1 / data.rates.USD : null
      if (rub_kzt && usd_kzt) {
        return { date: today, usd_kzt, rub_kzt, usd_rub: usd_kzt / rub_kzt }
      }
    }
  } catch (e) {}

  // 2. Fallback: fawazahmed0 CDN
  const bust = Date.now()
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json?_=${bust}`,
    `https://latest.currency-api.pages.dev/v1/currencies/usd.json?_=${bust}`,
  ]
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: 'no-store' })
      if (!r.ok) continue
      const j = await r.json()
      const usd = j.usd || {}
      const kzt = +usd.kzt
      const rub = +usd.rub
      if (!kzt || !rub) continue
      return { date: j.date, usd_kzt: kzt, usd_rub: rub, rub_kzt: kzt / rub }
    } catch (e) {}
  }
  return null
}

// ─── Формат вывода ─────────────────────────────────────────────────────────
function fmtRate(v, precision) {
  if (v == null || !isFinite(v)) return '—'
  return Number(v).toLocaleString('ru', { minimumFractionDigits: precision, maximumFractionDigits: precision })
}

// Как часто обновляем «текущий» курс. fawazahmed0 публикует раз в сутки,
// 15 минут — компромисс между свежестью и нагрузкой на CDN.
const LATEST_REFRESH_MS = 15 * 60 * 1000

// Строит список дат «1 число месяца» за последние monthsBack месяцев включая текущий.
// Будущие 1-е числа пропускает.
function firstOfMonthDates(monthsBack) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const out = []
  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    if (d > today) continue
    out.push(ymd(d))
  }
  return out
}

async function fetchFirstOfMonthSeries(monthsBack) {
  const dates = firstOfMonthDates(monthsBack)
  const results = await Promise.all(dates.map(fetchOne))
  return results.filter(Boolean)
}

// Серия из 1-х чисел уже одна точка на месяц — просто разложить по ключу YYYY-MM.
function snapshotFromFirstOfMonth(series) {
  const out = {}
  series.forEach((pt) => {
    if (!pt?.date) return
    const mk = pt.date.slice(0, 7)
    out[mk] = {
      usd_kzt: pt.usd_kzt,
      rub_kzt: pt.rub_kzt,
      usd_rub: pt.usd_rub,
      date: pt.date,
      source: 'fetched',
    }
  })
  return out
}

// Сколько месяцев истории фиксируем: покрываем самый ранний закрытый месяц, минимум 13.
function monthsBackFor(state) {
  const MIN = 13
  const closed = state ? closedMonths(state) : []
  const earliest = closed[0]
  if (!earliest) return MIN
  const { year, month } = monthFromKey(earliest)
  const today = new Date()
  const diff = (today.getUTCFullYear() - year) * 12 + (today.getUTCMonth() - month)
  return Math.max(MIN, diff)
}

// ─── Корневой компонент ────────────────────────────────────────────────────
export default function Rates({ state }) {
  const [seriesByPeriod, setSeriesByPeriod] = useState({ '1m': null, '1y': null })
  const [latest, setLatest] = useState(null)
  const [error, setError] = useState(false)
  const [storeVersion, setStoreVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  // Исторические серии для графиков — грузим один раз
  useEffect(() => {
    let cancelled = false
    setError(false)
    Promise.all(PERIODS.map((p) => fetchSeries(p).then((s) => [p.id, s])))
      .then((pairs) => {
        if (cancelled) return
        const map = Object.fromEntries(pairs)
        if (Object.values(map).some((s) => !s || s.length === 0)) {
          setError(true)
          return
        }
        setSeriesByPeriod(map)
      })
      .catch(() => !cancelled && setError(true))
    return () => { cancelled = true }
  }, [])

  // Фиксируем помесячные снапшоты — котировка строго на 1 число каждого месяца.
  // Диапазон зависит от самого раннего закрытого месяца, минимум 13.
  useEffect(() => {
    let cancelled = false
    const monthsBack = monthsBackFor(state)
    fetchFirstOfMonthSeries(monthsBack)
      .then((series) => {
        if (cancelled || !series.length) return
        const snap = snapshotFromFirstOfMonth(series)
        setMonthRatesBatch(snap, { overwrite: true })
        setStoreVersion((v) => v + 1)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [state])

  // Актуальный курс — отдельно: при монтировании, по таймеру и при возврате во вкладку.
  // Используется ТОЛЬКО для отображения карточек, в расчёты не попадает.
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      fetchLatest().then((r) => { if (!cancelled && r) setLatest(r) })
    }
    refresh()
    const id = setInterval(refresh, LATEST_REFRESH_MS)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (error) {
    return <p className="empty">⚠ Не удалось загрузить курсы валют.</p>
  }

  const loading = !seriesByPeriod['1m'] || !seriesByPeriod['1y']
  if (loading) {
    return <p className="empty small">Загрузка курсов…</p>
  }

  function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    fetchLatest().then((r) => {
      if (r) setLatest(r)
      setRefreshing(false)
    }).catch(() => setRefreshing(false))
  }

  return (
    <>
      <div className="rates-toolbar">
        <button className="rates-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Обновление…' : 'Обновить'}
        </button>
      </div>
      <div className="rates-list">
        {PAIRS.map((pair) => (
          <RateBlock key={pair.id} pair={pair} seriesByPeriod={seriesByPeriod} latest={latest} />
        ))}
      </div>
      <CrossRateCalc />
      <FixedRatesTable state={state} storeVersion={storeVersion} />
    </>
  )
}

// ─── Форматирование с разделителями тысяч ──────────────────────────────────
function fmtThousands(str) {
  if (!str) return ''
  const parts = str.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return parts.join('.')
}

function parseRaw(str) {
  return str.replace(/[ \s ]/g, '').replace(',', '.')
}

function fmtResult(num, precision) {
  if (num == null || !isFinite(num)) return ''
  return num.toLocaleString('ru', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
}

// ─── Блок одной пары ───────────────────────────────────────────────────────
function RateBlock({ pair, seriesByPeriod, latest }) {
  const [chartOpen, setChartOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [swapped, setSwapped] = useState(false)

  const series = seriesByPeriod['1y'] || []

  const latestSeries = seriesByPeriod['1m'] || []
  const fallback = latestSeries.length ? pair.get(latestSeries[latestSeries.length - 1]) : null
  const rawCurrent = latest ? pair.get(latest) : fallback
  const current = rawCurrent != null
    ? parseFloat(rawCurrent.toFixed(pair.precision))
    : null

  const todayStr = ymd(new Date())
  const todayLabel = new Date(todayStr).toLocaleDateString('ru', { day: '2-digit', month: 'short' })

  const values = useMemo(() => {
    const base = series.map(pair.get)
    const lastDate = series.length ? series[series.length - 1].date : null
    if (current != null && lastDate !== todayStr) base.push(current)
    return base
  }, [series, pair, current, todayStr])

  const labels = useMemo(() => {
    const base = series.map((r) => {
      const d = new Date(r.date)
      const mon = d.toLocaleDateString('ru', { month: 'short' })
      const yr = String(d.getUTCFullYear()).slice(2)
      return `${mon} '${yr}`
    })
    const lastDate = series.length ? series[series.length - 1].date : null
    if (current != null && lastDate !== todayStr) {
      const d = new Date(todayStr)
      const mon = d.toLocaleDateString('ru', { month: 'short' })
      const yr = String(d.getUTCFullYear()).slice(2)
      base.push(`${mon} '${yr}`)
    }
    return base
  }, [series, current, todayStr])

  const yearSeries = seriesByPeriod['1y'] || []
  const yearValues = useMemo(() => yearSeries.map(pair.get), [yearSeries, pair])
  const first = yearValues.length ? yearValues[0] : null
  const yearCurrent = yearValues.length ? yearValues[yearValues.length - 1] : null
  const change = first != null && yearCurrent != null ? yearCurrent - first : 0
  const changePct = first ? (change / first) * 100 : 0
  const changeClass = change > 0 ? 'pos' : change < 0 ? 'neg' : ''
  const changeSign = change > 0 ? '+' : ''

  const fromUnit = swapped ? pair.toUnit : pair.fromUnit
  const toUnit   = swapped ? pair.fromUnit : pair.toUnit
  const effectiveRate = current != null ? (swapped ? 1 / current : current) : null
  const numAmount = parseFloat(parseRaw(amount)) || 0
  const resultNum = effectiveRate != null && amount !== '' ? numAmount * effectiveRate : null

  function handleAmountChange(e) {
    let val = parseRaw(e.target.value).replace(/[^\d.]/g, '')
    const dot = val.indexOf('.')
    if (dot !== -1) val = val.slice(0, dot + 1) + val.slice(dot + 1).replace(/\./g, '')
    setAmount(val)
  }

  const data = {
    labels,
    datasets: [
      {
        label: pair.title,
        data: values,
        borderColor: pair.color,
        backgroundColor: pair.color + '22',
        borderWidth: 2,
        tension: 0.35,
        fill: 'origin',
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${fmtRate(ctx.parsed.y, pair.precision)} ${pair.unit}`,
        },
      },
    },
    scales: {
      x: { ...xAxisOpts(), ticks: { ...xAxisOpts().ticks, maxTicksLimit: 14, includeBounds: true } },
      y: yAxisOpts((v) => fmtRate(v, pair.precision)),
    },
  }

  return (
    <div className="rate-row card">
      <div className="rate-row-main">
        <div className="rate-row-top">
          <div className="rate-row-info">
            <span className="rate-row-flags">{pair.flags}</span>
            <span className="rate-row-symbols">{pair.symbols}</span>
          </div>
          <div className="rate-row-value">
            <span className="rate-big">
              {fmtRate(current, pair.precision)}&nbsp;<span className="rate-unit">{pair.unit}</span>
            </span>
          </div>
          <button
            type="button"
            className={`rate-chart-btn${chartOpen ? ' active' : ''}`}
            onClick={() => setChartOpen((o) => !o)}
            title="График"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polyline points="1,13 5,8 8,10 12,4 17,6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        </div>

        <div className="rate-converter">
          <div className="inp-wrap">
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={fmtThousands(amount)}
              onChange={handleAmountChange}
            />
            <span className="inp-cur">{fromUnit}</span>
          </div>
          <button
            type="button"
            className="rate-conv-swap"
            onClick={() => setSwapped((s) => !s)}
            title="Поменять направление"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 5.5H13M10 2.5L13 5.5L10 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 10.5H3M6 7.5L3 10.5L6 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="inp-wrap">
            <input
              className="field-input rate-conv-result"
              type="text"
              readOnly
              placeholder="0"
              value={fmtResult(resultNum, pair.precision)}
            />
            <span className="inp-cur">{toUnit}</span>
          </div>
        </div>
      </div>

      {chartOpen && (
        <div className="rate-row-chart">
          <div style={{ position: 'relative', height: 200 }}>
            <Line data={data} options={options} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Кросс-калькулятор ─────────────────────────────────────────────────────
function CrossRateCalc() {
  const [curs, setCurs] = useState(['RU', 'USDT', 'KZT', 'USD'])
  const [rates, setRates] = useState(['', '', ''])

  function addCur() {
    setCurs((c) => [...c, ''])
    setRates((r) => [...r, ''])
  }

  function delCur(i) {
    if (curs.length <= 2) return
    setCurs((c) => c.filter((_, idx) => idx !== i))
    const ri = i === 0 ? 0 : i - 1
    setRates((r) => r.filter((_, idx) => idx !== ri))
  }

  function setCurName(i, val) {
    setCurs((c) => c.map((x, idx) => (idx === i ? val.toUpperCase() : x)))
  }

  function setRate(i, val) {
    setRates((r) => r.map((x, idx) => (idx === i ? val.replace(/[^\d.,]/g, '').replace(',', '.') : x)))
  }

  const parsed = rates.map((r) => parseFloat(r))
  const allValid = parsed.every((r) => r > 0)
  const cross = allValid
    ? parsed.reduce((acc, r, i) => i % 2 === 0 ? acc / r : acc * r, 1)
    : null
  const [flipped, setFlipped] = useState(false)
  const displayVal = cross != null ? (flipped ? 1 / cross : cross) : null
  const precision = displayVal == null ? 2 : displayVal < 1 ? 6 : displayVal < 10 ? 4 : 2
  const fromLabel = flipped ? curs[curs.length - 1] : curs[0]
  const toLabel = flipped ? curs[0] : curs[curs.length - 1]

  const [open, setOpen] = useState(false)

  return (
    <div className="card cross-calc">
      <div className="section-title-row" onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>
        <div className="section-title">Калькулятор кросс курса</div>
        <span className="expand-chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="cross-calc-inner">
          <div className="cross-chain-scroll">
            <div className="cross-chain">
              {curs.map((cur, i) => (
                <Fragment key={i}>
                  <div className="cross-node">
                    {curs.length > 2 && (
                      <button className="cross-del" onClick={(e) => { e.stopPropagation(); delCur(i) }} title="Удалить">×</button>
                    )}
                    <input
                      className="cross-cur-name"
                      value={cur}
                      onChange={(e) => setCurName(i, e.target.value)}
                      placeholder="USD"
                      maxLength={6}
                    />
                  </div>
                  {i < rates.length && (
                    <div className="cross-leg">
                      <span className="cross-arrow">→</span>
                      <input
                        className="cross-rate-inp"
                        type="text"
                        inputMode="decimal"
                        value={rates[i]}
                        onChange={(e) => setRate(i, e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </Fragment>
              ))}
              <button className="cross-add-btn" onClick={addCur} title="Добавить валюту">+</button>
            </div>
          </div>
          <div className="cross-result">
            <div className="cross-result-top">
              <div>
                <div className="cross-result-label">1 {fromLabel} =</div>
                <div className="cross-result-val">{displayVal != null ? `${fmtRate(displayVal, precision)} ${toLabel}` : '—'}</div>
              </div>
              <button className="cross-flip-btn" onClick={() => setFlipped((f) => !f)} title="Поменять направление">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 5.5H13M10 2.5L13 5.5L10 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 10.5H3M6 7.5L3 10.5L6 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Таблица зафиксированных курсов ────────────────────────────────────────
function FixedRatesTable({ state, storeVersion }) {
  const store = useMemo(() => loadRatesStore(), [storeVersion])
  const months = useMemo(() => listStoredMonths(store).sort().reverse(), [store])
  const closed = useMemo(() => (state ? closedMonths(state) : []), [state])
  const usage = useMemo(() => getUsageMap(closed, store), [closed, store])
  const [open, setOpen] = useState(false)

  if (!months.length) return null

  return (
    <div className="card">
      <div className="section-title-row" onClick={() => setOpen((v) => !v)} style={{ cursor: 'pointer' }}>
        <div className="section-title">Зафиксированные курсы</div>
        <span className="expand-chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ overflowX: 'auto' }}>
        <table className="rates-fixed-table">
          <thead>
            <tr>
              <th>Месяц</th>
              <th style={{ textAlign: 'right' }}>1&nbsp;$&nbsp;=&nbsp;₸</th>
              <th style={{ textAlign: 'right' }}>1&nbsp;₽&nbsp;=&nbsp;₸</th>
              <th style={{ textAlign: 'right' }}>1&nbsp;$&nbsp;=&nbsp;₽</th>
              <th>Дата котировки</th>
              <th>Применяется в расчётах</th>
            </tr>
          </thead>
          <tbody>
            {months.map((mk) => {
              const r = store.monthly[mk]
              const used = (usage[mk] || []).length
              return (
                <tr key={mk}>
                  <td>{monthLabel(mk)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtRate(r.usd_kzt, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtRate(r.rub_kzt, 3)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtRate(r.usd_rub, 2)}</td>
                  <td className="muted">{r.date || '—'}</td>
                  <td>
                    {used > 0 ? (
                      <span className="rates-used-badge" title={(usage[mk] || []).map(monthLabel).join(', ')}>
                        ✓ да{used > 1 ? ` · ${used} мес` : ''}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}
    </div>
  )
}
