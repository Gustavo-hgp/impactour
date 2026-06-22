import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const PAGE_SIZE = 10
const emptyForm = { nome: '', ativo: true }

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nomeRef = useRef(null)

  useEffect(() => {
    if (!supabase) return setLoading(false)
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error, count } = await supabase
        .from('fornecedores')
        .select('id, nome, ativo', { count: 'exact' })
        .order('nome')
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (data.length === 0 && page > 0) return setPage((p) => p - 1)
      setFornecedores(data)
      setTotal(count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [page, tick])

  const refresh = () => setTick((t) => t + 1)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function startEdit(f) {
    setEditId(f.id)
    setForm({ nome: f.nome, ativo: f.ativo })
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
    const nome = form.nome.trim()
    if (!nome) return setError('Informe o nome.')
    setSaving(true)
    const payload = { nome, ativo: form.ativo }
    const { error } = editId
      ? await supabase.from('fornecedores').update(payload).eq('id', editId)
      : await supabase.from('fornecedores').insert(payload)
    setSaving(false)
    if (error) return setError(error.message)
    cancelEdit()
    refresh()
  }

  async function remove(id) {
    if (!confirm('Excluir este fornecedor? As despesas fixas dele ficarão sem vínculo.')) return
    const { error } = await supabase.from('fornecedores').delete().eq('id', id)
    if (error) return setError(error.message)
    refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fornecedores</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Cadastro de fornecedores. Vincule cada despesa fixa recorrente (ex.: contador, limpeza) a um
          deles em Despesas Fixas.
        </p>
      </div>

      <form
        onSubmit={save}
        className={`bg-white rounded-xl border p-4 grid gap-3 sm:grid-cols-4 items-end ${editId ? 'border-brand ring-2 ring-brand/30' : 'border-slate-200'}`}
      >
        {editId && (
          <p className="sm:col-span-4 text-sm font-medium text-brand-dark">Editando "{form.nome}"</p>
        )}
        <Field label="Nome" className="sm:col-span-2">
          <input
            ref={nomeRef}
            className="input"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Insira o nome do fornecedor..."
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-1">
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
          />
          Ativo
        </label>
        <div className="sm:col-span-1 flex gap-2">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : editId ? 'Salvar' : 'Adicionar'}
          </button>
          {editId && (
            <button className="btn-ghost" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {error && <p className="text-sm text-accent">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
            )}
            {!loading && fornecedores.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Nenhum fornecedor cadastrado.</td></tr>
            )}
            {!loading &&
              fornecedores.map((f) => (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{f.nome}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${f.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button className="link" onClick={() => startEdit(f)}>Editar</button>
                    <button className="link text-accent ml-3" onClick={() => remove(f.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>{total} fornecedor{total === 1 ? '' : 'es'}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-ghost px-3 py-1 disabled:opacity-40"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </button>
              <span>Página {page + 1} de {totalPages}</span>
              <button
                type="button"
                className="btn-ghost px-3 py-1 disabled:opacity-40"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
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
