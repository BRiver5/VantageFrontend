/**
 * Цвета 3D-кубиков из профиля: корпус, цифры и отблеск граней.
 *
 * У темы `vantage` цифры нарисованы в текстуре (золотом на прозрачном), а корпус
 * красится цветом экземпляра. Поэтому корпус задаёт `themeColor` броска, цифры —
 * перекрашенная копия текстуры (подменяется прямо у материала), а грани — цвет
 * отблеска (specular): он ложится на рёбра и фаски, когда кубик ловит свет.
 *
 * «Обычные» кубики — исходная тема без перекраски. Цвет цифр меняется у всех
 * кубиков на экране игрока: это его настройка вида, а не свойство броска.
 */
import { D as DiceObject } from '@3d-dice/dice-box/dist/Dice.js'

export interface DiceStyle {
  body_color: string
  accent_color: string
  number_color: string
}

/** Исходная тема: так кубики выглядят, если ничего не настраивать */
export const STANDARD_DICE: DiceStyle = { body_color: '#34302a', accent_color: '#e3c46e', number_color: '#e3c46e' }
/** Что сервер даёт новому пользователю: тоже считаем «обычными» кубиками */
const SERVER_DEFAULT: DiceStyle = { body_color: '#1a1a2e', accent_color: '#e94560', number_color: '#ffffff' }

const same = (a: DiceStyle, b: DiceStyle) =>
  a.body_color.toLowerCase() === b.body_color.toLowerCase() &&
  a.accent_color.toLowerCase() === b.accent_color.toLowerCase() &&
  a.number_color.toLowerCase() === b.number_color.toLowerCase()

export const isStandardDice = (s: DiceStyle | null | undefined) => !s || same(s, STANDARD_DICE) || same(s, SERVER_DEFAULT)

/* ---------- сцена библиотеки ---------- */

interface Tex {
  url?: string | null
  updateURL(url: string): void
}
interface Mat {
  diffuseTexture?: Tex | null
  specularColor?: { r: number; g: number; b: number; copyFromFloats(r: number, g: number, b: number): unknown }
}
interface Scene {
  getMaterialByName(name: string): Mat | null
}

let scene: Scene | null = null
let wanted: DiceStyle | null = null
const THEME = 'vantage'
const TEXTURES = { light: `/assets/themes/${THEME}/diffuse-light.png`, dark: `/assets/themes/${THEME}/diffuse-dark.png` }
const originalSpecular = new Map<Mat, [number, number, number]>()
const recolored = new Map<string, Promise<string>>()

/** Сцену отдаёт сама библиотека, когда грузит модели и кубики */
let hooked = false
export function hookDiceScene(): void {
  if (hooked) return
  hooked = true
  const wrap = (name: 'loadModels' | 'loadDie') => {
    const original = (DiceObject as unknown as Record<string, (...a: unknown[]) => unknown>)[name].bind(DiceObject)
    ;(DiceObject as unknown as Record<string, (...a: unknown[]) => unknown>)[name] = (options: unknown, sc: unknown) => {
      if (sc && sc !== scene) {
        scene = sc as Scene
        if (wanted) void paint(wanted)
      }
      return original(options, sc)
    }
  }
  wrap('loadModels')
  wrap('loadDie')
}

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim())
  const n = m ? parseInt(m[1], 16) : 0xffffff
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Копия текстуры цифр нужного цвета: форма и сглаживание краёв те же, меняется только цвет */
function recolor(src: string, color: string): Promise<string> {
  const key = `${src}|${color}`
  const known = recolored.get(key)
  if (known) return known
  const job = new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext('2d')
      if (!g) return reject(new Error('canvas'))
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, c.width, c.height)
      const [r, gg, b] = hex(color)
      const px = data.data
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue
        // лёгкая объёмность от яркости исходного пикселя, чтобы цифры не были плоскими
        const shade = 0.82 + 0.18 * ((px[i] + px[i + 1] + px[i + 2]) / 765)
        px[i] = Math.min(255, r * shade)
        px[i + 1] = Math.min(255, gg * shade)
        px[i + 2] = Math.min(255, b * shade)
      }
      g.putImageData(data, 0, 0)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('texture'))
    img.src = src
  })
  recolored.set(key, job)
  return job
}

async function paint(style: DiceStyle): Promise<void> {
  const sc = scene
  if (!sc) return
  const standard = isStandardDice(style)
  for (const variant of ['light', 'dark'] as const) {
    const mat = sc.getMaterialByName(`${THEME}_${variant}`)
    if (!mat) continue
    // цифры
    const next = standard ? TEXTURES[variant] : await recolor(TEXTURES[variant], style.number_color).catch(() => TEXTURES[variant])
    if (wanted !== style) return
    if (mat.diffuseTexture && mat.diffuseTexture.url !== next) mat.diffuseTexture.updateURL(next)
    // отблеск граней
    const spec = mat.specularColor
    if (spec) {
      if (!originalSpecular.has(mat)) originalSpecular.set(mat, [spec.r, spec.g, spec.b])
      if (standard) {
        const [r, g, b] = originalSpecular.get(mat) as [number, number, number]
        spec.copyFromFloats(r, g, b)
      } else {
        const [r, g, b] = hex(style.accent_color)
        spec.copyFromFloats(r / 255, g / 255, b / 255)
      }
    }
  }
}

/** Применить стиль; если сцены ещё нет, применится, как только библиотека её создаст */
export function applyDiceStyle(style: DiceStyle | null | undefined): void {
  wanted = style ?? STANDARD_DICE
  void paint(wanted)
}

/** Цвет корпуса для броска: у «обычных» кубиков — цвет темы */
export const bodyColorOf = (style: DiceStyle | null | undefined) => (isStandardDice(style) ? STANDARD_DICE.body_color : (style as DiceStyle).body_color)
