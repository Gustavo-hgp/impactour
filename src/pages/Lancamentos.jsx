import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayISO } from '../lib/format.js'
import { useCurrency } from '../lib/currency.jsx'
import PasseioSelect from '../components/PasseioSelect.jsx'

const PAGE_SIZE = 10
const emptyForm = { passeio_id: '', data: todayISO(), quantidade: '' }

export default function Lancamentos() {
  const { formatMoney } = useCurrency()
  const [passeios, setPasseios] = useState([])
  const [lancamentos, setLancamentos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchDate, setSearchDate] = useState('')
  const [tick, setTick] = useState(0) // força recarregar a lista após salvar/excluir

  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true) // passeios (formulário)
  const [listLoading, setListLoading] = useState(true) // tabela
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  // Passeios do seletor — carrega uma vez.
  useEffect(() => {
    if (!supabase) return setLoading(false)
    ;(async () => {
      const { data, error } = await supabase
        .from('passeios')
        .select('id, nome, custo_pax')
        .eq('ativo', true)
        .order('nome')
      if (error) setError(error.message)
      else setPasseios(data)
      setLoading(false)
    })()
  }, [])

  // Lançamentos — 10 por página, filtráveis por data (busca qualquer dia, não só os recentes).
  useEffect(() => {
    if (!supabase) return setListLoading(false)
    let cancelled = false
    ;(async () => {
      setListLoading(true)
      let q = supabase
        .from('lancamentos')
        .select('id, data, quantidade, passeio_id, passeios(nome, custo_pax)', {
          count: 'exact',
        })
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (searchDate) q = q.eq('data', searchDate)
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      const { data, error, count } = await q
      if (cancelled) return
      if (error) {
        setError(error.message)
        setListLoading(false)
        return
      }
      // Se a página ficou vazia depois de excluir o último item, volta uma.
      if (data.length === 0 && page > 0) return setPage((p) => p - 1)
      setLancamentos(data)
      setTotal(count ?? 0)
      setListLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [page, searchDate, tick])

  const refreshList = () => setTick((t) => t + 1)

  const passeioSel = passeios.find((p) => String(p.id) === String(form.passeio_id))
  const qtd = parseInt(form.quantidade, 10) || 0
  const previewCusto = passeioSel ? qtd * Number(passeioSel.custo_pax) : 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function save(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    if (!form.passeio_id) return setError('Escolha o passeio.')
    if (!form.data) return setError('Escolha a data.')

    setSaving(true)
    const row = {
      passeio_id: Number(form.passeio_id),
      data: form.data,
      quantidade: Math.max(0, parseInt(form.quantidade, 10) || 0),
    }
    // Editando: atualiza o registro existente pelo id (permite trocar a data sem duplicar).
    // Novo: upsert pela chave única (passeio + data).
    const { error } = editId
      ? await supabase.from('lancamentos').update(row).eq('id', editId)
      : await supabase.from('lancamentos').upsert(row, { onConflict: 'passeio_id,data' })
    setSaving(false)
    if (error) return setError(error.message)
    setMsg(editId ? 'Lançamento atualizado!' : 'Lançamento salvo!')
    setEditId(null)
    setForm({ ...emptyForm, data: form.data }) // mantém a data, limpa o resto
    // Mostra o resultado no topo da lista.
    setSearchDate('')
    setPage(0)
    refreshList()
  }

  function editRow(l) {
    setMsg('')
    setEditId(l.id)
    setForm({ passeio_id: String(l.passeio_id), data: l.data, quantidade: String(l.quantidade) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditId(null)
    setForm(emptyForm)
    setMsg('')
  }

  async function remove(id) {
    if (!confirm('Excluir este lançamento?')) return
    const { error } = await supabase.from('lancamentos').delete().eq('id', id)
    if (error) return setError(error.message)
    refreshList()
  }

  const fmtData = (iso) => iso.split('-').reverse().join('/')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Lançar</h1>

      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3 sm:grid-cols-4 items-end">
        <div className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-500 mb-1">Passeio</span>
          <PasseioSelect
            passeios={passeios}
            value={form.passeio_id}
            onChange={(id) => setForm((f) => ({ ...f, passeio_id: id }))}
          />
        </div>
        <Field label="Data">
          <input
            type="date"
            className="input"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
          />
        </Field>
        <Field label="Pessoas">
          <input
            type="number"
            min="0"
            className="input"
            value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
            placeholder="0"
          />
        </Field>

        <div className="sm:col-span-4 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-slate-500">
            {passeioSel
              ? `Custo: ${formatMoney(previewCusto)}`
              : 'Escolha um passeio para ver o custo.'}
          </span>
          <div className="flex items-center gap-3">
            {editId && (
              <button type="button" className="btn-ghost" onClick={cancelEdit}>
                Cancelar
              </button>
            )}
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando…' : editId ? 'Atualizar lançamento' : 'Salvar lançamento'}
            </button>
          </div>
        </div>
      </form>

      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {error && <p className="text-sm text-accent">{error}</p>}

      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-600">
            {searchDate ? `Lançamentos de ${fmtData(searchDate)}` : 'Lançamentos recentes'}
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input w-auto py-1.5"
              value={searchDate}
              onChange={(e) => {
                setPage(0)
                setSearchDate(e.target.value)
              }}
              aria-label="Buscar por data"
            />
            {searchDate && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setPage(0)
                  setSearchDate('')
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Passeio</th>
                <th className="px-4 py-2 text-right">Pessoas</th>
                <th className="px-4 py-2 text-right">Custo</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Carregando…
                  </td>
                </tr>
              )}
              {!listLoading && lancamentos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    {searchDate ? 'Nenhum lançamento nesta data.' : 'Nenhum lançamento ainda.'}
                  </td>
                </tr>
              )}
              {!listLoading &&
                lancamentos.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap">{fmtData(l.data)}</td>
                    <td className="px-4 py-2 font-medium">{l.passeios?.nome || '—'}</td>
                    <td className="px-4 py-2 text-right">{l.quantidade}</td>
                    <td className="px-4 py-2 text-right">
                      {formatMoney(l.quantidade * Number(l.passeios?.custo_pax || 0))}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button className="link" onClick={() => editRow(l)}>
                        Editar
                      </button>
                      <button className="link text-accent ml-3" onClick={() => remove(l.id)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!listLoading && total > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
              <span>
                {total} lançamento{total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-ghost px-3 py-1 disabled:opacity-40"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </button>
                <span>
                  Página {page + 1} de {totalPages}
                </span>
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
