import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// La app se publica en https://matias143.github.io/finanzas/
export default defineConfig({
  base: '/finanzas/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: { chunkSizeWarningLimit: 1200 },
})
