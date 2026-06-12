import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// Normaliza para busca: minúsculas e sem acento (ex.: "São" casa com "sao").
const norm = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function PasseioSelect({ passeios, value, onChange, placeholder = 'Digite ou selecione…' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const ref = useRef(null)

  const selected = passeios.find((p) => String(p.id) === String(value)) || null

  // Fecha ao clicar fora ou apertar Esc.
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
    const q = norm(query)
    if (!q) return passeios
    return passeios.filter((p) => norm(p.nome).includes(q))
  }, [passeios, query])

  // Sempre que a lista muda, volta o destaque para o primeiro.
  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  function choose(p) {
    onChange(String(p.id))
    setQuery('')
    setOpen(false)
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

  // Aberto: mostra o que está sendo digitado. Fechado: o nome do selecionado.
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
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl py-1 text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-slate-400">Nenhum passeio encontrado.</li>
          ) : (
            filtered.map((p, i) => {
              const isSel = String(p.id) === String(value)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(p)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${
                      i === highlight ? 'bg-[#e8effb] text-brand-dark' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{p.nome}</span>
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
