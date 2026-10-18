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
  categorias: Categoria[]
  reglas: Regla[]
  actualizado: string | null
}

export type EstadoSync = 'local' | 'sincronizando' | 'ok' | 'error'
