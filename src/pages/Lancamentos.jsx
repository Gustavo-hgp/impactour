import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayISO } from '../lib/format.js'
import { useCurrency } from '../lib/currency.jsx'
import PasseioSelect from '../components/PasseioSelect.jsx'
import PickList from '../components/PickList.jsx'
import { custoReal, parceiroNome, passeioNome, tipoServicoLabel } from '../lib/calc.js'

const PAGE_SIZE = 10
const emptyForm = { passeio_id: '', parceiro_id: '', tipo_servico: '', data: todayISO(), quantidade: '' }

export default function Lancamentos() {
  const { formatMoney } = useCurrency()
  const [passeios, setPasseios] = useState([])
  const [parceiros, setParceiros] = useState([])
  const [precos, setPrecos] = useState([])
  const [lancamentos, setLancamentos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchDate, setSearchDate] = useState('')
  const [tick, setTick] = useState(0)

  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  // Passeios + parceiros + preços do formulário — carrega uma vez.
  useEffect(() => {
    if (!supabase) return setLoading(false)
    ;(async () => {
      const [pRes, paRes, ppRes] = await Promise.all([
        supabase.from('passeios').select('id, nome, custo_pax').eq('ativo', true).order('nome'),
        supabase.from('parceiros').select('id, nome, qtd_maxima').order('nome'),
        supabase.from('parceiro_precos').select('parceiro_id, passeio_id, tipo_servico, valor'),
      ])
      if (pRes.error) setError(pRes.error.message)
      else setPasseios(pRes.data)
      if (!paRes.error) setParceiros(paRes.data) // tolera tabela ainda não criada
      if (!ppRes.error) setPrecos(ppRes.data || [])
      setLoading(false)
    })()
  }, [])

  // Lançamentos — 10 por página, filtráveis por data.
  useEffect(() => {
    if (!supabase) return setListLoading(false)
    let cancelled = false
    ;(async () => {
      setListLoading(true)
      let q = supabase
        .from('lancamentos')
        .select(
          'id, data, quantidade, passeio_id, parceiro_id, tipo_servico, valor_servico, custo_pax_ref, passeio_nome, parceiro_nome, passeios(nome, custo_pax), parceiros(nome)',
          { count: 'exact' },
        )
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
  const parceiroSel = parceiros.find((p) => String(p.id) === String(form.parceiro_id))
  // Parceiros que têm preço para o passeio escolhido (após escolher o passeio).
  const parceirosDisponiveis = form.passeio_id
    ? parceiros.filter((pa) =>
        precos.some(
          (pp) => String(pp.parceiro_id) === String(pa.id) && String(pp.passeio_id) === String(form.passeio_id),
        ),
      )
    : parceiros
  // Tipos de serviço que o parceiro tem PARA o passeio escolhido.
  const tiposDisponiveis =
    form.parceiro_id && form.passeio_id
      ? precos.filter(
          (pp) =>
            String(pp.parceiro_id) === String(form.parceiro_id) &&
            String(pp.passeio_id) === String(form.passeio_id),
        )
      : []
  const precoSel = tiposDisponiveis.find((pp) => pp.tipo_servico === form.tipo_servico) || null
  const valorServico = precoSel ? Number(precoSel.valor) : 0
  const qtd = parseInt(form.quantidade, 10) || 0
  const previewRef = passeioSel ? qtd * Number(passeioSel.custo_pax) : 0
  const semPreco = parceiroSel && passeioSel && tiposDisponiveis.length === 0
  const excedeMax = parceiroSel && parceiroSel.qtd_maxima > 0 && qtd > parceiroSel.qtd_maxima
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Se só há um tipo de serviço pra esse parceiro+passeio, já seleciona.
  useEffect(() => {
    if (tiposDisponiveis.length === 1 && form.tipo_servico !== tiposDisponiveis[0].tipo_servico) {
      setForm((f) => ({ ...f, tipo_servico: tiposDisponiveis[0].tipo_servico }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.parceiro_id, form.passeio_id, precos])

  async function save(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    if (!form.passeio_id) return setError('Escolha o passeio.')
    if (!form.data) return setError('Escolha a data.')
    if (form.parceiro_id && semPreco)
      return setError('Esse parceiro não tem preço cadastrado para este passeio (cadastre em Parceiros).')
    if (form.parceiro_id && !form.tipo_servico) return setError('Escolha o tipo de serviço do parceiro.')

    setSaving(true)
    const row = {
      passeio_id: Number(form.passeio_id),
      data: form.data,
      quantidade: Math.max(0, parseInt(form.quantidade, 10) || 0),
      parceiro_id: form.parceiro_id ? Number(form.parceiro_id) : null,
      tipo_servico: form.parceiro_id ? form.tipo_servico || null : null,
      valor_servico: form.parceiro_id && precoSel ? valorServico : null,
      // snapshots — congelam o histórico
      custo_pax_ref: passeioSel ? Number(passeioSel.custo_pax) : null,
      passeio_nome: passeioSel?.nome ?? null,
      parceiro_nome: form.parceiro_id ? parceiroSel?.nome ?? null : null,
    }
    const { error } = editId
      ? await supabase.from('lancamentos').update(row).eq('id', editId)
      : await supabase.from('lancamentos').insert(row)
    setSaving(false)
    if (error) return setError(error.message)
    setMsg(editId ? 'Lançamento atualizado!' : 'Lançamento salvo!')
    setEditId(null)
    setForm({ ...emptyForm, data: form.data })
    setSearchDate('')
    setPage(0)
    refreshList()
  }

  function editRow(l) {
    setMsg('')
    setEditId(l.id)
    setForm({
      passeio_id: String(l.passeio_id),
      parceiro_id: l.parceiro_id ? String(l.parceiro_id) : '',
      tipo_servico: l.tipo_servico || '',
      data: l.data,
      quantidade: String(l.quantidade),
    })
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

      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3 sm:grid-cols-6 items-end">
        <div className="block sm:col-span-3">
          <span className="block text-xs font-medium text-slate-500 mb-1">Passeio</span>
          <PasseioSelect
            passeios={passeios}
            value={form.passeio_id}
            onChange={(id) => setForm((f) => ({ ...f, passeio_id: id, parceiro_id: '', tipo_servico: '' }))}
          />
        </div>
        <Field label="Data" className="sm:col-span-3">
          <input
            type="date"
            className="input"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
          />
        </Field>

        <div className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-500 mb-1">
            Parceiro <span className="font-normal text-slate-400">(opcional)</span>
          </span>
          <PickList
            items={parceirosDisponiveis}
            value={form.parceiro_id}
            onChange={(id) => setForm((f) => ({ ...f, parceiro_id: id, tipo_servico: '' }))}
            placeholder={form.passeio_id ? 'Sem parceiro (referência)' : 'Escolha o passeio primeiro'}
            emptyText={form.passeio_id ? 'Nenhum parceiro com preço pra este passeio.' : 'Escolha o passeio antes.'}
            allowClear
          />
        </div>
        <Field label="Tipo de serviço" className="sm:col-span-2">
          <select
            className="input disabled:bg-slate-50 disabled:text-slate-400"
            value={form.tipo_servico}
            onChange={(e) => setForm({ ...form, tipo_servico: e.target.value })}
            disabled={!parceiroSel}
          >
            <option value="">{parceiroSel ? 'Escolha…' : '—'}</option>
            {tiposDisponiveis.map((pp) => (
              <option key={pp.tipo_servico} value={pp.tipo_servico}>
                {tipoServicoLabel(pp.tipo_servico)} — {formatMoney(pp.valor)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pessoas" className="sm:col-span-2">
          <input
            type="number"
            min="0"
            className="input"
            value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
            placeholder="0"
          />
        </Field>

        {excedeMax && (
          <p className="sm:col-span-6 text-sm text-accent">
            Atenção: {qtd} pessoas excede a capacidade do parceiro (máx {parceiroSel.qtd_maxima}).
          </p>
        )}

        <div className="sm:col-span-6 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-slate-500">
            {passeioSel
              ? parceiroSel && precoSel
                ? `Referência: ${formatMoney(previewRef)} · Parceiro (${tipoServicoLabel(precoSel.tipo_servico)}): ${formatMoney(valorServico)}`
                : `Custo de referência: ${formatMoney(previewRef)}`
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

        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Passeio</th>
                <th className="px-4 py-2">Parceiro</th>
                <th className="px-4 py-2 text-right">Pessoas</th>
                <th className="px-4 py-2 text-right">Custo</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando…</td>
                </tr>
              )}
              {!listLoading && lancamentos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    {searchDate ? 'Nenhum lançamento nesta data.' : 'Nenhum lançamento ainda.'}
                  </td>
                </tr>
              )}
              {!listLoading &&
                lancamentos.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap">{fmtData(l.data)}</td>
                    <td className="px-4 py-2 font-medium">{passeioNome(l)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {parceiroNome(l)
                        ? `${parceiroNome(l)}${l.tipo_servico ? ` · ${tipoServicoLabel(l.tipo_servico)}` : ''}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">{l.quantidade}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(custoReal(l))}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button className="link" onClick={() => editRow(l)}>Editar</button>
                      <button className="link text-accent ml-3" onClick={() => remove(l.id)}>Excluir</button>
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
