// Vista previa de importación: mapeo de categorías y cuentas, y selección de movimientos.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { colorLibre } from '@/lib/colores'
import { comparar, construir, NUEVA, sugerirCategoria, sugerirCuenta, type ArchivoInterpretado, type EstadoImport } from '@/lib/importar'
import type { Categoria } from '@/lib/types'
import { fechaCorta, fechaLarga, fmtCLP } from '@/lib/util'
import { ir } from '@/hooks/use-ruta'
import { cn } from '@/lib/utils'

const CHIP: Record<EstadoImport, [string, string]> = {
  nuevo: ['Nuevo', 'text-primary'],
  completa: ['Completa categoría', 'text-warning'],
  duplicado: ['Ya existe', 'text-muted-foreground'],
  importado: ['Ya importado', 'text-muted-foreground'],
}

export function Importador({ nombre, datos, onClose }: { nombre: string; datos: ArchivoInterpretado; onClose: () => void }) {
  const store = useStore()
  const cfg = store.state.config
  const [abierto, setAbierto] = useState(true)

  const filas = useMemo(
    () => comparar(datos.filas, Object.values(store.state.movs), new Set(Object.keys(store.state.movs))).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    // Solo al abrir: la comparación no debe cambiar mientras eliges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos],
  )

  const grupos = useMemo(() => {
    const g = new Map<string, { tipo: 'gasto' | 'ingreso'; nombre: string; n: number; total: number }>()
    for (const r of filas) {
      if (r.tipo === 'traspaso' || !r.catOrigen) continue
      const k = r.tipo + '|' + r.catOrigen
      const x = g.get(k) || { tipo: r.tipo, nombre: r.catOrigen, n: 0, total: 0 }
      x.n++
      x.total += r.monto
      g.set(k, x)
    }
    return g
  }, [filas])
  const cuentasOrigen = useMemo(() => [...new Set(filas.flatMap((r) => [r.cuentaOrigen, r.cuentaDestino, r.cuentaPropia]).filter(Boolean) as string[])], [filas])

  const [mapaCat, setMapaCat] = useState<Record<string, string>>(() =>
    Object.fromEntries([...grupos.entries()].map(([k, g]) => [k, sugerirCategoria(g.nombre, g.tipo, cfg)])),
  )
  const [mapaCuenta, setMapaCuenta] = useState<Record<string, string>>(() => Object.fromEntries(cuentasOrigen.map((c) => [c, sugerirCuenta(c, cfg.cuentas)])))
  const [elegidas, setElegidas] = useState(() => new Set(filas.filter((r) => r.estado === 'nuevo' || r.estado === 'completa').map((r) => r.id)))

  const cuenta = (e: EstadoImport) => filas.filter((r) => r.estado === e).length
  const fechas = filas.map((r) => r.fecha).sort()
  const cerrar = (v: boolean) => {
    setAbierto(v)
    if (!v) setTimeout(onClose, 300)
  }

  const importar = async () => {
    const nuevasCats: Categoria[] = []
    const mapa: Record<string, string> = {}
    for (const [k, valor] of Object.entries(mapaCat)) {
      let cat = valor
      if (cat.startsWith(NUEVA)) {
        cat = cat.slice(NUEVA.length)
        if (!cfg.categorias.some((c) => c.nombre === cat) && !nuevasCats.some((c) => c.nombre === cat)) {
          const tipo = k.split('|')[0] as Categoria['tipo']
          nuevasCats.push({ nombre: cat, tipo, color: colorLibre([...cfg.categorias, ...nuevasCats].map((c) => c.color)), presupuesto: 0 })
        }
      }
      mapa[k] = cat
    }
    const nuevasCuentas = [...new Set(Object.values(mapaCuenta))].filter((c) => !cfg.cuentas.includes(c))
    if (nuevasCats.length || nuevasCuentas.length) {
      await store.guardarConfig({ categorias: [...cfg.categorias, ...nuevasCats], cuentas: [...cfg.cuentas, ...nuevasCuentas] })
    }
    const { nuevos, cambios } = construir(filas, mapa, mapaCuenta, elegidas, store.state.config.reglas)
    await store.guardarMovsEnLote([...nuevos, ...cambios])
    toast.success(`${nuevos.length} importados${cambios.length ? ` · ${cambios.length} categorías completadas` : ''}`)
    cerrar(false)
    ir('movimientos')
  }

  const n = elegidas.size
  return (
    <Drawer open={abierto} onOpenChange={cerrar}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Importar {datos.formato}</DrawerTitle>
          <DrawerDescription>
            {nombre} · {filas.length} movimientos del {fechaLarga(fechas[0]).toLowerCase()} al {fechaLarga(fechas.at(-1)!).toLowerCase()}
            {datos.omitidas ? ` · ${datos.omitidas} filas sin fecha o monto omitidas` : ''}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-5 overflow-y-auto px-4 pb-2">
          <div className="grid grid-cols-2 gap-3">
            <Card className="gap-0 py-3">
              <CardContent className="px-3.5">
                <div className="text-muted-foreground text-xs">Nuevos</div>
                <div className="num text-xl font-semibold">{cuenta('nuevo')}</div>
              </CardContent>
            </Card>
            <Card className="gap-0 py-3">
              <CardContent className="px-3.5">
                <div className="text-muted-foreground text-xs">Ya en la app</div>
                <div className="num text-xl font-semibold">{cuenta('duplicado') + cuenta('completa') + cuenta('importado')}</div>
                <div className="text-muted-foreground text-xs">{cuenta('completa') ? `${cuenta('completa')} sin categoría: se completa` : 'se omiten'}</div>
              </CardContent>
            </Card>
          </div>

          {grupos.size > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Categorías</h3>
              <p className="text-muted-foreground mb-1 text-xs">Cómo pasar las categorías del archivo a las tuyas.</p>
              <div className="divide-y">
                {[...grupos.entries()].map(([k, g]) => (
                  <div key={k} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{g.nombre}</div>
                      <div className="text-muted-foreground num text-xs">
                        {g.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} · {g.n} · {fmtCLP(g.total)}
                      </div>
                    </div>
                    <Select value={mapaCat[k]} onValueChange={(v) => setMapaCat((m) => ({ ...m, [k]: v }))}>
                      <SelectTrigger size="sm" className="w-[52%] shrink-0" data-mapa-cat={k}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NUEVA + g.nombre}>➕ Crear «{g.nombre}»</SelectItem>
                        <SelectSeparator />
                        {cfg.categorias
                          .filter((c) => c.tipo === g.tipo)
                          .map((c) => (
                            <SelectItem key={c.nombre} value={c.nombre}>
                              {c.nombre}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {cuentasOrigen.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Cuentas</h3>
              <div className="divide-y">
                {cuentasOrigen.map((c) => (
                  <div key={c} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-medium">{c}</div>
                    <Select value={mapaCuenta[c]} onValueChange={(v) => setMapaCuenta((m) => ({ ...m, [c]: v }))}>
                      <SelectTrigger size="sm" className="w-[52%] shrink-0" data-mapa-cuenta={c}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([...cfg.cuentas, c])].map((x) => (
                          <SelectItem key={x} value={x}>
                            {x === c && !cfg.cuentas.includes(c) ? `➕ ${x}` : x}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>
          )}

          <details className="group">
            <summary className="text-primary cursor-pointer py-1 text-sm">Ver movimientos ({filas.length})</summary>
            <div className="divide-y">
              {filas.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 py-2.5" data-fila-imp>
                  <Checkbox
                    checked={elegidas.has(r.id)}
                    disabled={r.estado === 'importado'}
                    onCheckedChange={(v) =>
                      setElegidas((s) => {
                        const x = new Set(s)
                        if (v) x.add(r.id)
                        else x.delete(r.id)
                        return x
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {r.tipo === 'traspaso' ? `Traspaso ${r.cuentaOrigen || ''} → ${r.cuentaDestino || '?'}` : r.descripcion || r.catOrigen || 'Sin descripción'}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {fechaCorta(r.fecha)} · <span className={CHIP[r.estado][1]}>{CHIP[r.estado][0]}</span>
                      {r.existente ? ` · ${r.existente.descripcion}` : ''}
                    </span>
                  </span>
                  <span className={cn('num text-sm font-semibold', r.tipo === 'ingreso' && 'text-income', r.tipo === 'traspaso' && 'text-muted-foreground')}>
                    {r.tipo === 'gasto' ? '-' : r.tipo === 'ingreso' ? '+' : ''}
                    {fmtCLP(r.monto)}
                  </span>
                </label>
              ))}
            </div>
          </details>
        </div>

        <DrawerFooter className="pb-safe">
          <Button onClick={importar} disabled={!n} id="imp-ok">
            {n ? `Importar ${n} movimiento${n === 1 ? '' : 's'}` : 'Nada que importar'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
