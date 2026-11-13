/**
 * Микшер звуков местности. Каждый источник — свой голос с плавной
 * громкостью. Бесшовная петля — Web Audio (AudioBufferSourceNode.loop);
 * если файл не отдаётся для fetch (CORS) — запасной <audio loop>.
 * Голос заводится, когда громкость стала больше нуля, и глушится через
 * пару секунд тишины. Браузер без жеста пользователя звук не даёт — тогда
 * blocked и resume() по нажатию.
 */
type Voice = {
  url: string
  target: number
  silentSince: number | null
  gain?: GainNode
  src?: AudioBufferSourceNode
  el?: HTMLAudioElement
  starting?: boolean
}

const STOP_AFTER_MS = 2500

export class AmbientMixer {
  private ctx: AudioContext | null = null
  private voices = new Map<string, Voice>()
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private disposed = false
  blocked = false
  onBlocked: (v: boolean) => void = () => undefined

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    this.ctx = new Ctor()
    return this.ctx
  }

  private setBlocked(v: boolean) {
    if (this.blocked === v) return
    this.blocked = v
    this.onBlocked(v)
  }

  /** продолжить после жеста пользователя */
  resume() {
    void this.ctx?.resume().then(() => this.setBlocked(false), () => undefined)
    for (const v of this.voices.values()) if (v.el && v.el.paused && v.target > 0) void v.el.play().then(() => this.setBlocked(false), () => undefined)
  }

  private buffer(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url)
    if (!p) {
      const ctx = this.context()
      p = ctx
        ? fetch(url)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then((b) => ctx.decodeAudioData(b))
            .catch(() => null)
        : Promise.resolve(null)
      this.buffers.set(url, p)
    }
    return p
  }

  private async start(id: string, v: Voice) {
    v.starting = true
    const buf = await this.buffer(v.url)
    v.starting = false
    if (this.disposed || this.voices.get(id) !== v) return
    const ctx = this.ctx
    if (buf && ctx) {
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.connect(ctx.destination)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(gain)
      // все петли с одной фазы: два клиента слышат одно и то же место дорожки примерно одинаково
      src.start(0, (Date.now() / 1000) % buf.duration)
      v.gain = gain
      v.src = src
      if (ctx.state === 'suspended') ctx.resume().then(() => this.setBlocked(false), () => this.setBlocked(true))
      if (ctx.state === 'suspended') this.setBlocked(true)
    } else {
      const el = new Audio(v.url)
      el.loop = true
      el.volume = 0
      v.el = el
      el.play().then(
        () => this.setBlocked(false),
        () => this.setBlocked(true),
      )
    }
    this.apply(v)
  }

  private apply(v: Voice) {
    const t = Math.max(0, Math.min(1, v.target))
    if (v.gain && this.ctx) v.gain.gain.setTargetAtTime(t, this.ctx.currentTime, 0.25)
    if (v.el) v.el.volume = t
  }

  private stop(v: Voice) {
    try {
      v.src?.stop()
    } catch {
      /* уже остановлен */
    }
    v.src?.disconnect()
    v.gain?.disconnect()
    v.el?.pause()
  }

  /** громкости источников: id → {url, volume}; лишние голоса гаснут */
  sync(levels: ReadonlyMap<string, { url: string; volume: number }>) {
    const now = performance.now()
    for (const [id, v] of this.voices) {
      const want = levels.get(id)
      if (!want || want.url !== v.url) {
        v.target = 0
        this.apply(v)
        if (v.silentSince == null) v.silentSince = now
      }
    }
    for (const [id, want] of levels) {
      let v = this.voices.get(id)
      if (v && v.url !== want.url) {
        this.stop(v)
        this.voices.delete(id)
        v = undefined
      }
      if (!v) {
        if (want.volume <= 0) continue
        v = { url: want.url, target: want.volume, silentSince: null }
        this.voices.set(id, v)
        void this.start(id, v)
        continue
      }
      v.target = want.volume
      v.silentSince = want.volume > 0 ? null : (v.silentSince ?? now)
      this.apply(v)
    }
    for (const [id, v] of this.voices) {
      if (v.silentSince != null && now - v.silentSince > STOP_AFTER_MS && !v.starting) {
        this.stop(v)
        this.voices.delete(id)
      }
    }
  }

  dispose() {
    this.disposed = true
    for (const v of this.voices.values()) this.stop(v)
    this.voices.clear()
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }
}
