export type Tipo = 'gasto' | 'ingreso' | 'traspaso'
export type Origen = 'manual' | 'gmail' | 'notif' | 'importado' | 'csv' | string

export interface Movimiento {
  id: string
  fecha: string // YYYY-MM-DD
  monto: number // siempre positivo
  tipo: Tipo
  categoria: string
  descripcion: string
  cuenta: string
  /** Solo traspasos: cuenta a la que llega la plata (ej. "BancoEstado (ahorro)"). */
  destino?: string
  origen?: Origen
  notas?: string
  creado?: string
  actualizado?: string
  eliminado?: boolean
  sync?: string
}

export interface Categoria {
  nombre: string
  tipo: 'gasto' | 'ingreso'
  color: string
  presupuesto: number
}

export interface Regla {
  patron: string
  categoria: string
}

export interface Config {
  cuentas: string[]
  umbralHormiga: number
  patronAhorro: string
  /** Saldo conocido de cada cuenta en un momento; desde ahí se suman los movimientos. */
  saldos?: Record<string, SaldoBase>
  categorias: Categoria[]
  reglas: Regla[]
  actualizado: string | null
}

export type EstadoSync = 'local' | 'sincronizando' | 'ok' | 'error'

export interface SaldoBase {
  monto: number
  fecha: string // YYYY-MM-DD del ajuste
  momento: string // ISO: movimientos de ese mismo día creados después sí se suman
}
