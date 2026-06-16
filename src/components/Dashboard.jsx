import { CURRENCIES, curOf, fmt, monthLabel, sumByCur, sym, closedMonths } from '../utils/storage'

export default function Dashboard({ state }) {
  const months = closedMonths(state)

  if (!state.accounts.length) {
    return <p className="empty">Перейди в «Настройки» и добавь счета и источники дохода.</p>
  }
  if (!months.length) {
    return <p className="empty">Нет данных. Перейди в «Ввод данных» и добавь первый месяц.</p>
  }

  const lastKey = months[months.length - 1]
  const last = state.entries[lastKey]
  const prev = months.length > 1 ? state.entries[months[months.length - 2]] : null

  const lb = sumByCur(last.balances || {}, state.accounts, 'account', state)
  const li = sumByCur(last.income || {}, state.sources, 'source', state)
  const pb = prev ? sumByCur(prev.balances || {}, state.accounts, 'account', state) : null

  const balLines = CURRENCIES.filter((c) => lb[c]).map((c) => `${fmt(lb[c])} ${sym(c)}`)
  const incLines = CURRENCIES.filter((c) => li[c]).map((c) => `${fmt(li[c])} ${sym(c)}`)

  return (
    <div>
      <p className="month-subtitle">{monthLabel(lastKey)}</p>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Остаток</div>
          <div className="metric-value">
            {balLines.length ? balLines.map((l, i) => <div key={i}>{l}</div>) : '0 ₸'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Доход</div>
          <div className="metric-value pos">
            {incLines.length ? incLines.map((l, i) => <div key={i}>{l}</div>) : '0 ₸'}
          </div>
        </div>
        {prev && (() => {
          const spLines = CURRENCIES.filter((c) => li[c] || lb[c] || pb[c]).map((c) => {
            const sp = Math.max(0, li[c] - (lb[c] - (pb[c] || 0)))
            return { c, sp }
          })
          if (!spLines.length) return null
          const allPos = spLines.every(({ sp }) => sp === 0)
          return (
            <div className="metric">
              <div className="metric-label">Потрачено</div>
              <div className="metric-value">
                {spLines.map(({ c, sp }) => (
                  <div key={c} className={sp > 0 ? 'neg' : 'pos'}>{fmt(sp)} {sym(c)}</div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>

      {!prev && <p className="empty small">Добавь ещё один месяц, чтобы видеть расходы</p>}

      <div className="card">
        <div className="section-title">По счетам</div>
        {state.accounts.map((a) => {
          const c = curOf(a, 'account', state)
          const val = +(last.balances || {})[a] || 0
          const pval = prev ? +(prev.balances || {})[a] || 0 : null
          const diff = pval !== null ? val - pval : null
          return (
            <div className="history-row" key={a}>
              <span>{a} <span className="cur-tag">{c}</span></span>
              <span>
                {fmt(val)} {sym(c)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="section-title">По доходам</div>
        {state.sources.map((s) => {
          const c = curOf(s, 'source', state)
          const val = +(last.income || {})[s] || 0
          return (
            <div className="history-row" key={s}>
              <span>{s} <span className="cur-tag">{c}</span></span>
              <span className="pos">{fmt(val)} {sym(c)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
