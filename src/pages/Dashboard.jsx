import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import DateFilter from '../components/DateFilter.jsx'
import {
  BarChart, Bar, BarXAxis, Grid, ChartTooltip,
  Legend, LegendItemComponent, LegendMarker, LegendLabel,
} from '../components/ui/bar-chart.jsx'
import { Bar as RBar, Line, ComposedChart, CartesianGrid, XAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip as RChartTooltip,
  ChartTooltipContent,
} from '../components/ui/chart.jsx'

const NAVY = '#0a3fa8'
const RED = '#e11d2a'

const chartConfig = {
  faturamento: { label: 'Faturamento', color: NAVY },
  gasto: { label: 'Custo', color: RED },
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

  const select = 'data, quantidade, passeios(nome, custo_pax, preco_venda_pax)'

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
    let pessoas = 0, faturamento = 0, gasto = 0
    const dias = new Set()
    for (const r of filtered) {
      const p = r.passeios || {}
      pessoas += r.quantidade
      faturamento += r.quantidade * Number(p.preco_venda_pax || 0)
      gasto += r.quantidade * Number(p.custo_pax || 0)
      if (r.quantidade > 0) dias.add(r.data)
    }
    return { pessoas, faturamento, gasto, lucro: faturamento - gasto, dias: dias.size }
  }, [filtered])

  // Faturamento x Gasto por passeio — passeios do dia/período SELECIONADO no filtro
  const porPasseio = useMemo(() => {
    const acc = {}
    for (const r of filtered) {
      if (r.quantidade <= 0) continue
      const nome = r.passeios?.nome || '—'
      const a = (acc[nome] ||= { nome, faturamento: 0, gasto: 0 })
      a.faturamento += r.quantidade * Number(r.passeios?.preco_venda_pax || 0)
      a.gasto += r.quantidade * Number(r.passeios?.custo_pax || 0)
    }
    return Object.values(acc).sort((a, b) => b.faturamento - a.faturamento)
  }, [filtered])

  // Valores por dia — "dia": semana (seg→dom) da data selecionada; "período": cada dia do período
  const semana = useMemo(() => {
    const start = mode === 'dia' ? weekStart : from
    const end = mode === 'dia' ? addDays(weekStart, 6) : to
    if (!start || !end) return []
    const byDate = {}
    for (let d = new Date(start); toISO(d) <= toISO(end); d = addDays(d, 1)) {
      const iso = toISO(d)
      byDate[iso] = { data: iso, faturamento: 0, gasto: 0 }
    }
    for (const r of rows) {
      if (!byDate[r.data]) continue
      const p = r.passeios || {}
      byDate[r.data].faturamento += r.quantidade * Number(p.preco_venda_pax || 0)
      byDate[r.data].gasto += r.quantidade * Number(p.custo_pax || 0)
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
      byDate[iso] = { data: iso, faturamento: 0, gasto: 0 }
    }
    for (const r of rows) {
      if (!byDate[r.data]) continue
      const p = r.passeios || {}
      byDate[r.data].faturamento += r.quantidade * Number(p.preco_venda_pax || 0)
      byDate[r.data].gasto += r.quantidade * Number(p.custo_pax || 0)
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

  const semanaTemDados = semana.some((d) => d.faturamento > 0)
  const mesTemDados = proximos30.some((d) => d.faturamento > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            KPIs do período: {periodoLabel}
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

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <Kpi label="Faturamento" value={money(kpis.faturamento)} tone="text-emerald-600" />
        <Kpi label="Gasto" value={money(kpis.gasto)} tone="text-accent" />
        <Kpi label="Lucro" value={money(kpis.lucro)} tone="text-brand-dark" />
        <Kpi label="Pessoas" value={kpis.pessoas} />
      </div>

      <Card
        title={mode === 'dia' ? 'Valores da semana' : 'Valores do período'}
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
                content={<ChartTooltipContent valueFormatter={money} />}
              />
              <RBar dataKey="faturamento" fill="var(--color-faturamento)" radius={4} />
              <Line
                dataKey="gasto"
                type="monotone"
                stroke="var(--color-gasto)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </Card>

      <Card title="Próximos 30 dias" subtitle="A partir da data selecionada · por dia">
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
                content={<ChartTooltipContent valueFormatter={money} />}
              />
              <RBar dataKey="faturamento" fill="var(--color-faturamento)" radius={3} />
              <Line
                dataKey="gasto"
                type="monotone"
                stroke="var(--color-gasto)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </Card>

      <Card title="Faturamento x Gasto por passeio" subtitle={`Período selecionado · ${periodoLabel}`}>
        {porPasseio.length === 0 ? (
          <Empty loading={loading} text="Nenhum passeio no período selecionado." />
        ) : (
          <div className="h-72">
            <BarChart data={porPasseio} xDataKey="nome" className="h-full" barGap={0.55}>
              <Grid horizontal />
              <Bar dataKey="faturamento" fill={NAVY} lineCap={8} />
              <Bar dataKey="gasto" fill={RED} lineCap={8} />
              <BarXAxis showAllLabels />
              <ChartTooltip
                rows={(p) => [
                  { color: NAVY, label: 'Faturamento', value: money(p.faturamento) },
                  { color: RED, label: 'Gasto', value: money(p.gasto) },
                ]}
              />
            </BarChart>
            <ChartLegend />
          </div>
        )}
      </Card>
    </div>
  )
}

function ChartLegend() {
  return (
    <Legend
      className="justify-center"
      items={[
        { label: 'Faturamento', color: NAVY },
        { label: 'Gasto', color: RED },
      ]}
    >
      <LegendItemComponent>
        <LegendMarker />
        <LegendLabel />
      </LegendItemComponent>
    </Legend>
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
