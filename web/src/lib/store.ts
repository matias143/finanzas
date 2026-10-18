// Estado de la app: guardado local (IndexedDB) + sincronización con tu Google Sheet (Apps Script).
// Mantiene el mismo formato que la versión anterior, así los datos guardados en el celular se conservan.
import { useSyncExternalStore } from 'react'
import type { Categoria, Config, EstadoSync, Movimiento } from './types'
import { uid } from './util'

export const CONFIG_DEFAULT: Config = {
  cuentas: ['Santander', 'Mercado Pago', 'BancoEstado (ahorro)', 'Efectivo'],
  umbralHormiga: 5000,
  // Traspasos cuya descripción calce con esto cuentan como ahorro (ej. "Traspaso a Banco Estado").
  patronAhorro: 'estado|ahorro',
  categorias: [
    { nombre: 'Supermercado', tipo: 'gasto', color: '#2f9e6e', presupuesto: 0 },
    { nombre: 'Comida y delivery', tipo: 'gasto', color: '#e8833a', presupuesto: 0 },
    { nombre: 'Transporte', tipo: 'gasto', color: '#3b7dd8', presupuesto: 0 },
    { nombre: 'Hogar', tipo: 'gasto', color: '#8a63d2', presupuesto: 0 },
    { nombre: 'Cuentas básicas', tipo: 'gasto', color: '#1aa3b8', presupuesto: 0 },
    { nombre: 'Salud', tipo: 'gasto', color: '#d64f6b', presupuesto: 0 },
    { nombre: 'Suscripciones', tipo: 'gasto', color: '#c2559e', presupuesto: 0 },
    { nombre: 'Entretención', tipo: 'gasto', color: '#d9a21b', presupuesto: 0 },
    { nombre: 'Ropa', tipo: 'gasto', color: '#6c8a2e', presupuesto: 0 },
    { nombre: 'Compras', tipo: 'gasto', color: '#b0703c', presupuesto: 0 },
    { nombre: 'Educación', tipo: 'gasto', color: '#4a5fc1', presupuesto: 0 },
    { nombre: 'Transferencias', tipo: 'gasto', color: '#7a8796', presupuesto: 0 },
    { nombre: 'Otros', tipo: 'gasto', color: '#9aa3ad', presupuesto: 0 },
    { nombre: 'Sueldo', tipo: 'ingreso', color: '#2f9e6e', presupuesto: 0 },
    { nombre: 'Transferencias recibidas', tipo: 'ingreso', color: '#3b7dd8', presupuesto: 0 },
    { nombre: 'Otros ingresos', tipo: 'ingreso', color: '#9aa3ad', presupuesto: 0 },
  ],
  // Patrones (expresiones regulares) sobre la descripción en minúsculas y sin tildes.
  reglas: [
    { patron: 'lider|jumbo|unimarc|santa isabel|tottus|acuenta|mayorista', categoria: 'Supermercado' },
    { patron: 'uber eats|rappi|pedidos ?ya|didi food|mcdonald|burger|starbucks|juan maestro|dominos|papa john', categoria: 'Comida y delivery' },
    { patron: 'uber|didi|cabify|metro|bip|copec|shell|petrobras|aramco|peaje|autopista|turbus|pullman|latam|sky airline|jetsmart', categoria: 'Transporte' },
    { patron: 'netflix|spotify|disney|hbo|\\bmax\\b|youtube|prime video|icloud|apple com|google one|chatgpt|openai|claude|anthropic', categoria: 'Suscripciones' },
    { patron: 'enel|cge|aguas|\\bluz\\b|\\bagua\\b|\\bgas\\b|abastible|lipigas|gasco|entel|movistar|\\bwom\\b|claro|vtr|mundo|internet', categoria: 'Cuentas básicas' },
    { patron: 'farmacia|cruz verde|salcobrand|ahumada|clinica|isapre|fonasa|consulta|dental', categoria: 'Salud' },
    { patron: 'arriendo|dividendo|gastos comunes|sodimac|easy|homecenter|ikea', categoria: 'Hogar' },
    { patron: 'cine|cinemark|cineplanet|steam|playstation|xbox|nintendo|ticketmaster|puntoticket|bar\\b', categoria: 'Entretención' },
    { patron: 'h m|zara|nike|adidas|bata|ropa', categoria: 'Ropa' },
    { patron: 'mercado ?libre|falabella|paris|ripley|aliexpress|temu|shein|amazon', categoria: 'Compras' },
    { patron: 'sueldo|remuneracion|liquidacion', categoria: 'Sueldo' },
  ],
  actualizado: null,
}

// ---------- IndexedDB mínimo (clave → valor) ----------
const DB = 'finanzas'
const ST = 'kv'
let dbPromesa: Promise<IDBDatabase> | undefined
function idb() {
  dbPromesa ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(ST)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbPromesa
}
async function idbGet<T>(k: string): Promise<T | undefined> {
  const db = await idb()
  return new Promise((res, rej) => {
    const q = db.transaction(ST).objectStore(ST).get(k)
    q.onsuccess = () => res(q.result as T)
    q.onerror = () => rej(q.error)
  })
}
async function idbPut(k: string, v: unknown) {
  const db = await idb()
  return new Promise<void>((res, rej) => {
    const t = db.transaction(ST, 'readwrite')
    t.objectStore(ST).put(v, k)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

// ---------- Estado ----------
export interface Estado {
  movs: Record<string, Movimiento> // incluye eliminados, para sincronizar el borrado
  pendientes: Record<string, Movimiento> // aún no enviados al servidor
  config: Config
  configSucia: boolean
  ultimaSync: string | null
  api: { url: string; token: string }
  estado: EstadoSync // no se persiste
  error: string // no se persiste
}

const state: Estado = {
  movs: {},
  pendientes: {},
  config: structuredClone(CONFIG_DEFAULT),
  configSucia: false,
  ultimaSync: null,
  api: { url: '', token: '' },
  estado: 'local',
  error: '',
}

// React necesita una referencia nueva cada vez que algo cambia.
let version = 0
const oyentes = new Set<() => void>()
let timerSync: ReturnType<typeof setTimeout> | undefined
let syncEnCurso: Promise<void> | null = null

async function llamar(accion: string, datos: Record<string, unknown> = {}) {
  const r = await fetch(state.api.url, {
    method: 'POST',
    // text/plain evita el "preflight" CORS, que Apps Script no soporta.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: state.api.token, accion, ...datos }),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  let j: any
  try {
    j = await r.json()
  } catch {
    throw new Error('Respuesta inválida. ¿La URL es la del despliegue (termina en /exec)?')
  }
  if (j.error) throw new Error(j.error)
  return j
}

export const store = {
  state,

  async cargar() {
    const s = await idbGet<Partial<Estado>>('estado')
    if (s) {
      Object.assign(state, s)
      state.config = { ...structuredClone(CONFIG_DEFAULT), ...s.config }
    }
    state.estado = this.conectado() ? 'ok' : 'local'
    this.emitir()
  },

  async guardar() {
    const { estado: _e, error: _er, ...persistir } = state
    await idbPut('estado', structuredClone(persistir))
  },

  suscribir(fn: () => void) {
    oyentes.add(fn)
    return () => {
      oyentes.delete(fn)
    }
  },
  version: () => version,
  emitir() {
    version++
    oyentes.forEach((f) => f())
  },

  conectado() {
    return Boolean(state.api.url && state.api.token)
  },

  movimientos() {
    return Object.values(state.movs).filter((m) => !m.eliminado)
  },

  categoria(nombre: string): Categoria | undefined {
    return state.config.categorias.find((c) => c.nombre === nombre)
  },

  async guardarMov(datos: Partial<Movimiento>) {
    const ahora = new Date().toISOString()
    const previo = datos.id ? state.movs[datos.id] : undefined
    const m = { ...previo, ...datos } as Movimiento
    if (!m.id) {
      m.id = uid()
      m.creado = ahora
      m.origen = m.origen || 'manual'
    }
    m.monto = Math.round(Math.abs(Number(m.monto)) || 0)
    m.eliminado = Boolean(m.eliminado)
    m.actualizado = ahora
    state.movs[m.id] = m
    state.pendientes[m.id] = m
    await this.guardar()
    this.emitir()
    this.programarSync()
    return m
  },

  async eliminarMov(id: string) {
    if (!state.movs[id]) return
    await this.guardarMov({ id, eliminado: true })
  },

  async guardarMovsEnLote(lista: Partial<Movimiento>[]) {
    const ahora = new Date().toISOString()
    for (const d of lista) {
      const m = { ...(d.id ? state.movs[d.id] : undefined), ...d, actualizado: ahora } as Movimiento
      if (!m.id) m.id = uid()
      if (!m.creado) m.creado = ahora
      m.eliminado = Boolean(m.eliminado)
      if (m.monto !== undefined) m.monto = Math.round(Math.abs(Number(m.monto)) || 0)
      state.movs[m.id] = m
      state.pendientes[m.id] = m
    }
    await this.guardar()
    this.emitir()
    this.programarSync()
  },

  async guardarConfig(cambios: Partial<Config>) {
    state.config = { ...state.config, ...cambios, actualizado: new Date().toISOString() }
    state.configSucia = true
    await this.guardar()
    this.emitir()
    this.programarSync()
  },

  async guardarApi(url: string, token: string) {
    const cambio = url.trim() !== state.api.url || token.trim() !== state.api.token
    state.api = { url: url.trim(), token: token.trim() }
    if (cambio) {
      // Nueva conexión: subir todo lo local y bajar todo lo remoto.
      state.ultimaSync = null
      for (const m of Object.values(state.movs)) state.pendientes[m.id] = m
      state.configSucia = true
    }
    await this.guardar()
    return this.sync()
  },

  programarSync(ms = 1500) {
    clearTimeout(timerSync)
    timerSync = setTimeout(() => this.sync().catch(() => {}), ms)
  },

  async sync(): Promise<void> {
    if (!this.conectado()) {
      state.estado = 'local'
      this.emitir()
      return
    }
    if (syncEnCurso) return syncEnCurso
    syncEnCurso = (async () => {
      state.estado = 'sincronizando'
      state.error = ''
      this.emitir()
      try {
        const enviados = Object.values(state.pendientes)
        const configEnviada = state.configSucia ? state.config : null
        const r = await llamar('sync', { movimientos: enviados, config: configEnviada, desde: state.ultimaSync })
        // Quitar de pendientes solo lo que no cambió mientras se enviaba.
        for (const m of enviados) if (state.pendientes[m.id] === m) delete state.pendientes[m.id]
        if (configEnviada && state.config === configEnviada) state.configSucia = false

        for (const m of (r.movimientos || []) as Movimiento[]) {
          const local = state.movs[m.id]
          if (state.pendientes[m.id] && local && (local.actualizado || '') > (m.actualizado || '')) continue
          state.movs[m.id] = m
        }
        if (r.config && !state.configSucia && (r.config.actualizado || '') >= (state.config.actualizado || '')) {
          state.config = { ...structuredClone(CONFIG_DEFAULT), ...r.config }
        }
        state.ultimaSync = r.horaServidor
        state.estado = 'ok'
        await this.guardar()
      } catch (e) {
        state.estado = 'error'
        state.error = e instanceof Error ? e.message : String(e)
      } finally {
        syncEnCurso = null
        this.emitir()
      }
    })()
    return syncEnCurso
  },

  exportar() {
    return JSON.stringify(
      { version: 1, exportado: new Date().toISOString(), config: state.config, movimientos: Object.values(state.movs) },
      null,
      2,
    )
  },

  async importar(texto: string) {
    const d = JSON.parse(texto)
    if (!Array.isArray(d.movimientos)) throw new Error('Archivo no válido')
    for (const m of d.movimientos as Movimiento[]) {
      if (!m.id) continue
      const local = state.movs[m.id]
      if (!local || (local.actualizado || '') < (m.actualizado || '')) {
        state.movs[m.id] = m
        state.pendientes[m.id] = m
      }
    }
    if (d.config) {
      state.config = { ...state.config, ...d.config, actualizado: new Date().toISOString() }
      state.configSucia = true
    }
    await this.guardar()
    this.emitir()
    this.programarSync(100)
    return d.movimientos.length as number
  },
}

/** Hook: vuelve a dibujar el componente cuando cambian los datos. */
export function useStore() {
  useSyncExternalStore(store.suscribir, store.version)
  return store
}
