import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// Combobox genérico com busca. items: [{ id, nome }].
// getSecondary(item) -> texto secundário opcional (ex.: tipo).
const norm = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function PickList({
  items,
  value,
  onChange,
  placeholder = 'Digite ou selecione…',
  getSecondary,
  emptyText = 'Nada encontrado.',
  allowClear = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const ref = useRef(null)

  const selected = items.find((i) => String(i.id) === String(value)) || null
  const q = norm(query)

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!q) return items
    return items
      .filter((i) => norm(i.nome).includes(q) || norm(getSecondary?.(i)).includes(q))
      .sort((a, b) => (norm(a.nome).startsWith(q) ? 0 : 1) - (norm(b.nome).startsWith(q) ? 0 : 1))
  }, [items, q, getSecondary])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  function choose(i) {
    onChange(String(i.id))
    setQuery('')
    setOpen(false)
  }

  function clear(e) {
    e.stopPropagation()
    onChange('')
    setQuery('')
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) return setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault()
        if (filtered[highlight]) choose(filtered[highlight])
      }
    }
  }

  const display = open ? query : selected?.nome ?? ''

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          className="input pr-9"
          value={display}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
        />
        {allowClear && selected && !open ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        ) : (
          <ChevronDown
            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl py-1 text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-slate-400">{emptyText}</li>
          ) : (
            filtered.map((i, idx) => {
              const isSel = String(i.id) === String(value)
              const secondary = getSecondary?.(i)
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => choose(i)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${
                      idx === highlight ? 'bg-[#e8effb] text-brand-dark' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">
                      {i.nome}
                      {secondary && <span className="text-slate-400"> · {secondary}</span>}
                    </span>
                    {isSel && <Check className="h-4 w-4 text-brand shrink-0" />}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
