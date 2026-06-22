import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { todayISO } from '../lib/format.js'
import { useCurrency } from '../lib/currency.jsx'
import MoneyInput from '../components/MoneyInput.jsx'

const PAGE_SIZE = 10
const blankPessoa = () => ({ nome: '', ativo: true })
const blankComissao = (moeda) => ({
  data: todayISO(),
  descricao: '',
  valor: '',
  moeda,
  pago_em: '',
})

export default function Pessoas() {
  const { formatMoney, formatIn, currency } = useCurrency()
  const [pessoas, setPessoas] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState(blankPessoa)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const nomeRef = useRef(null)

  // expand por pessoa — guarda Set de IDs abertos.
  const [aberto, setAberto] = useState(() => new Set())
  // comissões carregadas por pessoa_id.
  const [comissoes, setComissoes] = useState({})
  // form de comissão por pessoa.
  const [comForm, setComForm] = useState({}) // { [pessoaId]: { data, descricao, valor, moeda, pago_em } }
  const [comEditId, setComEditId] = useState({}) // { [pessoaId]: comissaoId | null }
  const [comSaving, setComSaving] = useState({}) // { [pessoaId]: bool }
  const [comError, setComError] = useState({}) // { [pessoaId]: string }

  // Lista paginada de pessoas.
  useEffect(() => {
    if (!supabase) return setLoading(false)
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error, count } = await supabase
        .from('pessoas')
        .select('id, nome, ativo, created_at', { count: 'exact' })
        .order('nome')
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (data.length === 0 && page > 0) return setPage((p) => p - 1)
      setPessoas(data)
      setTotal(count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [page, tick])

  const refresh = () => setTick((t) => t + 1)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // --- CRUD de pessoa ---
  function startEdit(p) {
    setEditId(p.id)
    setForm({ nome: p.nome, ativo: p.ativo })
    nomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    nomeRef.current?.focus()
  }

  function cancelEdit() {
    setEditId(null)
    setForm(blankPessoa())
  }

  async function savePessoa(e) {
    e.preventDefault()
    setError('')
    const nome = form.nome.trim()
    if (!nome) return setError('Informe o nome.')
    setSaving(true)
    const payload = { nome, ativo: form.ativo }
    const { error } = editId
      ? await supabase.from('pessoas').update(payload).eq('id', editId)
      : await supabase.from('pessoas').insert(payload)
    setSaving(false)
    if (error) return setError(error.message)
    cancelEdit()
    refresh()
  }

  async function removePessoa(id) {
    if (!confirm('Excluir esta pessoa? As comissões dela também serão removidas.')) return
    const { error } = await supabase.from('pessoas').delete().eq('id', id)
    if (error) return setError(error.message)
    refresh()
  }

  // --- Expand + carregar comissões ---
  async function toggleAberto(p) {
    const isOpen = aberto.has(p.id)
    setAberto((s) => {
      const next = new Set(s)
      isOpen ? next.delete(p.id) : next.add(p.id)
      return next
    })
    if (!isOpen) {
      if (!comForm[p.id]) {
        setComForm((s) => ({ ...s, [p.id]: blankComissao(currency) }))
      }
      await loadComissoes(p.id)
    }
  }

  async function loadComissoes(pessoaId) {
    const { data, error } = await supabase
      .from('comissoes')
      .select('id, data, descricao, valor, moeda, pago_em')
      .eq('pessoa_id', pessoaId)
      .order('data', { ascending: false })
    if (error) {
      setComError((s) => ({ ...s, [pessoaId]: error.message }))
      return
    }
    setComissoes((s) => ({ ...s, [pessoaId]: data || [] }))
  }

  // --- CRUD de comissão ---
  function setComField(pessoaId, patch) {
    setComForm((s) => ({ ...s, [pessoaId]: { ...s[pessoaId], ...patch } }))
  }

  function editComissao(pessoaId, c) {
    setComEditId((s) => ({ ...s, [pessoaId]: c.id }))
    setComForm((s) => ({
      ...s,
      [pessoaId]: {
        data: c.data,
        descricao: c.descricao || '',
        valor: String(c.valor),
        moeda: c.moeda || 'CLP',
        pago_em: c.pago_em || '',
      },
    }))
  }

  function cancelComEdit(pessoaId) {
    setComEditId((s) => ({ ...s, [pessoaId]: null }))
    setComForm((s) => ({ ...s, [pessoaId]: blankComissao(currency) }))
  }

  async function saveComissao(e, pessoaId) {
    e.preventDefault()
    setComError((s) => ({ ...s, [pessoaId]: '' }))
    const f = comForm[pessoaId] || blankComissao(currency)
    const v = Math.max(0, Number(f.valor) || 0)
    if (v <= 0) return setComError((s) => ({ ...s, [pessoaId]: 'Informe um valor maior que zero.' }))
    if (!f.data) return setComError((s) => ({ ...s, [pessoaId]: 'Informe a data.' }))
    setComSaving((s) => ({ ...s, [pessoaId]: true }))
    const row = {
      pessoa_id: pessoaId,
      data: f.data,
      descricao: f.descricao.trim() || null,
      valor: v,
      moeda: f.moeda,
      pago_em: f.pago_em || null,
    }
    const editingId = comEditId[pessoaId]
    const { error } = editingId
      ? await supabase.from('comissoes').update(row).eq('id', editingId)
      : await supabase.from('comissoes').insert(row)
    setComSaving((s) => ({ ...s, [pessoaId]: false }))
    if (error) return setComError((s) => ({ ...s, [pessoaId]: error.message }))
    cancelComEdit(pessoaId)
    await loadComissoes(pessoaId)
  }

  async function removeComissao(pessoaId, id) {
    if (!confirm('Excluir esta comissão?')) return
    const { error } = await supabase.from('comissoes').delete().eq('id', id)
    if (error) return setComError((s) => ({ ...s, [pessoaId]: error.message }))
    await loadComissoes(pessoaId)
  }

  const fmtData = (iso) => iso.split('-').reverse().join('/')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pessoas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Funcionários. O salário fixo entra como Despesa Fixa vinculada à pessoa; as comissões são
          lançadas aqui, uma por vez.
        </p>
      </div>

      <form
        onSubmit={savePessoa}
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
            placeholder="Insira o nome da pessoa..."
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
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
            )}
            {!loading && pessoas.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Nenhuma pessoa cadastrada.</td></tr>
            )}
            {!loading &&
              pessoas.map((p) => {
                const isOpen = aberto.has(p.id)
                const cs = comissoes[p.id] || []
                const f = comForm[p.id] || blankComissao(currency)
                const editingComId = comEditId[p.id]
                return (
                  <PessoaRow key={p.id}>
                    <tr className="border-t border-slate-100">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleAberto(p)}
                          className="p-1 text-slate-500 hover:text-brand-dark"
                          aria-expanded={isOpen}
                          title="Comissões"
                        >
                          <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                      <td className="px-4 py-2 font-medium">{p.nome}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${p.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button className="link" onClick={() => startEdit(p)}>Editar</button>
                        <button className="link text-accent ml-3" onClick={() => removePessoa(p.id)}>Excluir</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50">
                        <td></td>
                        <td colSpan={3} className="px-4 py-3 space-y-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {editingComId ? 'Editando comissão' : 'Lançar comissão'}
                          </h3>
                          <form onSubmit={(e) => saveComissao(e, p.id)} className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto_auto_auto] items-end">
                            <Field label="Data">
                              <input
                                type="date"
                                className="input"
                                value={f.data}
                                onChange={(e) => setComField(p.id, { data: e.target.value })}
                              />
                            </Field>
                            <Field label="Descrição (opcional)">
                              <input
                                type="text"
                                className="input"
                                value={f.descricao}
                                onChange={(e) => setComField(p.id, { descricao: e.target.value })}
                                placeholder="Ex.: City Tour 15/03"
                              />
                            </Field>
                            <Field label="Valor">
                              <MoneyInput
                                className="input w-32"
                                value={f.valor}
                                onChange={(v) => setComField(p.id, { valor: v })}
                                moeda={f.moeda}
                              />
                            </Field>
                            <Field label="Moeda">
                              <select
                                className="input w-20"
                                value={f.moeda}
                                onChange={(e) => setComField(p.id, { moeda: e.target.value })}
                              >
                                <option value="CLP">CLP</option>
                                <option value="USD">US$</option>
                                <option value="BRL">R$</option>
                              </select>
                            </Field>
                            <Field label="Pago em (opc.)">
                              <input
                                type="date"
                                className="input w-36"
                                value={f.pago_em}
                                onChange={(e) => setComField(p.id, { pago_em: e.target.value })}
                              />
                            </Field>
                            <div className="flex gap-2">
                              <button className="btn-primary whitespace-nowrap" type="submit" disabled={comSaving[p.id]}>
                                {comSaving[p.id] ? 'Salvando…' : editingComId ? 'Salvar' : 'Adicionar'}
                              </button>
                              {editingComId && (
                                <button className="btn-ghost" type="button" onClick={() => cancelComEdit(p.id)}>
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </form>
                          {comError[p.id] && <p className="text-sm text-accent">{comError[p.id]}</p>}

                          {cs.length === 0 ? (
                            <p className="text-sm text-slate-400">Nenhuma comissão lançada.</p>
                          ) : (
                            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden bg-white">
                              {cs.map((c) => (
                                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-700 truncate">
                                      {fmtData(c.data)}{c.descricao ? ` · ${c.descricao}` : ''}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {formatIn(c.valor, c.moeda)}
                                      {c.moeda !== 'CLP' && <span className="text-slate-400"> · {formatMoney(c.moeda === 'CLP' ? c.valor : c.valor)}</span>}
                                      {c.pago_em
                                        ? <span className="ml-2 text-emerald-600">pago {fmtData(c.pago_em)}</span>
                                        : <span className="ml-2 text-slate-400">pendente</span>}
                                    </p>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-3">
                                    <button className="link" onClick={() => editComissao(p.id, c)}>Editar</button>
                                    <button className="link text-accent" onClick={() => removeComissao(p.id, c.id)}>Excluir</button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </PessoaRow>
                )
              })}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>{total} pessoa{total === 1 ? '' : 's'}</span>
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

// Wrapper que retorna seus children — permite renderizar 2 <tr> da mesma "linha" de pessoa.
function PessoaRow({ children }) {
  return <>{children}</>
}

function Field({ label, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
