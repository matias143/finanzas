import { useState } from 'react'
import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/lib/store'
import { useUI } from '@/lib/ui'
import { colorDe } from '@/lib/colores'
import type { Movimiento } from '@/lib/types'
import { fechaLarga, fmtCLP, nombreMes, normalizar, sumar } from '@/lib/util'
import { cn } from '@/lib/utils'

const ETIQUETA_ORIGEN: Record<string, string> = { gmail: 'correo', notif: 'notificación', csv: 'cartola', importado: 'importado' }

function FilaMov({ m, onClick }: { m: Movimiento; onClick: () => void }) {
  const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '-' : ''
  const inicial = (m.descripcion || m.categoria || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <button onClick={onClick} className="hover:bg-accent/50 flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors">
      <span
        className="grid size-9 shrink-0 place-content-center rounded-lg text-sm font-bold text-white"
        style={{ background: m.tipo === 'traspaso' ? 'var(--muted-foreground)' : colorDe(m.categoria) }}
      >
        {inicial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{m.descripcion || m.categoria || 'Sin descripción'}</span>
          {m.origen && m.origen !== 'manual' && (
            <Badge variant="secondary" className="bg-primary/15 text-primary px-1.5 py-0 text-[10px]">
              {ETIQUETA_ORIGEN[m.origen] || m.origen}
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {m.tipo === 'traspaso' ? 'Traspaso' : m.categoria || 'Sin categoría'} · {m.cuenta}
        </span>
      </span>
      <span className={cn('num shrink-0 font-semibold', m.tipo === 'ingreso' && 'text-income', m.tipo === 'traspaso' && 'text-muted-foreground')}>
        {signo}
        {fmtCLP(m.monto)}
      </span>
    </button>
  )
}

export function Movimientos() {
  const store = useStore()
  const { mes, abrirEditor } = useUI()
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  // La cuenta elegida se recuerda en este dispositivo.
  const [cuenta, setCuentaState] = useState(() => {
    try {
      return localStorage.getItem('filtro-cuenta') || ''
    } catch {
      return ''
    }
  })
  const setCuenta = (c: string) => {
    setCuentaState(c)
    try {
      localStorage.setItem('filtro-cuenta', c)
    } catch {
      /* sin almacenamiento */
    }
  }

  const q = normalizar(busqueda)
  const delMes = store.movimientos().filter((m) => m.fecha?.startsWith(mes))
  // Cuentas: las configuradas y cualquier otra que aparezca en los movimientos
  const cuentas = [...new Set([...store.state.config.cuentas, ...store.movimientos().map((m) => m.cuenta)].filter(Boolean))]
  const cuentaActiva = cuentas.includes(cuenta) ? cuenta : ''
  let lista = delMes
  if (cuentaActiva) lista = lista.filter((m) => m.cuenta === cuentaActiva)
  if (filtro !== 'todos') lista = lista.filter((m) => m.tipo === filtro)
  if (q) lista = lista.filter((m) => normalizar(`${m.descripcion} ${m.categoria} ${m.cuenta} ${m.notas}`).includes(q))
  lista.sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')))

  const porDia = new Map<string, Movimiento[]>()
  for (const m of lista) {
    if (!porDia.has(m.fecha)) porDia.set(m.fecha, [])
    porDia.get(m.fecha)!.push(m)
  }
  const neto = sumar(lista.filter((m) => m.tipo === 'ingreso')) - sumar(lista.filter((m) => m.tipo === 'gasto'))

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input type="search" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="bg-card pl-9" />
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filtrar por cuenta">
        {['', ...cuentas.filter((c) => c === cuentaActiva || delMes.some((m) => m.cuenta === c))].map((c) => {
          const n = c ? delMes.filter((m) => m.cuenta === c).length : delMes.length
          const activa = c === cuentaActiva
          return (
            <button
              key={c || 'todas'}
              onClick={() => setCuenta(c)}
              aria-pressed={activa}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                activa ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {c || 'Todas las cuentas'}
              <span className={cn('num text-xs', activa ? 'opacity-80' : 'opacity-60')}>{n}</span>
            </button>
          )
        })}
      </div>
      <Tabs value={filtro} onValueChange={setFiltro}>
        <TabsList className="w-full">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="gasto">Gastos</TabsTrigger>
          <TabsTrigger value="ingreso">Ingresos</TabsTrigger>
          <TabsTrigger value="traspaso">Traspasos</TabsTrigger>
        </TabsList>
      </Tabs>

      {lista.length ? (
        <>
          <div className="text-muted-foreground num flex justify-between px-1 text-xs">
            <span>{lista.length} movimientos</span>
            <span>
              <span className="text-expense">-{fmtCLP(sumar(lista.filter((m) => m.tipo === 'gasto')))}</span>
              {' · '}
              <span className="text-income">+{fmtCLP(sumar(lista.filter((m) => m.tipo === 'ingreso')))}</span>
              {' · '}Neto {fmtCLP(neto)}
            </span>
          </div>
          {[...porDia].map(([fecha, ms]) => (
            <section key={fecha}>
              <h3 className="text-muted-foreground mb-1.5 px-1 text-xs">{fechaLarga(fecha)}</h3>
              <div className="bg-card divide-y overflow-hidden rounded-xl border shadow-sm">
                {ms.map((m) => (
                  <FilaMov key={m.id} m={m} onClick={() => abrirEditor(m)} />
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        <div className="text-muted-foreground py-12 text-center text-sm">
          <b className="text-foreground mb-1 block text-base">Nada por aquí</b>
          No hay movimientos {q || filtro !== 'todos' || cuentaActiva ? 'con ese filtro ' : ''}en {nombreMes(mes)}.
        </div>
      )}
    </div>
  )
}
