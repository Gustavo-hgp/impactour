import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import {
  ClipboardList,
  HandCoins,
  Handshake,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Settings,
  Wallet,
  X,
} from 'lucide-react'
import Dashboard from './pages/Dashboard.jsx'
import Lancamentos from './pages/Lancamentos.jsx'
import Passeios from './pages/Passeios.jsx'
import Parceiros from './pages/Parceiros.jsx'
import Financeiro from './pages/Financeiro.jsx'
import Balanco from './pages/Balanco.jsx'
import Login from './pages/Login.jsx'
import { CurrencyProvider, useCurrency, CURRENCIES } from './lib/currency.jsx'
import { supabase, supabaseConfigured } from './lib/supabase.js'

const groups = [
  {
    title: 'Operacional',
    links: [
      { to: '/', label: 'Dashboard', end: true, icon: LayoutDashboard },
      { to: '/lancamentos', label: 'Lançar', icon: ClipboardList },
      { to: '/passeios', label: 'Passeios', icon: Map },
      { to: '/parceiros', label: 'Parceiros', icon: Handshake },
    ],
  },
  {
    title: 'Financeiro',
    links: [
      { to: '/financeiro', label: 'Visão Financeira', icon: Wallet },
      { to: '/balanco', label: 'Balanço Financeiro', icon: HandCoins },
    ],
  },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    setMenuOpen(false)
    await supabase.auth.signOut()
  }

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-400 text-sm">Carregando…</div>
    )
  }

  // Sem login não há acesso aos dados (as policies do banco exigem usuário autenticado).
  if (false && supabaseConfigured && !session) {
    return <Login />
  }

  return (
    <CurrencyProvider>
      <div className="min-h-screen lg:flex bg-slate-100">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} onLogout={handleLogout} />

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="h-1 bg-gradient-to-r from-brand via-brand-dark to-accent" />

          {/* Barra mobile com o botão de menu */}
          <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
              className="-ml-1 p-1 text-slate-600 hover:text-brand"
            >
              <Menu className="h-6 w-6" />
            </button>
            <img src="/logo.webp" alt="Impactour" className="h-7 w-auto" />
          </div>

          <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
            {!supabaseConfigured && <ConfigWarning />}
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/lancamentos" element={<Lancamentos />} />
              <Route path="/passeios" element={<Passeios />} />
          <Route path="/parceiros" element={<Parceiros />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/balanco" element={<Balanco />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </CurrencyProvider>
  )
}

function Sidebar({ open, onClose, onLogout }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <img src="/logo.webp" alt="Impactour" className="h-8 w-auto" />
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="p-1 text-slate-400 hover:text-slate-600 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {g.title}
              </div>
              <div className="space-y-0.5">
                {g.links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`
                    }
                  >
                    <l.icon className="h-4 w-4 shrink-0" />
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-slate-100 p-3">
          <CurrencySelector />
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}

function CurrencySelector() {
  const { currency, setCurrency } = useCurrency()
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Moeda
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1 text-[11px] font-medium text-slate-400 transition hover:text-brand"
          title="Configurar câmbio"
        >
          <Settings className="h-3.5 w-3.5" />
          Câmbio
        </button>
      </div>
      <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {Object.entries(CURRENCIES).map(([code, m]) => (
          <option key={code} value={code}>
            {m.label} ({m.symbol})
          </option>
        ))}
      </select>
      {settingsOpen && <CambioModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function CambioModal({ onClose }) {
  const { rates, saveRates } = useCurrency()
  const [usd, setUsd] = useState(String(rates.USD))
  const [brl, setBrl] = useState(String(rates.BRL))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    const { error } = await saveRates({
      USD: Number(usd) || rates.USD,
      BRL: Number(brl) || rates.BRL,
    })
    setSaving(false)
    setMsg(error ? 'Erro ao salvar.' : 'Taxas salvas!')
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Câmbio</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Quanto vale 1 unidade em pesos chilenos (CLP). Afeta só a exibição — não altera os valores
          salvos.
        </p>
        <form onSubmit={save} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">1 US$ = (CLP)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={usd}
              onChange={(e) => setUsd(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">1 R$ = (CLP)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={brl}
              onChange={(e) => setBrl(e.target.value)}
            />
          </label>
          <div className="flex items-center justify-end gap-3 pt-1">
            {msg && <span className="mr-auto text-sm text-green-600">{msg}</span>}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Fechar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

function ConfigWarning() {
  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
      <strong>Supabase não configurado.</strong> Defina <code>VITE_SUPABASE_URL</code> e{' '}
      <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code> (dev) ou nas variáveis de
      ambiente do container (Docker).
    </div>
  )
}
