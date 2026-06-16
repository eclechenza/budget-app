import { useState, useEffect, useMemo, Fragment } from 'react'
import { fmt, sym, closedMonths, monthLabel, CURRENCIES } from '../utils/storage'
import { convertCurrency, getMonthlyData } from '../utils/analytics'
import AssetsChart from './AssetsChart'
import { ASSET_TYPES } from './ItemList'

// Порядок 3 карточек
const COLS = [
  { cur: 'KZT', label: 'Тенге' },
  { cur: 'RUB', label: 'Рубли' },
  { cur: 'USD', label: 'Доллары' },
]

// Порядок строки разбивки: тенге → рубли → доллары
const BREAKDOWN = [
  { cur: 'KZT', label: 'тенге' },
  { cur: 'RUB', label: 'рубли' },
  { cur: 'USD', label: 'доллары' },
]

// Актуальные курсы с CDN (fallback на второй зеркальный хост)
async function fetchLiveRates() {
  const today = new Date().toISOString().slice(0, 10)
  const bust = Date.now()
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json?_=${bust}`,
    `https://latest.currency-api.pages.dev/v1/currencies/usd.json?_=${bust}`,
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${today}/v1/currencies/usd.json`,
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
      // { KZT: 1, RUB: rub_kzt, USD: usd_kzt } — формат convertCurrency
      return { KZT: 1, RUB: kzt / rub, USD: kzt }
    } catch {}
  }
  return null
}

function pluralMonths(n) {
  const r = Math.round(Math.abs(n))
  if (r % 10 === 1 && r !== 11) return `${r} месяц`
  if ([2, 3, 4].includes(r % 10) && ![12, 13, 14].includes(r % 100)) return `${r} месяца`
  return `${r} месяцев`
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

function fmtRate(rate) {
  if (rate == null) return null
  if (rate >= 100)  return Math.round(rate).toLocaleString('ru')
  if (rate >= 1)    return rate.toLocaleString('ru', { maximumFractionDigits: 2 })
  if (rate >= 0.01) return rate.toLocaleString('ru', { maximumFractionDigits: 4 })
  return rate.toLocaleString('ru', { maximumSignificantDigits: 3 })
}

export default function Assets({ state }) {
  const closed = closedMonths(state)
  const [totalCur,       setTotalCur]       = useState('KZT')
  const [liveRates,      setLiveRates]      = useState(null)
  const [ratesState,     setRatesState]     = useState('loading') // 'loading' | 'ok' | 'error'
  const [cushionMonths,  setCushionMonths]  = useState(6)
  const [assetsMonthIdx, setAssetsMonthIdx] = useState(Math.max(0, closed.length - 1))
  const [totalMonthIdx,  setTotalMonthIdx]  = useState(Math.max(0, closed.length - 1))

  useEffect(() => {
    let cancelled = false
    fetchLiveRates().then((r) => {
      if (cancelled) return
      if (r) { setLiveRates(r); setRatesState('ok') }
      else    setRatesState('error')
    })
    return () => { cancelled = true }
  }, [])

  const { accounts, accountType, accountCur, entries } = state

  if (!accounts.length) {
    return (
      <div className="card">
        <div className="empty-state">
          <svg className="empty-state-icon" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="10" y="22" width="52" height="36" rx="5"/>
            <line x1="10" y1="33" x2="62" y2="33"/>
            <line x1="20" y1="44" x2="34" y2="44"/>
            <line x1="20" y1="50" x2="28" y2="50"/>
            <line x1="50" y1="44" x2="50" y2="54"/>
            <line x1="45" y1="49" x2="55" y2="49"/>
          </svg>
          <div className="empty-state-title">Нет счетов</div>
          <div className="empty-state-text">Перейди в <strong>Настройки</strong> и добавь счета. Для отображения капитала нужен хотя бы один счёт типа <strong>Актив</strong>.</div>
        </div>
      </div>
    )
  }

  // Последний закрытый месяц
  const latestKey = closed.at(-1)
  const balances  = latestKey ? (entries[latestKey].balances || {}) : {}

  if (!latestKey) {
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
          <div className="empty-state-text">Введи данные во вкладке <strong>Ввод данных</strong> и отметь «Месяц закрыт» — после этого здесь появится динамика капитала.</div>
        </div>
      </div>
    )
  }

  // «Активы по валютам» — выбранный месяц
  const safeAssetsIdx  = Math.min(Math.max(0, assetsMonthIdx), closed.length - 1)
  const assetsKey      = closed[safeAssetsIdx]
  const assetsBalances = assetsKey ? (entries[assetsKey].balances || {}) : {}

  // «Всего» — выбранный месяц
  const safeTotalIdx  = Math.min(Math.max(0, totalMonthIdx), closed.length - 1)
  const totalKey      = closed[safeTotalIdx]
  const totalBalances = totalKey ? (entries[totalKey].balances || {}) : {}

  // Счета типа «Актив», сгруппированные по валюте
  const byCur = { RUB: [], KZT: [], USD: [] }
  accounts.forEach((a) => {
    if (ASSET_TYPES.has(accountType[a])) {
      const c = accountCur[a] || 'KZT'
      if (byCur[c]) byCur[c].push(a)
    }
  })

  // Блок «Всего» — конвертация по актуальному курсу
  const assetAccounts = accounts.filter((a) => ASSET_TYPES.has(accountType[a]))
  const needsConvert  = assetAccounts.some((a) => (accountCur[a] || 'KZT') !== totalCur)

  const totalConverted = liveRates
    ? Math.round(assetAccounts.reduce((sum, a) => {
        const cur    = accountCur[a] || 'KZT'
        const amount = +totalBalances[a]  || 0
        return sum + convertCurrency(amount, cur, totalCur, liveRates)
      }, 0))
    : null

  const accountMeta    = state.accountMeta    || {}
  const inflationRates = state.inflationRates || {}

  // Взвешенный средний % доходности по всем активам (с конвертацией в totalCur)
  let globalWeightedYield = null
  if (liveRates && totalConverted != null && totalConverted > 0) {
    let sumWeighted = 0, anyYield = false
    assetAccounts.forEach((a) => {
      const y = parseFloat((accountMeta[a] || {}).yield)
      if (!isNaN(y)) {
        const cur         = accountCur[a] || 'KZT'
        const amountInCur = convertCurrency(+totalBalances[a] || 0, cur, totalCur, liveRates)
        sumWeighted      += amountInCur * y
        anyYield          = true
      }
    })
    if (anyYield) globalWeightedYield = sumWeighted / totalConverted
  }

  // Взвешенная средняя инфляция по валютам (вес = доля валюты в totalCur)
  let globalWeightedInflation = null
  if (liveRates && totalConverted != null && totalConverted > 0) {
    let sumWeighted = 0, anyInfl = false
    CURRENCIES.forEach((cur) => {
      const infl = parseFloat(inflationRates[cur])
      if (isNaN(infl) || inflationRates[cur] === '') return
      const groupConverted = byCur[cur].reduce((s, a) => {
        return s + convertCurrency(+totalBalances[a] || 0, cur, totalCur, liveRates)
      }, 0)
      sumWeighted += groupConverted * infl
      anyInfl      = true
    })
    if (anyInfl) globalWeightedInflation = sumWeighted / totalConverted
  }

  const globalEfficiency =
    globalWeightedYield !== null && globalWeightedInflation !== null
      ? globalWeightedYield - globalWeightedInflation
      : null

  const fmtPct = (v) =>
    `${v > 0 ? '+' : ''}${v % 1 === 0 ? v : v.toFixed(2)}%`

  const emergencyFund = useMemo(() => {
    const totalCapital = liveRates
      ? Math.round(accounts.reduce((sum, a) => {
          const cur = accountCur[a] || 'KZT'
          return sum + convertCurrency(+balances[a] || 0, cur, totalCur, liveRates)
        }, 0))
      : null

    const monthlyData = getMonthlyData(state)
    const lastN = monthlyData.slice(-12)
    const totalNetExp = lastN.reduce((sum, d) => {
      const mRates = d.rates || liveRates || {}
      return sum + CURRENCIES.reduce((s, c) =>
        s + convertCurrency(d.netExpensesMapped[c] || 0, c, totalCur, mRates), 0)
    }, 0)
    const avgMonthlyExp = lastN.length ? Math.round(totalNetExp / lastN.length) : 0

    return {
      totalCapital,
      avgMonthlyExp,
      monthsLast: avgMonthlyExp > 0 && totalCapital != null ? totalCapital / avgMonthlyExp : null,
    }
  }, [state, totalCur, liveRates, balances, accounts, accountCur])

  return (
    <>
      <p className="month-subtitle">Данные за {monthLabel(latestKey).replace(' г.', '')}</p>

      {/* ─── Блок «Всего» ─────────────────────────────────────── */}
      <div className="card assets-summary-card">
        <div className="assets-summary-header">
          <span className="section-title">Всего</span>
          <div className="month-switcher">
            <button
              className="month-arrow"
              onClick={() => setTotalMonthIdx((i) => Math.max(0, i - 1))}
              disabled={safeTotalIdx === 0}
            >‹</button>
            <span className="month-switcher-label">{monthLabel(totalKey)}</span>
            <button
              className="month-arrow"
              onClick={() => setTotalMonthIdx((i) => Math.min(closed.length - 1, i + 1))}
              disabled={safeTotalIdx === closed.length - 1}
            >›</button>
          </div>
        </div>
        <div className="cur-tabs" style={{ marginBottom: 12 }}>
          {CURRENCIES.map((c) => (
            <button
              key={c}
              className={'cur-tab' + (totalCur === c ? ' active' : '')}
              onClick={() => setTotalCur(c)}
            >
              {sym(c)}
            </button>
          ))}
        </div>

        {ratesState === 'loading' && needsConvert && (
          <p className="rates-hint">Загружаю актуальные курсы…</p>
        )}
        {ratesState === 'error' && needsConvert && (
          <p className="rates-hint">Не удалось загрузить курсы — нет соединения</p>
        )}

        <div className="assets-grand-total-row">
          <div className="assets-grand-total">
            {totalConverted != null ? fmt(totalConverted) : '—'}
            <span className="assets-sym"> {sym(totalCur)}</span>
          </div>
          {(globalWeightedYield !== null || globalWeightedInflation !== null || globalEfficiency !== null) && (
            <div className="assets-metrics assets-metrics--lg">
              <div className="assets-metric">
                <div className="assets-metric-label">Ср. доходность</div>
                <div className={`assets-metric-val${globalWeightedYield !== null && globalWeightedYield < 0 ? ' assets-metric-val--neg' : ''}`}>
                  {globalWeightedYield !== null ? fmtPct(globalWeightedYield) : '—'}
                </div>
              </div>
              <div className="assets-metric">
                <div className="assets-metric-label">Ср. инфляция</div>
                <div className={`assets-metric-val${globalWeightedInflation !== null ? ' assets-metric-val--neg' : ''}`}>
                  {globalWeightedInflation !== null ? fmtPct(-globalWeightedInflation) : '—'}
                </div>
              </div>
              <div className="assets-metric">
                <div className="assets-metric-label">Эффективность</div>
                <div className={`assets-metric-val${globalEfficiency !== null && globalEfficiency < 0 ? ' assets-metric-val--neg' : ''}`}>
                  {globalEfficiency !== null ? fmtPct(globalEfficiency) : '—'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="assets-breakdown">
          {BREAKDOWN.map(({ cur, label }, i) => {
            const groupTotal = byCur[cur].reduce((s, a) => s + (+totalBalances[a] || 0), 0)
            const converted  = liveRates
              ? Math.round(convertCurrency(groupTotal, cur, totalCur, liveRates))
              : null
            const rate       = cur !== totalCur && liveRates
              ? convertCurrency(1, cur, totalCur, liveRates)
              : null
            return (
              <Fragment key={cur}>
                {i > 0 && <span className="assets-breakdown-sep">+</span>}
                <div className="assets-breakdown-col">
                  <span className="assets-breakdown-label">
                    {label}
                    {rate != null && (
                      <span className="assets-breakdown-rate">
                        {' '}(1 {sym(cur)} = {fmtRate(rate)} {sym(totalCur)})
                      </span>
                    )}
                  </span>
                  <span className="assets-breakdown-val">
                    {converted != null ? fmt(converted) : '—'}{' '}
                    <span className="assets-breakdown-sym">{sym(totalCur)}</span>
                  </span>
                  {converted != null && totalConverted > 0 && (
                    <span className="assets-breakdown-pct">
                      {Math.round(converted / totalConverted * 100)}% от капитала
                    </span>
                  )}
                </div>
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* ─── 3 колонки по валютам ─────────────────────────────── */}
      <div className="card assets-currencies-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="section-title" style={{ marginBottom: 0 }}>Активы по валютам</span>
          <div className="month-switcher">
            <button
              className="month-arrow"
              onClick={() => setAssetsMonthIdx((i) => Math.max(0, i - 1))}
              disabled={safeAssetsIdx === 0}
            >‹</button>
            <span className="month-switcher-label">{monthLabel(assetsKey)}</span>
            <button
              className="month-arrow"
              onClick={() => setAssetsMonthIdx((i) => Math.min(closed.length - 1, i + 1))}
              disabled={safeAssetsIdx === closed.length - 1}
            >›</button>
          </div>
        </div>
        <div className="assets-grid">
        {COLS.map(({ cur, label }) => {
          const list  = byCur[cur]
          const total = list.reduce((s, a) => s + (+assetsBalances[a] || 0), 0)

          // Взвешенный средний % по счетам с заданной доходностью
          let weightedYield = null
          if (total > 0) {
            let sumWeighted = 0, anyYield = false
            list.forEach((a) => {
              const y = parseFloat((accountMeta[a] || {}).yield)
              if (!isNaN(y)) { sumWeighted += (+assetsBalances[a] || 0) * y; anyYield = true }
            })
            if (anyYield) weightedYield = sumWeighted / total
          }

          // Инфляция для этой валюты
          const inflVal  = parseFloat(inflationRates[cur])
          const inflation = !isNaN(inflVal) && inflationRates[cur] !== '' ? inflVal : null

          return (
            <div key={cur} className="assets-col">
              <div className="assets-col-title">{label}</div>
              <div className="assets-col-mid">
                <div className="assets-total">
                  {fmt(total)}
                  <span className="assets-sym"> {sym(cur)}</span>
                </div>
                {(weightedYield !== null || inflation !== null) && (
                  <div className="assets-metrics">
                    <div className="assets-metric">
                      <div className="assets-metric-label">Доходность</div>
                      <div className={`assets-metric-val${weightedYield !== null && weightedYield < 0 ? ' assets-metric-val--neg' : ''}`}>
                        {weightedYield !== null ? fmtPct(weightedYield) : '—'}
                      </div>
                    </div>
                    <div className="assets-metric">
                      <div className="assets-metric-label">Инфляция</div>
                      <div className={`assets-metric-val${inflation !== null ? ' assets-metric-val--neg' : ''}`}>
                        {inflation !== null ? fmtPct(-inflation) : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="assets-list">
                {list.length === 0
                  ? <p className="empty small">Нет счетов</p>
                  : list.map((a) => {
                      const meta      = accountMeta[a] || {}
                      const yieldVal  = meta.yield !== '' && meta.yield != null ? parseFloat(meta.yield) : null
                      const hasYield  = yieldVal !== null && !isNaN(yieldVal)
                      const isNegYield = hasYield && yieldVal < 0
                      const hasDate   = meta.maturityDate
                      return (
                        <div key={a} className="assets-row">
                          <div className="assets-name-wrap">
                            <span className="assets-name">{a}</span>
                            {(hasYield || hasDate) && (
                              <span className="assets-meta-hint">
                                {hasYield && (
                                  <span className={isNegYield ? 'assets-meta-neg' : ''}>
                                    {yieldVal > 0 ? '+' : ''}{yieldVal}%
                                  </span>
                                )}
                                {hasYield && hasDate && <span className="assets-meta-sep">·</span>}
                                {hasDate && <span>{fmtDate(meta.maturityDate)}</span>}
                              </span>
                            )}
                          </div>
                          <span className="assets-amount">
                            {fmt(+assetsBalances[a] || 0)}
                            <span className="assets-row-sym"> {sym(cur)}</span>
                          </span>
                        </div>
                      )
                    })
                }
              </div>
            </div>
          )
        })}
        </div>
      </div>

      {/* ─── Динамика активов ────────────────────────────────────── */}
      <AssetsChart state={state} liveRates={liveRates} />

      {/* ─── Подушка безопасности ────────────────────────────────── */}
      <div className="card">
        <div className="section-title">Подушка безопасности</div>

        <div className="metric-grid" style={{ marginBottom: 14 }}>
          <div className="forecast-metric">
            <div className="forecast-metric-label">Всего на счетах</div>
            <div className="forecast-metric-value">
              {emergencyFund.totalCapital != null ? `${fmt(emergencyFund.totalCapital)} ${sym(totalCur)}` : '…'}
            </div>
          </div>
          <div className="forecast-metric">
            <div className="forecast-metric-label">Средние расходы / мес. (год)</div>
            <div className="forecast-metric-value">
              {fmt(emergencyFund.avgMonthlyExp)} {sym(totalCur)}
            </div>
          </div>
          {emergencyFund.monthsLast != null && (
            <div className="forecast-metric">
              <div className="forecast-metric-label">Хватит примерно на</div>
              <div className={`forecast-metric-value ${
                emergencyFund.monthsLast >= cushionMonths ? 'pos'
                  : emergencyFund.monthsLast >= cushionMonths * 0.5 ? 'cushion-warn'
                  : 'neg'
              }`}>
                {pluralMonths(emergencyFund.monthsLast)}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 13 }}>Рекомендуемая подушка:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={1}
              max={60}
              value={cushionMonths}
              onChange={(e) => setCushionMonths(Math.max(1, +e.target.value || 1))}
              className="cushion-input"
            />
            <span className="muted" style={{ fontSize: 13 }}>мес.</span>
          </div>
          <span style={{ fontSize: 13 }}>
            = <strong>{fmt(emergencyFund.avgMonthlyExp * cushionMonths)} {sym(totalCur)}</strong>
          </span>
        </div>

        {emergencyFund.totalCapital != null && emergencyFund.totalCapital > 0 && (() => {
          const cushionAmount  = emergencyFund.avgMonthlyExp * cushionMonths
          const cushionCapped  = Math.min(cushionAmount, emergencyFund.totalCapital)
          const assetsAmount   = Math.max(0, emergencyFund.totalCapital - cushionAmount)
          const cushionPct     = cushionCapped / emergencyFund.totalCapital * 100
          const assetsPct      = 100 - cushionPct
          const liquidAmount   = Math.round(cushionCapped * 0.25)
          const depositAmount  = cushionCapped - liquidAmount
          const liquidPct      = cushionPct * 0.25
          const depositPct     = cushionPct * 0.75
          return (
            <div style={{ marginTop: 20 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>
                Рекомендованное распределение
              </div>
              {/* Подписи над полосой */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                <div style={{ flex: cushionPct, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#5B6FE6', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Подушка безопасности
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fmt(cushionCapped)} {sym(totalCur)}
                  </div>
                </div>
                {assetsPct > 0 && (
                  <div style={{ flex: assetsPct, minWidth: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#1D9E75', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Активы
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fmt(assetsAmount)} {sym(totalCur)}
                    </div>
                  </div>
                )}
              </div>
              {/* Полоса: ликвидная | на вкладе | активы */}
              <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 3 }}>
                <div style={{ flex: liquidPct,  background: '#8FA8F5', minWidth: liquidPct  > 0 ? 3 : 0, borderRadius: '6px 0 0 6px' }} />
                <div style={{ flex: depositPct, background: '#5B6FE6', minWidth: depositPct > 0 ? 3 : 0, borderRadius: assetsPct === 0 ? '0 6px 6px 0' : 0 }} />
                {assetsPct > 0 && (
                  <div style={{ flex: assetsPct, background: '#1D9E75', minWidth: 3, borderRadius: '0 6px 6px 0' }} />
                )}
              </div>
              {/* Подписи под полосой */}
              <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                <div style={{ flex: liquidPct, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#8FA8F5', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Ликвидная часть
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fmt(liquidAmount)} {sym(totalCur)}
                  </div>
                </div>
                <div style={{ flex: depositPct, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#5B6FE6', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    На вкладе
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {fmt(depositAmount)} {sym(totalCur)}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </>
  )
}
