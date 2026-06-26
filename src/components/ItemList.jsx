import { useState, useRef } from 'react'
import { CURRENCIES, sym } from '../utils/storage'

export const ACCOUNT_TYPES = ['Карта', 'Вклад', 'Инвестиция']
export const ASSET_TYPES = new Set(['Вклад', 'Инвестиция'])
export const SOURCE_TYPES = ['Постоянный', 'Переменный', 'Проценты']

export default function ItemList({ items, curMap, onChange, onAdd, label, typeMap, onTypeChange, types, defaultType, onRename, onArchive, onHide, metaMap, onMetaChange }) {
  const dragIndex = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  function updateName(i, val) {
    const next = [...items]
    const oldName = next[i]
    next[i] = val
    const nextCur = { ...curMap }
    if (oldName !== val) {
      nextCur[val] = nextCur[oldName] || 'KZT'
      delete nextCur[oldName]
      if (onRename) onRename(oldName, val)
    }
    if (typeMap && onTypeChange) {
      const nextType = { ...typeMap }
      if (oldName !== val) {
        nextType[val] = nextType[oldName] || defaultType || 'Карта'
        delete nextType[oldName]
      }
      onTypeChange(nextType)
    }
    if (metaMap && onMetaChange && oldName !== val) {
      const nextMeta = { ...metaMap }
      nextMeta[val] = nextMeta[oldName] || {}
      delete nextMeta[oldName]
      onMetaChange(nextMeta)
    }
    onChange(next, nextCur)
  }

  function updateMeta(name, field, val) {
    onMetaChange({ ...metaMap, [name]: { ...(metaMap[name] || {}), [field]: val } })
  }

  function updateCur(name, cur) {
    onChange(items, { ...curMap, [name]: cur })
  }

  function updateType(name, type) {
    onTypeChange({ ...typeMap, [name]: type })
  }

  function remove(i) {
    const next = [...items]
    const name = next[i]
    next.splice(i, 1)
    const nextCur = { ...curMap }
    delete nextCur[name]
    if (typeMap && onTypeChange) {
      const nextType = { ...typeMap }
      delete nextType[name]
      onTypeChange(nextType)
    }
    if (metaMap && onMetaChange) {
      const nextMeta = { ...metaMap }
      delete nextMeta[name]
      onMetaChange(nextMeta)
    }
    onChange(next, nextCur)
  }

  function handleDragStart(i) {
    dragIndex.current = i
  }

  function handleDragOver(e, i) {
    e.preventDefault()
    setDragOver(i)
  }

  function handleDrop(i) {
    const from = dragIndex.current
    if (from === null || from === i) { setDragOver(null); return }
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(i, 0, moved)
    dragIndex.current = null
    setDragOver(null)
    onChange(next, curMap)
  }

  function handleDragEnd() {
    dragIndex.current = null
    setDragOver(null)
  }

  const hasMeta = metaMap != null

  return (
    <div>
      {items.map((name, i) => {
        const isAsset = hasMeta && typeMap && ASSET_TYPES.has(typeMap[name] || defaultType)
        const meta = hasMeta ? (metaMap[name] || {}) : null
        return (
          <div
            className={`settings-row${dragOver === i ? ' drag-over' : ''}`}
            key={i}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
          >
            <span className="drag-handle">⠿</span>
            <input
              className="field-input"
              style={{ flex: '1 1 140px', minWidth: 0 }}
              type="text"
              value={name}
              onChange={(e) => updateName(i, e.target.value)}
            />
            {typeMap && onTypeChange && (
              <select
                className="select-inline"
                style={hasMeta ? { flex: '0 0 68px' } : { flex: 1, minWidth: 0 }}
                value={typeMap[name] || defaultType || 'Карта'}
                onChange={(e) => updateType(name, e.target.value)}
              >
                {(types || ACCOUNT_TYPES).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            <select
              className="select-inline"
              style={hasMeta ? { flex: '0 0 52px' } : { flex: 1, minWidth: 0 }}
              value={curMap[name] || 'KZT'}
              onChange={(e) => updateCur(name, e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{sym(c)}</option>
              ))}
            </select>
            {hasMeta && (
              <div className="s-meta-area">
                {isAsset && (
                  <>
                    <input
                      type="date"
                      className="field-input field-input--sm s-meta-date"
                      value={meta.maturityDate || ''}
                      onChange={(e) => updateMeta(name, 'maturityDate', e.target.value)}
                      title="Дата окончания"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      className="field-input field-input--sm s-meta-yield"
                      value={meta.yield || ''}
                      placeholder="%"
                      onChange={(e) => updateMeta(name, 'yield', e.target.value)}
                      title="Доходность, % годовых"
                    />
                  </>
                )}
              </div>
            )}
            {onHide && (
              <button className="btn-icon btn-icon--box" title="Скрыть в этом месяце" onClick={() => onHide(name)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 8C2.5 4.5 5 3 8 3s5.5 1.5 7 5c-1.5 3.5-4 5-7 5S2.5 11.5 1 8z"/>
                  <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            {onArchive
              ? (
                <button className="btn-icon btn-icon--box" title="В архив" onClick={() => onArchive(name)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="14" height="3.5" rx="1"/>
                    <path d="M2 5.5h12V13a1 1 0 01-1 1H3a1 1 0 01-1-1V5.5z" opacity="0.75"/>
                    <line x1="5.5" y1="9.5" x2="10.5" y2="9.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </button>
              )
              : <button className="btn-icon" onClick={() => remove(i)}>×</button>
            }
          </div>
        )
      })}
      <button className="add-btn" onClick={onAdd}>+ добавить {label}</button>
    </div>
  )
}
