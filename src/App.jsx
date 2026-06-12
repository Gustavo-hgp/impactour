import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { LogOut, Menu, MountainSnow, X } from 'lucide-react'
import Dashboard from './pages/Dashboard.jsx'
import Lancamentos from './pages/Lancamentos.jsx'
import Passeios from './pages/Passeios.jsx'
import Login from './pages/Login.jsx'
import { supabase, supabaseConfigured } from './lib/supabase.js'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/lancamentos', label: 'Lançar' },
  { to: '/passeios', label: 'Passeios' },
]

const navClass = ({ isActive }) =>
  `px-4 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

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
  if (supabaseConfigured && !session) {
    return <Login />
  }

  return (
    <div className="min-h-screen">
      <div className="h-1 bg-gradient-to-r from-brand via-brand-dark to-accent" />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo />
          <nav className="hidden sm:flex gap-1 ml-4">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          {session && (
            <button
              className="ml-auto hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          )}
          <button
            className="sm:hidden ml-auto p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="sm:hidden border-t border-slate-100 px-4 py-2 flex flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={navClass}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            {session && (
              <button
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 text-left transition"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            )}
          </nav>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {!supabaseConfigured && <ConfigWarning />}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/passeios" element={<Passeios />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <span className="grid place-items-center h-9 w-9 rounded-full bg-brand text-white shadow-sm">
        <MountainSnow className="h-5 w-5" />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-brand-dark">
        IMPAC<span className="text-accent">TOUR</span>
      </span>
    </div>
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
