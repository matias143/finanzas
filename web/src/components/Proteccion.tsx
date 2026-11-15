// Si una pantalla falla, muestra un aviso con botón para recargar en vez de dejar todo en negro.
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export class Proteccion extends Component<{ children: ReactNode; clave?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { clave?: string }) {
    // Al cambiar de pantalla se vuelve a intentar.
    if (prev.clave !== this.props.clave && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="bg-card mt-4 rounded-xl border p-5 text-center">
        <b className="mb-1 block">Algo falló en esta pantalla</b>
        <p className="text-muted-foreground mb-4 text-sm">{this.state.error.message}</p>
        <Button onClick={() => location.reload()}>Recargar</Button>
      </div>
    )
  }
}
