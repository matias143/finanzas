import { ArrowDownRight, ArrowUpRight, CalendarDays, PiggyBank, Repeat } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { BarrasMeses, DonaCategorias, LineaAcumulado } from '@/components/charts'
import { useStore } from '@/lib/store'
import { useUI } from '@/lib/ui'
import { colorDe } from '@/lib/colores'
import { acumuladoDiario, ahorro, compararConAnterior, hormiga, presupuestos, recurrentes, resumenMes, serieMeses } from '@/lib/stats'
import { fmtCLP, fmtPct, hoy, nombreMes, sumar, sumarMes } from '@/lib/util'
import { cn } from '@/lib/utils'

function Kpi({ titulo, valor, detalle, className }: { titulo: string; valor: string; detalle?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('gap-1 py-3', className)}>
      <CardContent className="px-3.5">
        <div className="text-muted-foreground text-xs">{titulo}</div>
        <div className="num mt-0.5 text-xl font-semibold tracking-tight">{valor}</div>
        {detalle && <div className="text-muted-foreground mt-0.5 text-xs">{detalle}</div>}
      </CardContent>
    </Card>
  )
}

export function BarraPresupuesto({ p }: { p: ReturnType<typeof presupuestos>[number] }) {
  const pct = p.pct ?? 0
  const color = pct >= 1 ? 'var(--expense)' : pct >= 0.8 ? 'var(--warning)' : p.color
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
        <span className="flex-1 font-medium">{p.categoria}</span>
        <span className="num text-muted-foreground">{fmtPct(p.pct)}</span>
      </div>
      <Progress value={pct * 100} className="bg-muted" indicatorStyle={{ background: color }} />
      <div className="text-muted-foreground num flex justify-between text-xs">
        <span>Gastado {fmtCLP(p.gastado)}</span>
        <span>{p.limite - p.gastado >= 0 ? `Quedan ${fmtCLP(p.limite - p.gastado)}` : `Excedido ${fmtCLP(p.gastado - p.limite)}`}</span>
      </div>
    </div>
  )
}

/** "▲ 12% más" en rojo (gastaste más) o "▼ 8% menos" en verde (gastaste menos). */
function Variacion({ v, className }: { v: number | null; className?: string }) {
  if (v == null) return <span className={cn('text-muted-foreground', className)}>sin datos</span>
  if (Math.round(v * 100) === 0) return <span className={cn('text-muted-foreground', className)}>igual</span>
  return (
    <span className={cn('num font-semibold', v > 0 ? 'text-expense' : 'text-income', className)}>
      {v > 0 ? '▲' : '▼'} {fmtPct(Math.abs(v))} {v > 0 ? 'más' : 'menos'}
    </span>
  )
}

function DosBarras({ filas }: { filas: { etiqueta: string; valor: number; color: string }[] }) {
  const max = Math.max(...filas.map((f) => f.valor), 1)
  return (
    <div className="space-y-1.5">
      {filas.map((f) => (
        <div key={f.etiqueta} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
          <span className="text-muted-foreground truncate capitalize">{f.etiqueta}</span>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div className="h-full rounded-full" style={{ width: `${(f.valor / max) * 100}%`, background: f.color }} />
          </div>
          <span className="num w-20 text-right">{fmtCLP(f.valor)}</span>
        </div>
      ))}
    </div>
  )
}

function Comparacion({ mes, proyeccion }: { mes: string; proyeccion: number }) {
  const store = useStore()
  const c = compararConAnterior(store.movimientos(), mes, hoy())
  if (!c.hayDatosAnteriores) return null
  const este = nombreMes(mes, true)
  const ant = nombreMes(c.anteriorYm, true)
  const antLargo = nombreMes(c.anteriorYm).split(' ')[0].toLowerCase()
  const varProy = c.anteriorTotal > 0 ? (proyeccion - c.anteriorTotal) / c.anteriorTotal : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <CalendarDays className="size-4" /> Comparado con {antLargo}
        </CardTitle>
        <CardDescription>Cuánto has gastado contra el mes anterior</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {c.esMesActual && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">Al día {c.dia}</span>
              <Variacion v={c.varAFecha} className="text-sm" />
            </div>
            <DosBarras
              filas={[
                { etiqueta: este, valor: c.actualAFecha, color: 'var(--primary)' },
                { etiqueta: `${ant} 1–${c.dia}`, valor: c.anteriorAFecha, color: 'var(--muted-foreground)' },
              ]}
            />
            <p className="text-muted-foreground text-xs">
              Del 1 al {c.dia} de cada mes:{' '}
              {c.actualAFecha >= c.anteriorAFecha ? `${fmtCLP(c.actualAFecha - c.anteriorAFecha)} más` : `${fmtCLP(c.anteriorAFecha - c.actualAFecha)} menos`} que
              en {antLargo} a la misma fecha.
            </p>
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">
              Mes completo {c.esMesActual && <span className="text-muted-foreground text-xs font-normal">· proyectado</span>}
            </span>
            <Variacion v={c.esMesActual ? varProy : c.varTotal} className="text-sm" />
          </div>
          {c.esMesActual ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Llevas el <b className="text-foreground num">{fmtPct(c.actualTotal / c.anteriorTotal)}</b> de lo que gastaste en {antLargo}
                </span>
              </div>
              <Progress
                value={(c.actualTotal / c.anteriorTotal) * 100}
                className="bg-muted"
                indicatorStyle={{ background: c.actualTotal > c.anteriorTotal ? 'var(--expense)' : 'var(--primary)' }}
              />
              <p className="text-muted-foreground num text-xs">
                {antLargo.charAt(0).toUpperCase() + antLargo.slice(1)} cerró en {fmtCLP(c.anteriorTotal)} · a este ritmo cerrarías en {fmtCLP(proyeccion)}
              </p>
            </>
          ) : (
            <DosBarras
              filas={[
                { etiqueta: este, valor: c.actualTotal, color: 'var(--primary)' },
                { etiqueta: ant, valor: c.anteriorTotal, color: 'var(--muted-foreground)' },
              ]}
            />
          )}
        </section>

        {c.categorias.length > 0 && (
          <section>
            <div className="mb-1 text-sm font-medium">Dónde cambió más {c.esMesActual && <span className="text-muted-foreground text-xs font-normal">· a esta fecha</span>}</div>
            <ul className="divide-y">
              {c.categorias.map((x) => (
                <li key={x.categoria} className="flex items-center gap-2.5 py-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colorDe(x.categoria) }} />
                  <span className="min-w-0 flex-1 truncate">{x.categoria}</span>
                  <span className={cn('num', x.diferencia > 0 ? 'text-expense' : 'text-income')}>
                    {x.diferencia > 0 ? '+' : '-'}
                    {fmtCLP(Math.abs(x.diferencia))}
                  </span>
                  <span className="num text-muted-foreground w-16 text-right text-xs">
                    {x.variacion == null ? 'nuevo' : `${x.variacion > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(x.variacion))}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

export function Inicio() {
  const store = useStore()
  const { mes } = useUI()
  const movs = store.movimientos()
  const cfg = store.state.config

  if (!movs.length) {
    return (
      <Card className="mt-2 text-center">
        <CardHeader>
          <CardTitle className="text-lg">Bienvenido a tus finanzas</CardTitle>
          <CardDescription>
            Agrega tu primer movimiento con el botón <b>+</b>, o conecta tu Google Sheet en{' '}
            <a href="#ajustes" className="text-primary underline underline-offset-4">
              Ajustes
            </a>{' '}
            para sincronizar y leer tus correos.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const h = hoy()
  const r = resumenMes(movs, mes, h)
  const hor = hormiga(movs, mes, cfg.umbralHormiga)
  const rec = recurrentes(movs, mes)
  const alertas = presupuestos(movs, mes, cfg.categorias).filter((p) => p.limite && (p.pct ?? 0) >= 0.8)
  const aho = ahorro(movs, mes, cfg.patronAhorro)

  return (
    <div className="space-y-3">
      <Card className="gap-3 py-5">
        <CardContent className="px-5">
          <div className="text-muted-foreground text-sm">Balance del mes</div>
          <div className={cn('num mt-0.5 mb-4 text-4xl font-bold tracking-tight', r.balance >= 0 ? 'text-income' : 'text-expense')}>{fmtCLP(r.balance)}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/60 rounded-lg px-3 py-2.5">
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <ArrowUpRight className="text-income size-3.5" /> Ingresos
              </div>
              <div className="num text-income text-lg font-semibold">{fmtCLP(r.ingresos)}</div>
            </div>
            <div className="bg-muted/60 rounded-lg px-3 py-2.5">
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <ArrowDownRight className="text-expense size-3.5" /> Gastos
              </div>
              <div className="num text-expense text-lg font-semibold">{fmtCLP(r.gastos)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Kpi titulo="Tasa de ahorro" valor={fmtPct(r.tasaAhorro)} detalle="del ingreso del mes" />
        <Kpi titulo="Gasto diario" valor={fmtCLP(r.promDiario)} detalle="promedio" />
        <Kpi
          titulo={r.esMesActual ? 'Proyección a fin de mes' : 'Gasto total'}
          valor={fmtCLP(r.proyeccion)}
          detalle={r.esMesActual ? 'estimado de gasto al cierre' : 'gastos del mes'}
        />
        <Kpi titulo="Gastos hormiga" valor={fmtCLP(hor.total)} detalle={`${hor.cantidad} compras ≤ ${fmtCLP(cfg.umbralHormiga)}`} />
      </div>

      <Comparacion mes={mes} proyeccion={r.proyeccion} />

      {(aho.total !== 0 || aho.mes !== 0) && (
        <Card className="border-primary/20 bg-primary/10 gap-0 py-3.5">
          <CardContent className="grid grid-cols-2 gap-3 px-4">
            <div>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <PiggyBank className="size-3.5" /> Ahorro este mes
              </div>
              <div className="num text-income text-xl font-semibold">{fmtCLP(aho.mes)}</div>
              <div className="text-muted-foreground text-xs">{r.ingresos ? `${fmtPct(aho.mes / r.ingresos)} de tus ingresos` : 'traspasos a tu ahorro'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Ahorro acumulado</div>
              <div className="num text-xl font-semibold">{fmtCLP(aho.total)}</div>
              <div className="text-muted-foreground text-xs">total traspasado</div>
            </div>
          </CardContent>
        </Card>
      )}

      {alertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Presupuestos en alerta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {alertas.map((p) => (
              <BarraPresupuesto key={p.categoria} p={p} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gasto por categoría</CardTitle>
          <CardDescription>Toca un color para ver el detalle</CardDescription>
        </CardHeader>
        <CardContent>
          {r.porCategoria.length ? (
            <>
              <DonaCategorias datos={r.porCategoria} colorDe={colorDe} total={r.gastos} cantidad={r.cantidadGastos} />
              <ul className="mt-4 divide-y">
                {r.porCategoria.map((c) => (
                  <li key={c.categoria} className="flex items-center gap-2.5 py-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colorDe(c.categoria) }} />
                    <span className="flex-1 truncate">{c.categoria}</span>
                    <span className="num">{fmtCLP(c.monto)}</span>
                    <span className="num text-muted-foreground w-10 text-right text-xs">{fmtPct(c.pct)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Sin gastos este mes.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ritmo de gasto</CardTitle>
          <CardDescription>Acumulado del mes contra el mes anterior</CardDescription>
        </CardHeader>
        <CardContent className="pl-1">
          <LineaAcumulado actual={acumuladoDiario(movs, mes, h)} anterior={acumuladoDiario(movs, sumarMes(mes, -1), h)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Últimos 6 meses</CardTitle>
        </CardHeader>
        <CardContent className="pl-1">
          <BarrasMeses serie={serieMeses(movs, mes, 6)} />
        </CardContent>
      </Card>

      {rec.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Repeat className="size-4" /> Gastos recurrentes
            </CardTitle>
            <CardDescription>Posibles suscripciones · aprox. {fmtCLP(sumar(rec))} al mes</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {rec.map((x) => (
                <li key={x.descripcion} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{x.descripcion}</span>
                    <span className="text-muted-foreground text-xs">
                      {x.categoria} · {x.meses} de 6 meses
                    </span>
                  </span>
                  <span className="num shrink-0">{fmtCLP(x.monto)}/mes</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
