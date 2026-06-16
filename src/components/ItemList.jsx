import { useState, useRef } from 'react'
import { CURRENCIES, sym } from '../utils/storage'

export const ACCOUNT_TYPES = ['Карта', 'Вклад', 'Инвестиция']
export const ASSET_TYPES = new Set(['Вклад', 'Инвестиция'])
export const SOURCE_TYPES = ['Постоянный', 'Переменный', 'Проценты']

export default function ItemList({ items, curMap, onChange, onAdd, label, typeMap, onTypeChange, types, defaultType, onRename, onArchive, metaMap, onMetaChange }) {
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
              className="s-name"
              style={undefined}
              type="text"
              value={name}
              onChange={(e) => updateName(i, e.target.value)}
            />
            {typeMap && onTypeChange && (
              <select
                className="s-cur"
                style={hasMeta ? { flex: '0 0 68px' } : undefined}
                value={typeMap[name] || defaultType || 'Карта'}
                onChange={(e) => updateType(name, e.target.value)}
              >
                {(types || ACCOUNT_TYPES).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            <select
              className="s-cur"
              style={hasMeta ? { flex: '0 0 52px' } : undefined}
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
                      className="s-meta-date"
                      value={meta.maturityDate || ''}
                      onChange={(e) => updateMeta(name, 'maturityDate', e.target.value)}
                      title="Дата окончания"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      className="s-meta-yield"
                      value={meta.yield || ''}
                      placeholder="%"
                      onChange={(e) => updateMeta(name, 'yield', e.target.value)}
                      title="Доходность, % годовых"
                    />
                  </>
                )}
              </div>
            )}
            {onArchive
              ? <button className="archive-btn" onClick={() => onArchive(name)}>В архив</button>
              : <button className="del-btn" onClick={() => remove(i)}>×</button>
            }
          </div>
        )
      })}
      <button className="add-btn" onClick={onAdd}>+ добавить {label}</button>
    </div>
  )
}
