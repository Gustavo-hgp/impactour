import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useCurrency } from '../lib/currency.jsx'
import DateFilter from '../components/DateFilter.jsx'
import { BarChart, Bar, BarYAxis, Grid, ChartTooltip } from '../components/ui/bar-chart.jsx'
import { Bar as RBar, ComposedChart, CartesianGrid, XAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip as RChartTooltip,
  ChartTooltipContent,
} from '../components/ui/chart.jsx'
import { custoReferencia, passeioNome } from '../lib/calc.js'

const NAVY = '#0a3fa8'

const chartConfig = {
  gasto: { label: 'Custo', color: NAVY },
}

const toISO = (d) => (d ? d.toLocaleDateString('en-CA') : null)
const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const fmtBR = (d) => d.toLocaleDateString('pt-BR')
const weekdayBR = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
const dayMonth = (iso) => iso.slice(8) + '/' + iso.slice(5, 7)

export default function Dashboard() {
  const { formatMoney } = useCurrency()
  const [mode, setMode] = useState('dia') // 'dia' | 'periodo'
  const [single, setSingle] = useState(new Date())
  const [range, setRange] = useState({ from: addDays(new Date(), -6), to: new Date() })

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // O filtro de data governa TODOS os gráficos.
  const from = mode === 'dia' ? single : range?.from
  const to = mode === 'dia' ? single : (range?.to ?? range?.from)
  const fromStr = toISO(from)
  const toStr = toISO(to)

  // Janelas dos gráficos ancoradas na data selecionada no filtro.
  const ref = from || new Date()
  const dow = ref.getDay() // 0=dom .. 6=sáb
  const weekStart = addDays(ref, -((dow + 6) % 7)) // segunda da semana da data selecionada
  const weekStartStr = toISO(weekStart)
  const horizonEndStr = toISO(addDays(ref, 29)) // data selecionada + 29 dias

  // Busca única cobrindo a união de todas as janelas.
  const fetchDates = [fromStr, toStr, weekStartStr, horizonEndStr].filter(Boolean).sort()
  const fetchLo = fetchDates[0]
  const fetchHi = fetchDates[fetchDates.length - 1]

  const select = 'data, quantidade, custo_pax_ref, passeio_nome, passeios(nome, custo_pax)'

  async function load() {
    if (!supabase || !fetchLo || !fetchHi) return setLoading(false)
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('lancamentos')
      .select(select)
      .gte('data', fetchLo)
      .lte('data', fetchHi)
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setRows(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [fetchLo, fetchHi])

  // Linhas dentro do período exato do filtro (KPIs + por passeio).
  const filtered = useMemo(
    () => rows.filter((r) => r.data >= fromStr && r.data <= toStr),
    [rows, fromStr, toStr],
  )

  const kpis = useMemo(() => {
    let pessoas = 0, gasto = 0
    const dias = new Set()
    for (const r of filtered) {
      pessoas += r.quantidade
      gasto += custoReferencia(r)
      if (r.quantidade > 0) dias.add(r.data)
    }
    return { pessoas, gasto, custoMedio: pessoas > 0 ? gasto / pessoas : 0, dias: dias.size }
  }, [filtered])

  // Custo por passeio — passeios do dia/período SELECIONADO no filtro
  const porPasseio = useMemo(() => {
    const acc = {}
    for (const r of filtered) {
      if (r.quantidade <= 0) continue
      const nome = passeioNome(r)
      const a = (acc[nome] ||= { nome, gasto: 0 })
      a.gasto += custoReferencia(r)
    }
    return Object.values(acc).sort((a, b) => b.gasto - a.gasto)
  }, [filtered])

  // Custo por dia — "dia": semana (seg→dom) da data selecionada; "período": cada dia do período
  const semana = useMemo(() => {
    const start = mode === 'dia' ? weekStart : from
    const end = mode === 'dia' ? addDays(weekStart, 6) : to
    if (!start || !end) return []
    const byDate = {}
    for (let d = new Date(start); toISO(d) <= toISO(end); d = addDays(d, 1)) {
      const iso = toISO(d)
      byDate[iso] = { data: iso, gasto: 0 }
    }
    for (const r of rows) {
      if (!byDate[r.data]) continue
      byDate[r.data].gasto += custoReferencia(r)
    }
    return Object.values(byDate)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((d) => ({ ...d, label: mode === 'dia' ? weekdayBR(d.data) : dayMonth(d.data) }))
  }, [rows, mode, weekStartStr, fromStr, toStr])

  // Próximos 30 dias — a partir da data selecionada, por dia
  const proximos30 = useMemo(() => {
    const byDate = {}
    for (let i = 0; i < 30; i++) {
      const iso = toISO(addDays(ref, i))
      byDate[iso] = { data: iso, gasto: 0 }
    }
    for (const r of rows) {
      if (!byDate[r.data]) continue
      byDate[r.data].gasto += custoReferencia(r)
    }
    return Object.values(byDate)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((d) => ({ ...d, label: dayMonth(d.data) }))
  }, [rows, fromStr])

  const periodoLabel =
    mode === 'dia'
      ? (from ? fmtBR(from) : '—')
      : from && to
        ? `${fmtBR(from)} → ${fmtBR(to)}`
        : 'Selecione o período'

  const semanaTemDados = semana.some((d) => d.gasto > 0)
  const mesTemDados = proximos30.some((d) => d.gasto > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Custo do período: {periodoLabel}
            {mode === 'periodo' && kpis.dias > 0 && ` · ${kpis.dias} dia(s) com lançamento`}
          </p>
        </div>
        <DateFilter
          mode={mode}
          setMode={setMode}
          single={single}
          setSingle={setSingle}
          range={range}
          setRange={setRange}
          label={periodoLabel}
        />
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Kpi label="Custo de operação" value={formatMoney(kpis.gasto)} tone="text-brand-dark" />
        <Kpi label="Custo médio /pessoa" value={formatMoney(kpis.custoMedio)} />
        <Kpi label="Pessoas" value={kpis.pessoas} />
      </div>

      <Card
        title={mode === 'dia' ? 'Custo da semana' : 'Custo do período'}
        subtitle={mode === 'dia' ? 'Semana da data selecionada · segunda a domingo' : `Por dia · ${periodoLabel}`}
      >
        {!semanaTemDados ? (
          <Empty loading={loading} text={mode === 'dia' ? 'Sem lançamentos nesta semana.' : 'Sem lançamentos neste período.'} />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
            <ComposedChart data={semana} margin={{ top: 8, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={mode === 'dia' ? 0 : 'preserveStartEnd'}
                minTickGap={mode === 'dia' ? 5 : 24}
              />
              <RChartTooltip
                cursor={false}
                content={<ChartTooltipContent valueFormatter={formatMoney} />}
              />
              <RBar dataKey="gasto" fill="var(--color-gasto)" radius={4} />
            </ComposedChart>
          </ChartContainer>
        )}
      </Card>

      <Card title="Próximos 30 dias" subtitle="Custo a partir da data selecionada · por dia">
        {!mesTemDados ? (
          <Empty loading={loading} text="Sem lançamentos nos próximos 30 dias." />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
            <ComposedChart data={proximos30} margin={{ top: 8, left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <RChartTooltip
                cursor={false}
                content={<ChartTooltipContent valueFormatter={formatMoney} />}
              />
              <RBar dataKey="gasto" fill="var(--color-gasto)" radius={3} />
            </ComposedChart>
          </ChartContainer>
        )}
      </Card>

      <Card title="Custo por passeio" subtitle={`Período selecionado · ${periodoLabel}`}>
        {porPasseio.length === 0 ? (
          <Empty loading={loading} text="Nenhum passeio no período selecionado." />
        ) : (
          <div style={{ height: Math.max(260, porPasseio.length * 44) }}>
            <BarChart
              data={porPasseio}
              xDataKey="nome"
              orientation="horizontal"
              className="h-full"
              margin={{ top: 8, right: 24, bottom: 28, left: 210 }}
              barGap={0.3}
            >
              <Grid vertical horizontal={false} />
              <Bar dataKey="gasto" fill={NAVY} lineCap={8} />
              <BarYAxis />
              <ChartTooltip
                rows={(p) => [{ color: NAVY, label: 'Custo', value: formatMoney(p.gasto) }]}
              />
            </BarChart>
          </div>
        )}
      </Card>
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

function Card({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-600">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Empty({ loading, text = 'Sem lançamentos para este período.' }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">
      {loading ? 'Carregando…' : text}
    </div>
  )
}
