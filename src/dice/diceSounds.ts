let audioCtx: AudioContext | null = null
let mutedByMotion = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (mutedByMotion) return null

  mutedByMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (mutedByMotion) return null

  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

export function initDiceAudio() {
  getCtx()
}

function createNoiseBuffer(ac: AudioContext, duration: number): AudioBuffer {
  const length = Math.floor(ac.sampleRate * duration)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/** Низкий деревянный удар — только шум через фильтры, без осцилляторов */
function woodThud(ac: AudioContext, volume: number, delay = 0, tone: 'body' | 'tap' | 'crack' = 'body') {
  const t = ac.currentTime + delay
  const dur = tone === 'crack' ? 0.06 : tone === 'tap' ? 0.09 : 0.14

  const src = ac.createBufferSource()
  src.buffer = createNoiseBuffer(ac, dur)

  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = tone === 'crack' ? 520 : tone === 'tap' ? 340 : 220
  lp.Q.value = 0.7

  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = tone === 'crack' ? 780 : tone === 'tap' ? 280 : 140
  bp.Q.value = tone === 'body' ? 1.2 : 1.6

  const g = ac.createGain()
  g.gain.setValueAtTime(volume, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)

  src.connect(lp)
  lp.connect(bp)
  bp.connect(g)
  g.connect(ac.destination)
  src.start(t)
  src.stop(t + dur)
}

/** Магическая вспышка — шумовой свип, без электронных тонов */
function magicalFlash(ac: AudioContext, volume: number, duration = 0.48, delay = 0) {
  const t = ac.currentTime + delay

  const src = ac.createBufferSource()
  src.buffer = createNoiseBuffer(ac, duration)

  const hp = ac.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 280

  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 2.8
  bp.frequency.setValueAtTime(420, t)
  bp.frequency.exponentialRampToValueAtTime(3200, t + duration * 0.65)

  const g = ac.createGain()
  g.gain.setValueAtTime(0.001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + 0.035)
  g.gain.exponentialRampToValueAtTime(0.001, t + duration)

  src.connect(hp)
  hp.connect(bp)
  bp.connect(g)
  g.connect(ac.destination)
  src.start(t)
  src.stop(t + duration)

  // лёгкое мерцание
  const tail = ac.createBufferSource()
  tail.buffer = createNoiseBuffer(ac, duration * 0.55)
  const hp2 = ac.createBiquadFilter()
  hp2.type = 'highpass'
  hp2.frequency.value = 1400
  const bp2 = ac.createBiquadFilter()
  bp2.type = 'bandpass'
  bp2.frequency.value = 2200
  bp2.Q.value = 4
  const g2 = ac.createGain()
  g2.gain.setValueAtTime(0.001, t + 0.05)
  g2.gain.exponentialRampToValueAtTime(volume * 0.22, t + 0.1)
  g2.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.7)
  tail.connect(hp2)
  hp2.connect(bp2)
  bp2.connect(g2)
  g2.connect(ac.destination)
  tail.start(t + 0.05)
  tail.stop(t + duration * 0.7)
}

/** Старт броска — тихое деревянное «посыпались» */
export function playDiceThrow(diceCount = 1) {
  const ac = getCtx()
  if (!ac) return

  const taps = Math.min(Math.max(diceCount, 1), 4)
  for (let i = 0; i < taps; i++) {
    woodThud(ac, 0.08 + Math.random() * 0.04, i * 0.05, 'tap')
  }
}

/** Кость ударилась о поверхность */
export function playDiceLand(sides = 20) {
  const ac = getCtx()
  if (!ac) return

  const weight = 0.78 + Math.min(sides, 100) * 0.006 + Math.random() * 0.12
  woodThud(ac, weight, 0, 'body')
  woodThud(ac, weight * 0.5, 0.03, 'tap')
}

/** Столкновение двух к20 в оверлее */
export function playClashImpact() {
  const ac = getCtx()
  if (!ac) return

  woodThud(ac, 0.52, 0, 'body')
  magicalFlash(ac, 0.11, 0.3)
}

/** Раскол числа */
export function playCrackFall() {
  const ac = getCtx()
  if (!ac) return

  woodThud(ac, 0.2, 0, 'crack')
  woodThud(ac, 0.14, 0.05, 'crack')
  woodThud(ac, 0.09, 0.16, 'tap')
}

/** Объявление цифры результата */
export function playRevealPop() {
  const ac = getCtx()
  if (!ac) return
  magicalFlash(ac, 0.09, 0.3)
}

/** Победитель после столкновения */
export function playWinnerChime() {
  const ac = getCtx()
  if (!ac) return
  magicalFlash(ac, 0.13, 0.38, 0)
  magicalFlash(ac, 0.07, 0.24, 0.14)
}
