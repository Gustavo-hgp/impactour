import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useCurrency } from '../lib/currency.jsx'
import { tipoServicoLabel } from '../lib/calc.js'

const PAGE_SIZE = 10
const TIPOS = [
  { v: 'van', label: 'Van' },
  { v: 'guia', label: 'Guia' },
  { v: 'van_guia', label: 'Van + Guia' },
]
const blank = () => ({ nome: '', qtd_maxima: '', precos: [] })

export default function Parceiros() {
  const { formatMoney } = useCurrency()
  const [passeios, setPasseios] = useState([])
  const [parceiros, setParceiros] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [tick, setTick] = useState(0)
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aberto, setAberto] = useState(() => new Set())
  const nomeRef = useRef(null)

  const togglePrecos = (id) =>
    setAberto((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Passeios (para os selects de preço) — uma vez.
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase.from('passeios').select('id, nome').eq('ativo', true).order('nome')
      if (data) setPasseios(data)
    })()
  }, [])

  // Parceiros + seus preços, paginado.
  useEffect(() => {
    if (!supabase) return setLoading(false)
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error, count } = await supabase
        .from('parceiros')
        .select('id, nome, qtd_maxima, parceiro_precos(passeio_id, tipo_servico, valor, passeios(nome))', { count: 'exact' })
        .order('nome')
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (data.length === 0 && page > 0) return setPage((p) => p - 1)
      setParceiros(data)
      setTotal(count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [page, tick])

  const refresh = () => setTick((t) => t + 1)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function startEdit(p) {
    setEditId(p.id)
    setForm({
      nome: p.nome,
      qtd_maxima: p.qtd_maxima,
      precos: (p.parceiro_precos || []).map((pp) => ({
        passeio_id: String(pp.passeio_id),
        tipo_servico: pp.tipo_servico || '',
        valor: String(pp.valor),
      })),
    })
    nomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    nomeRef.current?.focus()
  }

  function cancelEdit() {
    setEditId(null)
    setForm(blank())
  }

  const addPreco = () =>
    setForm((f) => ({ ...f, precos: [...f.precos, { passeio_id: '', tipo_servico: '', valor: '' }] }))
  const setPreco = (i, patch) =>
    setForm((f) => ({ ...f, precos: f.precos.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }))
  const removePreco = (i) => setForm((f) => ({ ...f, precos: f.precos.filter((_, idx) => idx !== i) }))

  async function save(e) {
    e.preventDefault()
    setError('')
    const nome = form.nome.trim()
    if (!nome) return setError('Informe o nome do parceiro.')

    // dedupe por passeio (mantém o último) e filtra válidos
    const map = new Map()
    for (const p of form.precos) {
      if (!p.passeio_id || !p.tipo_servico || !(Number(p.valor) > 0)) continue
      map.set(`${p.passeio_id}|${p.tipo_servico}`, {
        passeio_id: Number(p.passeio_id),
        tipo_servico: p.tipo_servico,
        valor: Number(p.valor),
      })
    }
    const precos = [...map.values()]
    if (precos.length === 0) return setError('Adicione passeio, tipo de serviço e valor em pelo menos um item.')

    setSaving(true)
    const base = { nome, qtd_maxima: Math.max(0, parseInt(form.qtd_maxima, 10) || 0) }
    const res = editId
      ? await supabase.from('parceiros').update(base).eq('id', editId).select('id').single()
      : await supabase.from('parceiros').insert(base).select('id').single()
    if (res.error) {
      setSaving(false)
      return setError(res.error.message)
    }
    const parceiroId = res.data.id

    // Sincroniza preços de forma segura:
    // 1) lê o que já existe (só na edição);
    // 2) upsert dos preços do form (chave única parceiro_id,passeio_id,tipo_servico) —
    //    se falhar aqui, o parceiro continua com os preços antigos intactos;
    // 3) só agora apaga os preços que sumiram da edição.
    let existentes = []
    if (editId) {
      const r = await supabase
        .from('parceiro_precos')
        .select('id, passeio_id, tipo_servico')
        .eq('parceiro_id', parceiroId)
      if (!r.error) existentes = r.data || []
    }

    const ups = await supabase
      .from('parceiro_precos')
      .upsert(
        precos.map((p) => ({ parceiro_id: parceiroId, ...p })),
        { onConflict: 'parceiro_id,passeio_id,tipo_servico' },
      )
    if (ups.error) {
      setSaving(false)
      return setError(ups.error.message)
    }

    if (existentes.length) {
      const keep = new Set(precos.map((p) => `${p.passeio_id}|${p.tipo_servico}`))
      const removerIds = existentes
        .filter((e) => !keep.has(`${e.passeio_id}|${e.tipo_servico}`))
        .map((e) => e.id)
      if (removerIds.length) {
        const del = await supabase.from('parceiro_precos').delete().in('id', removerIds)
        if (del.error) {
          setSaving(false)
          return setError(del.error.message)
        }
      }
    }

    setSaving(false)
    cancelEdit()
    refresh()
  }

  async function remove(id) {
    if (!confirm('Excluir este parceiro? Os lançamentos antigos mantêm o valor e a economia já registrados.')) return
    const { error } = await supabase.from('parceiros').delete().eq('id', id)
    if (error) return setError(error.message)
    refresh()
  }

  const passeioNomeById = (id) => passeios.find((p) => String(p.id) === String(id))?.nome || '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Parceiros</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Quem presta o serviço. Cadastre, pra cada passeio que ele atende, quanto ele cobra (em pesos).
        </p>
      </div>

      <form
        onSubmit={save}
        className={`bg-white rounded-xl border p-4 space-y-3 ${editId ? 'border-brand ring-2 ring-brand/30' : 'border-slate-200'}`}
      >
        {editId && <p className="text-sm font-medium text-brand-dark">Editando “{form.nome}”</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Parceiro">
            <input
              ref={nomeRef}
              className="input"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Insira o nome do parceiro..."
            />
          </Field>
          <Field label="Qtd. máx. de pessoas">
            <input
              className="input"
              type="number"
              min="0"
              value={form.qtd_maxima}
              onChange={(e) => setForm({ ...form, qtd_maxima: e.target.value })}
              placeholder="0"
            />
          </Field>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-500 mb-2">Preços por passeio (CLP)</span>
          <div className="space-y-2">
            {form.precos.length === 0 && (
              <p className="text-sm text-slate-400">Nenhum passeio adicionado ainda.</p>
            )}
            {form.precos.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="input"
                  value={p.passeio_id}
                  onChange={(e) => setPreco(i, { passeio_id: e.target.value })}
                >
                  <option value="">Escolha o passeio…</option>
                  {passeios.map((ps) => (
                    <option key={ps.id} value={ps.id}>{ps.nome}</option>
                  ))}
                </select>
                <select
                  className="input w-36"
                  value={p.tipo_servico}
                  onChange={(e) => setPreco(i, { tipo_servico: e.target.value })}
                >
                  <option value="">Tipo…</option>
                  {TIPOS.map((t) => (
                    <option key={t.v} value={t.v}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input w-32"
                  value={p.valor}
                  onChange={(e) => setPreco(i, { valor: e.target.value })}
                  placeholder="0,00"
                />
                <button
                  type="button"
                  onClick={() => removePreco(i)}
                  className="p-2 text-slate-400 hover:text-accent"
                  aria-label="Remover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addPreco}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-dark hover:underline"
          >
            <Plus className="h-4 w-4" /> Adicionar passeio
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Adicionar parceiro'}
          </button>
          {editId && (
            <button className="btn-ghost" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {error && <p className="text-sm text-accent">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Parceiro</th>
              <th className="px-4 py-2 text-right">Máx.</th>
              <th className="px-4 py-2">Preços por passeio</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
            )}
            {!loading && parceiros.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Nenhum parceiro cadastrado.</td></tr>
            )}
            {!loading &&
              parceiros.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 font-medium">{p.nome}</td>
                  <td className="px-4 py-2 text-right">{p.qtd_maxima}</td>
                  <td className="px-4 py-2 text-slate-600 max-w-xs">
                    <PrecosCelula
                      precos={p.parceiro_precos || []}
                      aberto={aberto.has(p.id)}
                      onToggle={() => togglePrecos(p.id)}
                      passeioNomeById={passeioNomeById}
                      formatMoney={formatMoney}
                    />
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button className="link" onClick={() => startEdit(p)}>Editar</button>
                    <button className="link text-accent ml-3" onClick={() => remove(p.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>{total} parceiro{total === 1 ? '' : 's'}</span>
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

const PREVIEW_N = 2

function PrecosCelula({ precos, aberto, onToggle, passeioNomeById, formatMoney }) {
  if (precos.length === 0) return <span>—</span>
  const ordenados = aberto
    ? [...precos].sort((a, b) => {
        const na = a.passeios?.nome || passeioNomeById(a.passeio_id)
        const nb = b.passeios?.nome || passeioNomeById(b.passeio_id)
        return na.localeCompare(nb, 'pt-BR')
      })
    : precos
  const label = `${precos.length} ${precos.length === 1 ? 'preço' : 'preços'}`
  const previewItens = precos.slice(0, PREVIEW_N)

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline"
        aria-expanded={aberto}
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {!aberto && (
        <p className="mt-0.5 text-xs text-slate-400 truncate">
          {previewItens
            .map((pp) => `${pp.passeios?.nome || passeioNomeById(pp.passeio_id)} · ${formatMoney(pp.valor)}`)
            .join(' · ')}
          {precos.length > PREVIEW_N && ' · …'}
        </p>
      )}

      {aberto && (
        <ul className="mt-2 max-h-56 overflow-y-auto pr-1 text-xs divide-y divide-slate-50">
          {ordenados.map((pp, i) => (
            <li key={`${pp.passeio_id}-${pp.tipo_servico}-${i}`} className="flex items-center justify-between gap-3 py-1">
              <span className="truncate text-slate-600">
                {pp.passeios?.nome || passeioNomeById(pp.passeio_id)}
                <span className="text-slate-400"> · {tipoServicoLabel(pp.tipo_servico)}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-700">{formatMoney(pp.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
