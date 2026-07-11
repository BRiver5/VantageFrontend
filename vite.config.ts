import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vantage API не отдаёт CORS-заголовки, поэтому в dev/preview ходим через прокси.
const API_TARGET = 'https://vantage-api-production-0324.up.railway.app'

const proxy = {
  '/api': {
    target: API_TARGET,
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
