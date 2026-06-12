import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import Calendar from './Calendar.jsx'

export default function DateFilter({
  mode, setMode, single, setSingle, range, setRange, label,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isWide = useMediaQuery('(min-width: 768px)')

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

  function handleSingle(d) {
    setSingle(d)
    setOpen(false)
  }
  function handleRange(r) {
    setRange(r)
    if (r?.from && r?.to) setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand transition"
      >
        <CalendarDays className="h-4 w-4 text-brand" />
        <span>{label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 z-50 mt-2 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden max-w-[calc(100vw-2rem)]">
          <div className="bg-brand text-white px-4 py-3">
            <div className="font-semibold">Filtrar por data</div>
            <div className="text-xs text-white/80">Escolha um dia ou agrupe vários</div>
          </div>
          <div className="p-4 space-y-4">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
              <button
                type="button"
                className={`px-3 py-1 rounded-md font-medium transition ${mode === 'dia' ? 'bg-brand text-white' : 'text-slate-600'}`}
                onClick={() => setMode('dia')}
              >
                Dia
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-md font-medium transition ${mode === 'periodo' ? 'bg-brand text-white' : 'text-slate-600'}`}
                onClick={() => setMode('periodo')}
              >
                Período
              </button>
            </div>

            <div className="overflow-x-auto">
              {mode === 'dia' ? (
                <Calendar
                  mode="single"
                  required
                  selected={single}
                  onSelect={handleSingle}
                  defaultMonth={single}
                />
              ) : (
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={handleRange}
                  defaultMonth={range?.from}
                  numberOfMonths={isWide ? 2 : 1}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const m = window.matchMedia(query)
    const handler = () => setMatches(m.matches)
    m.addEventListener('change', handler)
    return () => m.removeEventListener('change', handler)
  }, [query])
  return matches
}
