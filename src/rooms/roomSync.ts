/**
 * Перезагрузка снимка комнаты, когда журнал событий больше не может нас догнать.
 *
 * Сервер чистит журнал (старые события истекают, вытесненные снимки карты
 * становятся noop). Тогда на sync он отвечает `sync.reset`, а REST /events —
 * `{items: [], reset: true}`: «догнать нельзя, перечитайте снимок». Здесь:
 *   - одна перезагрузка за раз (повторный запрос получает ту же);
 *   - после неё снова sync с seq свежего снимка;
 *   - reset подряд без успешного sync.done — с растущей паузой, чтобы не крутиться.
 */
import type { RoomEventMessage, RoomState } from '../types/rooms'
import type { RoomEventsPage } from './roomsApi'

/** Пауза перед повторной перезагрузкой: первая — сразу, дальше растёт */
export const RESET_BACKOFF = [0, 1000, 2000, 5000, 10000, 30000]

export interface StateReloaderOptions {
  /** GET /state — тот же путь, что и при входе в комнату */
  load: () => Promise<RoomState>
  /** заменить локальное состояние снимком и запомнить его seq */
  apply: (state: RoomState) => void
  /** снова sync с seq свежего снимка */
  resync: () => void
  onError?: (e: unknown) => void
}

export class StateReloader {
  private inflight: Promise<void> | null = null
  /** reset подряд без успешного sync */
  private resets = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private readonly opts: StateReloaderOptions

  constructor(opts: StateReloaderOptions) {
    this.opts = opts
  }

  /** Перечитать снимок и догнать события. Пока одна перезагрузка идёт, новая не начинается */
  reload(): Promise<void> {
    if (this.inflight) return this.inflight
    const run = (async () => {
      try {
        const state = await this.opts.load()
        if (this.disposed) return
        this.opts.apply(state)
        this.opts.resync()
      } finally {
        this.inflight = null
      }
    })()
    this.inflight = run
    return run
  }

  /** Сервер сказал «журнал не догонит» (sync.reset или reset в REST) */
  onReset(): void {
    if (this.disposed || this.inflight || this.timer) return
    const delay = RESET_BACKOFF[Math.min(this.resets, RESET_BACKOFF.length - 1)]
    this.resets += 1
    if (delay === 0) return this.runReset()
    this.timer = setTimeout(() => {
      this.timer = null
      this.runReset()
    }, delay)
  }

  /** sync закончился как обычно: счётчик reset подряд обнуляется */
  onSynced(): void {
    this.resets = 0
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private runReset() {
    if (this.disposed) return
    this.reload().catch((e: unknown) => {
      this.opts.onError?.(e)
      // снимок не загрузился (сеть): попробуем ещё раз, уже с паузой
      this.onReset()
    })
  }
}

/**
 * Догнать события через REST (GET /events?after_seq=) — запасной путь без сокета.
 * Если сервер ответил reset, события не применяются, а снимок перечитывается.
 */
export async function catchUpViaRest(opts: {
  fetchPage: (afterSeq: number) => Promise<RoomEventsPage>
  getSeq: () => number
  onEvent: (msg: RoomEventMessage) => void
  reloader: StateReloader
  /** страница меньше этого — значит, дальше событий нет */
  limit: number
  maxPages?: number
}): Promise<'done' | 'reset'> {
  const maxPages = opts.maxPages ?? 50
  for (let i = 0; i < maxPages; i++) {
    const page = await opts.fetchPage(opts.getSeq())
    if (page.reset) {
      opts.reloader.onReset()
      return 'reset'
    }
    for (const msg of page.items) opts.onEvent(msg)
    if (page.items.length < opts.limit) break
  }
  opts.reloader.onSynced()
  return 'done'
}
