import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!supabase) return setError('Supabase não configurado.')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError('E-mail ou senha inválidos.')
  }

  return (
    <div className="min-h-screen">
      <div className="h-1 bg-gradient-to-r from-brand via-brand-dark to-accent" />
      <div className="min-h-[calc(100vh-0.25rem)] grid place-items-center px-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm bg-white rounded-xl border border-slate-200 p-6 space-y-4"
        >
          <div className="flex justify-center select-none">
            <img src="/logo.webp" alt="Impactour" className="h-12 w-auto max-w-full" />
          </div>
          <p className="text-center text-sm text-slate-500">Entre para continuar</p>

          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">E-mail</span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Senha</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="text-sm text-accent">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
