// Gráficos (Recharts, el mismo motor que usan los charts de shadcn).
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'

import { fmtCLP, fmtCorto, fmtPct, nombreMes } from '@/lib/util'
import type { PorCategoria } from '@/lib/stats'

const ejes = { stroke: 'var(--muted-foreground)', fontSize: 12, tickLine: false, axisLine: false }

/** Recuadro del tooltip con estilo shadcn. */
function TooltipCaja({ active, payload, label, titulo }: TooltipContentProps & { titulo?: (l: unknown) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover text-popover-foreground grid min-w-36 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{titulo ? titulo(label) : String(label)}</div>
      {payload.map((p) =>
        p.value == null ? null : (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color }} />
            <span className="text-muted-foreground flex-1">{p.name}</span>
            <span className="num font-medium">{fmtCLP(Number(p.value))}</span>
          </div>
        ),
      )}
    </div>
  )
}

/** Dona de gasto por categoría. Al tocar un trozo, el centro muestra esa categoría. */
export function DonaCategorias({ datos, colorDe, total, cantidad }: { datos: PorCategoria[]; colorDe: (c: string) => string; total: number; cantidad: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const actual = sel != null ? datos[sel] : null
  return (
    <div className="relative mx-auto h-52 w-full max-w-64" onMouseLeave={() => setSel(null)}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={datos}
            dataKey="monto"
            nameKey="categoria"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={1}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={false}
            onMouseEnter={(_, i) => setSel(i)}
            onClick={(_, i) => setSel((s) => (s === i ? null : i))}
          >
            {datos.map((d, i) => (
              <Cell key={d.categoria} fill={colorDe(d.categoria)} opacity={sel == null || sel === i ? 1 : 0.35} className="cursor-pointer outline-none" />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <b className="num text-lg">{fmtCLP(actual ? actual.monto : total)}</b>
        <span className="text-muted-foreground mx-auto max-w-32 text-xs leading-tight">
          {actual ? `${actual.categoria} · ${fmtPct(actual.pct)}` : `${cantidad} gastos`}
        </span>
      </div>
    </div>
  )
}

/** Gasto acumulado del mes contra el mes anterior. */
export function LineaAcumulado({ actual, anterior }: { actual: (number | null)[]; anterior: (number | null)[] }) {
  const dias = Math.max(actual.length, anterior.length)
  const datos = Array.from({ length: dias }, (_, i) => ({ dia: i + 1, actual: actual[i] ?? null, anterior: anterior[i] ?? null }))
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={datos} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="dia" {...ejes} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...ejes} width={44} tickFormatter={(v) => fmtCorto(v)} />
          <Tooltip content={(p) => <TooltipCaja {...p} titulo={(l) => 'Día ' + l} />} cursor={{ stroke: 'var(--border)' }} />
          <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12 }} />
          <Line name="Este mes" dataKey="actual" stroke="var(--primary)" strokeWidth={2.5} dot={false} type="monotone" connectNulls={false} isAnimationActive={false} />
          <Line name="Mes anterior" dataKey="anterior" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} type="monotone" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Ingresos y gastos por mes. */
export function BarrasMeses({ serie }: { serie: { ym: string; ingresos: number; gastos: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={serie} margin={{ left: 0, right: 8, top: 8 }} barGap={3}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="ym" {...ejes} tickFormatter={(v) => nombreMes(v, true)} />
          <YAxis {...ejes} width={44} tickFormatter={(v) => fmtCorto(v)} />
          <Tooltip content={(p) => <TooltipCaja {...p} titulo={(l) => nombreMes(String(l))} />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar name="Ingresos" dataKey="ingresos" fill="var(--income)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Bar name="Gastos" dataKey="gastos" fill="var(--expense)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
