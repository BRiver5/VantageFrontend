/**
 * Кубики, которые падают на заданную грань.
 *
 * В комнате кости бросает сервер, а `@3d-dice/dice-box` сам решает исход физикой
 * и принимать готовые значения не умеет. Но он читает результат так: после
 * остановки кубика берёт низкополигональный «коллайдер» с тем же положением и
 * поворотом, пускает луч из центра вверх (у d4 — вниз) и по номеру пробитого
 * треугольника достаёт значение из `colliderFaceMap`. Значит, если перед чтением
 * довернуть кубик так, чтобы нужная грань смотрела вверх, библиотека сама
 * «увидит» заданное значение, а игрок увидит, как кубик в конце броска
 * переваливается на эту грань.
 *
 * Нужное значение едет в `rollId` кости: `F<значение>_<уникальный суффикс>`.
 * Перехват статического `getRollResult` работает, только пока world грузится в
 * основном потоке (`offscreen: false`): в воркере код вшит в бандл строкой.
 *
 * d100 (две кости: десятки и единицы) и нестандартные кости не доворачиваются —
 * катятся как есть, а значение им показывает текст.
 */
import { D as DiceObject } from '@3d-dice/dice-box/dist/Dice.js'
import { FORCEABLE_SIDES, forcedValueOf } from './forcedIds'

const SNAP_MS = 380

type Vec = [number, number, number]
type Quat = [number, number, number, number]

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Поворот на кратчайшем пути от вектора `from` к `to` (оба единичные) */
function shortestArc(from: Vec, to: Vec): Quat {
  const d = dot(from, to)
  if (d < -0.999999) {
    // противоположные направления: поворот на 180° вокруг любой перпендикулярной оси
    const axis = norm(Math.abs(from[0]) < 0.9 ? cross(from, [1, 0, 0]) : cross(from, [0, 1, 0]))
    return [axis[0], axis[1], axis[2], 0]
  }
  const c = cross(from, to)
  const q: Quat = [c[0], c[1], c[2], 1 + d]
  const l = Math.hypot(q[0], q[1], q[2], q[3])
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** Произведение кватернионов: сначала `b`, затем `a` */
const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]

function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  let bb = b
  if (cos < 0) {
    cos = -cos
    bb = [-b[0], -b[1], -b[2], -b[3]]
  }
  if (cos > 0.9995) {
    const q: Quat = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]
    const l = Math.hypot(...q)
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
  }
  const theta = Math.acos(cos)
  const s = Math.sin(theta)
  const wa = Math.sin((1 - t) * theta) / s
  const wb = Math.sin(t * theta) / s
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb]
}

/* ---------- минимальное описание нужных частей dice-box ---------- */

interface MeshLike {
  getVerticesData(kind: string): ArrayLike<number> | null
  getIndices(): ArrayLike<number> | null
}
interface DieLike {
  config?: { rollId?: string | number; dieType?: string; sides?: number | string; parentMesh?: string; meshName?: string }
  mesh?: { rotationQuaternion: { x: number; y: number; z: number; w: number; set(x: number, y: number, z: number, w: number): unknown } }
  d10Instance?: unknown
  dieParent?: unknown
}
interface SceneLike {
  themeData: Record<string, { colliderFaceMap: Record<string, Record<string | number, number>>; d4FaceDown?: boolean }>
  getMeshByName(name: string): MeshLike | null
}

/** Внешняя нормаль первой грани коллайдера с нужным значением (в локальных осях кубика) */
function faceNormal(collider: MeshLike, faceMap: Record<string | number, number>, want: number): Vec | null {
  const pos = collider.getVerticesData('position')
  const idx = collider.getIndices()
  if (!pos || !idx) return null
  const ids = Object.keys(faceMap).filter((k) => faceMap[k] === want)
  if (ids.length === 0) return null

  const p = (i: number): Vec => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]
  // центр модели — среднее вершин; нормаль грани должна смотреть от него
  let cx = 0
  let cy = 0
  let cz = 0
  const n = pos.length / 3
  for (let i = 0; i < n; i++) {
    cx += pos[i * 3]
    cy += pos[i * 3 + 1]
    cz += pos[i * 3 + 2]
  }
  const center: Vec = [cx / n, cy / n, cz / n]

  const f = Number(ids[0])
  const a = p(idx[f * 3])
  const b = p(idx[f * 3 + 1])
  const c = p(idx[f * 3 + 2])
  let nrm = norm(cross(sub(b, a), sub(c, a)))
  const mid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
  if (dot(nrm, sub(mid, center)) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]]
  return nrm
}

/** Довернуть остановившийся кубик так, чтобы вверх смотрела грань с заданным значением */
async function snapToValue(die: DieLike, scene: SceneLike): Promise<void> {
  const want = forcedValueOf(die.config?.rollId)
  if (want === null || !die.mesh || die.d10Instance || die.dieParent) return
  const dieType = die.config?.dieType
  const sides = Number(String(dieType ?? '').replace(/\D/g, ''))
  if (!dieType || !FORCEABLE_SIDES.has(sides)) return

  const theme = die.config?.parentMesh || die.config?.meshName
  if (!theme) return
  const data = scene.themeData?.[theme]
  const faceMap = data?.colliderFaceMap?.[dieType]
  const collider = scene.getMeshByName(`${theme}_${dieType}_collider`)
  if (!faceMap || !collider) return

  // у d10 «десятка» в одних темах лежит на грани со значением 10, в других — 0
  const normal = faceNormal(collider, faceMap, want) ?? (dieType === 'd10' && want === 10 ? faceNormal(collider, faceMap, 0) : null)
  if (!normal) return

  // d4 читается лучом вниз, остальные — вверх
  const target: Vec = dieType === 'd4' && data.d4FaceDown !== false ? [0, -1, 0] : [0, 1, 0]
  const arc = shortestArc(normal, target)
  // случайный поворот вокруг вертикали: кубики не должны лечь одинаково
  const yaw = Math.random() * Math.PI * 2
  const final = mul([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], arc)

  const rq = die.mesh.rotationQuaternion
  const from: Quat = [rq.x, rq.y, rq.z, rq.w]

  await new Promise<void>((resolve) => {
    const t0 = performance.now()
    const done = () => {
      rq.set(final[0], final[1], final[2], final[3])
      resolve()
    }
    // вкладка может быть скрыта и кадры не идут: страхуемся таймером
    const guard = setTimeout(done, SNAP_MS + 250)
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / SNAP_MS)
      // плавное замедление в конце, как у кубика, который «досыпается»
      const e = 1 - Math.pow(1 - k, 3)
      const q = slerp(from, final, e)
      rq.set(q[0], q[1], q[2], q[3])
      if (k < 1) requestAnimationFrame(step)
      else {
        clearTimeout(guard)
        done()
      }
    }
    requestAnimationFrame(step)
  })
}

let installed = false

/**
 * Включить доворот граней. Безопасно вызывать много раз. Перехват ставится на
 * класс кубика из общего модуля dice-box, поэтому действует и на кубики,
 * созданные библиотекой позже.
 */
export function installForcedFaces(): void {
  if (installed) return
  installed = true
  const original = DiceObject.getRollResult.bind(DiceObject)
  DiceObject.getRollResult = async (die: unknown, scene: unknown) => {
    try {
      await snapToValue(die as DieLike, scene as SceneLike)
    } catch (e) {
      // не вышло довернуть — оставляем как выпало, число всё равно покажет текст
      console.warn('dice: не удалось довернуть кубик', e)
    }
    return original(die, scene)
  }
}
