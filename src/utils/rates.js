// Хранилище исторических курсов валют по месяцам.
// Источник истины для всех конвертаций в приложении —
// текущий курс используется ТОЛЬКО для отображения карточек на вкладке «Курс валют».
//
// Структура: { monthly: { '2024-03': { usd_kzt, rub_kzt, usd_rub, date, source } } }
//   usd_kzt — сколько KZT за 1 USD
//   rub_kzt — сколько KZT за 1 RUB
//   usd_rub — сколько RUB за 1 USD
//   date    — фактическая дата котировки (YYYY-MM-DD)
//   source  — 'fetched' (автоматически из CDN) | 'manual'

const KEY = 'budget_rates_history'

function defaults() {
  return { monthly: {} }
}

export function loadRatesStore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return { monthly: (data && typeof data.monthly === 'object') ? data.monthly : {} }
    }
  } catch {}
  return defaults()
}

export function saveRatesStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch {}
}

function mk(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

export function monthFromKey(k) {
  const [y, m] = k.split('-').map(Number)
  return { year: y, month: m - 1 }
}

// Перезаписать снапшот одного месяца
export function setMonthRate(year, month, rateData) {
  const store = loadRatesStore()
  store.monthly[mk(year, month)] = rateData
  saveRatesStore(store)
  return store
}

// Массовое обновление. По умолчанию НЕ перезаписывает уже существующие записи —
// первый успешный fetch фиксирует курс месяца, повторные не затирают историю.
// Передай overwrite: true, чтобы принудительно обновить.
export function setMonthRatesBatch(map, { overwrite = false } = {}) {
  const store = loadRatesStore()
  let changed = false
  Object.entries(map).forEach(([key, data]) => {
    if (!data) return
    if (!overwrite && store.monthly[key]) return
    store.monthly[key] = data
    changed = true
  })
  if (changed) saveRatesStore(store)
  return store
}

// Снимок конкретного месяца без фолбэка
export function getStoredMonthRate(year, month, store) {
  const s = store || loadRatesStore()
  return s.monthly[mk(year, month)] || null
}

// Ближайший по дате сохранённый курс. Сначала ищет ≤ требуемого месяца,
// иначе берёт самый ранний из имеющихся.
export function getNearestMonthRate(year, month, store) {
  const s = store || loadRatesStore()
  const target = mk(year, month)
  const keys = Object.keys(s.monthly).sort()
  if (!keys.length) return null
  let earlier = null
  for (const k of keys) {
    if (k <= target) earlier = k
    else break
  }
  const useKey = earlier || keys[0]
  return { key: useKey, ...s.monthly[useKey] }
}

// Возвращает объект { KZT, RUB, USD } — kzt-эквивалент каждой валюты,
// совместимо с существующей convertCurrency: amount * rates[from] / rates[to].
export function getRatesForMonth(year, month, store) {
  const s = store || loadRatesStore()
  const exact = getStoredMonthRate(year, month, s)
  const r = exact || getNearestMonthRate(year, month, s)
  if (!r) return null
  return { KZT: 1, RUB: r.rub_kzt, USD: r.usd_kzt }
}

// Единая точка входа для всех конвертаций в приложении.
// Возвращает множитель: сколько единиц `to` равно одной единице `from` на дату месяца.
export function getRateForMonth(year, month, from, to, store) {
  if (from === to) return 1
  const rates = getRatesForMonth(year, month, store)
  if (!rates) return null
  if (rates[from] == null || rates[to] == null) return null
  return rates[from] / rates[to]
}

// Список всех зафиксированных месяцев — отсортирован по возрастанию.
export function listStoredMonths(store) {
  const s = store || loadRatesStore()
  return Object.keys(s.monthly).sort()
}

// Возвращает Map: monthKey стора → массив monthKey закрытых записей, которые им считаются.
// Используется для отметки «применяется в расчётах» в таблице на вкладке «Курс валют».
export function getUsageMap(closedMonthKeys, store) {
  const s = store || loadRatesStore()
  const usage = {}
  Object.keys(s.monthly).forEach((k) => { usage[k] = [] })
  closedMonthKeys.forEach((mk) => {
    const { year, month } = monthFromKey(mk)
    const nearest = getNearestMonthRate(year, month, s)
    if (!nearest) return
    if (!usage[nearest.key]) usage[nearest.key] = []
    usage[nearest.key].push(mk)
  })
  return usage
}
