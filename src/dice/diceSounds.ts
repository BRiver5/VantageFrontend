import addResultSrc from '../assets/sound_effects/add_result_final.mp3'
import comparingSrc from '../assets/sound_effects/comparing_final.mp3'
import drop1Src from '../assets/sound_effects/drop_1.mp3'
import drop2Src from '../assets/sound_effects/drop_2.mp3'
import drop3Src from '../assets/sound_effects/drop_3.mp3'

type DropId = 1 | 2 | 3

const VOLUME = 0.5

const DROP_SRC: Record<DropId, string> = {
  1: drop1Src,
  2: drop2Src,
  3: drop3Src,
}

/** Допустимые комбинации звуков падения для каждой кости */
const DROP_COMBOS: DropId[][] = [
  [1, 2, 3],
  [2, 1, 3],
  [1, 3],
  [2, 3],
  [1, 2],
]

let mutedByMotion = false

function isMuted(): boolean {
  if (typeof window === 'undefined') return true
  if (!mutedByMotion) {
    mutedByMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  return mutedByMotion
}

const ALL_SRC = [drop1Src, drop2Src, drop3Src, addResultSrc, comparingSrc]

export function initDiceAudio() {
  if (isMuted()) return
  for (const src of ALL_SRC) {
    const a = new Audio(src)
    a.preload = 'auto'
    a.volume = VOLUME
    a.load()
  }
}

/** Интервал между звуками внутри одной комбинации — следующий стартует до конца предыдущего */
const DROP_STEP_MS = 90

/** Смещение старта комбинации для каждой следующей кости */
const DIE_STAGGER_MS = 80

function playOne(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (isMuted()) {
      resolve()
      return
    }
    const audio = new Audio(src)
    audio.volume = VOLUME
    const done = () => resolve()
    audio.addEventListener('ended', done, { once: true })
    audio.addEventListener('error', done, { once: true })
    void audio.play().catch(done)
  })
}

function pickDropCombo(): DropId[] {
  return DROP_COMBOS[Math.floor(Math.random() * DROP_COMBOS.length)]
}

function playDropCombo() {
  const combo = pickDropCombo()
  combo.forEach((id, i) => {
    setTimeout(() => {
      void playOne(DROP_SRC[id])
    }, i * DROP_STEP_MS)
  })
}

/** Одна случайная комбинация drop_1/2/3 для одной кости */
export function playDropForDie() {
  if (isMuted()) return
  void playDropCombo()
}

/**
 * Звуки падения для броска: по одной комбинации на каждую кость.
 * Комбинации и звуки внутри них слегка наслаиваются для более плавного звучания.
 */
export function playDropsForRoll(diceCount: number) {
  if (isMuted() || diceCount <= 0) return

  for (let i = 0; i < diceCount; i++) {
    const delay = 180 + i * (DIE_STAGGER_MS + Math.random() * 35)
    setTimeout(() => playDropCombo(), delay)
  }
}

/** Появление числа или финального результата */
export function playAddResult() {
  if (isMuted()) return
  void playOne(addResultSrc)
}

/** Столкновение двух к20 — преимущество / помеха */
export function playComparing() {
  if (isMuted()) return
  void playOne(comparingSrc)
}
