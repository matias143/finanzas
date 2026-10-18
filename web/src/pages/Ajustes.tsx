import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Plus, RefreshCw, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Importador } from '@/components/Importador'
import { CONFIG_DEFAULT, useStore } from '@/lib/store'
import { colorLibre } from '@/lib/colores'
import { interpretar, leerArchivo, type ArchivoInterpretado } from '@/lib/importar'
import type { Categoria, Regla } from '@/lib/types'
import { categorizar, hoy, normalizarPatron, soloDigitos } from '@/lib/util'

function Conexion() {
  const store = useStore()
  const s = store.state
  const [url, setUrl] = useState(s.api.url)
  const [token, setToken] = useState(s.api.token)
  const [ocupado, setOcupado] = useState(false)
  const pendientes = Object.keys(s.pendientes).length

  const guardar = async () => {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url.trim())) return toast.error('La URL debe ser la de Apps Script y terminar en /exec')
    if (!token.trim()) return toast.error('Falta la clave')
    setOcupado(true)
    await store.guardarApi(url, token)
    setOcupado(false)
    if (store.state.estado === 'ok') toast.success('Conectado y sincronizado')
    else toast.error('No se pudo conectar: ' + store.state.error)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexión con Google</CardTitle>
        <CardDescription>
          Tus datos se guardan en una Google Sheet privada tuya. Pega la URL del despliegue de Apps Script y tu clave (las muestra la función{' '}
          <code className="bg-muted rounded px-1 text-xs">configurar</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="api-url">URL de la API</Label>
          <Input id="api-url" placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="api-token">Clave</Label>
          <Input id="api-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        <p className="text-muted-foreground text-xs">
          {s.ultimaSync ? `Última sincronización: ${new Date(s.ultimaSync).toLocaleString('es-CL')}` : 'Aún sin sincronizar.'}
          {pendientes > 0 && ` · ${pendientes} cambios por enviar`}
          {s.estado === 'error' && <span className="text-destructive block">Error: {s.error}</span>}
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={guardar} disabled={ocupado} className="w-full">
          <RefreshCw className={ocupado ? 'animate-spin' : ''} /> Guardar y sincronizar
        </Button>
      </CardFooter>
    </Card>
  )
}

function Categorias() {
  const store = useStore()
  const [filas, setFilas] = useState(() => store.state.config.categorias.map((c) => ({ ...c, original: c.nombre })))
  const cambiar = (i: number, cambios: Partial<Categoria>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...cambios } : x)))

  const guardar = async () => {
    const cats: Categoria[] = []
    const renombres = new Map<string, string>()
    for (const f of filas) {
      const nombre = f.nombre.trim()
      if (!nombre) continue
      if (cats.some((c) => c.nombre === nombre)) return toast.error(`Categoría repetida: ${nombre}`)
      if (f.original && f.original !== nombre) renombres.set(f.original, nombre)
      cats.push({ nombre, tipo: f.tipo, color: f.color, presupuesto: f.presupuesto || 0 })
    }
    if (!cats.length) return toast.error('Debe haber al menos una categoría')
    const reglas = store.state.config.reglas.map((r) => ({ ...r, categoria: renombres.get(r.categoria) || r.categoria }))
    await store.guardarConfig({ categorias: cats, reglas })
    if (renombres.size) {
      const cambios = store
        .movimientos()
        .filter((m) => renombres.has(m.categoria))
        .map((m) => ({ id: m.id, categoria: renombres.get(m.categoria) }))
      if (cambios.length) await store.guardarMovsEnLote(cambios)
    }
    setFilas(cats.map((c) => ({ ...c, original: c.nombre })))
    toast.success('Categorías guardadas')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorías</CardTitle>
        <CardDescription>Toca el color para cambiarlo. Si renombras una, sus movimientos se actualizan.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {filas.map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-2">
            <input
              type="color"
              value={c.color}
              onChange={(e) => cambiar(i, { color: e.target.value })}
              className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
              aria-label="Color"
            />
            <Input value={c.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} placeholder="Nombre" className="h-9" />
            <Select value={c.tipo} onValueChange={(v) => cambiar(i, { tipo: v as Categoria['tipo'] })}>
              <SelectTrigger size="sm" className="h-9 w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gasto">Gasto</SelectItem>
                <SelectItem value="ingreso">Ingreso</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setFilas((f) => f.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilas((f) => [...f, { nombre: '', tipo: 'gasto', color: colorLibre(f.map((x) => x.color)), presupuesto: 0, original: '' }])}
        >
          <Plus /> Categoría
        </Button>
        <Button size="sm" className="ml-auto" onClick={guardar}>
          Guardar categorías
        </Button>
      </CardFooter>
    </Card>
  )
}

function Reglas() {
  const store = useStore()
  const cfg = store.state.config
  const [filas, setFilas] = useState<Regla[]>(() => cfg.reglas.map((r) => ({ ...r })))
  const cambiar = (i: number, cambios: Partial<Regla>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...cambios } : x)))

  const guardar = async () => {
    const reglas = filas.map((r) => ({ ...r, patron: normalizarPatron(r.patron) })).filter((r) => r.patron)
    for (const r of reglas) {
      try {
        new RegExp(r.patron)
      } catch {
        return toast.error('Patrón inválido: ' + r.patron)
      }
    }
    await store.guardarConfig({ reglas })
    toast.success('Reglas guardadas')
  }

  const aplicar = async () => {
    const cambios = store
      .movimientos()
      .filter((m) => m.tipo !== 'traspaso' && (!m.categoria || ['Otros', 'Sin categoría', 'Transferencias', 'Transferencias recibidas'].includes(m.categoria)))
      .map((m) => ({ m, cat: categorizar(m.descripcion, store.state.config.reglas) }))
      .filter(({ m, cat }) => cat && cat !== m.categoria && store.categoria(cat)?.tipo === m.tipo)
      .map(({ m, cat }) => ({ id: m.id, categoria: cat! }))
    if (cambios.length) await store.guardarMovsEnLote(cambios)
    toast.success(`${cambios.length} movimientos recategorizados`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reglas automáticas</CardTitle>
        <CardDescription>
          Si la descripción contiene el patrón, se asigna la categoría. Separa variantes con <code className="bg-muted rounded px-1 text-xs">|</code>, en
          minúsculas y sin tildes. Ej: <code className="bg-muted rounded px-1 text-xs">lider|jumbo</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {filas.map((r, i) => (
          <div key={i} className="flex items-center gap-2 py-2">
            <Input value={r.patron} onChange={(e) => cambiar(i, { patron: e.target.value })} placeholder="patrón" className="h-9" />
            <Select value={r.categoria} onValueChange={(v) => cambiar(i, { categoria: v })}>
              <SelectTrigger size="sm" className="h-9 w-[45%] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cfg.categorias.map((c) => (
                  <SelectItem key={c.nombre} value={c.nombre}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setFilas((f) => f.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setFilas((f) => [...f, { patron: '', categoria: 'Otros' }])}>
          <Plus /> Regla
        </Button>
        <Button size="sm" className="ml-auto" onClick={guardar}>
          Guardar reglas
        </Button>
        <Button variant="secondary" size="sm" className="w-full" onClick={aplicar}>
          Aplicar reglas a movimientos sin categoría
        </Button>
      </CardFooter>
    </Card>
  )
}

function Preferencias() {
  const store = useStore()
  const c = store.state.config
  const [cuentas, setCuentas] = useState(c.cuentas.join(', '))
  const [hormiga, setHormiga] = useState(String(c.umbralHormiga))
  const [ahorro, setAhorro] = useState(c.patronAhorro || '')
  const guardar = async () => {
    const lista = cuentas
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    await store.guardarConfig({
      cuentas: lista.length ? lista : CONFIG_DEFAULT.cuentas,
      umbralHormiga: soloDigitos(hormiga) || 5000,
      patronAhorro: normalizarPatron(ahorro) || 'estado|ahorro',
    })
    toast.success('Preferencias guardadas')
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferencias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Cuentas (separadas por coma)</Label>
          <Input value={cuentas} onChange={(e) => setCuentas(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Umbral de gasto hormiga</Label>
          <Input inputMode="numeric" value={hormiga} onChange={(e) => setHormiga(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Cuenta de ahorro</Label>
          <Input value={ahorro} onChange={(e) => setAhorro(e.target.value)} placeholder="estado|ahorro" />
          <p className="text-muted-foreground text-xs">Los traspasos cuya descripción calce con esto cuentan como ahorro.</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button size="sm" onClick={guardar}>
          Guardar preferencias
        </Button>
      </CardFooter>
    </Card>
  )
}

function ImportarYRespaldo() {
  const store = useStore()
  const [archivo, setArchivo] = useState<{ nombre: string; datos: ArchivoInterpretado } | null>(null)
  const xls = useRef<HTMLInputElement>(null)
  const json = useRef<HTMLInputElement>(null)

  const elegirXls = async (f?: File) => {
    if (!f) return
    const id = toast.loading('Leyendo archivo…')
    try {
      const datos = interpretar(await leerArchivo(f))
      if (!datos.filas.length) throw new Error('El archivo no tiene movimientos válidos')
      setArchivo({ nombre: f.name, datos })
      toast.dismiss(id)
    } catch (e) {
      toast.error('Error: ' + (e instanceof Error ? e.message : String(e)), { id })
    }
  }
  const restaurar = async (f?: File) => {
    if (!f) return
    try {
      toast.success(`${await store.importar(await f.text())} movimientos restaurados`)
    } catch (e) {
      toast.error('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
  const exportar = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([store.exportar()], { type: 'application/json' }))
    a.download = `finanzas-respaldo-${hoy()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Importar movimientos</CardTitle>
          <CardDescription>
            Desde un Excel o CSV: exportación de Wallet u otra app, o cartola del banco. Verás una vista previa antes de guardar y no se duplica lo que ya
            tienes.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <input
            ref={xls}
            type="file"
            hidden
            accept=".xls,.xlsx,.csv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => {
              elegirXls(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button className="w-full" onClick={() => xls.current?.click()}>
            <FileSpreadsheet /> Elegir archivo Excel / CSV
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Respaldo</CardTitle>
          <CardDescription>Descarga todos tus datos en un archivo, o recupéralos desde uno.</CardDescription>
        </CardHeader>
        <CardFooter className="gap-2">
          <Button variant="outline" className="flex-1" onClick={exportar}>
            <Download /> Exportar
          </Button>
          <input
            ref={json}
            type="file"
            hidden
            accept="application/json"
            onChange={(e) => {
              restaurar(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button variant="outline" className="flex-1" onClick={() => json.current?.click()}>
            <Upload /> Restaurar
          </Button>
        </CardFooter>
      </Card>
      {archivo && <Importador nombre={archivo.nombre} datos={archivo.datos} onClose={() => setArchivo(null)} />}
    </>
  )
}

export function Ajustes() {
  return (
    <div className="space-y-3">
      <Conexion />
      <Categorias />
      <Reglas />
      <Preferencias />
      <ImportarYRespaldo />
      <p className="text-muted-foreground py-2 text-center text-xs">Finanzas · versión 2.0</p>
    </div>
  )
}
