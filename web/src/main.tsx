import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App'
import { store } from '@/lib/store'

// Tema claro/oscuro según el sistema
const oscuro = window.matchMedia('(prefers-color-scheme: dark)')
const aplicarTema = () => document.documentElement.classList.toggle('dark', oscuro.matches)
aplicarTema()
oscuro.addEventListener('change', aplicarTema)

// Si se publicó una versión nueva mientras la app estaba abierta, los archivos antiguos ya no existen:
// se recarga una vez para tomar la versión nueva (en vez de mostrar un error).
function recargarPorVersionNueva() {
  try {
    if (sessionStorage.getItem('recarga-version')) return false
    sessionStorage.setItem('recarga-version', '1')
  } catch {
    /* sin almacenamiento: se recarga igual */
  }
  location.reload()
  return true
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  recargarPorVersionNueva()
})
setTimeout(() => {
  try {
    sessionStorage.removeItem('recarga-version')
  } catch {
    /* nada */
  }
}, 15000)

store.cargar().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// Funcionamiento sin internet (solo en la versión publicada)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
}
