import { useState, useRef, useEffect } from 'react'
import { monthLabel, sym, CURRENCIES } from '../utils/storage'
import { downloadExport, applyImport, validateImport, importSummary } from '../utils/exportImport'

const CUR_LABELS = { KZT: 'Тенге (₸)', RUB: 'Рубли (₽)', USD: 'Доллары ($)' }

export default function Settings({ state, onSave, onImport, onSaveInflation, theme, onThemeChange }) {
  const [inflRates, setInflRates] = useState(() => ({ KZT: '', RUB: '', USD: '', ...(state.inflationRates || {}) }))
  const [toast, setToast] = useState(null) // { type: 'success'|'error', msg: string }
  const [ctxCopied, setCtxCopied] = useState(false)
  const [importPending, setImportPending] = useState(null) // { data, summary } | null
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const toastTimer = useRef(null)
  const ctxTimer = useRef(null)
  const fileInputRef = useRef(null)
  const inflTimer = useRef(null)
  const inflMounted = useRef(false)

  useEffect(() => {
    if (!inflMounted.current) { inflMounted.current = true; return }
    clearTimeout(inflTimer.current)
    inflTimer.current = setTimeout(() => { onSaveInflation(inflRates); showToast('success', 'Сохранено') }, 600)
    return () => clearTimeout(inflTimer.current)
  }, [inflRates])

  function showToast(type, msg) {
    setToast({ type, msg })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function handleSave() {
    onSave({ accounts: state.accounts, accountCur: state.accountCur, accountType: state.accountType || {}, sources: state.sources, sourceCur: state.sourceCur, sourceType: state.sourceType || {}, expenseCategories: state.expenseCategories || [], expenseCur: state.expenseCur || {}, refundCategories: state.refundCategories || [], refundCur: state.refundCur || {}, refundMapping: state.refundMapping || {}, renames: { accounts: {}, sources: {}, expenses: {}, refunds: {} } })
    showToast('success', 'Настройки сохранены')
  }

  function handleExport() {
    downloadExport(state)
    showToast('success', 'Экспорт завершён')
  }

  function handleImportClick() {
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        validateImport(data)
        setImportPending({ data, summary: importSummary(data) })
      } catch (err) {
        showToast('error', `Ошибка: ${err.message}`)
      }
    }
    reader.onerror = () => showToast('error', 'Не удалось прочитать файл')
    reader.readAsText(file)
  }

  function confirmImport() {
    try {
      const budgetState = applyImport(importPending.data)
      setImportPending(null)
      onImport(budgetState)
    } catch (err) {
      setImportPending(null)
      showToast('error', `Ошибка импорта: ${err.message}`)
    }
  }

  function cancelImport() {
    setImportPending(null)
  }

  function confirmDelete() {
    localStorage.removeItem('budget_app')
    localStorage.removeItem('budget_route')
    window.location.reload()
  }

  function exportProjectContext() {
    const lines = []
    const entryKeys = Object.keys(state.entries).sort()

    lines.push('# Проект')
    lines.push('- Название: Budget Tracker')
    lines.push('- Описание: Локальный веб-трекер личного бюджета с мультивалютностью и прогнозом капитала')
    lines.push('- Платформа: веб-приложение, запускается локально (Vite + React)')
    lines.push('- Хранение данных: localStorage (без сервера)')
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('# Модель данных')
    lines.push('')

    lines.push('## Счета (accounts)')
    if (state.accounts.length > 0) {
      state.accounts.forEach((a) => {
        const type = (state.accountType || {})[a] || 'Карта'
        const cur = (state.accountCur || {})[a] || 'KZT'
        lines.push(`- ${a}: тип=${type}, валюта=${cur}`)
      })
    } else {
      lines.push('(нет)')
    }
    lines.push('')

    lines.push('## Источники дохода (sources)')
    if (state.sources.length > 0) {
      state.sources.forEach((s) => {
        const cur = (state.sourceCur || {})[s] || 'KZT'
        lines.push(`- ${s}: ${cur}`)
      })
    } else {
      lines.push('(нет)')
    }
    lines.push('')

    lines.push('## Категории расходов (expenseCategories)')
    if ((state.expenseCategories || []).length > 0) {
      state.expenseCategories.forEach((c) => {
        const cur = (state.expenseCur || {})[c] || 'KZT'
        lines.push(`- ${c}: ${cur}`)
      })
    } else {
      lines.push('(нет)')
    }
    lines.push('')

    lines.push('## Возвраты (refundCategories)')
    if ((state.refundCategories || []).length > 0) {
      state.refundCategories.forEach((c) => {
        const cur = (state.refundCur || {})[c] || 'KZT'
        lines.push(`- ${c}: ${cur}`)
      })
    } else {
      lines.push('(нет)')
    }
    lines.push('')

    lines.push('## Записи (entries)')
    if (entryKeys.length > 0) {
      lines.push(`- Диапазон: ${monthLabel(entryKeys[0])} — ${monthLabel(entryKeys[entryKeys.length - 1])}`)
      lines.push(`- Месяцев с данными: ${entryKeys.length}`)
      lines.push('- Структура: { balances: {[счёт]: число}, income: {[источник]: число}, expenses: {[категория]: число}, refunds: {[возврат]: число}, note: строка }')
    } else {
      lines.push('(нет данных)')
    }
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('# Ключевая логика')
    lines.push('')
    lines.push('## Капитал')
    lines.push('Сумма балансов всех счетов (Карта + Актив) по каждой валюте отдельно.')
    lines.push('')
    lines.push('## Сбережения')
    lines.push('savedKZT = incKZT − netExpKZT, где netExpKZT = expenses − refunds (всё конвертируется в KZT по курсу)')
    lines.push('Норма сбережений = savedKZT / incKZT × 100%')
    lines.push('')
    lines.push('## Прогноз капитала')
    lines.push('- Начальный капитал = балансы счетов типа "Актив" за последний месяц')
    lines.push('- Среднее сбережений = среднее за последние 6 месяцев (без источника "Фриланс")')
    lines.push('- Сложный %: cap = cap × (1 + monthlyRate) + savings')
    lines.push('- Простой %: cap = cap + initCap × monthlyRate + savings')
    lines.push('- Реальная стоимость: realValue = cap / (1 + monthlyInflation)^month')
    lines.push('')
    lines.push('## Конвертация валют')
    lines.push('Через базу KZT: amount × rates[from] / rates[to]')
    lines.push('rates = { KZT: 1, RUB: <KZT за 1 RUB>, USD: <KZT за 1 USD> }')
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('# Мультивалютность')
    lines.push('- Поддерживаемые валюты: KZT (₸), RUB (₽), USD ($)')
    lines.push('- Базовая валюта: KZT (через неё идёт конвертация)')
    lines.push('- Курсы: загружаются с api.exchangerate-api.com или вводятся вручную в режиме "Сводный"')
    lines.push('- Инфляция: задаётся вручную (% годовых), применяется в прогнозе')
    lines.push('- Каждому счёту, источнику и категории задаётся своя валюта')
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('# Текущее состояние')
    lines.push('')
    lines.push('## Реализовано')
    lines.push('- Учёт доходов / расходов / возвратов / балансов по месяцам')
    lines.push('- Мультивалютность (KZT, RUB, USD) с конвертацией через KZT')
    lines.push('- Типы счетов: Карта / Актив (активы — базовый капитал в прогнозе)')
    lines.push('- Обзор с графиками: капитал, норма сбережений, доходы, расходы (burn rate)')
    lines.push('- Прогноз капитала: простой / сложный %, инфляция, раздельный и сводный режим')
    lines.push('- Экспорт статистики в Markdown (таблица по месяцам)')
    lines.push('- Экспорт данных в JSON (полный бэкап) и импорт обратно')
    lines.push('- Тёмная / светлая тема')
    lines.push('- Drag-and-drop сортировка категорий в настройках')
    lines.push('- Хранение: localStorage (без сервера и авторизации)')

    if (entryKeys.length > 0) {
      const lastKey = entryKeys[entryKeys.length - 1]
      const lastEntry = state.entries[lastKey]
      const withBalance = Object.entries(lastEntry.balances || {}).filter(([, v]) => +v > 0)
      if (withBalance.length > 0) {
        lines.push('')
        lines.push(`## Балансы за последний месяц (${monthLabel(lastKey)})`)
        withBalance.forEach(([name, val]) => {
          const cur = (state.accountCur || {})[name] || 'KZT'
          lines.push(`- ${name}: ${Number(val).toLocaleString('ru')} ${cur}`)
        })
      }
    }

    const text = lines.join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCtxCopied(true)
      clearTimeout(ctxTimer.current)
      ctxTimer.current = setTimeout(() => setCtxCopied(false), 2500)
    })
  }

  return (
    <div>
      <div className="card theme-card">
        <span className="section-title" style={{ marginBottom: 0 }}>Тема</span>
        <div className="chips">
          <button
            className={`chip${theme === 'light' ? ' active' : ''}`}
            onClick={() => onThemeChange('light')}
          >☀ Светлая</button>
          <button
            className={`chip${theme === 'dark' ? ' active' : ''}`}
            onClick={() => onThemeChange('dark')}
          >🌙 Тёмная</button>
        </div>
      </div>

      {/* ── Инфляция ── */}
      <div className="card">
        <div className="section-title">Инфляция</div>
        {CURRENCIES.map((c) => (
          <div className="settings-row" key={c}>
            <span className="settings-row-label">{CUR_LABELS[c]}</span>
            <div className="settings-infl-input-wrap">
              <input
                type="text"
                inputMode="decimal"
                className="field-input field-input--sm"
                style={{ width: 72, textAlign: 'right' }}
                value={inflRates[c]}
                placeholder="0"
                onChange={(e) => setInflRates({ ...inflRates, [c]: e.target.value })}
              />
              <span className="settings-infl-sym">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card data-transfer-card">
        <div className="section-title">Данные</div>
        <div className="data-transfer-row">
          <div className="data-transfer-item">
            <div className="data-transfer-label">Создать резервную копию</div>
            <div className="data-transfer-desc">Скачать все данные в JSON-файл</div>
            <button className="btn-secondary full" onClick={handleExport}>Экспорт данных</button>
          </div>
          <div className="data-transfer-divider" />
          <div className="data-transfer-item">
            <div className="data-transfer-label">Восстановить из копии</div>
            <div className="data-transfer-desc">Загрузить JSON-файл с данными</div>
            <button className="btn-secondary full" onClick={handleImportClick}>Импорт данных</button>
          </div>
          <div className="data-transfer-divider" />
          <div className="data-transfer-item">
            <div className="data-transfer-label">Сбросить всё</div>
            <div className="data-transfer-desc">Удалить все данные без возможности восстановления</div>
            <button className="btn-danger full" onClick={() => setDeleteConfirm(true)}>Удалить данные</button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <button className="btn-secondary full" onClick={exportProjectContext}>Экспорт контекста проекта</button>

      {importPending && (
        <div className="confirm-overlay" onClick={cancelImport}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">Импорт данных</div>
            <div className="confirm-body">
              <p className="confirm-warning">Текущие данные будут полностью заменены.</p>
              <div className="confirm-meta">
                <div className="confirm-meta-row">
                  <span>Счетов</span>
                  <span>{importPending.summary.accounts}</span>
                </div>
                <div className="confirm-meta-row">
                  <span>Месяцев с данными</span>
                  <span>{importPending.summary.months}</span>
                </div>
                {importPending.summary.exportedAt && (
                  <div className="confirm-meta-row">
                    <span>Дата экспорта</span>
                    <span>{new Date(importPending.summary.exportedAt).toLocaleString('ru', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={cancelImport}>Отмена</button>
              <button className="btn-primary" onClick={confirmImport}>Импортировать</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="confirm-overlay" onClick={() => setDeleteConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title confirm-title--danger">Удалить все данные?</div>
            <div className="confirm-body">
              <p className="confirm-warning">Это действие необратимо. Все счета, история по месяцам и настройки будут удалены.</p>
              <div className="confirm-meta">
                <div className="confirm-meta-row">
                  <span>Счетов</span>
                  <span>{state.accounts.length}</span>
                </div>
                <div className="confirm-meta-row">
                  <span>Месяцев с данными</span>
                  <span>{Object.keys(state.entries).length}</span>
                </div>
              </div>
            </div>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(false)}>Отмена</button>
              <button className="btn-danger" onClick={confirmDelete}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast${toast.type === 'error' ? ' toast-error' : ''}`}>
          <span className="toast-check">{toast.type === 'error' ? '✕' : '✓'}</span>
          {toast.msg}
        </div>
      )}
      {ctxCopied && (
        <div className="toast">
          <span className="toast-check">✓</span> Контекст скопирован в буфер обмена
        </div>
      )}
    </div>
  )
}
