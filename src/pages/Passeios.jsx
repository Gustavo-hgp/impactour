import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useCurrency } from '../lib/currency.jsx'

const emptyForm = { nome: '', custo_pax: '' }

export default function Passeios() {
  const { formatMoney } = useCurrency()
  const [passeios, setPasseios] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const nomeRef = useRef(null)

  async function load() {
    if (!supabase) return setLoading(false)
    setLoading(true)
    const { data, error } = await supabase
      .from('passeios')
      .select('*')
      .order('nome')
    if (error) setError(error.message)
    else setPasseios(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(p) {
    setEditId(p.id)
    setForm({ nome: p.nome, custo_pax: p.custo_pax })
    nomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    nomeRef.current?.focus()
  }

  function cancelEdit() {
    setEditId(null)
    setForm(emptyForm)
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    const payload = {
      nome: form.nome.trim(),
      custo_pax: Number(form.custo_pax) || 0,
    }
    if (!payload.nome) return setError('Informe o nome do passeio.')

    const query = editId
      ? supabase.from('passeios').update(payload).eq('id', editId)
      : supabase.from('passeios').insert(payload)
    const { error } = await query
    if (error) return setError(error.message)
    cancelEdit()
    load()
  }

  async function remove(id) {
    if (!confirm('Excluir este passeio? Os lançamentos antigos são mantidos com o custo histórico.')) return
    const { error } = await supabase.from('passeios').delete().eq('id', id)
    if (error) return setError(error.message)
    load()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Passeios</h1>

      <form onSubmit={save} className={`bg-white rounded-xl border p-4 grid gap-3 sm:grid-cols-3 items-end ${editId ? 'border-brand ring-2 ring-brand/30' : 'border-slate-200'}`}>
        {editId && (
          <p className="sm:col-span-3 text-sm font-medium text-brand-dark">
            Editando “{form.nome}”
          </p>
        )}
        <Field label="Passeio" className="sm:col-span-2">
          <input
            ref={nomeRef}
            className="input"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Ex.: City Tour"
          />
        </Field>
        <Field label="Custo /pax">
          <input
            className="input" type="number" step="0.01" min="0"
            value={form.custo_pax}
            onChange={(e) => setForm({ ...form, custo_pax: e.target.value })}
            placeholder="0,00"
          />
        </Field>
        <div className="sm:col-span-3 flex gap-2">
          <button className="btn-primary" type="submit">
            {editId ? 'Salvar alterações' : 'Adicionar passeio'}
          </button>
          {editId && (
            <button className="btn-ghost" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Passeio</th>
              <th className="px-4 py-2 text-right">Custo /pax</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
            )}
            {!loading && passeios.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Nenhum passeio cadastrado.</td></tr>
            )}
            {passeios.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{p.nome}</td>
                <td className="px-4 py-2 text-right">{formatMoney(p.custo_pax)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button className="link" onClick={() => startEdit(p)}>Editar</button>
                  <button className="link text-red-600 ml-3" onClick={() => remove(p.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
