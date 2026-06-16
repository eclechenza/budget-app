import { useState, useRef, useEffect } from 'react'
import { curOf, genMonths, sym } from '../utils/storage'
import ItemList, { ACCOUNT_TYPES, ASSET_TYPES, SOURCE_TYPES } from './ItemList'

function fmtInput(val) {
  if (val === '' || val == null) return ''
  const s = String(val)
  const [int, dec] = s.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return dec !== undefined ? formatted + '.' + dec : formatted
}

function parseInput(str) {
  return str.replace(/[ \s]/g, '')
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

// Reusable archive list in edit mode
function ArchiveList({ items, onRestore, onDelete }) {
  if (items.length === 0) return <span className="muted small">Архив пуст</span>
  return items.map((name) => (
    <div className="acc-edit-archive-row" key={name}>
      <span className="acc-edit-archive-name">{name}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="restore-btn" onClick={() => onRestore(name)}>Восстановить</button>
        <button className="restore-btn restore-btn--danger" onClick={() => onDelete(name)}>Удалить</button>
      </div>
    </div>
  ))
}

// Reusable section delete modal
function DeleteModal({ name, label, onCancel, onConfirm }) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">Удалить {label}?</div>
        <div className="confirm-body">
          <p className="confirm-warning">«{name}» будет удалён безвозвратно. Данные в истории месяцев сохранятся.</p>
        </div>
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={onCancel}>Отмена</button>
          <button className="btn-danger" onClick={onConfirm}>Удалить</button>
        </div>
      </div>
    </div>
  )
}

export default function Entry({ state, onSave, onSaveSettings }) {
  const months = genMonths(24, 1)
  const [selectedMonth, setSelectedMonth] = useState(months[1].k)

  const _initial = state.entries[months[1].k] || {}
  const [balances, setBalances] = useState(_initial.balances || {})
  const [income, setIncome] = useState(_initial.income   || {})
  const [expenses, setExpenses] = useState(_initial.expenses || {})
  const [refunds, setRefunds] = useState(_initial.refunds  || {})
  const [note, setNote] = useState(_initial.note || '')
  const [closed, setClosed] = useState(_initial.closed || false)
  const [toast, setToast] = useState(false)
  const toastTimer = useRef(null)
  const saveTimer = useRef(null)
  const dataMounted = useRef(false)
  const isMonthSwitch = useRef(false)

  useEffect(() => {
    if (!dataMounted.current) { dataMounted.current = true; return }
    if (isMonthSwitch.current) { isMonthSwitch.current = false; return }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onSave(selectedMonth, balances, income, expenses, note, refunds, closed)
      setToast(true)
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(false), 2500)
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [balances, income, expenses, refunds, note])

  // ── Счета ────────────────────────────────────────────────────────────────
  const [accountsTab, setAccountsTab] = useState('active')
  const [editingAccounts, setEditingAccounts] = useState(false)
  const [editAccounts, setEditAccounts] = useState([])
  const [editArchivedAccounts, setEditArchivedAccounts] = useState([])
  const [editAccountCur, setEditAccountCur] = useState({})
  const [editAccountType, setEditAccountType] = useState({})
  const [editAccountMeta, setEditAccountMeta] = useState({})
  const [editAccountRenames, setEditAccountRenames] = useState({})
  const [deleteAccountName, setDeleteAccountName] = useState(null)

  function startEditAccounts() {
    setEditAccounts([...state.accounts])
    setEditArchivedAccounts([...(state.archivedAccounts || [])])
    setEditAccountCur({ ...state.accountCur })
    setEditAccountType({ ...(state.accountType || {}) })
    setEditAccountMeta({ ...(state.accountMeta || {}) })
    setEditAccountRenames({})
    setAccountsTab('active')
    setEditingAccounts(true)
  }
  function archiveEditAccount(name) {
    setEditAccounts(prev => prev.filter(a => a !== name))
    setEditArchivedAccounts(prev => [...prev, name])
  }
  function restoreEditAccount(name) {
    setEditArchivedAccounts(prev => prev.filter(a => a !== name))
    setEditAccounts(prev => [...prev, name])
  }
  function deleteArchivedAccount(name) {
    setEditArchivedAccounts(prev => prev.filter(a => a !== name))
    setEditAccountCur(prev => { const n = { ...prev }; delete n[name]; return n })
    setEditAccountType(prev => { const n = { ...prev }; delete n[name]; return n })
    setDeleteAccountName(null)
  }
  function trackEditRename(oldName, newName) {
    setEditAccountRenames(prev => {
      const updated = { ...prev }
      for (const k of Object.keys(updated)) {
        if (updated[k] === oldName) {
          if (k === newName) delete updated[k]
          else updated[k] = newName
          return updated
        }
      }
      if (oldName !== newName) updated[oldName] = newName
      return updated
    })
  }
  function addEditAccount() {
    let n = 'Новый счёт', i = 2
    while (editAccounts.includes(n)) n = `Новый счёт ${i++}`
    setEditAccounts([...editAccounts, n])
    setEditAccountCur({ ...editAccountCur, [n]: 'KZT' })
    setEditAccountType({ ...editAccountType, [n]: 'Карта' })
  }
  function saveEditAccounts() {
    const newBalances = { ...balances }
    for (const [oldName, newName] of Object.entries(editAccountRenames)) {
      if (oldName in newBalances) { newBalances[newName] = newBalances[oldName]; delete newBalances[oldName] }
    }
    setBalances(newBalances)
    onSaveSettings({
      accounts: editAccounts, accountCur: editAccountCur, accountType: editAccountType, accountMeta: editAccountMeta,
      archivedAccounts: editArchivedAccounts,
      sources: state.sources, sourceCur: state.sourceCur, sourceType: state.sourceType || {},
      expenseCategories: state.expenseCategories || [], expenseCur: state.expenseCur || {},
      refundCategories: state.refundCategories || [], refundCur: state.refundCur || {},
      refundMapping: state.refundMapping || {},
      renames: { accounts: editAccountRenames, sources: {}, expenses: {}, refunds: {} },
    })
    setEditingAccounts(false)
  }

  // ── Доходы ───────────────────────────────────────────────────────────────
  const [sourcesTab, setSourcesTab] = useState('active')
  const [editingSources, setEditingSources] = useState(false)
  const [editSources, setEditSources] = useState([])
  const [editArchivedSources, setEditArchivedSources] = useState([])
  const [editSourceCur, setEditSourceCur] = useState({})
  const [editSourceType, setEditSourceType] = useState({})
  const [editSourceRenames, setEditSourceRenames] = useState({})
  const [deleteSourceName, setDeleteSourceName] = useState(null)

  function startEditSources() {
    setEditSources([...state.sources])
    setEditArchivedSources([...(state.archivedSources || [])])
    setEditSourceCur({ ...state.sourceCur })
    setEditSourceType({ ...(state.sourceType || {}) })
    setEditSourceRenames({})
    setSourcesTab('active')
    setEditingSources(true)
  }
  function archiveEditSource(name) {
    setEditSources(prev => prev.filter(s => s !== name))
    setEditArchivedSources(prev => [...prev, name])
  }
  function restoreEditSource(name) {
    setEditArchivedSources(prev => prev.filter(s => s !== name))
    setEditSources(prev => [...prev, name])
  }
  function deleteArchivedSource(name) {
    setEditArchivedSources(prev => prev.filter(s => s !== name))
    setEditSourceCur(prev => { const n = { ...prev }; delete n[name]; return n })
    setEditSourceType(prev => { const n = { ...prev }; delete n[name]; return n })
    setDeleteSourceName(null)
  }
  function trackEditSourceRename(oldName, newName) {
    setEditSourceRenames(prev => {
      const updated = { ...prev }
      for (const k of Object.keys(updated)) {
        if (updated[k] === oldName) {
          if (k === newName) delete updated[k]
          else updated[k] = newName
          return updated
        }
      }
      if (oldName !== newName) updated[oldName] = newName
      return updated
    })
  }
  function addEditSource() {
    let n = 'Новый источник', i = 2
    while (editSources.includes(n)) n = `Новый источник ${i++}`
    setEditSources([...editSources, n])
    setEditSourceCur({ ...editSourceCur, [n]: 'KZT' })
    setEditSourceType({ ...editSourceType, [n]: 'Постоянный' })
  }
  function saveEditSources() {
    const newIncome = { ...income }
    for (const [oldName, newName] of Object.entries(editSourceRenames)) {
      if (oldName in newIncome) { newIncome[newName] = newIncome[oldName]; delete newIncome[oldName] }
    }
    setIncome(newIncome)
    onSaveSettings({
      accounts: state.accounts, accountCur: state.accountCur, accountType: state.accountType || {},
      sources: editSources, sourceCur: editSourceCur, sourceType: editSourceType,
      archivedSources: editArchivedSources,
      expenseCategories: state.expenseCategories || [], expenseCur: state.expenseCur || {},
      refundCategories: state.refundCategories || [], refundCur: state.refundCur || {},
      refundMapping: state.refundMapping || {},
      renames: { accounts: {}, sources: editSourceRenames, expenses: {}, refunds: {} },
    })
    setEditingSources(false)
  }

  // ── Расходы ──────────────────────────────────────────────────────────────
  const [expensesTab, setExpensesTab] = useState('active')
  const [editingExpenses, setEditingExpenses] = useState(false)
  const [editExpenses, setEditExpenses] = useState([])
  const [editArchivedExpenses, setEditArchivedExpenses] = useState([])
  const [editExpenseCur, setEditExpenseCur] = useState({})
  const [editExpenseRenames, setEditExpenseRenames] = useState({})
  const [deleteExpenseName, setDeleteExpenseName] = useState(null)

  function startEditExpenses() {
    setEditExpenses([...(state.expenseCategories || [])])
    setEditArchivedExpenses([...(state.archivedExpenses || [])])
    setEditExpenseCur({ ...(state.expenseCur || {}) })
    setEditExpenseRenames({})
    setExpensesTab('active')
    setEditingExpenses(true)
  }
  function archiveEditExpense(name) {
    setEditExpenses(prev => prev.filter(e => e !== name))
    setEditArchivedExpenses(prev => [...prev, name])
  }
  function restoreEditExpense(name) {
    setEditArchivedExpenses(prev => prev.filter(e => e !== name))
    setEditExpenses(prev => [...prev, name])
  }
  function deleteArchivedExpense(name) {
    setEditArchivedExpenses(prev => prev.filter(e => e !== name))
    setEditExpenseCur(prev => { const n = { ...prev }; delete n[name]; return n })
    setDeleteExpenseName(null)
  }
  function trackEditExpenseRename(oldName, newName) {
    setEditExpenseRenames(prev => {
      const updated = { ...prev }
      for (const k of Object.keys(updated)) {
        if (updated[k] === oldName) {
          if (k === newName) delete updated[k]
          else updated[k] = newName
          return updated
        }
      }
      if (oldName !== newName) updated[oldName] = newName
      return updated
    })
  }
  function addEditExpense() {
    let n = 'Новый расход', i = 2
    while (editExpenses.includes(n)) n = `Новый расход ${i++}`
    setEditExpenses([...editExpenses, n])
    setEditExpenseCur({ ...editExpenseCur, [n]: 'KZT' })
  }
  function saveEditExpenses() {
    const newExpenses = { ...expenses }
    for (const [oldName, newName] of Object.entries(editExpenseRenames)) {
      if (oldName in newExpenses) { newExpenses[newName] = newExpenses[oldName]; delete newExpenses[oldName] }
    }
    setExpenses(newExpenses)
    onSaveSettings({
      accounts: state.accounts, accountCur: state.accountCur, accountType: state.accountType || {},
      sources: state.sources, sourceCur: state.sourceCur, sourceType: state.sourceType || {},
      expenseCategories: editExpenses, expenseCur: editExpenseCur,
      archivedExpenses: editArchivedExpenses,
      refundCategories: state.refundCategories || [], refundCur: state.refundCur || {},
      refundMapping: state.refundMapping || {},
      renames: { accounts: {}, sources: {}, expenses: editExpenseRenames, refunds: {} },
    })
    setEditingExpenses(false)
  }

  // ── Возвраты ─────────────────────────────────────────────────────────────
  const [refundsTab, setRefundsTab] = useState('active')
  const [editingRefunds, setEditingRefunds] = useState(false)
  const [editRefunds, setEditRefunds] = useState([])
  const [editArchivedRefunds, setEditArchivedRefunds] = useState([])
  const [editRefundCur, setEditRefundCur] = useState({})
  const [editRefundRenames, setEditRefundRenames] = useState({})
  const [editRefundMapping, setEditRefundMapping] = useState({})
  const [deleteRefundName, setDeleteRefundName] = useState(null)

  function startEditRefunds() {
    setEditRefunds([...(state.refundCategories || [])])
    setEditArchivedRefunds([...(state.archivedRefunds || [])])
    setEditRefundCur({ ...(state.refundCur || {}) })
    setEditRefundRenames({})
    setEditRefundMapping({ ...(state.refundMapping || {}) })
    setRefundsTab('active')
    setEditingRefunds(true)
  }
  function archiveEditRefund(name) {
    setEditRefunds(prev => prev.filter(r => r !== name))
    setEditArchivedRefunds(prev => [...prev, name])
  }
  function restoreEditRefund(name) {
    setEditArchivedRefunds(prev => prev.filter(r => r !== name))
    setEditRefunds(prev => [...prev, name])
  }
  function deleteArchivedRefund(name) {
    setEditArchivedRefunds(prev => prev.filter(r => r !== name))
    setEditRefundCur(prev => { const n = { ...prev }; delete n[name]; return n })
    setEditRefundMapping(prev => { const n = { ...prev }; delete n[name]; return n })
    setDeleteRefundName(null)
  }
  function trackEditRefundRename(oldName, newName) {
    setEditRefundRenames(prev => {
      const updated = { ...prev }
      for (const k of Object.keys(updated)) {
        if (updated[k] === oldName) {
          if (k === newName) delete updated[k]
          else updated[k] = newName
          return updated
        }
      }
      if (oldName !== newName) updated[oldName] = newName
      return updated
    })
    setEditRefundMapping(prev => {
      if (!(oldName in prev)) return prev
      const next = { ...prev, [newName]: prev[oldName] }
      delete next[oldName]
      return next
    })
  }
  function addEditRefund() {
    let n = 'Новый возврат', i = 2
    while (editRefunds.includes(n)) n = `Новый возврат ${i++}`
    setEditRefunds([...editRefunds, n])
    setEditRefundCur({ ...editRefundCur, [n]: 'KZT' })
  }
  function saveEditRefunds() {
    const newRefunds = { ...refunds }
    for (const [oldName, newName] of Object.entries(editRefundRenames)) {
      if (oldName in newRefunds) { newRefunds[newName] = newRefunds[oldName]; delete newRefunds[oldName] }
    }
    setRefunds(newRefunds)
    onSaveSettings({
      accounts: state.accounts, accountCur: state.accountCur, accountType: state.accountType || {},
      sources: state.sources, sourceCur: state.sourceCur, sourceType: state.sourceType || {},
      expenseCategories: state.expenseCategories || [], expenseCur: state.expenseCur || {},
      refundCategories: editRefunds, refundCur: editRefundCur,
      archivedRefunds: editArchivedRefunds,
      refundMapping: editRefundMapping,
      renames: { accounts: {}, sources: {}, expenses: {}, refunds: editRefundRenames },
    })
    setEditingRefunds(false)
  }

  // ── Общее ────────────────────────────────────────────────────────────────
  function handleMonthChange(k) {
    isMonthSwitch.current = true
    setSelectedMonth(k)
    const ex = state.entries[k] || {}
    setBalances(ex.balances || {})
    setIncome(ex.income || {})
    setExpenses(ex.expenses || {})
    setRefunds(ex.refunds || {})
    setNote(ex.note || '')
    setClosed(ex.closed || false)
  }

  function handleSave() {
    onSave(selectedMonth, balances, income, expenses, note, refunds, closed)
    setToast(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(false), 2500)
  }

  const expCats = state.expenseCategories || []
  const refCats = state.refundCategories || []

  return (
    <div>
      <div className="month-select">
        <select value={selectedMonth} onChange={(e) => handleMonthChange(e.target.value)}>
          {months.map((o) => (
            <option key={o.k} value={o.k}>{o.label}</option>
          ))}
        </select>
        <label className="month-closed-label">
          <input type="checkbox" checked={closed} onChange={(e) => {
            const val = e.target.checked
            setClosed(val)
            onSave(selectedMonth, balances, income, expenses, note, refunds, val)
          }} />
          Месяц закрыт
        </label>
      </div>

      {/* ── Счета ── */}
      <div className="card">
        <div className="section-title-row">
          <div className="section-title">Остатки по счетам</div>
          {editingAccounts ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-primary btn-sm" onClick={saveEditAccounts}>Сохранить</button>
              <button className="btn-secondary btn-sm" onClick={() => setEditingAccounts(false)}>Отмена</button>
            </div>
          ) : (
            <button className="btn-secondary btn-sm" onClick={startEditAccounts}>Редактировать</button>
          )}
        </div>
        {editingAccounts ? (
          <>
            <div className="acc-tabs" style={{ marginBottom: 12 }}>
              <button className={`acc-tab${accountsTab === 'active' ? ' active' : ''}`} onClick={() => setAccountsTab('active')}>Активные</button>
              <button className={`acc-tab${accountsTab === 'archive' ? ' active' : ''}`} onClick={() => setAccountsTab('archive')}>Архив</button>
            </div>
            {accountsTab === 'active' ? (
              <ItemList
                items={editAccounts} curMap={editAccountCur}
                onChange={(a, c) => { setEditAccounts(a); setEditAccountCur(c) }}
                onAdd={addEditAccount} label="счёт"
                typeMap={editAccountType} onTypeChange={setEditAccountType}
                types={ACCOUNT_TYPES} defaultType="Карта"
                onRename={trackEditRename} onArchive={archiveEditAccount}
                metaMap={editAccountMeta} onMetaChange={setEditAccountMeta}
              />
            ) : (
              <ArchiveList items={editArchivedAccounts} onRestore={restoreEditAccount} onDelete={setDeleteAccountName} />
            )}
          </>
        ) : (
          <table className="fields-table">
            <tbody>
              {state.accounts.map((a) => {
                const c = curOf(a, 'account', state)
                const isAsset = ASSET_TYPES.has((state.accountType || {})[a])
                const meta = isAsset ? ((state.accountMeta || {})[a] || {}) : null
                return (
                  <tr key={a}>
                    <td className="name">{a}</td>
                    <td className="acc-meta-col">
                      {meta && (
                        <span className="acc-meta-hint">
                          <span className="acc-meta-date">{meta.maturityDate ? fmtDate(meta.maturityDate) : ''}</span>
                          <span className="acc-meta-yield">{meta.yield ? `${meta.yield}%` : ''}</span>
                        </span>
                      )}
                    </td>
                    <td className="inp">
                      <input type="text" inputMode="numeric"
                        value={fmtInput(balances[a] ?? '')} placeholder="0"
                        onChange={(e) => setBalances({ ...balances, [a]: parseInput(e.target.value) })}
                      />
                    </td>
                    <td className="cur-label">{sym(c)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Доходы ── */}
      <div className="card">
        <div className="section-title-row">
          <div className="section-title">Доходы</div>
          {editingSources ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-primary btn-sm" onClick={saveEditSources}>Сохранить</button>
              <button className="btn-secondary btn-sm" onClick={() => setEditingSources(false)}>Отмена</button>
            </div>
          ) : (
            <button className="btn-secondary btn-sm" onClick={startEditSources}>Редактировать</button>
          )}
        </div>
        {editingSources ? (
          <>
            <div className="acc-tabs" style={{ marginBottom: 12 }}>
              <button className={`acc-tab${sourcesTab === 'active' ? ' active' : ''}`} onClick={() => setSourcesTab('active')}>Активные</button>
              <button className={`acc-tab${sourcesTab === 'archive' ? ' active' : ''}`} onClick={() => setSourcesTab('archive')}>Архив</button>
            </div>
            {sourcesTab === 'active' ? (
              <ItemList
                items={editSources} curMap={editSourceCur}
                onChange={(s, c) => { setEditSources(s); setEditSourceCur(c) }}
                onAdd={addEditSource} label="источник"
                typeMap={editSourceType} onTypeChange={setEditSourceType}
                types={SOURCE_TYPES} defaultType="Постоянный"
                onRename={trackEditSourceRename} onArchive={archiveEditSource}
              />
            ) : (
              <ArchiveList items={editArchivedSources} onRestore={restoreEditSource} onDelete={setDeleteSourceName} />
            )}
          </>
        ) : (
          <table className="fields-table">
            <tbody>
              {state.sources.map((s) => {
                const c = curOf(s, 'source', state)
                return (
                  <tr key={s}>
                    <td className="name">{s}</td>
                    <td className="inp">
                      <input type="text" inputMode="numeric"
                        value={fmtInput(income[s] ?? '')} placeholder="0"
                        onChange={(e) => setIncome({ ...income, [s]: parseInput(e.target.value) })}
                      />
                    </td>
                    <td className="cur-label">{sym(c)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Расходы ── */}
      <div className="card">
        <div className="section-title-row">
          <div className="section-title">Расходы</div>
          {editingExpenses ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-primary btn-sm" onClick={saveEditExpenses}>Сохранить</button>
              <button className="btn-secondary btn-sm" onClick={() => setEditingExpenses(false)}>Отмена</button>
            </div>
          ) : (
            <button className="btn-secondary btn-sm" onClick={startEditExpenses}>Редактировать</button>
          )}
        </div>
        {editingExpenses ? (
          <>
            <div className="acc-tabs" style={{ marginBottom: 12 }}>
              <button className={`acc-tab${expensesTab === 'active' ? ' active' : ''}`} onClick={() => setExpensesTab('active')}>Активные</button>
              <button className={`acc-tab${expensesTab === 'archive' ? ' active' : ''}`} onClick={() => setExpensesTab('archive')}>Архив</button>
            </div>
            {expensesTab === 'active' ? (
              <ItemList
                items={editExpenses} curMap={editExpenseCur}
                onChange={(e, c) => { setEditExpenses(e); setEditExpenseCur(c) }}
                onAdd={addEditExpense} label="категорию"
                onRename={trackEditExpenseRename} onArchive={archiveEditExpense}
              />
            ) : (
              <ArchiveList items={editArchivedExpenses} onRestore={restoreEditExpense} onDelete={setDeleteExpenseName} />
            )}
          </>
        ) : expCats.length > 0 ? (
          <table className="fields-table">
            <tbody>
              {expCats.map((cat) => {
                const c = (state.expenseCur || {})[cat] || 'KZT'
                return (
                  <tr key={cat}>
                    <td className="name">{cat}</td>
                    <td className="inp">
                      <input type="text" inputMode="numeric"
                        value={fmtInput(expenses[cat] ?? '')} placeholder="0"
                        onChange={(e) => setExpenses({ ...expenses, [cat]: parseInput(e.target.value) })}
                      />
                    </td>
                    <td className="cur-label">{sym(c)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <span className="muted small">Нет категорий — добавь через «Редактировать»</span>
        )}
      </div>

      {/* ── Возвраты ── */}
      <div className="card">
        <div className="section-title-row">
          <div className="section-title">Возвраты</div>
          {editingRefunds ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-primary btn-sm" onClick={saveEditRefunds}>Сохранить</button>
              <button className="btn-secondary btn-sm" onClick={() => setEditingRefunds(false)}>Отмена</button>
            </div>
          ) : (
            <button className="btn-secondary btn-sm" onClick={startEditRefunds}>Редактировать</button>
          )}
        </div>
        {editingRefunds ? (
          <>
            <div className="acc-tabs" style={{ marginBottom: 12 }}>
              <button className={`acc-tab${refundsTab === 'active' ? ' active' : ''}`} onClick={() => setRefundsTab('active')}>Активные</button>
              <button className={`acc-tab${refundsTab === 'archive' ? ' active' : ''}`} onClick={() => setRefundsTab('archive')}>Архив</button>
            </div>
            {refundsTab === 'active' ? (
              <>
                <ItemList
                  items={editRefunds} curMap={editRefundCur}
                  onChange={(r, c) => { setEditRefunds(r); setEditRefundCur(c) }}
                  onAdd={addEditRefund} label="возврат"
                  onRename={trackEditRefundRename} onArchive={archiveEditRefund}
                />
                {editRefunds.length > 0 && (state.expenseCategories || []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>Привязка к расходам</div>
                    {editRefunds.map((rcat) => (
                      <div className="settings-row" key={rcat}>
                        <span style={{ flex: 1, fontSize: '0.9rem' }}>{rcat}</span>
                        <span style={{ padding: '0 8px', color: 'var(--text-muted)' }}>→</span>
                        <select
                          className="s-cur" style={{ flex: 2, maxWidth: 220 }}
                          value={editRefundMapping[rcat] || ''}
                          onChange={(e) => setEditRefundMapping({ ...editRefundMapping, [rcat]: e.target.value || undefined })}
                        >
                          <option value="">Не привязан</option>
                          {(state.expenseCategories || []).map((ecat) => (
                            <option key={ecat} value={ecat}>{ecat}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <ArchiveList items={editArchivedRefunds} onRestore={restoreEditRefund} onDelete={setDeleteRefundName} />
            )}
          </>
        ) : refCats.length > 0 ? (
          <table className="fields-table">
            <tbody>
              {refCats.map((cat) => {
                const c = (state.refundCur || {})[cat] || 'KZT'
                return (
                  <tr key={cat}>
                    <td className="name">{cat}</td>
                    <td className="inp">
                      <input type="text" inputMode="numeric"
                        value={fmtInput(refunds[cat] ?? '')} placeholder="0"
                        onChange={(e) => setRefunds({ ...refunds, [cat]: parseInput(e.target.value) })}
                      />
                    </td>
                    <td className="cur-label">{sym(c)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <span className="muted small">Нет категорий — добавь через «Редактировать»</span>
        )}
      </div>

      {toast && (
        <div className="toast">
          <span className="toast-check">✓</span> Сохранено
        </div>
      )}

      <div className="card">
        <div className="section-title">Заметка</div>
        <textarea
          className="note-input" value={note} placeholder="Заметки за месяц..."
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {deleteAccountName && <DeleteModal name={deleteAccountName} label="счёт" onCancel={() => setDeleteAccountName(null)} onConfirm={() => deleteArchivedAccount(deleteAccountName)} />}
      {deleteSourceName  && <DeleteModal name={deleteSourceName}  label="источник" onCancel={() => setDeleteSourceName(null)}  onConfirm={() => deleteArchivedSource(deleteSourceName)} />}
      {deleteExpenseName && <DeleteModal name={deleteExpenseName} label="категорию" onCancel={() => setDeleteExpenseName(null)} onConfirm={() => deleteArchivedExpense(deleteExpenseName)} />}
      {deleteRefundName  && <DeleteModal name={deleteRefundName}  label="возврат" onCancel={() => setDeleteRefundName(null)}  onConfirm={() => deleteArchivedRefund(deleteRefundName)} />}
    </div>
  )
}
