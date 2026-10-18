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

  const q = normalizar(busqueda)
  let lista = store.movimientos().filter((m) => m.fecha?.startsWith(mes))
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
            <span>Neto {fmtCLP(neto)}</span>
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
          No hay movimientos {q || filtro !== 'todos' ? 'con ese filtro ' : ''}en {nombreMes(mes)}.
        </div>
      )}
    </div>
  )
}
