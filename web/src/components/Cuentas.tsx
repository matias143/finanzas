// Tarjeta "Tus cuentas" (Inicio): saldo de cada cuenta y total. Permite indicar el saldo actual.
import { useState } from 'react'
import { ChevronRight, Pencil, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import { baseParaAhora, saldos } from '@/lib/saldos'
import { fechaCorta, fmtCLP, soloDigitos } from '@/lib/util'
import { cn } from '@/lib/utils'

function verCuenta(cuenta: string) {
  try {
    localStorage.setItem('filtro-cuenta', cuenta)
  } catch {
    /* sin almacenamiento */
  }
  location.hash = 'movimientos'
}

export function Cuentas() {
  const store = useStore()
  const cfg = store.state.config
  const { lista, total } = saldos(store.movimientos(), cfg)
  const [abierto, setAbierto] = useState(false)
  const [valores, setValores] = useState<Record<string, string>>({})
  const algunoConocido = lista.some((c) => c.conocido)

  const abrir = () => {
    setValores(Object.fromEntries(lista.map((c) => [c.cuenta, c.conocido ? fmtCLP(c.saldo) : ''])))
    setAbierto(true)
  }
  const guardar = async () => {
    const nuevos = { ...(cfg.saldos || {}) }
    let cambios = 0
    for (const c of lista) {
      const texto = valores[c.cuenta] ?? ''
      if (!texto.trim()) continue
      const negativo = texto.trim().startsWith('-')
      const monto = soloDigitos(texto) * (negativo ? -1 : 1)
      if (c.conocido && monto === Math.round(c.saldo)) continue
      nuevos[c.cuenta] = baseParaAhora(monto)
      cambios++
    }
    if (cambios) await store.guardarConfig({ saldos: nuevos })
    setAbierto(false)
    toast.success(cambios ? 'Saldos actualizados' : 'Sin cambios')
  }

  return (
    <>
      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Wallet className="size-4" /> Tus cuentas
          </CardTitle>
          <CardDescription>{algunoConocido ? <span className="num text-foreground text-lg font-semibold">{fmtCLP(total)}</span> : 'Indica cuánto tienes hoy en cada cuenta'}</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={abrir}>
              <Pencil /> {algunoConocido ? 'Ajustar' : 'Indicar saldos'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="divide-y">
          {lista
            .filter((c) => c.conocido || c.saldo !== 0)
            .map((c) => (
              <button key={c.cuenta} onClick={() => verCuenta(c.cuenta)} className="flex w-full items-center gap-2 py-2.5 text-left text-sm">
                <span className="min-w-0 flex-1 truncate">{c.cuenta}</span>
                {c.conocido ? (
                  <span className={cn('num font-semibold', c.saldo < 0 && 'text-expense')}>{fmtCLP(c.saldo)}</span>
                ) : (
                  <span className="text-muted-foreground text-xs">sin saldo inicial</span>
                )}
                <ChevronRight className="text-muted-foreground size-4" />
              </button>
            ))}
        </CardContent>
      </Card>

      <Drawer open={abierto} onOpenChange={setAbierto} repositionInputs={false}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Saldo actual de cada cuenta</DrawerTitle>
            <DrawerDescription>
              Escribe cuánto tienes hoy (lo ves en la app de cada banco). Desde ahora la app suma y resta cada movimiento. Deja vacío lo que no quieras
              seguir.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4">
            {lista.map((c) => (
              <div key={c.cuenta} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.cuenta}</div>
                  {c.desde && <div className="text-muted-foreground text-xs">ajustado el {fechaCorta(c.desde)}</div>}
                </div>
                <Input
                  inputMode="numeric"
                  placeholder="$0"
                  className="num w-40 text-right"
                  value={valores[c.cuenta] ?? ''}
                  onChange={(e) => {
                    const neg = e.target.value.trim().startsWith('-')
                    const d = soloDigitos(e.target.value)
                    setValores((v) => ({ ...v, [c.cuenta]: d ? (neg ? '-' : '') + fmtCLP(d) : neg ? '-' : '' }))
                  }}
                  aria-label={`Saldo de ${c.cuenta}`}
                />
              </div>
            ))}
          </div>
          <DrawerFooter className="pb-safe">
            <Button onClick={guardar}>Guardar saldos</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}
