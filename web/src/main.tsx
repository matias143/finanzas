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
