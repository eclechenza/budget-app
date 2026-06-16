import { CURRENCIES, fmt, sym } from '../utils/storage'
import { convertCurrency, hasRatesForMixedCurrency } from '../utils/analytics'

function monthlyAvgPct(values, incomes) {
  const pcts = values
    .map((v, i) => incomes[i] > 0 ? (v / incomes[i]) * 100 : null)
    .filter((p) => p !== null)
  return pcts.length > 0
    ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length)
    : null
}

function renderTiles(avgInc, avgExp, avgSav, expPct, savPct, cur) {
  const rows = [
    { label: 'Доход',      value: avgInc, pct: null   },
    { label: 'Расход',     value: avgExp, pct: expPct },
    { label: 'Сбережения', value: avgSav, pct: savPct },
  ]

  return rows.map((row) => (
    <div key={row.label} className="avg6-tile">
      <div className="avg6-tile-label">{row.label}</div>
      <div className="avg6-tile-row">
        <span className="avg6-tile-value">{fmt(row.value)} {sym(cur)}</span>
        {row.pct !== null && <span className="avg6-tile-pct">{row.pct}%</span>}
      </div>
    </div>
  ))
}

export default function AverageSixMonths({ monthlyData, tab, period, permanentOnly }) {
  const lastN = monthlyData.slice(-period)
  if (!lastN.length) return null
  const ratesOk = hasRatesForMixedCurrency(lastN)

  const hasAnyData = lastN.some((d) =>
    CURRENCIES.some((c) => ((d.permanentIncome || d.income)[c] || 0) > 0 || (d.netExpensesMapped[c] || 0) > 0)
  )
  if (!hasAnyData) return null

  function incForCur(d, c) {
    return permanentOnly
      ? ((d.permanentIncome || d.income)[c] || 0)
      : (d.income[c] || 0)
  }

  function avgByCur(c) {
    const avgInc = Math.round(
      lastN.map((d) => incForCur(d, c)).reduce((s, v) => s + v, 0) / lastN.length
    )
    const avgExp = Math.round(
      lastN.map((d) => d.netExpensesMapped[c] || 0).reduce((s, v) => s + v, 0) / lastN.length
    )
    const expPct = monthlyAvgPct(
      lastN.map((d) => d.netExpensesMapped[c] || 0),
      lastN.map((d) => incForCur(d, c))
    )
    const savPct = expPct !== null ? 100 - expPct : null
    return { avgInc, avgExp, avgSav: avgInc - avgExp, expPct, savPct }
  }

  function avgConverted(toCur) {
    const perMonth = lastN.map((d) => {
      const exp = CURRENCIES.reduce((s, c) => s + convertCurrency(d.netExpensesMapped[c] || 0, c, toCur, d.rates || {}), 0)
      const inc = CURRENCIES.reduce((s, c) => s + convertCurrency(incForCur(d, c), c, toCur, d.rates || {}), 0)
      return { exp, inc }
    })
    const avgInc = Math.round(perMonth.reduce((s, m) => s + m.inc, 0) / lastN.length)
    const avgExp = Math.round(perMonth.reduce((s, m) => s + m.exp, 0) / lastN.length)
    const expPct = monthlyAvgPct(
      perMonth.map((m) => m.exp),
      perMonth.map((m) => m.inc)
    )
    const savPct = expPct !== null ? 100 - expPct : null
    return { avgInc, avgExp, avgSav: avgInc - avgExp, expPct, savPct }
  }

  const needsRates = tab !== 'by_cur'

  let content
  if (tab === 'by_cur') {
    const groups = CURRENCIES
      .map((c) => ({ c, ...avgByCur(c) }))
      .filter(({ avgInc, avgExp }) => avgInc > 0 || avgExp > 0)

    content = groups.map(({ c, avgInc, avgExp, avgSav, expPct, savPct }) => (
      <div key={c} className="avg6-cur-group">
        <div className="avg6-cur-label">{sym(c)}</div>
        <div className="avg6-tiles">{renderTiles(avgInc, avgExp, avgSav, expPct, savPct, c)}</div>
      </div>
    ))
  } else {
    const data = avgConverted(tab)
    if (data) content = <div className="avg6-tiles">{renderTiles(data.avgInc, data.avgExp, data.avgSav, data.expPct, data.savPct, tab)}</div>
  }

  return (
    <div className="card avg6-card">
      <div className="chart-card-header">
        <div className="section-title">Средние значения</div>
      </div>
      {needsRates && !ratesOk && (
        <p className="rates-hint">
          ⚠ Открой вкладку «Курс валют», чтобы зафиксировать исторические курсы
        </p>
      )}
      <div className="avg6-content">
        {content}
      </div>
    </div>
  )
}
