import { useState, useEffect, useMemo } from 'react'
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
  { id: 'RUB_KZT', title: 'Рубль к тенге',  flags: '🇷🇺🇰🇿', unit: '₸', fromUnit: '₽', toUnit: '₸', precision: 3, color: CUR_COLORS.KZT, get: (r) => r.rub_kzt },
  { id: 'USD_KZT', title: 'Доллар к тенге', flags: '🇺🇸🇰🇿', unit: '₸', fromUnit: '$',  toUnit: '₸', precision: 2, color: CUR_COLORS.USD, get: (r) => r.usd_kzt },
  { id: 'USD_RUB', title: 'Доллар к рублю', flags: '🇺🇸🇷🇺', unit: '₽', fromUnit: '$',  toUnit: '₽', precision: 2, color: CUR_COLORS.RUB, get: (r) => r.usd_rub },
]

const PERIODS = [
  { id: '1m', label: '1 месяц', days: 30,  step: 1  },
  { id: '1y', label: '1 год',   days: 365, step: 15 },
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

// Текущий курс — отдельный запрос к `@latest`, минуя кеш CDN.
// Используется ТОЛЬКО для отображения карточек на этой вкладке.
async function fetchLatest() {
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

  return (
    <>
      <div className="rates-list">
        {PAIRS.map((pair) => (
          <RateBlock key={pair.id} pair={pair} seriesByPeriod={seriesByPeriod} latest={latest} />
        ))}
      </div>
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

  const values = useMemo(() => series.map(pair.get), [series, pair])
  const labels = useMemo(
    () => series.map((r) =>
      new Date(r.date).toLocaleDateString('ru', { day: '2-digit', month: 'short' })
    ),
    [series]
  )

  const latestSeries = seriesByPeriod['1m'] || []
  const fallback = latestSeries.length ? pair.get(latestSeries[latestSeries.length - 1]) : null
  const rawCurrent = latest ? pair.get(latest) : fallback
  const current = rawCurrent != null
    ? parseFloat(rawCurrent.toFixed(pair.precision))
    : null

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
      x: { ...xAxisOpts(), ticks: { ...xAxisOpts().ticks, maxTicksLimit: 6 } },
      y: yAxisOpts((v) => fmtRate(v, pair.precision)),
    },
  }

  return (
    <div className="rate-row card">
      <div className="rate-row-main">
        <div className="rate-row-info">
          <span className="rate-row-flags">{pair.flags}</span>
          <span className="rate-row-name">{pair.title}</span>
        </div>

        <div className="rate-row-value">
          <span className="rate-big">
            {fmtRate(current, pair.precision)}&nbsp;<span className="rate-unit">{pair.unit}</span>
          </span>
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
