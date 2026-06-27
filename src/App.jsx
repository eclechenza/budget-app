import { useState, useEffect, useRef } from 'react'
import { loadState, saveState } from './utils/storage'
import { syncToGist } from './utils/gistSync'
import Overview        from './components/Overview'
import Assets          from './components/Assets'
import FinancialRoute  from './components/FinancialRoute'
import Entry           from './components/Entry'
import Settings        from './components/Settings'
import Rates           from './components/Rates'
import Portfolio       from './components/Portfolio'
import { TAB_ICONS }   from './components/TabIcons'

const TABS = ['overview', 'assets', 'route', 'rates', 'entry', 'portfolio', 'settings']
const TAB_LABELS = { overview: 'Обзор', assets: 'Капитал', route: 'Маршрут', rates: 'Курс валют', entry: 'Ввод данных', settings: 'Настройки', portfolio: 'Инвестиции' }

export default function App() {
  const [tab,        setTab]        = useState('overview')
  const [state,      setState]      = useState(() => loadState())
  const [theme,      setTheme]      = useState(() => localStorage.getItem('theme') || 'light')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [swiping,    setSwiping]    = useState(false)
  const swipeRef    = useRef({ startX: 0, startY: 0, active: false, dirLocked: false })
  const drawerRef   = useRef(drawerOpen)
  drawerRef.current = drawerOpen

  useEffect(() => {
    function onTouchStart(e) {
      const t = e.touches[0]
      swipeRef.current = { startX: t.clientX, startY: t.clientY, active: false, dirLocked: false }
      if (!drawerRef.current && t.clientX < 24) swipeRef.current.active = true
      if (drawerRef.current) swipeRef.current.active = true
    }

    function onTouchMove(e) {
      const ref = swipeRef.current
      if (!ref.active) return
      const dx = e.touches[0].clientX - ref.startX
      const dy = e.touches[0].clientY - ref.startY
      if (!ref.dirLocked) {
        if (Math.abs(dy) > Math.abs(dx)) { ref.active = false; return }
        ref.dirLocked = true
      }
      e.preventDefault()
      if (!drawerRef.current && dx > 0) setSwiping(true)
      if (drawerRef.current && dx < 0) setSwiping(true)
    }

    function onTouchEnd(e) {
      const ref = swipeRef.current
      if (!ref.active) return
      const dx = e.changedTouches[0].clientX - ref.startX
      setSwiping(false)
      ref.active = false
      if (!drawerRef.current && dx > 60) setDrawerOpen(true)
      if (drawerRef.current && dx < -60) setDrawerOpen(false)
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove',  onTouchMove,  { passive: false })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function updateState(next) {
    setState(next)
    saveState(next)
    syncToGist(next).catch(() => {})
  }

  function handleSaveEntry(monthKey, balances, income, expenses, note, refunds, closed, hiddenAccounts, hiddenSources, hiddenExpenses, hiddenRefunds) {
    updateState({ ...state, entries: { ...state.entries, [monthKey]: { balances, income, expenses, note, refunds, closed, hiddenAccounts: hiddenAccounts || [], hiddenSources: hiddenSources || [], hiddenExpenses: hiddenExpenses || [], hiddenRefunds: hiddenRefunds || [] } } })
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

  function handleSaveSettings({ accounts, accountCur, accountType, accountMeta, archivedAccounts, sources, sourceCur, sourceType, archivedSources, sourceMeta, expenseCategories, expenseCur, archivedExpenses, expenseMeta, refundCategories, refundCur, archivedRefunds, refundMeta, refundMapping, renames = {} }) {
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
    updateState({ ...state, accounts, accountCur, accountType, accountMeta: accountMeta ?? state.accountMeta ?? {}, archivedAccounts: archivedAccounts ?? state.archivedAccounts ?? [], sources, sourceCur, sourceType, archivedSources: archivedSources ?? state.archivedSources ?? [], sourceMeta: sourceMeta ?? state.sourceMeta ?? {}, expenseCategories, expenseCur, archivedExpenses: archivedExpenses ?? state.archivedExpenses ?? [], expenseMeta: expenseMeta ?? state.expenseMeta ?? {}, refundCategories, refundCur, archivedRefunds: archivedRefunds ?? state.archivedRefunds ?? [], refundMeta: refundMeta ?? state.refundMeta ?? {}, refundMapping: newRefundMapping, entries: newEntries })
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
      </header>

      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}

      <nav className={`sidebar${drawerOpen ? ' open' : ''}${swiping ? ' swiping' : ''}`}>
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
        {import.meta.env.DEV && <span className="sidebar-dev-badge">DEV</span>}
      </nav>

      <div className="content">
        <div className="app">
          {tab === 'overview'  && <Overview        state={state} />}
          {tab === 'assets'    && <Assets state={state} />}
          {tab === 'route'     && <FinancialRoute  state={state} />}
          {tab === 'rates'     && <Rates state={state} />}
          {tab === 'entry'     && <Entry           state={state} onSave={handleSaveEntry} onSaveSettings={handleSaveSettings} />}
          {tab === 'settings'  && <Settings        state={state} onSave={handleSaveSettings} onImport={handleImport} onSaveInflation={handleSaveInflation} theme={theme} onThemeChange={setTheme} />}
          {tab === 'portfolio' && <Portfolio />}
        </div>
      </div>
    </div>
  )
}
