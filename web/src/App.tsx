import { useCallback, useEffect, useState } from 'react'
import { ChartColumn, ChevronLeft, ChevronRight, List, Plus, SlidersHorizontal, Target } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { EditorMovimiento } from '@/components/EditorMovimiento'
import { Inicio } from '@/pages/Inicio'
import { Movimientos } from '@/pages/Movimientos'
import { Presupuesto } from '@/pages/Presupuesto'
import { Ajustes } from '@/pages/Ajustes'
import { useRuta, type Ruta } from '@/hooks/use-ruta'
import { store, useStore } from '@/lib/store'
import { repararColores } from '@/lib/colores'
import { UIContext } from '@/lib/ui'
import type { Movimiento } from '@/lib/types'
import { mesActual, nombreMes, sumarMes } from '@/lib/util'
import { cn } from '@/lib/utils'

function EstadoSync() {
  const s = useStore().state
  const pend = Object.keys(s.pendientes).length
  const texto = {
    local: 'Solo en este dispositivo',
    sincronizando: 'Sincronizando…',
    ok: pend ? `${pend} por enviar` : 'Sincronizado',
    error: 'Sin conexión · tocar para reintentar',
  }[s.estado]
  const color = { local: 'bg-muted-foreground', sincronizando: 'bg-warning', ok: 'bg-income', error: 'bg-destructive' }[s.estado]
  return (
    <button
      className={cn('text-muted-foreground flex items-center gap-1.5 text-xs', s.estado === 'error' && 'text-destructive')}
      onClick={async () => {
        if (!store.conectado()) {
          location.hash = 'ajustes'
          return
        }
        await store.sync()
        if (store.state.estado === 'ok') toast.success('Sincronizado')
        else toast.error('Error: ' + store.state.error)
      }}
    >
      <span className={cn('size-1.5 rounded-full', color)} />
      {texto}
    </button>
  )
}

const NAV: { ruta: Ruta; texto: string; icono: typeof List }[] = [
  { ruta: 'inicio', texto: 'Inicio', icono: ChartColumn },
  { ruta: 'movimientos', texto: 'Movimientos', icono: List },
  { ruta: 'presupuesto', texto: 'Presupuesto', icono: Target },
  { ruta: 'ajustes', texto: 'Ajustes', icono: SlidersHorizontal },
]

export default function App() {
  const ruta = useRuta()
  const [mes, setMes] = useState(mesActual)
  const [editor, setEditor] = useState<{ abierto: boolean; mov?: Movimiento }>({ abierto: false })
  const abrirEditor = useCallback((mov?: Movimiento) => setEditor({ abierto: true, mov }), [])

  useEffect(() => {
    // Atajo del ícono (mantener presionado → "Nuevo gasto")
    if (location.hash === '#nuevo') {
      history.replaceState(null, '', '#inicio')
      abrirEditor()
    }
    store.sync().then(repararColores)
    // Sincronizar al volver a la app y cada 5 minutos mientras está abierta.
    const alVolver = () => !document.hidden && store.sync()
    document.addEventListener('visibilitychange', alVolver)
    const t = setInterval(alVolver, 5 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(t)
    }
  }, [abrirEditor])

  useEffect(() => window.scrollTo(0, 0), [ruta])

  const conMes = ruta !== 'ajustes'
  const [izq, der] = NAV.length === 4 ? [NAV.slice(0, 2), NAV.slice(2)] : [NAV, []]

  return (
    <UIContext.Provider value={{ mes, setMes, abrirEditor }}>
      <header className="pt-safe bg-background/85 sticky top-0 z-30 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between px-3 py-2.5">
          <Button variant="outline" size="icon" aria-label="Mes anterior" className={cn(!conMes && 'invisible')} onClick={() => setMes(sumarMes(mes, -1))}>
            <ChevronLeft />
          </Button>
          <div className="flex flex-col items-center">
            <h1 className="font-semibold tracking-tight">{conMes ? nombreMes(mes) : 'Ajustes'}</h1>
            <EstadoSync />
          </div>
          <Button variant="outline" size="icon" aria-label="Mes siguiente" className={cn(!conMes && 'invisible')} onClick={() => setMes(sumarMes(mes, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-1 pb-28">
        {ruta === 'inicio' && <Inicio />}
        {ruta === 'movimientos' && <Movimientos />}
        {ruta === 'presupuesto' && <Presupuesto />}
        {ruta === 'ajustes' && <Ajustes />}
      </main>

      <nav className="pb-safe bg-card fixed inset-x-0 bottom-0 z-30 border-t" aria-label="Secciones">
        <div className="mx-auto flex max-w-xl items-center justify-around px-2 py-1.5">
          {[...izq, null, ...der].map((n) =>
            n ? (
              <a
                key={n.ruta}
                href={'#' + n.ruta}
                className={cn('flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px]', ruta === n.ruta ? 'text-primary font-semibold' : 'text-muted-foreground')}
              >
                <n.icono className="size-5" />
                {n.texto}
              </a>
            ) : (
              <Button key="fab" size="icon" aria-label="Agregar movimiento" className="-mt-6 size-14 rounded-2xl shadow-lg" onClick={() => abrirEditor()}>
                <Plus className="size-7" />
              </Button>
            ),
          )}
        </div>
      </nav>

      <EditorMovimiento
        abierto={editor.abierto}
        mov={editor.mov}
        mes={mes}
        onOpenChange={(v) => setEditor((e) => ({ ...e, abierto: v }))}
        onGuardado={(f) => f.slice(0, 7) !== mes && setMes(f.slice(0, 7))}
      />
      <Toaster position="top-center" richColors closeButton />
    </UIContext.Provider>
  )
}
