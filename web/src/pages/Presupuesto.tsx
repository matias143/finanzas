import { useState } from 'react'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useStore } from '@/lib/store'
import { useUI } from '@/lib/ui'
import { presupuestos } from '@/lib/stats'
import { fmtCLP, fmtPct, soloDigitos } from '@/lib/util'

function CampoLimite({ categoria, limite }: { categoria: string; limite: number }) {
  const store = useStore()
  const [texto, setTexto] = useState(limite ? fmtCLP(limite) : '')
  const guardar = async () => {
    const valor = soloDigitos(texto)
    setTexto(valor ? fmtCLP(valor) : '')
    if (valor === limite) return
    const cats = store.state.config.categorias.map((c) => (c.nombre === categoria ? { ...c, presupuesto: valor } : c))
    await store.guardarConfig({ categorias: cats })
    toast.success('Presupuesto guardado')
  }
  return (
    <Input
      inputMode="numeric"
      placeholder="Sin límite"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onFocus={() => setTexto((t) => t.replace(/\D/g, ''))}
      onBlur={guardar}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="num h-9 w-32 text-right"
    />
  )
}

export function Presupuesto() {
  const store = useStore()
  const { mes } = useUI()
  const ps = presupuestos(store.movimientos(), mes, store.state.config.categorias)
  const conLimite = ps.filter((p) => p.limite)
  const totalLim = conLimite.reduce((a, p) => a + p.limite, 0)
  const totalGas = conLimite.reduce((a, p) => a + p.gastado, 0)

  return (
    <div className="space-y-3">
      {conLimite.length > 0 && (
        <Card className="py-5">
          <CardContent className="space-y-3 px-5">
            <div className="text-muted-foreground text-sm">Presupuesto del mes</div>
            <div className="num text-3xl font-bold tracking-tight">
              {fmtCLP(totalGas)} <span className="text-muted-foreground text-base font-medium">de {fmtCLP(totalLim)}</span>
            </div>
            <Progress
              value={(totalGas / totalLim) * 100}
              className="bg-muted"
              indicatorStyle={{ background: totalGas > totalLim ? 'var(--expense)' : 'var(--primary)' }}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Límite mensual por categoría</CardTitle>
          <CardDescription>Escribe un monto para fijar un límite. Déjalo vacío si no quieres límite.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {ps.map((p) => {
            const pct = p.pct ?? 0
            const color = pct >= 1 ? 'var(--expense)' : pct >= 0.8 ? 'var(--warning)' : p.color
            return (
              <div key={p.categoria} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
                  <span className="flex-1 text-sm font-medium">{p.categoria}</span>
                  <CampoLimite categoria={p.categoria} limite={p.limite} />
                </div>
                {p.limite > 0 && <Progress value={pct * 100} className="bg-muted" indicatorStyle={{ background: color }} />}
                <div className="text-muted-foreground num flex justify-between text-xs">
                  <span>Gastado {fmtCLP(p.gastado)}</span>
                  {p.limite > 0 && (
                    <span>
                      {fmtPct(p.pct)} · {p.limite - p.gastado >= 0 ? `quedan ${fmtCLP(p.limite - p.gastado)}` : `excedido ${fmtCLP(p.gastado - p.limite)}`}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
