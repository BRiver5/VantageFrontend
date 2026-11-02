/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый адрес API; по умолчанию same-origin `/api` */
  readonly VITE_API_BASE?: string
  /**
   * Прямой адрес WebSocket сервера для комнат, например
   * `wss://vantage-api-production-0324.up.railway.app/api`.
   * Через `/api` на проде сокет не работает: rewrite Vercel не проксирует WebSocket.
   * В dev не нужен — работает прокси Vite (`ws: true`).
   */
  readonly VITE_WS_BASE?: string
  /** Только для проверок: открывает window.__playForcedRoll в сборке */
  readonly VITE_DICE_TEST_HOOK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
