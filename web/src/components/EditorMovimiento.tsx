// Hoja inferior para crear o editar un movimiento.
import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useStore } from '@/lib/store'
import type { Movimiento, Tipo } from '@/lib/types'
import { categorizar, fmtCLP, hoy, mesActual, soloDigitos } from '@/lib/util'
import { cn } from '@/lib/utils'

interface Props {
  abierto: boolean
  mov?: Movimiento
  mes: string
  onOpenChange: (v: boolean) => void
  onGuardado: (fecha: string) => void
}

export function EditorMovimiento({ abierto, mov, mes, onOpenChange, onGuardado }: Props) {
  const store = useStore()
  const cfg = store.state.config
  const [tipo, setTipo] = useState<Tipo>('gasto')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [notas, setNotas] = useState('')
  const categoriaManual = useRef(false)
  const montoRef = useRef<HTMLInputElement>(null)

  const categoriasDe = (t: Tipo) => cfg.categorias.filter((c) => c.tipo === t)
  const porDefecto = (t: Tipo, desc: string) => {
    if (t === 'traspaso') return 'Traspaso'
    const cats = categoriasDe(t)
    const auto = categorizar(desc, cfg.reglas)
    if (auto && cats.some((c) => c.nombre === auto)) return auto
    return cats.find((c) => /^otros/i.test(c.nombre))?.nombre || cats[0]?.nombre || ''
  }

  // Cargar datos al abrir
  useEffect(() => {
    if (!abierto) return
    if (mov) {
      setTipo(mov.tipo)
      setMonto(mov.monto ? fmtCLP(mov.monto) : '')
      setDescripcion(mov.descripcion || '')
      setCategoria(mov.categoria || porDefecto(mov.tipo, mov.descripcion))
      setCuenta(mov.cuenta || cfg.cuentas[0])
      setFecha(mov.fecha)
      setNotas(mov.notas || '')
      categoriaManual.current = true
    } else {
      setTipo('gasto')
      setMonto('')
      setDescripcion('')
      setCategoria(porDefecto('gasto', ''))
      setCuenta(cfg.cuentas[0])
      setFecha(mes === mesActual() ? hoy() : `${mes}-01`)
      setNotas('')
      categoriaManual.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, mov])

  const cambiarTipo = (t: string) => {
    const nt = t as Tipo
    setTipo(nt)
    if (nt === 'traspaso' || !categoriaManual.current || !categoriasDe(nt).some((c) => c.nombre === categoria)) {
      setCategoria(porDefecto(nt, descripcion))
      categoriaManual.current = false
    }
  }
  const cambiarDescripcion = (d: string) => {
    setDescripcion(d)
    if (categoriaManual.current || tipo === 'traspaso') return
    const auto = categorizar(d, cfg.reglas)
    if (auto && store.categoria(auto)?.tipo === tipo) setCategoria(auto)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const valor = soloDigitos(monto)
    if (!valor) {
      montoRef.current?.focus()
      return toast.error('Ingresa un monto')
    }
    const f = fecha || hoy()
    await store.guardarMov({
      ...(mov ? { id: mov.id } : {}),
      tipo,
      monto: valor,
      fecha: f,
      descripcion: descripcion.trim(),
      categoria: tipo === 'traspaso' ? 'Traspaso' : categoria,
      cuenta,
      notas: notas.trim(),
    })
    onOpenChange(false)
    onGuardado(f)
    toast.success(mov ? 'Cambios guardados' : 'Movimiento agregado')
  }

  const eliminar = async () => {
    if (!mov) return
    await store.eliminarMov(mov.id)
    onOpenChange(false)
    toast.success('Movimiento eliminado')
  }

  const cats = categoriasDe(tipo)
  const cuentas = [...new Set([...cfg.cuentas, cuenta].filter(Boolean))]

  return (
    <Drawer open={abierto} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <form onSubmit={guardar} className="flex min-h-0 flex-col">
          <DrawerHeader className="text-left">
            <DrawerTitle>{mov ? 'Editar movimiento' : 'Nuevo movimiento'}</DrawerTitle>
            <DrawerDescription className="sr-only">Monto, categoría, cuenta y fecha</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4">
            <Tabs value={tipo} onValueChange={cambiarTipo}>
              <TabsList className="w-full">
                <TabsTrigger value="gasto" className="data-[state=active]:text-expense">
                  Gasto
                </TabsTrigger>
                <TabsTrigger value="ingreso" className="data-[state=active]:text-income">
                  Ingreso
                </TabsTrigger>
                <TabsTrigger value="traspaso">Traspaso</TabsTrigger>
              </TabsList>
            </Tabs>
            <input
              ref={montoRef}
              inputMode="numeric"
              placeholder="$0"
              aria-label="Monto"
              value={monto}
              autoFocus={!mov}
              onChange={(e) => {
                const d = soloDigitos(e.target.value)
                setMonto(d ? fmtCLP(d) : '')
              }}
              className={cn(
                'num w-full bg-transparent py-1 text-center text-4xl font-bold tracking-tight outline-none',
                tipo === 'gasto' && 'text-expense',
                tipo === 'ingreso' && 'text-income',
              )}
            />
            <div className="space-y-1.5">
              <Label htmlFor="e-desc">Descripción</Label>
              <Input id="e-desc" value={descripcion} onChange={(e) => cambiarDescripcion(e.target.value)} placeholder="Ej: Lider, Uber, arriendo…" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                {tipo === 'traspaso' ? (
                  <Input value="Traspaso" disabled />
                ) : (
                  <Select
                    value={categoria}
                    onValueChange={(v) => {
                      setCategoria(v)
                      categoriaManual.current = true
                    }}
                  >
                    <SelectTrigger id="e-cat">
                      <SelectValue placeholder="Elegir" />
                    </SelectTrigger>
                    <SelectContent>
                      {!cats.some((c) => c.nombre === categoria) && categoria && <SelectItem value={categoria}>{categoria}</SelectItem>}
                      {cats.map((c) => (
                        <SelectItem key={c.nombre} value={c.nombre}>
                          <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} />
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Cuenta</Label>
                <Select value={cuenta} onValueChange={setCuenta}>
                  <SelectTrigger id="e-cuenta">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentas.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-fecha">Fecha</Label>
              <Input id="e-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-notas">Notas</Label>
              <Input id="e-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DrawerFooter className="pb-safe flex-row">
            {mov && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" className="text-destructive">
                    <Trash2 /> Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {mov.descripcion || mov.categoria} · {fmtCLP(mov.monto)}. Se borra también de tu planilla.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={eliminar} className="bg-destructive hover:bg-destructive/90 text-white">
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="submit" className="flex-1">
              Guardar
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
