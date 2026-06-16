import { CURRENCIES, curOf, fmt, monthLabel, sym, closedMonths } from './storage'
import { sumExpensesByCur, sumRefundsByCur } from './analytics'

function sumByCurLocal(obj, names, type, state) {
  const r = { KZT: 0, RUB: 0, USD: 0 }
  names.forEach((n) => {
    r[curOf(n, type, state)] += +obj[n] || 0
  })
  return r
}

function fmtAmt(val, cur) {
  return val ? `${fmt(val)} ${sym(cur)}` : null
}

function activeCurs(obj) {
  return CURRENCIES.filter((c) => obj[c])
}

export function buildExportText(state) {
  const months = closedMonths(state)
  if (!months.length) return 'Нет данных для экспорта.'

  const now = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
  const lines = []

  lines.push(`# Бюджет — аналитика (${now})`)
  lines.push('')

  // ── Сводная таблица по месяцам ──────────────────────────────────────────────
  lines.push('## Сводка по месяцам')
  lines.push('')
  lines.push('| Месяц | Доход | Расходы | Возвраты | Чистые расходы | Сохранено | Сбережения |')
  lines.push('|-------|-------|---------|----------|----------------|-----------|------------|')

  months.forEach((mk) => {
    const e    = state.entries[mk]
    const inc  = sumByCurLocal(e.income   || {}, state.sources,  'source',  state)
    const exp  = sumExpensesByCur(e.expenses || {}, state)
    const ref  = sumRefundsByCur(e.refunds || {}, state)
    const curs = [...new Set([...activeCurs(inc), ...activeCurs(exp), ...activeCurs(ref)])]

    if (!curs.length) {
      lines.push(`| ${monthLabel(mk)} | — | — | — | — | — | — |`)
      return
    }

    const incStr  = curs.map((c) => fmtAmt(inc[c], c)).filter(Boolean).join(', ') || '—'
    const expStr  = curs.map((c) => fmtAmt(exp[c], c)).filter(Boolean).join(', ') || '—'
    const refStr  = curs.map((c) => fmtAmt(ref[c], c)).filter(Boolean).join(', ') || '—'
    const netStr  = curs.map((c) => {
      const net = (exp[c] || 0) - (ref[c] || 0)
      return net ? `${fmt(net)} ${sym(c)}` : null
    }).filter(Boolean).join(', ') || '—'

    const savedParts = curs.map((c) => {
      const s = (inc[c] || 0) - ((exp[c] || 0) - (ref[c] || 0))
      return `${s >= 0 ? '+' : ''}${fmt(s)} ${sym(c)}`
    }).join(', ')

    // % сбережений считаем по первой валюте с доходом
    const mainCur = curs.find((c) => inc[c] > 0)
    const pct = mainCur && inc[mainCur] > 0
      ? Math.round(((inc[mainCur] - ((exp[mainCur] || 0) - (ref[mainCur] || 0))) / inc[mainCur]) * 100)
      : null

    lines.push(`| ${monthLabel(mk)} | ${incStr} | ${expStr} | ${refStr} | ${netStr} | ${savedParts} | ${pct !== null ? pct + '%' : '—'} |`)
  })

  // ── Детали по категориям расходов ───────────────────────────────────────────
  if (state.expenseCategories?.length) {
    lines.push('')
    lines.push('## Расходы по категориям')
    lines.push('')

    const header = ['Категория', ...months.map((mk) => monthLabel(mk))].join(' | ')
    lines.push('| ' + header + ' |')
    lines.push('| ' + ['---', ...months.map(() => '---')].join(' | ') + ' |')

    state.expenseCategories.forEach((cat) => {
      const c = (state.expenseCur || {})[cat] || 'KZT'
      const vals = months.map((mk) => {
        const v = +(state.entries[mk]?.expenses || {})[cat] || 0
        return v ? `${fmt(v)} ${sym(c)}` : '—'
      })
      lines.push(`| ${cat} | ${vals.join(' | ')} |`)
    })
  }

  // ── Возвраты по категориям ──────────────────────────────────────────────────
  if (state.refundCategories?.length) {
    lines.push('')
    lines.push('## Возвраты по категориям')
    lines.push('_Суммы, которые мне вернули другие люди в счёт оплаты общих расходов. Не являются доходом — вычитаются из расходов для расчёта реальных личных трат._')
    lines.push('')

    const header = ['Категория', ...months.map((mk) => monthLabel(mk))].join(' | ')
    lines.push('| ' + header + ' |')
    lines.push('| ' + ['---', ...months.map(() => '---')].join(' | ') + ' |')

    state.refundCategories.forEach((cat) => {
      const c = (state.refundCur || {})[cat] || 'KZT'
      const vals = months.map((mk) => {
        const v = +(state.entries[mk]?.refunds || {})[cat] || 0
        return v ? `${fmt(v)} ${sym(c)}` : '—'
      })
      lines.push(`| ${cat} | ${vals.join(' | ')} |`)
    })
  }

  // ── Детали по источникам дохода ─────────────────────────────────────────────
  if (state.sources?.length) {
    lines.push('')
    lines.push('## Доходы по источникам')
    lines.push('')

    const header = ['Источник', ...months.map((mk) => monthLabel(mk))].join(' | ')
    lines.push('| ' + header + ' |')
    lines.push('| ' + ['---', ...months.map(() => '---')].join(' | ') + ' |')

    state.sources.forEach((s) => {
      const c = curOf(s, 'source', state)
      const vals = months.map((mk) => {
        const v = +(state.entries[mk]?.income || {})[s] || 0
        return v ? `${fmt(v)} ${sym(c)}` : '—'
      })
      lines.push(`| ${s} | ${vals.join(' | ')} |`)
    })
  }

  // ── Остатки по счетам ───────────────────────────────────────────────────────
  if (state.accounts?.length) {
    lines.push('')
    lines.push('## Остатки по счетам')
    lines.push('')

    const header = ['Счёт', ...months.map((mk) => monthLabel(mk))].join(' | ')
    lines.push('| ' + header + ' |')
    lines.push('| ' + ['---', ...months.map(() => '---')].join(' | ') + ' |')

    state.accounts.forEach((a) => {
      const c = curOf(a, 'account', state)
      const vals = months.map((mk) => {
        const v = +(state.entries[mk]?.balances || {})[a] || 0
        return v ? `${fmt(v)} ${sym(c)}` : '—'
      })
      lines.push(`| ${a} | ${vals.join(' | ')} |`)
    })
  }

  // ── Заметки ─────────────────────────────────────────────────────────────────
  const notes = months.filter((mk) => state.entries[mk]?.note)
  if (notes.length) {
    lines.push('')
    lines.push('## Заметки')
    lines.push('')
    notes.forEach((mk) => {
      lines.push(`**${monthLabel(mk)}:** ${state.entries[mk].note}`)
    })
  }

  return lines.join('\n')
}
