/**
 * Прогресс туров: копия в localStorage (работает и без входа, и без сети) и
 * настройки пользователя на сервере. При входе копии сливаются по updated_at,
 * более свежие локальные записи досылаются на сервер.
 */
import type { ProgressMap, TourProgress, TourStatus } from './types'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ProgressBackend {
  save(id: string, progress: Pick<TourProgress, 'status' | 'step'>): Promise<unknown>
  reset(id: string): Promise<unknown>
  resetAll(): Promise<unknown>
}

export const LOCAL_KEY = 'vantage-tours'
export const localKey = (userId: string | null): string => `${LOCAL_KEY}:${userId ?? 'anon'}`

const STATUSES: readonly TourStatus[] = ['offered', 'in_progress', 'completed']
const RANK: Record<TourStatus, number> = { offered: 0, in_progress: 1, completed: 2 }

/** Разобрать сохранённое: битые записи отбрасываются */
export function parseProgress(raw: unknown): ProgressMap {
  const out: ProgressMap = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Partial<TourProgress>
    if (!STATUSES.includes(v.status as TourStatus)) continue
    const step = typeof v.step === 'number' && Number.isFinite(v.step) && v.step >= 0 ? Math.floor(v.step) : 0
    out[id] = { status: v.status as TourStatus, step, updated_at: typeof v.updated_at === 'string' ? v.updated_at : null }
  }
  return out
}

const stamp = (p: TourProgress): number => {
  const t = p.updated_at ? Date.parse(p.updated_at) : NaN
  return Number.isNaN(t) ? 0 : t
}

/** Какая из двух записей главнее: свежее по времени, при равенстве — дальше продвинутая */
export function newer(a: TourProgress, b: TourProgress): TourProgress {
  const ta = stamp(a)
  const tb = stamp(b)
  if (ta !== tb) return ta > tb ? a : b
  return RANK[a.status] >= RANK[b.status] ? a : b
}

export function mergeProgress(a: ProgressMap, b: ProgressMap): ProgressMap {
  const out: ProgressMap = { ...a }
  for (const [id, p] of Object.entries(b)) out[id] = out[id] ? newer(out[id], p) : p
  return out
}

function readLocal(storage: KeyValueStorage | null, key: string): ProgressMap {
  if (!storage) return {}
  try {
    const raw = storage.getItem(key)
    return raw ? parseProgress(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export class ProgressStore {
  private map: ProgressMap = {}
  private userId: string | null = null
  private backend: ProgressBackend | null = null
  private listeners = new Set<() => void>()
  private storage: KeyValueStorage | null
  private now: () => string

  constructor(storage: KeyValueStorage | null, now: () => string = () => new Date().toISOString()) {
    this.storage = storage
    this.now = now
    this.map = readLocal(storage, localKey(null))
  }

  /**
   * Пользователь сменился (вход, выход, загрузка /auth/me). server — туры из
   * его настроек; backend — куда сохранять (null — только локально).
   */
  attach(userId: string | null, server: ProgressMap | null | undefined, backend: ProgressBackend | null): void {
    this.userId = userId
    this.backend = userId ? backend : null
    let local = readLocal(this.storage, localKey(userId))
    if (userId) {
      // пройденное до входа переезжает в аккаунт
      local = mergeProgress(local, readLocal(this.storage, localKey(null)))
      this.remove(localKey(null))
    }
    const remote = parseProgress(server ?? {})
    const merged = mergeProgress(local, remote)
    if (this.backend) {
      for (const [id, p] of Object.entries(merged)) {
        const r = remote[id]
        if (!r || (p !== r && stamp(p) > stamp(r))) this.push(() => this.backend?.save(id, { status: p.status, step: p.step }))
      }
    }
    this.commit(merged)
  }

  get snapshot(): ProgressMap {
    return this.map
  }

  get(id: string): TourProgress | null {
    return this.map[id] ?? null
  }

  set(id: string, progress: Pick<TourProgress, 'status' | 'step'>): void {
    this.commit({ ...this.map, [id]: { ...progress, updated_at: this.now() } })
    this.push(() => this.backend?.save(id, progress))
  }

  /** Отметить, что тур уже предлагали: только если о нём ничего не известно */
  markOffered(id: string): void {
    if (!this.map[id]) this.set(id, { status: 'offered', step: 0 })
  }

  reset(id: string): void {
    if (!this.map[id]) return
    const next = { ...this.map }
    delete next[id]
    this.commit(next)
    this.push(() => this.backend?.reset(id))
  }

  resetAll(): void {
    this.commit({})
    this.push(() => this.backend?.resetAll())
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private commit(next: ProgressMap): void {
    this.map = next
    if (this.storage) {
      try {
        this.storage.setItem(localKey(this.userId), JSON.stringify(next))
      } catch {
        /* хранилище недоступно или переполнено — живём в памяти */
      }
    }
    for (const fn of this.listeners) fn()
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(key)
    } catch {
      /* ignore */
    }
  }

  /** Сервер — не обязателен: ошибка сети или старый сервер не мешают туру */
  private push(fn: () => Promise<unknown> | undefined): void {
    try {
      void fn()?.catch(() => {})
    } catch {
      /* ignore */
    }
  }
}
