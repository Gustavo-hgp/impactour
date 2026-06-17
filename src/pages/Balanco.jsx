import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayISO } from '../lib/format.js'
import { useCurrency } from '../lib/currency.jsx'

const PAGE_SIZE = 10

export default function Balanco() {
  const { formatMoney, formatIn, toCLP, currency } = useCurrency()
  const blank = () => ({ data: todayISO(), valor: '', moeda: currency, tipo: 'recebido', descricao: '' })

  const [itens, setItens] = useState([])
  const [totaisRaw, setTotaisRaw] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchDate, setSearchDate] = useState('')
  const [tick, setTick] = useState(0)
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [listLoading, setListLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  // Caixa atual.
  const [caixaInput, setCaixaInput] = useState('')
  const [caixaMoeda, setCaixaMoeda] = useState('CLP')
  const [savingCaixa, setSavingCaixa] = useState(false)
  const [caixaMsg, setCaixaMsg] = useState('')

  // Lançamentos — 10 por página, filtráveis por data.
  useEffect(() => {
    if (!supabase) return setListLoading(false)
    let cancelled = false
    ;(async () => {
      setListLoading(true)
      let q = supabase
        .from('recebimentos')
        .select('id, data, valor, moeda, tipo, descricao', { count: 'exact' })
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (searchDate) q = q.eq('data', searchDate)
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      let tq = supabase.from('recebimentos').select('valor, moeda, tipo')
      if (searchDate) tq = tq.eq('data', searchDate)

      const [listRes, totaisRes] = await Promise.all([q, tq])
      if (cancelled) return
      if (listRes.error) {
        setError(listRes.error.message)
        setListLoading(false)
        return
      }
      if (listRes.data.length === 0 && page > 0) return setPage((p) => p - 1)
      setItens(listRes.data)
      setTotal(listRes.count ?? 0)
      setTotaisRaw(totaisRes.error ? [] : totaisRes.data || [])
      setListLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [page, searchDate, tick])

  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase
        .from('config')
        .select('valor, texto')
        .eq('chave', 'caixa_atual')
        .maybeSingle()
      if (data) {
        setCaixaInput(data.valor ? String(data.valor) : '')
        if (data.texto) setCaixaMoeda(data.texto)
      }
    })()
  }, [])

  const refreshList = () => setTick((t) => t + 1)

  async function saveCaixa(e) {
    e.preventDefault()
    if (!supabase) return
    setSavingCaixa(true)
    setCaixaMsg('')
    const v = Math.max(0, Number(caixaInput) || 0)
    const { error } = await supabase
      .from('config')
      .upsert({ chave: 'caixa_atual', valor: v, texto: caixaMoeda }, { onConflict: 'chave' })
    setSavingCaixa(false)
    setCaixaMsg(error ? 'Erro ao salvar.' : 'Caixa atualizado!')
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    if (!form.data) return setError('Escolha a data.')
    setSaving(true)
    const row = {
      data: form.data,
      valor: Math.max(0, Number(form.valor) || 0),
      moeda: form.moeda,
      tipo: form.tipo,
      descricao: form.descricao.trim() || null,
    }
    const { error } = editId
      ? await supabase.from('recebimentos').update(row).eq('id', editId)
      : await supabase.from('recebimentos').insert(row)
    setSaving(false)
    if (error) return setError(error.message)
    setMsg(editId ? 'Lançamento atualizado!' : 'Lançamento salvo!')
    setEditId(null)
    setForm((f) => ({ ...blank(), data: f.data, moeda: f.moeda, tipo: f.tipo }))
    setSearchDate('')
    setPage(0)
    refreshList()
  }

  function editRow(r) {
    setMsg('')
    setEditId(r.id)
    setForm({
      data: r.data,
      valor: String(r.valor),
      moeda: r.moeda || 'CLP',
      tipo: r.tipo || 'recebido',
      descricao: r.descricao || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditId(null)
    setForm(blank())
    setMsg('')
  }

  async function remove(id) {
    if (!confirm('Excluir este lançamento?')) return
    const { error } = await supabase.from('recebimentos').delete().eq('id', id)
    if (error) return setError(error.message)
    refreshList()
  }

  const fmtData = (iso) => iso.split('-').reverse().join('/')
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const previewCLP = toCLP(form.valor, form.moeda)
  const caixaCLP = toCLP(caixaInput, caixaMoeda)
  const { entradasCLP, saidasCLP, saldoCLP } = useMemo(() => {
    const entradas = totaisRaw.filter((r) => r.tipo !== 'pago').reduce((s, r) => s + toCLP(r.valor, r.moeda), 0)
    const saidas = totaisRaw.filter((r) => r.tipo === 'pago').reduce((s, r) => s + toCLP(r.valor, r.moeda), 0)
    return { entradasCLP: entradas, saidasCLP: saidas, saldoCLP: entradas - saidas }
  }, [totaisRaw, toCLP])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Balanço Financeiro</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Caixa atual, entradas (recebido) e saídas (pago) · escolha a moeda — converte para peso
          automaticamente
        </p>
      </div>

      {/* Caixa atual */}
      <form
        onSubmit={saveCaixa}
        className="bg-white rounded-xl border border-slate-200 p-4 flex items-end gap-3 flex-wrap"
      >
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Caixa atual (no banco hoje)</span>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-40"
              value={caixaInput}
              onChange={(e) => setCaixaInput(e.target.value)}
              placeholder="0"
            />
            <select className="input w-24" value={caixaMoeda} onChange={(e) => setCaixaMoeda(e.target.value)}>
              <option value="CLP">CLP</option>
              <option value="USD">US$</option>
              <option value="BRL">R$</option>
            </select>
          </div>
        </label>
        <button className="btn-primary" type="submit" disabled={savingCaixa}>
          {savingCaixa ? 'Salvando…' : 'Atualizar caixa'}
        </button>
        {caixaMsg && <span className="text-sm text-green-600">{caixaMsg}</span>}
        <span className="text-sm text-slate-500 ml-auto">
          Convertido: <strong className="text-brand-dark">{formatMoney(caixaCLP)}</strong>
        </span>
      </form>

      <h2 className="text-sm font-semibold text-slate-600 -mb-2">Lançar entrada ou saída</h2>

      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {/* Tipo */}
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setForm({ ...form, tipo: 'recebido' })}
            className={`px-3 py-1 rounded-md font-medium transition ${
              form.tipo === 'recebido' ? 'bg-emerald-600 text-white' : 'text-slate-600'
            }`}
          >
            Recebido (entrada)
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, tipo: 'pago' })}
            className={`px-3 py-1 rounded-md font-medium transition ${
              form.tipo === 'pago' ? 'bg-accent text-white' : 'text-slate-600'
            }`}
          >
            Pago (saída)
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4 items-end">
          <Field label="Data">
            <input
              type="date"
              className="input"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
          </Field>
          <Field label="Valor">
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="0"
              />
              <select className="input w-24" value={form.moeda} onChange={(e) => setForm({ ...form, moeda: e.target.value })}>
                <option value="CLP">CLP</option>
                <option value="USD">US$</option>
                <option value="BRL">R$</option>
              </select>
            </div>
          </Field>
          <Field label="Descrição (opcional)">
            <input
              type="text"
              className="input"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder={form.tipo === 'pago' ? 'Ex.: pagamento fornecedor' : 'Ex.: sinal do cliente João'}
            />
          </Field>
          <div className="flex items-center justify-end gap-3">
            {editId && (
              <button type="button" className="btn-ghost" onClick={cancelEdit}>
                Cancelar
              </button>
            )}
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando…' : editId ? 'Atualizar' : 'Adicionar'}
            </button>
          </div>
        </div>
        {form.moeda !== 'CLP' && Number(form.valor) > 0 && (
          <p className="text-xs text-slate-500">
            ≈ <strong className="text-brand-dark">{formatMoney(previewCLP)}</strong> na moeda selecionada (à
            taxa atual do câmbio)
          </p>
        )}
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
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Descrição</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2 text-right">{currency === 'CLP' ? 'Original' : 'Em pesos'}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {listLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
            )}
            {!listLoading && itens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {searchDate ? 'Nenhum lançamento nesta data.' : 'Nenhum lançamento ainda.'}
                </td>
              </tr>
            )}
            {!listLoading &&
              itens.map((r) => {
                const pago = r.tipo === 'pago'
                const sinal = pago ? '− ' : ''
                const valorCLP = toCLP(r.valor, r.moeda)
                const colExtra =
                  currency === 'CLP'
                    ? r.moeda !== 'CLP'
                      ? formatIn(r.valor, r.moeda)
                      : '—'
                    : formatIn(valorCLP, 'CLP')
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap">{fmtData(r.data)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          pago ? 'bg-red-50 text-accent' : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {pago ? 'Pago' : 'Recebido'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.descricao || '—'}</td>
                    <td className={`px-4 py-2 text-right font-medium ${pago ? 'text-accent' : 'text-emerald-600'}`}>
                      {sinal}
                      {formatMoney(valorCLP)}
                    </td>
                    <td className={`px-4 py-2 text-right ${pago ? 'text-accent' : 'text-slate-500'}`}>
                      {sinal}
                      {colExtra}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button className="link" onClick={() => editRow(r)}>Editar</button>
                      <button className="link text-accent ml-3" onClick={() => remove(r.id)}>Excluir</button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
          {!listLoading && total > 0 && (
            <tfoot className="bg-slate-50 text-xs">
              <tr className="border-t border-slate-200">
                <td className="px-4 py-2 text-slate-500" colSpan={4}>
                  Entradas <strong className="text-emerald-600">{formatMoney(entradasCLP)}</strong>
                  {' · '}Saídas <strong className="text-accent">{formatMoney(saidasCLP)}</strong>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-slate-400">Saldo </span>
                  <strong className={saldoCLP < 0 ? 'text-accent' : 'text-brand-dark'}>
                    {formatMoney(saldoCLP)}
                  </strong>
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
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
