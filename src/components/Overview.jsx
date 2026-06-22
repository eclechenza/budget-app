import { useState } from 'react'
import { curOf, fmt, monthLabel, sumByCur, sym, CURRENCIES, closedMonths } from '../utils/storage'
import { getMonthlyData, convertCurrency } from '../utils/analytics'
import { getRatesForMonth, monthFromKey, loadRatesStore } from '../utils/rates'
import { buildExportText } from '../utils/exportAnalytics'
import NetWorthChart       from './NetWorthChart'
import SavingsChart        from './SavingsChart'
import BurnRateChart       from './BurnRateChart'
import IncomeChart         from './IncomeChart'
import AverageSixMonths    from './AverageSixMonths'
import ExpenseAnalysis     from './ExpenseAnalysis'

const SUMMARY_TABS = [
  { id: 'KZT',    label: '₸' },
  { id: 'RUB',    label: '₽' },
  { id: 'USD',    label: '$' },
  { id: 'by_cur', label: 'По валютам' },
]

const DASHBOARD_TABS = [
  { id: 'KZT',    label: '₸' },
  { id: 'RUB',    label: '₽' },
  { id: 'USD',    label: '$' },
  { id: 'by_cur', label: 'По валютам' },
]

const DASHBOARD_PERIOD_TABS = [
  { id: 3,  label: '3 мес' },
  { id: 6,  label: '6 мес' },
  { id: 12, label: '1 год' },
]

export default function Overview({ state }) {
  const months = closedMonths(state)

  const [expanded,    setExpanded]    = useState({})
  const [historyOpen, setHistoryOpen] = useState(false)
  const [summaryIdx,  setSummaryIdx]  = useState(Math.max(0, months.length - 1))
  const [copied,      setCopied]      = useState(false)
  const [summaryTab,  setSummaryTab]  = useState('KZT')
  const [dashboardTab, setDashboardTab] = useState('KZT')
  const [dashboardPeriod, setDashboardPeriod] = useState(12)
  const [dashboardPermanentOnly, setDashboardPermanentOnly] = useState(true)

  function handleExport() {
    const text = buildExportText(state)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (!state.accounts.length)
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
          <div className="empty-state-title">Пока нечего показать</div>
          <div className="empty-state-text">Перейди в <strong>Настройки</strong> и добавь счета, источники дохода и категории расходов.</div>
        </div>
      </div>
    )

  if (!months.length)
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
          <div className="empty-state-text">Введи данные за месяц во вкладке <strong>Ввод данных</strong> и отметь «Месяц закрыт» — после этого появятся графики и статистика.</div>
        </div>
      </div>
    )

  // ─── Данные для графиков (вычисляются до Summary, чтобы использовать netExpensesMapped) ──
  const monthlyData = getMonthlyData(state)

  // ─── Блок «Саммари» — выбранный месяц ─────────────────────────────────────
  const safeIdx = Math.min(Math.max(0, summaryIdx), months.length - 1)
  const selKey   = months[safeIdx]
  const selEntry = state.entries[selKey]

  const slb    = sumByCur(selEntry.balances || {}, state.accounts, 'account', state)
  const sli    = sumByCur(selEntry.income   || {}, state.sources,  'source',  state)
  const selMonthData = monthlyData.find((d) => d.key === selKey)
  const sNetExp = selMonthData ? selMonthData.netExpensesMapped : { KZT: 0, RUB: 0, USD: 0 }
  const sActiveCurs = CURRENCIES.filter((c) => slb[c] || sli[c] || sNetExp[c])

  // ─── Курсы для выбранного месяца (нужны для конвертации) ──────────────────
  const { year: selYear, month: selMonth } = monthFromKey(selKey)
  const selRates = getRatesForMonth(selYear, selMonth, loadRatesStore())

  const hasMixedCurs = summaryTab !== 'by_cur' &&
    CURRENCIES.some((c) => c !== summaryTab && (slb[c] || sli[c] || sNetExp[c]))
  const needsRates = hasMixedCurs
  const ratesOk    = selRates != null

  // ─── Предыдущий месяц для дельты ──────────────────────────────────────────
  const prevKey   = safeIdx > 0 ? months[safeIdx - 1] : null
  const prevEntry = prevKey ? state.entries[prevKey] : null
  const plb  = prevEntry ? sumByCur(prevEntry.balances || {}, state.accounts, 'account', state) : null
  const pli  = prevEntry ? sumByCur(prevEntry.income   || {}, state.sources,  'source',  state) : null
  const prevMonthData = prevEntry ? monthlyData.find((d) => d.key === prevKey) : null
  const pNetExp = prevMonthData ? prevMonthData.netExpensesMapped : { KZT: 0, RUB: 0, USD: 0 }
  // ─── Конвертированные итоги (используются при выборе конкретной валюты) ───
  const conv = summaryTab !== 'by_cur' ? (() => {
    const to = summaryTab
    const r  = selRates || {}
    const balance = Math.round(CURRENCIES.reduce((s, c) => s + convertCurrency(slb[c] || 0, c, to, r), 0))
    const income  = Math.round(CURRENCIES.reduce((s, c) => s + convertCurrency(sli[c] || 0, c, to, r), 0))
    const netExp  = Math.round(CURRENCIES.reduce((s, c) => s + convertCurrency(Math.max(0, sNetExp[c] || 0), c, to, r), 0))
    const saved   = income - netExp
    const prevBal = plb ? Math.round(CURRENCIES.reduce((s, c) => s + convertCurrency(plb[c] || 0, c, to, r), 0)) : null
    const prevIncome = pli ? Math.round(CURRENCIES.reduce((s, c) => s + convertCurrency(pli[c] || 0, c, to, r), 0)) : null
    const prevNetExp = prevMonthData ? Math.round(CURRENCIES.reduce((s, c) => s + convertCurrency(Math.max(0, pNetExp[c] || 0), c, to, r), 0)) : null
    const prevSaved = (prevIncome != null && prevNetExp != null) ? prevIncome - prevNetExp : null
    return { balance, income, netExp, saved, prevBal, prevIncome, prevNetExp, prevSaved }
  })() : null

  function delta(cur, cur_val, prev_val) {
    if (!prevEntry || !prev_val) return null
    const pct = Math.round(((cur_val - prev_val) / prev_val) * 100)
    return pct
  }

  function toggleExpand(mk) {
    setExpanded((ex) => ({ ...ex, [mk]: !ex[mk] }))
  }

  return (
    <div>

{/* ── Блок 2: Саммари с переключателем месяца ────────────────────────── */}
      <div className="card">
        <div className="summary-header">
          <div className="section-title">Саммари за месяц</div>
          <div className="month-switcher">
            <button
              className="month-arrow"
              onClick={() => setSummaryIdx((i) => Math.max(0, i - 1))}
              disabled={safeIdx === 0}
            >‹</button>
            <span className="month-switcher-label">{monthLabel(selKey)}</span>
            <button
              className="month-arrow"
              onClick={() => setSummaryIdx((i) => Math.min(months.length - 1, i + 1))}
              disabled={safeIdx === months.length - 1}
            >›</button>
          </div>
        </div>
        <div className="chips">
          {SUMMARY_TABS.map((t) => (
            <button
              key={t.id}
              className={`chip${summaryTab === t.id ? ' active' : ''}`}
              onClick={() => setSummaryTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        {needsRates && !ratesOk && (
          <p className="rates-hint">
            ⚠ Открой вкладку «Курс валют», чтобы зафиксировать курсы для конвертации
          </p>
        )}

        <div className="tiles-grid-wrap">
        <div className="tiles-grid">

          {/* 1. Денег всего */}
          <div className="tile">
            {(() => {
              const renderDelta = (d) => d !== null && (
                <span className={`tile-delta-inline ${d >= 0 ? 'pos' : 'neg'}`}>{d >= 0 ? '↑' : '↓'}{Math.abs(d)}%</span>
              )

              if (conv) {
                const d = conv.prevBal != null && conv.prevBal !== 0
                  ? Math.round(((conv.balance - conv.prevBal) / conv.prevBal) * 100)
                  : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Денег всего</span>
                      {renderDelta(d)}
                    </div>
                    <div className="tile-value">{fmt(conv.balance)} {sym(summaryTab)}</div>
                  </>
                )
              }

              const curs = sActiveCurs.filter((c) => slb[c])
              if (!curs.length) {
                return (
                  <>
                    <div className="tile-label">Денег всего</div>
                    <div className="tile-value muted">—</div>
                  </>
                )
              }
              if (curs.length === 1) {
                const c = curs[0]
                const d = plb ? delta(c, slb[c], plb[c]) : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Денег всего</span>
                      {renderDelta(d)}
                    </div>
                    <div className="tile-value">{fmt(slb[c])} {sym(c)}</div>
                  </>
                )
              }
              return (
                <>
                  <div className="tile-label">Денег всего</div>
                  {curs.map((c) => {
                    const d = plb ? delta(c, slb[c], plb[c]) : null
                    return (
                      <div key={c} className="tile-value-row">
                        <span className="tile-value">{fmt(slb[c])} {sym(c)}</span>
                        {renderDelta(d)}
                      </div>
                    )
                  })}
                </>
              )
            })()}
          </div>

          {/* 2. Заработал */}
          <div className="tile">
            {(() => {
              const renderDelta = (d) => d !== null && (
                <span className={`tile-delta-inline ${d >= 0 ? 'pos' : 'neg'}`}>{d >= 0 ? '↑' : '↓'}{Math.abs(d)}%</span>
              )

              if (conv) {
                const d = conv.prevIncome != null && conv.prevIncome !== 0
                  ? Math.round(((conv.income - conv.prevIncome) / conv.prevIncome) * 100)
                  : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Заработал</span>
                      {renderDelta(d)}
                    </div>
                    <div className={`tile-value ${conv.income ? 'pos' : 'zero-val'}`}>{fmt(conv.income)} {sym(summaryTab)}</div>
                  </>
                )
              }

              if (sActiveCurs.length === 1) {
                const c = sActiveCurs[0]
                const d = pli && pli[c] ? Math.round(((sli[c] - pli[c]) / pli[c]) * 100) : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Заработал</span>
                      {renderDelta(d)}
                    </div>
                    <div className={`tile-value ${sli[c] ? 'pos' : 'zero-val'}`}>{fmt(sli[c])} {sym(c)}</div>
                  </>
                )
              }

              return (
                <>
                  <div className="tile-label">Заработал</div>
                  {sActiveCurs.map((c) => {
                    const d = pli && pli[c] ? Math.round(((sli[c] - pli[c]) / pli[c]) * 100) : null
                    return (
                      <div key={c} className="tile-value-row">
                        <span className={`tile-value ${sli[c] ? 'pos' : 'zero-val'}`}>{fmt(sli[c])} {sym(c)}</span>
                        {renderDelta(d)}
                      </div>
                    )
                  })}
                </>
              )
            })()}
          </div>

          {/* 3. Потратил (чистые расходы = расходы − возвраты) */}
          <div className="tile">
            {(() => {
              const renderDelta = (d) => d !== null && (
                <span className={`tile-delta-inline ${d <= 0 ? 'pos' : 'neg'}`}>{d >= 0 ? '↑' : '↓'}{Math.abs(d)}%</span>
              )

              if (conv) {
                const pct = conv.income > 0 ? Math.round((conv.netExp / conv.income) * 100) : null
                const d = conv.prevNetExp != null && conv.prevNetExp !== 0
                  ? Math.round(((conv.netExp - conv.prevNetExp) / conv.prevNetExp) * 100)
                  : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Потратил</span>
                      {renderDelta(d)}
                    </div>
                    <div className={`tile-value ${conv.netExp > 0 ? 'neg' : 'zero-val'}`}>
                      {fmt(conv.netExp)} {sym(summaryTab)}
                      {pct !== null && <span className="tile-pct">{pct}%</span>}
                    </div>
                  </>
                )
              }

              if (sActiveCurs.length === 1) {
                const c = sActiveCurs[0]
                const pct = sli[c] > 0 ? Math.round((sNetExp[c] / sli[c]) * 100) : null
                const d = pNetExp[c] ? Math.round(((sNetExp[c] - pNetExp[c]) / pNetExp[c]) * 100) : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Потратил</span>
                      {renderDelta(d)}
                    </div>
                    <div className={`tile-value ${sNetExp[c] > 0 ? 'neg' : 'zero-val'}`}>
                      {fmt(sNetExp[c])} {sym(c)}
                      {pct !== null && <span className="tile-pct">{pct}%</span>}
                    </div>
                  </>
                )
              }

              return (
                <>
                  <div className="tile-label">Потратил</div>
                  {sActiveCurs.map((c) => {
                    const pct = sli[c] > 0 ? Math.round((sNetExp[c] / sli[c]) * 100) : null
                    const d = pNetExp[c] ? Math.round(((sNetExp[c] - pNetExp[c]) / pNetExp[c]) * 100) : null
                    return (
                      <div key={c} className="tile-value-row">
                        <span className={`tile-value ${sNetExp[c] > 0 ? 'neg' : 'zero-val'}`}>
                          {fmt(sNetExp[c])} {sym(c)}
                          {pct !== null && <span className="tile-pct">{pct}%</span>}
                        </span>
                        {renderDelta(d)}
                      </div>
                    )
                  })}
                </>
              )
            })()}
          </div>

          {/* 4. Сохранил + % */}
          <div className="tile">
            {(() => {
              const renderDelta = (d) => d !== null && (
                <span className={`tile-delta-inline ${d >= 0 ? 'pos' : 'neg'}`}>{d >= 0 ? '↑' : '↓'}{Math.abs(d)}%</span>
              )

              if (conv) {
                const pct  = conv.income > 0 ? Math.round((conv.saved / conv.income) * 100) : null
                const zero = conv.income === 0 && conv.netExp === 0
                const d = conv.prevSaved != null && conv.prevSaved !== 0
                  ? Math.round(((conv.saved - conv.prevSaved) / conv.prevSaved) * 100)
                  : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Сохранил</span>
                      {!zero && renderDelta(d)}
                    </div>
                    <div className={`tile-value ${zero ? 'zero-val' : conv.saved >= 0 ? 'pos' : 'neg'}`}>
                      {zero ? `0 ${sym(summaryTab)}` : `${conv.saved >= 0 ? '+' : ''}${fmt(conv.saved)} ${sym(summaryTab)}`}
                      {pct !== null && !zero && <span className="tile-pct">{pct}%</span>}
                    </div>
                  </>
                )
              }

              if (sActiveCurs.length === 1) {
                const c = sActiveCurs[0]
                const saved = sli[c] - sNetExp[c]
                const pct   = sli[c] > 0 ? Math.round((saved / sli[c]) * 100) : null
                const zero  = sli[c] === 0 && sNetExp[c] === 0
                const prevSaved = pli ? pli[c] - pNetExp[c] : null
                const d = prevSaved ? Math.round(((saved - prevSaved) / prevSaved) * 100) : null
                return (
                  <>
                    <div className="tile-label-row">
                      <span className="tile-label">Сохранил</span>
                      {!zero && renderDelta(d)}
                    </div>
                    <div className={`tile-value ${zero ? 'zero-val' : saved >= 0 ? 'pos' : 'neg'}`}>
                      {zero ? `0 ${sym(c)}` : `${saved >= 0 ? '+' : ''}${fmt(saved)} ${sym(c)}`}
                      {pct !== null && !zero && <span className="tile-pct">{pct}%</span>}
                    </div>
                  </>
                )
              }

              return (
                <>
                  <div className="tile-label">Сохранил</div>
                  {sActiveCurs.map((c) => {
                    const saved = sli[c] - sNetExp[c]
                    const pct   = sli[c] > 0 ? Math.round((saved / sli[c]) * 100) : null
                    const zero  = sli[c] === 0 && sNetExp[c] === 0
                    const prevSaved = pli ? pli[c] - pNetExp[c] : null
                    const d = prevSaved ? Math.round(((saved - prevSaved) / prevSaved) * 100) : null
                    return (
                      <div key={c} className="tile-value-row">
                        <span className={`tile-value ${zero ? 'zero-val' : saved >= 0 ? 'pos' : 'neg'}`}>
                          {zero ? `0 ${sym(c)}` : `${saved >= 0 ? '+' : ''}${fmt(saved)} ${sym(c)}`}
                          {pct !== null && !zero && <span className="tile-pct">{pct}%</span>}
                        </span>
                        {!zero && renderDelta(d)}
                      </div>
                    )
                  })}
                </>
              )
            })()}
          </div>

        </div>
        </div>
      </div>

      {/* ── Блок 3: Дашборд ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="chart-card-header">
          <div className="section-title">Дашборд</div>
          <label className="perm-toggle">
            <span className={`perm-toggle-switch${dashboardPermanentOnly ? ' on' : ''}`} />
            <span className="perm-toggle-label">Постоянный доход</span>
            <input
              type="checkbox"
              checked={dashboardPermanentOnly}
              onChange={(e) => setDashboardPermanentOnly(e.target.checked)}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        <div className="dashboard-tabs-row">
          <div className="chips">
            {DASHBOARD_TABS.map((t) => (
              <button
                key={t.id}
                className={`chip${dashboardTab === t.id ? ' active' : ''}`}
                onClick={() => setDashboardTab(t.id)}
              >{t.label}</button>
            ))}
          </div>
          <div className="chips">
            {DASHBOARD_PERIOD_TABS.map((p) => (
              <button
                key={p.id}
                className={`chip chip--sm${dashboardPeriod === p.id ? ' active' : ''}`}
                onClick={() => setDashboardPeriod(p.id)}
              >{p.label}</button>
            ))}
          </div>
        </div>
        <div className="charts-grid">
          <AverageSixMonths monthlyData={monthlyData} tab={dashboardTab} period={dashboardPeriod} permanentOnly={dashboardPermanentOnly} />
          <NetWorthChart monthlyData={monthlyData} tab={dashboardTab} period={dashboardPeriod} />
          <SavingsChart  monthlyData={monthlyData} tab={dashboardTab} period={dashboardPeriod} permanentOnly={dashboardPermanentOnly} />
          <IncomeChart   monthlyData={monthlyData} tab={dashboardTab} period={dashboardPeriod} permanentOnly={dashboardPermanentOnly} />
          <BurnRateChart monthlyData={monthlyData} tab={dashboardTab} period={dashboardPeriod} permanentOnly={dashboardPermanentOnly} />
        </div>
      </div>

      {/* ── Анализ расходов ─────────────────────────────────────────────── */}
      <ExpenseAnalysis state={state} />

      {/* ── Блок 4: История данных ───────────────────────────────────────── */}
      <div className="card">
        <div className="section-title-row" onClick={() => setHistoryOpen((v) => !v)} style={{ cursor: 'pointer' }}>
          <div className="section-title">История данных</div>
          <span className="expand-chevron">{historyOpen ? '▲' : '▼'}</span>
        </div>
        {historyOpen && months
          .slice()
          .reverse()
          .map((mk, i, arr) => {
            const e   = state.entries[mk]
            const p   = state.entries[arr[i + 1]]
            const lbM = sumByCur(e.balances || {}, state.accounts, 'account', state)
            const liM = sumByCur(e.income   || {}, state.sources,  'source',  state)
            const pbM = p ? sumByCur(p.balances || {}, state.accounts, 'account', state) : null
            const isOpen = !!expanded[mk]

            return (
              <div key={mk} className="timeline-item">
                <div className="timeline-row" onClick={() => toggleExpand(mk)}>
                  <span className="bold">{monthLabel(mk)}</span>
                  <span className="expand-chevron">{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div className="timeline-detail">
                    <div className="detail-cols">
                      <div className="detail-section">
                        <div className="detail-title">Счета</div>
                        {state.accounts.map((a) => {
                          const c   = curOf(a, 'account', state)
                          const val = +(e.balances || {})[a] || 0
                          return (
                            <div className="detail-row" key={a}>
                              <span className="muted">{a}</span>
                              <span>{fmt(val)} {sym(c)}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div className="detail-section">
                        <div className="detail-title">Доходы</div>
                        {state.sources.map((s) => {
                          const c   = curOf(s, 'source', state)
                          const val = +(e.income || {})[s] || 0
                          return (
                            <div className="detail-row" key={s}>
                              <span className="muted">{s}</span>
                              <span className="pos">{fmt(val)} {sym(c)}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div>
                        {(state.expenseCategories || []).length > 0 && (
                          <div className="detail-section">
                            <div className="detail-title">Расходы</div>
                            {state.expenseCategories.map((cat) => {
                              const c   = (state.expenseCur || {})[cat] || 'KZT'
                              const val = +(e.expenses || {})[cat] || 0
                              return (
                                <div className="detail-row" key={cat}>
                                  <span className="muted">{cat}</span>
                                  <span className="neg">{fmt(val)} {sym(c)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {(state.refundCategories || []).length > 0 && (
                          <div className="detail-section">
                            <div className="detail-title">Возвраты</div>
                            {state.refundCategories.map((cat) => {
                              const c   = (state.refundCur || {})[cat] || 'KZT'
                              const val = +(e.refunds || {})[cat] || 0
                              return (
                                <div className="detail-row" key={cat}>
                                  <span className="muted">{cat}</span>
                                  <span className="pos">{fmt(val)} {sym(c)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {e.note && (
                      <div className="detail-note-block">
                        <div className="detail-title">Заметка</div>
                        <p className="detail-note">{e.note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button className="btn-secondary btn-sm" onClick={handleExport}>
          {copied ? 'Скопировано!' : 'Скопировать статистику'}
        </button>
      </div>

    </div>
  )
}
