import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayISO } from '../lib/format.js'
import { useCurrency } from '../lib/currency.jsx'
import MoneyInput from '../components/MoneyInput.jsx'

const PAGE_SIZE = 10
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const blank = () => ({
  descricao: '',
  valor: '',
  moeda: 'CLP',
  dia_vencimento: '',
  vinculo: 'nenhum:0', // formato "tipo:id"
  vigente_desde: todayISO(),
  vigente_ate: '',
})

const pad = (n) => String(n).padStart(2, '0')
const firstOfMonth = (iso) => iso.slice(0, 8) + '01'
const monthLabel = (mesRef) => {
  const [y, m] = mesRef.split('-')
  return `${MONTHS_PT[Number(m) - 1]}/${y}`
}

// Lista os meses de competência [start, end] inclusive (1º dia de cada mês, ambos já como 1º).
function monthsBetween(start, end) {
  const months = []
  if (!start || !end || start > end) return months
  const [y0, m0] = start.split('-').map(Number)
  const [y1, m1] = end.split('-').map(Number)
  let y = y0
  let m = m0
  for (let i = 0; i < 120 && (y < y1 || (y === y1 && m <= m1)); i++) {
    months.push(`${y}-${pad(m)}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

export default function DespesasFixas() {
  const { formatMoney, formatIn, toCLP } = useCurrency()
  const [despesas, setDespesas] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)

  const [pessoas, setPessoas] = useState([])
  const [fornecedores, setFornecedores] = useState([])

  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const descRef = useRef(null)

  // Pendências
  const [todasDespesas, setTodasDespesas] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [pendError, setPendError] = useState('')

  // Carrega pessoas e fornecedores uma vez.
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const [pRes, fRes] = await Promise.all([
        supabase.from('pessoas').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome'),
      ])
      if (!pRes.error) setPessoas(pRes.data || [])
      if (!fRes.error) setFornecedores(fRes.data || [])
    })()
  }, [])

  // Lista paginada.
  useEffect(() => {
    if (!supabase) return setLoading(false)
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error, count } = await supabase
        .from('despesas_fixas')
        .select(
          'id, descricao, valor, moeda, dia_vencimento, pessoa_id, fornecedor_id, vigente_desde, vigente_ate, pessoas(nome), fornecedores(nome)',
          { count: 'exact' },
        )
        .order('descricao')
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (data.length === 0 && page > 0) return setPage((p) => p - 1)
      setDespesas(data)
      setTotal(count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [page, tick])

  // Para calcular pendências: precisa de TODAS as despesas + recebimentos amarrados.
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const [dRes, rRes] = await Promise.all([
        supabase.from('despesas_fixas').select('id, descricao, valor, moeda, vigente_desde, vigente_ate, dia_vencimento, pessoas(nome), fornecedores(nome)'),
        supabase.from('recebimentos').select('despesa_fixa_id, mes_ref').not('despesa_fixa_id', 'is', null),
      ])
      if (cancelled) return
      if (dRes.error) {
        setPendError(dRes.error.message)
        return
      }
      setTodasDespesas(dRes.data || [])
      setPagamentos(rRes.error ? [] : rRes.data || [])
    })()
    return () => {
      cancelled = true
    }
  }, [tick])

  const refresh = () => setTick((t) => t + 1)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // --- form helpers ---
  function parseVinculo(v) {
    const [tipo, id] = v.split(':')
    return { tipo, id: id === '0' ? null : Number(id) }
  }
  function vinculoFromDespesa(d) {
    if (d.pessoa_id) return `pessoa:${d.pessoa_id}`
    if (d.fornecedor_id) return `fornecedor:${d.fornecedor_id}`
    return 'nenhum:0'
  }

  function startEdit(d) {
    setEditId(d.id)
    setForm({
      descricao: d.descricao,
      valor: String(d.valor),
      moeda: d.moeda || 'CLP',
      dia_vencimento: d.dia_vencimento ? String(d.dia_vencimento) : '',
      vinculo: vinculoFromDespesa(d),
      vigente_desde: d.vigente_desde,
      vigente_ate: d.vigente_ate || '',
    })
    descRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    descRef.current?.focus()
  }

  function cancelEdit() {
    setEditId(null)
    setForm(blank())
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    const descricao = form.descricao.trim()
    if (!descricao) return setError('Informe a descrição.')
    const v = Math.max(0, Number(form.valor) || 0)
    if (v <= 0) return setError('Informe um valor maior que zero.')
    const dia = form.dia_vencimento ? Math.max(1, Math.min(31, parseInt(form.dia_vencimento, 10))) : null
    const { tipo, id } = parseVinculo(form.vinculo)
    if (!form.vigente_desde) return setError('Informe vigente desde.')

    setSaving(true)
    const row = {
      descricao,
      valor: v,
      moeda: form.moeda,
      dia_vencimento: dia,
      pessoa_id: tipo === 'pessoa' ? id : null,
      fornecedor_id: tipo === 'fornecedor' ? id : null,
      vigente_desde: form.vigente_desde,
      vigente_ate: form.vigente_ate || null,
    }
    const { error } = editId
      ? await supabase.from('despesas_fixas').update(row).eq('id', editId)
      : await supabase.from('despesas_fixas').insert(row)
    setSaving(false)
    if (error) return setError(error.message)
    cancelEdit()
    refresh()
  }

  async function remove(id) {
    if (!confirm('Excluir esta despesa fixa? Pagamentos já lançados não serão removidos.')) return
    const { error } = await supabase.from('despesas_fixas').delete().eq('id', id)
    if (error) return setError(error.message)
    refresh()
  }

  // --- Pendências ---
  const pendentes = useMemo(() => {
    if (todasDespesas.length === 0) return []
    const today = new Date()
    const currentMesRef = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`
    const paidSet = new Set(pagamentos.map((p) => `${p.despesa_fixa_id}|${p.mes_ref}`))

    const out = []
    for (const d of todasDespesas) {
      const start = firstOfMonth(d.vigente_desde)
      const endRaw = d.vigente_ate ? firstOfMonth(d.vigente_ate) : currentMesRef
      const end = endRaw < currentMesRef ? endRaw : currentMesRef
      if (start > end) continue
      const meses = monthsBetween(start, end)
      for (const mes of meses) {
        if (!paidSet.has(`${d.id}|${mes}`)) {
          out.push({ despesa: d, mes_ref: mes })
        }
      }
    }
    return out.sort((a, b) => a.mes_ref.localeCompare(b.mes_ref))
  }, [todasDespesas, pagamentos])

  const totalPendentesCLP = useMemo(
    () => pendentes.reduce((s, p) => s + toCLP(p.despesa.valor, p.despesa.moeda), 0),
    [pendentes, toCLP],
  )

  async function marcarComoPaga(p) {
    const today = todayISO()
    const descricaoPagamento = `${p.despesa.descricao} - ${monthLabel(p.mes_ref)}`
    const { error } = await supabase.from('recebimentos').insert({
      data: today,
      valor: p.despesa.valor,
      moeda: p.despesa.moeda,
      tipo: 'pago',
      descricao: descricaoPagamento,
      despesa_fixa_id: p.despesa.id,
      mes_ref: p.mes_ref,
    })
    if (error) return setPendError(error.message)
    refresh()
  }

  function vinculoLabel(d) {
    if (d.pessoas?.nome) return `Pessoa: ${d.pessoas.nome}`
    if (d.fornecedores?.nome) return `Fornecedor: ${d.fornecedores.nome}`
    return '—'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Despesas Fixas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Cadastros recorrentes (salário, aluguel, contador, internet). Vincule a uma pessoa ou
          fornecedor — ou deixe avulsa. Pendências do mês aparecem na seção abaixo.
        </p>
      </div>

      <form
        onSubmit={save}
        className={`bg-white rounded-xl border p-4 grid gap-3 sm:grid-cols-6 items-end ${editId ? 'border-brand ring-2 ring-brand/30' : 'border-slate-200'}`}
      >
        {editId && (
          <p className="sm:col-span-6 text-sm font-medium text-brand-dark">Editando "{form.descricao}"</p>
        )}
        <Field label="Descrição" className="sm:col-span-3">
          <input
            ref={descRef}
            className="input"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Ex.: Aluguel escritório, Salário João"
          />
        </Field>
        <Field label="Valor" className="sm:col-span-1">
          <MoneyInput
            value={form.valor}
            onChange={(v) => setForm({ ...form, valor: v })}
            moeda={form.moeda}
          />
        </Field>
        <Field label="Moeda" className="sm:col-span-1">
          <select
            className="input"
            value={form.moeda}
            onChange={(e) => setForm({ ...form, moeda: e.target.value })}
          >
            <option value="CLP">CLP</option>
            <option value="USD">US$</option>
            <option value="BRL">R$</option>
          </select>
        </Field>
        <Field label="Dia venc." className="sm:col-span-1">
          <input
            type="number"
            min="1"
            max="31"
            className="input"
            value={form.dia_vencimento}
            onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
            placeholder="1-31"
          />
        </Field>

        <Field label="Vínculo" className="sm:col-span-3">
          <select
            className="input"
            value={form.vinculo}
            onChange={(e) => setForm({ ...form, vinculo: e.target.value })}
          >
            <option value="nenhum:0">— Sem vínculo (despesa avulsa)</option>
            {pessoas.length > 0 && (
              <optgroup label="Pessoas">
                {pessoas.map((p) => (
                  <option key={`p${p.id}`} value={`pessoa:${p.id}`}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            )}
            {fornecedores.length > 0 && (
              <optgroup label="Fornecedores">
                {fornecedores.map((f) => (
                  <option key={`f${f.id}`} value={`fornecedor:${f.id}`}>
                    {f.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="Vigente desde" className="sm:col-span-1">
          <input
            type="date"
            className="input"
            value={form.vigente_desde}
            onChange={(e) => setForm({ ...form, vigente_desde: e.target.value })}
          />
        </Field>
        <Field label="Vigente até (opc.)" className="sm:col-span-2">
          <input
            type="date"
            className="input"
            value={form.vigente_ate}
            onChange={(e) => setForm({ ...form, vigente_ate: e.target.value })}
          />
        </Field>

        <div className="sm:col-span-6 flex gap-2 pt-1">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : editId ? 'Salvar' : 'Adicionar despesa'}
          </button>
          {editId && (
            <button className="btn-ghost" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {error && <p className="text-sm text-accent">{error}</p>}

      {/* Lista de cadastros */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Descrição</th>
              <th className="px-4 py-2">Vínculo</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Vigência</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
            )}
            {!loading && despesas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhuma despesa fixa cadastrada.</td></tr>
            )}
            {!loading && despesas.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">
                  {d.descricao}
                  {d.dia_vencimento && (
                    <span className="text-xs text-slate-400 ml-1">· venc. dia {d.dia_vencimento}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{vinculoLabel(d)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatIn(d.valor, d.moeda)}</td>
                <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">
                  desde {d.vigente_desde.split('-').reverse().join('/')}
                  {d.vigente_ate && ` · até ${d.vigente_ate.split('-').reverse().join('/')}`}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button className="link" onClick={() => startEdit(d)}>Editar</button>
                  <button className="link text-accent ml-3" onClick={() => remove(d.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>{total} despesa{total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-3">
              <button type="button" className="btn-ghost px-3 py-1 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Anterior
              </button>
              <span>Página {page + 1} de {totalPages}</span>
              <button type="button" className="btn-ghost px-3 py-1 disabled:opacity-40" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pendências */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-600">Pendências</h2>
            <p className="text-xs text-slate-400">
              Despesas vigentes que ainda não foram pagas neste mês (ou em meses anteriores).
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Total a pagar</p>
            <p className={`text-lg font-bold ${pendentes.length > 0 ? 'text-accent' : 'text-emerald-600'}`}>
              {formatMoney(totalPendentesCLP)}
            </p>
          </div>
        </div>

        {pendError && <p className="text-sm text-accent">{pendError}</p>}

        {pendentes.length === 0 ? (
          <p className="text-sm text-slate-400">Tudo em dia.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {pendentes.map((p) => (
              <li key={`${p.despesa.id}-${p.mes_ref}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-700 truncate">
                    {p.despesa.descricao}
                    <span className="text-slate-400"> · {monthLabel(p.mes_ref)}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatIn(p.despesa.valor, p.despesa.moeda)}
                    {p.despesa.moeda !== 'CLP' && (
                      <span className="text-slate-400"> · {formatMoney(toCLP(p.despesa.valor, p.despesa.moeda))}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary py-1.5 px-3 text-xs whitespace-nowrap"
                  onClick={() => marcarComoPaga(p)}
                >
                  Marcar como paga
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
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
