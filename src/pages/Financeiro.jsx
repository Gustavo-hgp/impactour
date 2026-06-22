import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis } from 'recharts'
import { supabase } from '../lib/supabase.js'
import { useCurrency } from '../lib/currency.jsx'
import { cn } from '../lib/utils.js'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart.jsx'
import { DonutChart } from '../components/ui/DonutChart.jsx'
import { LeaderboardPodium } from '../components/ui/LeaderboardPodium.jsx'
import { custoReal, economiaLancamento, parceiroNome, passeioNome } from '../lib/calc.js'

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => d.toLocaleDateString('en-CA')
const currentMonthKey = () => ymd(new Date()).slice(0, 7)
const monthLabel = (key) => {
  const [y, m] = key.split('-')
  return `${MONTHS_PT[Number(m) - 1]}/${y}`
}
const shortMes = (key) => {
  const [y, m] = key.split('-')
  return `${MONTHS_PT[Number(m) - 1]}/${y.slice(2)}`
}
const addMonthsKey = (key, n) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const firstDayISO = (key) => `${key}-01`
const lastDayISO = (key) => {
  const [y, m] = key.split('-').map(Number)
  return ymd(new Date(y, m, 0))
}
function monthRange(startKey, endKey) {
  const keys = []
  let k = startKey
  for (let i = 0; i < 36 && k <= endKey; i++) {
    keys.push(k)
    k = addMonthsKey(k, 1)
  }
  return keys
}

const NAVY = '#0a3fa8'
const RED = '#e11d2a'
const GREEN = '#10b981'
const ORANGE = '#f97316'
const PALETTE = ['#0a3fa8', '#10b981', '#f59e0b', '#e11d2a', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#14b8a6', '#f97316', '#a855f7', '#0ea5e9']

export default function Financeiro() {
  const { formatMoney, toCLP } = useCurrency()

  const cur = currentMonthKey()
  const [mode, setMode] = useState('6') // '1' | '3' | '6' | 'custom'
  const [customFrom, setCustomFrom] = useState(cur)
  const [customTo, setCustomTo] = useState(addMonthsKey(cur, 5))

  const [saldos, setSaldos] = useState([])

  const [lancRaw, setLancRaw] = useState([])
  const [balRaw, setBalRaw] = useState([])
  const [despesasFixas, setDespesasFixas] = useState([])
  const [comissoesPeriodo, setComissoesPeriodo] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const startKey = mode === 'custom' ? customFrom : cur
  const endKey =
    mode === 'custom' ? customTo : addMonthsKey(cur, mode === '1' ? 0 : mode === '3' ? 2 : 5)
  const months = useMemo(
    () => (startKey && endKey && startKey <= endKey ? monthRange(startKey, endKey) : []),
    [startKey, endKey],
  )

  // Caixa atual = soma dos saldos em CLP (edição no Balanço).
  const caixa = useMemo(
    () => saldos.reduce((s, r) => s + toCLP(r.valor, r.moeda), 0),
    [saldos, toCLP],
  )

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('saldos_caixa').select('valor, moeda')
      if (!cancelled && data) setSaldos(data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Lançamentos (operação) + balanço (entradas/saídas) do período.
  useEffect(() => {
    if (!supabase || months.length === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      const periodStart = firstDayISO(startKey)
      const periodEnd = lastDayISO(endKey)
      const [lRes, bRes, dRes, cRes] = await Promise.all([
        supabase
          .from('lancamentos')
          .select('data, quantidade, parceiro_id, valor_servico, custo_pax_ref, passeio_nome, parceiro_nome, passeios(nome, custo_pax), parceiros(nome)')
          .gte('data', periodStart)
          .lte('data', periodEnd),
        supabase
          .from('recebimentos')
          .select('data, valor, moeda, tipo, despesa_fixa_id, mes_ref')
          .gte('data', periodStart)
          .lte('data', periodEnd),
        // Todas as despesas fixas: precisa avaliar vigência em cada mês do range.
        supabase.from('despesas_fixas').select('id, valor, moeda, vigente_desde, vigente_ate'),
        supabase
          .from('comissoes')
          .select('data, valor, moeda')
          .gte('data', periodStart)
          .lte('data', periodEnd),
      ])
      if (cancelled) return
      if (lRes.error) {
        setError(lRes.error.message)
        setLoading(false)
        return
      }
      setLancRaw(lRes.data || [])
      setBalRaw(bRes.error ? [] : bRes.data || [])
      setDespesasFixas(dRes.error ? [] : dRes.data || [])
      setComissoesPeriodo(cRes.error ? [] : cRes.data || [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [startKey, endKey, months.length])

  // Custo REAL por mês: usa o valor do parceiro quando houver, senão a referência.
  const custosPorMes = useMemo(() => {
    const m = {}
    for (const r of lancRaw) {
      const k = r.data.slice(0, 7)
      m[k] = (m[k] || 0) + custoReal(r)
    }
    return m
  }, [lancRaw])

  // Economia (referência − real) por mês — exclusiva do módulo financeiro.
  const economiaPorMes = useMemo(() => {
    const m = {}
    for (const r of lancRaw) {
      const k = r.data.slice(0, 7)
      m[k] = (m[k] || 0) + economiaLancamento(r)
    }
    return m
  }, [lancRaw])

  // Entradas (recebido) e pagamentos (pago) por mês, em CLP.
  const entradasPorMes = useMemo(() => {
    const m = {}
    for (const r of balRaw) {
      if (r.tipo === 'pago') continue
      const k = r.data.slice(0, 7)
      m[k] = (m[k] || 0) + toCLP(r.valor, r.moeda)
    }
    return m
  }, [balRaw, toCLP])

  // Saídas/mês = recebimentos(pago) + comissões com data no mês + despesas fixas
  // pendentes (vigentes no mês E sem recebimento amarrado por mes_ref).
  const pagosPorMes = useMemo(() => {
    const m = {}
    // 1) Recebimentos do tipo "pago" (inclui pagamentos de despesa fixa já efetuados).
    for (const r of balRaw) {
      if (r.tipo !== 'pago') continue
      const k = r.data.slice(0, 7)
      m[k] = (m[k] || 0) + toCLP(r.valor, r.moeda)
    }
    // 2) Comissões: alocadas no mês da data (independente de pago_em).
    for (const c of comissoesPeriodo) {
      const k = c.data.slice(0, 7)
      m[k] = (m[k] || 0) + toCLP(c.valor, c.moeda)
    }
    // 3) Despesas fixas pendentes: pra cada mês do range, se a despesa está vigente
    //    e ainda não tem recebimento amarrado, soma o valor previsto.
    const paidSet = new Set(
      balRaw
        .filter((r) => r.despesa_fixa_id && r.mes_ref)
        .map((r) => `${r.despesa_fixa_id}|${r.mes_ref}`),
    )
    for (const k of months) {
      const mesStart = firstDayISO(k)
      const mesEnd = lastDayISO(k)
      const mesRef = `${k}-01`
      for (const d of despesasFixas) {
        if (d.vigente_desde > mesEnd) continue
        if (d.vigente_ate && d.vigente_ate < mesStart) continue
        if (paidSet.has(`${d.id}|${mesRef}`)) continue
        m[k] = (m[k] || 0) + toCLP(d.valor, d.moeda)
      }
    }
    return m
  }, [balRaw, comissoesPeriodo, despesasFixas, months, toCLP])

  const perPasseio = useMemo(() => {
    const acc = {}
    for (const r of lancRaw) {
      if (r.quantidade <= 0) continue
      const nome = passeioNome(r)
      const a = (acc[nome] ||= { nome, pessoas: 0, custo: 0 })
      a.pessoas += r.quantidade
      a.custo += custoReal(r)
    }
    return Object.values(acc)
  }, [lancRaw])

  // Projeção rolando mês a mês. Saída = custos operacionais + pagamentos.
  const linhas = useMemo(() => {
    let saldoInicial = caixa
    return months.map((k) => {
      const rec = entradasPorMes[k] || 0
      const saida = (custosPorMes[k] || 0) + (pagosPorMes[k] || 0)
      const aporte = Math.max(0, saida - rec)
      const saldoFinal = saldoInicial + rec - saida
      const row = { mes: k, saldoInicial, rec, custos: custosPorMes[k] || 0, pagos: pagosPorMes[k] || 0, saida, aporte, saldoFinal }
      saldoInicial = saldoFinal
      return row
    })
  }, [months, entradasPorMes, custosPorMes, pagosPorMes, caixa])

  const totalEntradas = linhas.reduce((s, l) => s + l.rec, 0)
  const totalSaidas = linhas.reduce((s, l) => s + l.saida, 0)
  const saldoProjetado = caixa + totalEntradas - totalSaidas
  const necessidade = Math.max(0, totalSaidas - totalEntradas)
  const saldoMin = linhas.length ? Math.min(...linhas.map((l) => l.saldoFinal)) : caixa

  // Dados dos gráficos.
  const mesData = months.map((k) => ({
    mes: shortMes(k),
    custos: custosPorMes[k] || 0,
    recebimentos: entradasPorMes[k] || 0,
  }))
  const fluxoData = linhas.map((l) => ({ mes: shortMes(l.mes), entradas: l.rec, saidas: l.saida }))
  const saldoData = linhas.map((l) => ({ mes: shortMes(l.mes), saldo: l.saldoFinal }))
  const donutCusto = [...perPasseio]
    .sort((a, b) => b.custo - a.custo)
    .map((p, i) => ({ label: p.nome, value: p.custo, color: PALETTE[i % PALETTE.length] }))
  const podiumRankings = [...perPasseio]
    .sort((a, b) => b.pessoas - a.pessoas)
    .slice(0, 3)
    .map((p, i) => ({ userId: p.nome, userName: p.nome, rank: i + 1, value: p.pessoas }))
  const totalPessoas = perPasseio.reduce((s, p) => s + p.pessoas, 0)

  // Economia com parceiros (só financeiro).
  const economiaTotal = lancRaw.reduce((s, r) => s + economiaLancamento(r), 0)
  const economiaData = months.map((k) => ({ mes: shortMes(k), economia: economiaPorMes[k] || 0 }))
  const perParceiro = Object.values(
    lancRaw.reduce((acc, r) => {
      if (r.valor_servico == null) return acc
      const nome = parceiroNome(r) || 'Parceiro'
      ;(acc[nome] ||= { nome, economia: 0, usos: 0 })
      acc[nome].economia += economiaLancamento(r)
      acc[nome].usos += 1
      return acc
    }, {}),
  )
  const podiumParceiros = [...perParceiro]
    .sort((a, b) => b.economia - a.economia)
    .slice(0, 3)
    .map((p, i) => ({ userId: p.nome, userName: p.nome, rank: i + 1, value: p.economia }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Visão Financeira</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Projeção do caixa ·{' '}
            {months.length ? `${monthLabel(startKey)} → ${monthLabel(endKey)}` : 'período inválido'}
          </p>
        </div>
        <PeriodFilter
          mode={mode}
          setMode={setMode}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
        />
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Caixa atual" value={formatMoney(caixa)} sub="edite no Balanço" tone="text-brand-dark" />
        <Kpi label="Entradas" value={formatMoney(totalEntradas)} sub="recebido" tone="text-emerald-600" />
        <Kpi label="Saídas" value={formatMoney(totalSaidas)} sub="custos + pagamentos" tone="text-accent" />
        <Kpi
          label="Necessidade de aporte"
          value={formatMoney(necessidade)}
          sub="saídas − entradas"
          tone={necessidade > 0 ? 'text-accent' : 'text-slate-800'}
        />
        <Kpi
          label="Saldo projetado"
          value={formatMoney(saldoProjetado)}
          sub="caixa + entradas − saídas"
          tone={saldoProjetado < 0 ? 'text-accent' : 'text-brand-dark'}
        />
        <Kpi
          label="Economia parceiros"
          value={formatMoney(economiaTotal)}
          sub="referência − real"
          tone={economiaTotal > 0 ? 'text-emerald-600' : 'text-slate-800'}
        />
      </div>

      {saldoMin < 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ A projeção fica negativa em algum mês (mínimo {formatMoney(saldoMin)}). O caixa não cobre
          toda a operação do período — seria preciso um reforço de {formatMoney(Math.abs(saldoMin))}.
        </div>
      )}

      {/* Custos × Recebimentos + projeção */}
      <div className="space-y-4">
        <ChartCard title="Custos × Recebimentos" subtitle="Por mês · em pesos convertidos">
          {mesData.length === 0 ? (
            <Empty loading={loading} />
          ) : (
            <ChartContainer
              config={{ custos: { label: 'Custos', color: RED }, recebimentos: { label: 'Recebimentos', color: GREEN } }}
              className="aspect-auto h-64 w-full"
            >
              <ComposedChart data={mesData} margin={{ top: 8, left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={formatMoney} />} />
                <Bar dataKey="custos" fill="var(--color-custos)" radius={4} />
                <Bar dataKey="recebimentos" fill="var(--color-recebimentos)" radius={4} />
              </ComposedChart>
            </ChartContainer>
          )}
        </ChartCard>

        {/* Projeção mês a mês */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-600">Projeção mês a mês</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            O saldo final de um mês entra como caixa inicial do mês seguinte
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2">Mês</th>
                <th className="px-4 py-2 text-right">Caixa inicial</th>
                <th className="px-4 py-2 text-right">Entradas</th>
                <th className="px-4 py-2 text-right">Saídas</th>
                <th className="px-4 py-2 text-right">Aporte</th>
                <th className="px-4 py-2 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando…</td></tr>
              )}
              {!loading && linhas.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Selecione um período válido.</td></tr>
              )}
              {!loading &&
                linhas.map((l) => (
                  <tr key={l.mes} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium capitalize">{monthLabel(l.mes)}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{formatMoney(l.saldoInicial)}</td>
                    <td className="px-4 py-2 text-right text-emerald-600">{formatMoney(l.rec)}</td>
                    <td className="px-4 py-2 text-right text-accent">{formatMoney(l.saida)}</td>
                    <td className={`px-4 py-2 text-right ${l.aporte > 0 ? 'text-accent font-medium' : 'text-slate-400'}`}>
                      {formatMoney(l.aporte)}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${l.saldoFinal < 0 ? 'text-accent' : 'text-brand-dark'}`}>
                      {formatMoney(l.saldoFinal)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* Demais gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Saldo projetado" subtitle="Caixa acumulado ao longo dos meses">
          {saldoData.length === 0 ? (
            <Empty loading={loading} />
          ) : (
            <ChartContainer config={{ saldo: { label: 'Saldo', color: NAVY } }} className="aspect-auto h-64 w-full">
              <AreaChart data={saldoData} margin={{ top: 8, left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={formatMoney} />} />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                <Area dataKey="saldo" type="monotone" stroke="var(--color-saldo)" fill="var(--color-saldo)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard title="Entradas × Saídas" subtitle="Entradas (recebido) vs saídas (custos + pagamentos)">
          {fluxoData.length === 0 ? (
            <Empty loading={loading} />
          ) : (
            <ChartContainer
              config={{ entradas: { label: 'Entradas', color: GREEN }, saidas: { label: 'Saídas', color: ORANGE } }}
              className="aspect-auto h-64 w-full"
            >
              <LineChart data={fluxoData} margin={{ top: 8, left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={formatMoney} />} />
                <Line dataKey="entradas" type="monotone" stroke="var(--color-entradas)" strokeWidth={2} dot={false} />
                <Line dataKey="saidas" type="monotone" stroke="var(--color-saidas)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          )}
        </ChartCard>

        <DonutCard
          title="Custo por passeio"
          subtitle="Participação no custo do período"
          data={donutCusto}
          formatValue={formatMoney}
          loading={loading}
        />

        <ChartCard
          title="Passeios com mais pessoas"
          subtitle={`Top do período · ${totalPessoas.toLocaleString('pt-BR')} pessoas no total`}
        >
          {podiumRankings.length === 0 ? (
            <Empty loading={loading} text="Sem pessoas no período." />
          ) : (
            <div className="pt-3">
              <LeaderboardPodium rankings={podiumRankings} size="sm" showAvatar={false} />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Economia com parceiros" subtitle="Economia vs. referência, por mês">
          {economiaData.length === 0 ? (
            <Empty loading={loading} />
          ) : (
            <ChartContainer config={{ economia: { label: 'Economia', color: GREEN } }} className="aspect-auto h-56 w-full">
              <ComposedChart data={economiaData} margin={{ top: 8, left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={formatMoney} />} />
                <Bar dataKey="economia" fill="var(--color-economia)" radius={4} />
              </ComposedChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard title="Parceiros mais econômicos" subtitle="Top por economia gerada no período">
          {podiumParceiros.length === 0 ? (
            <Empty loading={loading} text="Nenhum lançamento com parceiro no período." />
          ) : (
            <div className="pt-3">
              <LeaderboardPodium rankings={podiumParceiros} size="sm" showAvatar={false} formatValue={formatMoney} />
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function DonutCard({ title, subtitle, data, formatValue, loading, maxLegend = 10 }) {
  const [expanded, setExpanded] = useState(false)
  const total = data.reduce((s, d) => s + d.value, 0)
  const shown = expanded ? data : data.slice(0, maxLegend)
  const hidden = data.length - shown.length

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <Empty loading={loading} />
      ) : (
        <div className="flex flex-col items-center gap-5 py-2 sm:flex-row sm:justify-center sm:items-start">
          <DonutChart
            data={data}
            size={172}
            strokeWidth={22}
            className="shrink-0"
            centerContent={
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Total</div>
                <div className="text-sm font-bold text-slate-800">{formatValue(total)}</div>
              </div>
            }
          />
          <div className="w-full sm:w-auto sm:min-w-[160px]">
            <ul className="space-y-1.5 text-sm">
              {shown.map((d) => (
                <li key={d.label} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="truncate text-slate-600" title={d.label}>{d.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">{formatValue(d.value)}</span>
                </li>
              ))}
            </ul>
            {data.length > maxLegend && (
              <button type="button" className="link mt-2 text-xs" onClick={() => setExpanded((e) => !e)}>
                {expanded ? 'Ver menos' : `Ver mais (${hidden})`}
              </button>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  )
}

function ChartCard({ title, subtitle, className, children }) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 p-4', className)}>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-600">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Empty({ loading, text = 'Sem dados no período.' }) {
  return (
    <div className="h-48 grid place-items-center text-sm text-slate-400">
      {loading ? 'Carregando…' : text}
    </div>
  )
}

function PeriodFilter({ mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const opts = [
    ['1', 'Próximo mês'],
    ['3', '3 meses'],
    ['6', '6 meses'],
    ['custom', 'Personalizado'],
  ]
  return (
    <div className="flex flex-col items-start sm:items-end gap-2">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
        {opts.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            className={`px-3 py-1 rounded-md font-medium transition ${
              mode === v ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <input type="month" className="input w-auto py-1.5" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="text-slate-400">→</span>
          <input type="month" className="input w-auto py-1.5" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}
