import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vantage API не отдаёт CORS-заголовки, поэтому в dev/preview ходим через прокси.
// API_TARGET переопределяет адрес в dev (например, локальный мок-сервер для проверок)
const API_TARGET = process.env.API_TARGET ?? 'https://vantage-api-production-0324.up.railway.app'

const proxy = {
  '/api': {
    target: API_TARGET,
    changeOrigin: true,
    // WebSocket комнат (/api/rooms/{id}/ws) идёт тем же прокси
    ws: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
