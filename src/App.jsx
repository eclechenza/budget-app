import { useState, useEffect } from 'react'
import { loadState, saveState } from './utils/storage'
import Overview        from './components/Overview'
import Assets          from './components/Assets'
import FinancialRoute  from './components/FinancialRoute'
import Entry           from './components/Entry'
import Settings        from './components/Settings'
import ExpenseAnalysis from './components/ExpenseAnalysis'
import Rates           from './components/Rates'
import { TAB_ICONS }   from './components/TabIcons'

const TABS = ['overview', 'assets', 'analysis', 'route', 'rates', 'entry', 'settings']
const TAB_LABELS = { overview: 'Обзор', assets: 'Капитал', analysis: 'Анализ расходов', route: 'Маршрут', rates: 'Курс валют', entry: 'Ввод данных', settings: 'Настройки' }

export default function App() {
  const [tab,        setTab]        = useState('overview')
  const [state,      setState]      = useState(() => loadState())
  const [theme,      setTheme]      = useState(() => localStorage.getItem('theme') || 'light')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function updateState(next) {
    setState(next)
    saveState(next)
  }

  function handleSaveEntry(monthKey, balances, income, expenses, note, refunds, closed) {
    updateState({ ...state, entries: { ...state.entries, [monthKey]: { balances, income, expenses, note, refunds, closed } } })
  }

  function renameKeys(obj, map) {
    if (!obj || !map || Object.keys(map).length === 0) return obj
    const result = { ...obj }
    for (const [oldKey, newKey] of Object.entries(map)) {
      if (oldKey in result) {
        result[newKey] = result[oldKey]
        delete result[oldKey]
      }
    }
    return result
  }

  function handleSaveInflation(inflationRates) {
    updateState({ ...state, inflationRates })
  }

  function handleImport(budgetState) {
    saveState(budgetState)
    window.location.reload()
  }

  function handleSaveSettings({ accounts, accountCur, accountType, accountMeta, archivedAccounts, sources, sourceCur, sourceType, archivedSources, expenseCategories, expenseCur, archivedExpenses, refundCategories, refundCur, archivedRefunds, refundMapping, renames = {} }) {
    const newEntries = Object.fromEntries(
      Object.entries(state.entries).map(([mk, entry]) => [mk, {
        ...entry,
        balances: renameKeys(entry.balances, renames.accounts),
        income:   renameKeys(entry.income,   renames.sources),
        expenses: renameKeys(entry.expenses, renames.expenses),
        refunds:  renameKeys(entry.refunds,  renames.refunds),
      }])
    )
    let newRefundMapping = { ...(refundMapping || {}) }
    for (const [oldName, newName] of Object.entries(renames.refunds || {})) {
      if (oldName in newRefundMapping) {
        newRefundMapping[newName] = newRefundMapping[oldName]
        delete newRefundMapping[oldName]
      }
    }
    for (const [oldName, newName] of Object.entries(renames.expenses || {})) {
      for (const rcat of Object.keys(newRefundMapping)) {
        if (newRefundMapping[rcat] === oldName) newRefundMapping[rcat] = newName
      }
    }
    updateState({ ...state, accounts, accountCur, accountType, accountMeta: accountMeta ?? state.accountMeta ?? {}, archivedAccounts: archivedAccounts ?? state.archivedAccounts ?? [], sources, sourceCur, sourceType, archivedSources: archivedSources ?? state.archivedSources ?? [], expenseCategories, expenseCur, archivedExpenses: archivedExpenses ?? state.archivedExpenses ?? [], refundCategories, refundCur, archivedRefunds: archivedRefunds ?? state.archivedRefunds ?? [], refundMapping: newRefundMapping, entries: newEntries })
  }

  function handleTabClick(t) {
    setTab(t)
    setDrawerOpen(false)
  }

  return (
    <div className="layout">
      <header className="mobile-header">
        <button className="mobile-header-menu" onClick={() => setDrawerOpen(true)} aria-label="Открыть меню">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <img src="/logo-scroooge.svg" alt="Scroooge" className="mobile-header-logo" />
        <div className="mobile-header-right" />
      </header>

      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}

      <nav className={`sidebar${drawerOpen ? ' open' : ''}`}>
        <img src="/logo-scroooge.svg" alt="Scroooge" className="sidebar-logo" />
        {TABS.map((t) => {
          const Icon = TAB_ICONS[t]
          return (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => handleTabClick(t)}>
              <Icon />
              {TAB_LABELS[t]}
            </button>
          )
        })}
      </nav>

      <div className="content">
        <div className="app">
          {tab === 'overview'  && <Overview        state={state} />}
          {tab === 'assets'    && <Assets state={state} />}
          {tab === 'analysis'  && <ExpenseAnalysis state={state} />}
          {tab === 'route'     && <FinancialRoute  state={state} />}
          {tab === 'rates'     && <Rates state={state} />}
          {tab === 'entry'     && <Entry           state={state} onSave={handleSaveEntry} onSaveSettings={handleSaveSettings} />}
          {tab === 'settings'  && <Settings        state={state} onSave={handleSaveSettings} onImport={handleImport} onSaveInflation={handleSaveInflation} theme={theme} onThemeChange={setTheme} />}
        </div>
      </div>
    </div>
  )
}
