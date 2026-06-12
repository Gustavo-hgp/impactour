import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { money, todayISO } from '../lib/format.js'

const emptyForm = { passeio_id: '', data: todayISO(), quantidade: '' }

export default function Lancamentos() {
  const [passeios, setPasseios] = useState([])
  const [lancamentos, setLancamentos] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!supabase) return setLoading(false)
    setLoading(true)
    const [pRes, lRes] = await Promise.all([
      supabase.from('passeios').select('id, nome, custo_pax, preco_venda_pax').eq('ativo', true).order('nome'),
      supabase
        .from('lancamentos')
        .select('id, data, quantidade, passeio_id, passeios(nome, custo_pax, preco_venda_pax)')
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    if (pRes.error || lRes.error) {
      setError((pRes.error || lRes.error).message)
      setLoading(false)
      return
    }
    setPasseios(pRes.data)
    setLancamentos(lRes.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const passeioSel = passeios.find((p) => String(p.id) === String(form.passeio_id))
  const qtd = parseInt(form.quantidade, 10) || 0
  const previewFat = passeioSel ? qtd * Number(passeioSel.preco_venda_pax) : 0

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
    load()
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
    load()
  }

  const fmtData = (iso) => iso.split('-').reverse().join('/')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Lançar</h1>

      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3 sm:grid-cols-4 items-end">
        <Field label="Passeio" className="sm:col-span-2">
          <select
            className="input"
            value={form.passeio_id}
            onChange={(e) => setForm({ ...form, passeio_id: e.target.value })}
          >
            <option value="">Selecione…</option>
            {passeios.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </Field>
        <Field label="Data">
          <input
            type="date" className="input"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
          />
        </Field>
        <Field label="Pessoas">
          <input
            type="number" min="0" className="input"
            value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
            placeholder="0"
          />
        </Field>

        <div className="sm:col-span-4 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-slate-500">
            {passeioSel
              ? `Faturamento: ${money(previewFat)}`
              : 'Escolha um passeio para ver o faturamento.'}
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
        <h2 className="text-sm font-semibold text-slate-600 mb-2">Lançamentos recentes</h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Passeio</th>
                <th className="px-4 py-2 text-right">Pessoas</th>
                <th className="px-4 py-2 text-right">Faturamento</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
              )}
              {!loading && lancamentos.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhum lançamento ainda.</td></tr>
              )}
              {lancamentos.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap">{fmtData(l.data)}</td>
                  <td className="px-4 py-2 font-medium">{l.passeios?.nome || '—'}</td>
                  <td className="px-4 py-2 text-right">{l.quantidade}</td>
                  <td className="px-4 py-2 text-right">
                    {money(l.quantidade * Number(l.passeios?.preco_venda_pax || 0))}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button className="link" onClick={() => editRow(l)}>Editar</button>
                    <button className="link text-accent ml-3" onClick={() => remove(l.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
