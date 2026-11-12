import { clearAccessToken, getAccessToken, TOKEN_EXPIRED_EVENT } from '../auth/token'
import type { ImageQuality } from './media'

/**
 * API без CORS-заголовков, поэтому запросы идут через same-origin `/api`
 * (в dev/preview его проксирует Vite, см. vite.config.ts; в проде нужен
 * такой же прокси на хостинге). Переопределяется через VITE_API_BASE.
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

type RequestOpts = {
  method?: string
  /** объект уходит JSON-ом, FormData — как есть (загрузка файлов) */
  body?: unknown
  /** If true, require token and send Authorization. If 'optional', send when present. */
  auth?: boolean | 'optional'
  signal?: AbortSignal
  /**
   * Отдавать картинки уменьшенными (`?quality=`). Только для чтения: прочитанное
   * с `quality` нельзя сохранять обратно — в базу попадут ссылки на копии.
   */
  quality?: ImageQuality
}

/**
 * Текст ошибки FastAPI: строка как есть, ошибки валидации (422) — списком
 * «поле: сообщение», а не «[object Object]».
 */
function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (!e || typeof e !== 'object') return String(e)
        const { loc, msg } = e as { loc?: unknown[]; msg?: string }
        const field = (loc ?? []).filter((x) => x !== 'body').join('.')
        return field ? `${field}: ${msg ?? ''}` : (msg ?? '')
      })
      .join('; ')
  }
  return JSON.stringify(detail)
}

/** Сервер ещё на старой схеме персонажа (v1): ждёт basic_info и т.п. */
export function isLegacySchemaError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 422 && /basic_info|ability_scores|combat/.test(e.message)
}

/**
 * Универсальный fetch к API. Каталог по-прежнему может использовать fetchPage/getOne;
 * auth и characters — через request().
 */
/** Ключ повтора: новый на каждое действие, тот же — только при повторе этого действия */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal, quality } = opts
  const headers: Record<string, string> = {}
  // у FormData границу multipart выставляет сам браузер
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  const token = getAccessToken()
  if (auth === true) {
    if (!token) throw new ApiError('Требуется авторизация', 401)
    headers.Authorization = `Bearer ${token}`
  } else if (auth === 'optional' && token) {
    headers.Authorization = `Bearer ${token}`
  }

  let url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (quality && quality !== 'high') url += `${url.includes('?') ? '&' : '?'}quality=${quality}`

  // изменяющий запрос несёт ключ: если связь оборвалась, повторяем его с тем же
  // ключом, и сервер не выполнит действие дважды (передача монет, броски, бой)
  const mutating = method !== 'GET' && method !== 'HEAD'
  if (mutating && !isForm) headers['Idempotency-Key'] = newIdempotencyKey()
  const init: RequestInit = {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    signal,
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    if (!mutating || isForm || signal?.aborted) throw e
    await wait(700)
    res = await fetch(url, init)
  }
  // первый запрос с этим ключом ещё выполняется: подождать и спросить снова
  if (res.status === 409 && headers['Idempotency-Key'] && res.headers.get('Idempotent-Replayed') == null) {
    const peek = await res.clone().text()
    if (/idempot|выполняется/i.test(peek)) {
      await wait(800)
      res = await fetch(url, init)
    }
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  // токен с запросом ушёл, а сервер его не принял — значит, истёк: выходим
  if (res.status === 401 && headers.Authorization) {
    clearAccessToken()
    window.dispatchEvent(new Event(TOKEN_EXPIRED_EVENT))
  }

  if (!res.ok) {
    const raw = data && typeof data === 'object' && 'detail' in data ? (data as { detail: unknown }).detail : null
    throw new ApiError(raw != null ? detailText(raw) : `${path}: ${res.status}`, res.status, data)
  }

  return data as T
}
