/**
 * Кубики, которые падают на заданную грань.
 *
 * В комнате кости бросает сервер, а `@3d-dice/dice-box` сам решает исход физикой
 * и принимать готовые значения не умеет. Поэтому бросок идёт в два приёма:
 *
 * 1. Запись. Физика работает шагами: воркер считает шаг и ждёт ответа основного
 *    потока. Мы отвечаем сразу и подменяем воркеру часы, поэтому весь полёт
 *    считается за доли секунды, пока сцена не рисуется. Так заранее становится
 *    известно, какой гранью кубик ляжет.
 * 2. Показ. К кубику с первого кадра применяется постоянный поворот модели,
 *    который ставит нужное значение на место выпавшей грани, и запись
 *    проигрывается в реальном времени. Кубик летит настоящей физикой и сразу
 *    ложится нужным числом вверх: докручивать в конце нечего.
 *
 * Если записать не вышло (другая версия библиотеки, таймаут), остаётся запасной
 * путь: довернуть кубик после остановки.
 *
 * Результат библиотека читает так: берёт низкополигональный «коллайдер» с тем же
 * положением и поворотом, пускает луч из центра вверх (у d4 — вниз) и по номеру
 * пробитого треугольника достаёт значение из `colliderFaceMap`, поэтому она сама
 * «видит» заданное значение.
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
  id?: number
  config?: { rollId?: string | number; dieType?: string; sides?: number | string; parentMesh?: string; meshName?: string }
  mesh?: {
    position: { set(x: number, y: number, z: number): unknown }
    rotationQuaternion: { x: number; y: number; z: number; w: number; set(x: number, y: number, z: number, w: number): unknown }
    isDisposed?: () => boolean
    getScene?: () => SceneLike
  }
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

/** Все грани коллайдера: нормаль и значение; нужна, чтобы узнать, какой гранью кубик лёг */
function faceList(collider: MeshLike, faceMap: Record<string | number, number>): Vec[] {
  const pos = collider.getVerticesData('position')
  const idx = collider.getIndices()
  if (!pos || !idx) return []
  const p = (i: number): Vec => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]
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
  const out: Vec[] = []
  for (const key of Object.keys(faceMap)) {
    const f = Number(key)
    const a = p(idx[f * 3])
    const b = p(idx[f * 3 + 1])
    const c = p(idx[f * 3 + 2])
    let nrm = norm(cross(sub(b, a), sub(c, a)))
    const mid: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    if (dot(nrm, sub(mid, center)) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]]
    out.push(nrm)
  }
  return out
}

const rotate = (q: Quat, v: Vec): Vec => {
  const u: Vec = [q[0], q[1], q[2]]
  const t: Vec = [2 * (u[1] * v[2] - u[2] * v[1]), 2 * (u[2] * v[0] - u[0] * v[2]), 2 * (u[0] * v[1] - u[1] * v[0])]
  const c = cross(u, t)
  return [v[0] + q[3] * t[0] + c[0], v[1] + q[3] * t[1] + c[1], v[2] + q[3] * t[2] + c[2]]
}

/**
 * Поворот модели в её собственных осях: нужное значение встаёт туда, где у
 * выпавшей грани. Грани кубика одинаковы, поэтому снаружи форма не меняется,
 * меняются только цифры. null — кубик без заданного значения.
 */
function faceOffset(die: DieLike, scene: SceneLike, finalQ: Quat): Quat | null {
  const want = forcedValueOf(die.config?.rollId)
  if (want === null || die.d10Instance || die.dieParent) return null
  const dieType = die.config?.dieType
  const sides = Number(String(dieType ?? '').replace(/\D/g, ''))
  if (!dieType || !FORCEABLE_SIDES.has(sides)) return null
  const theme = die.config?.parentMesh || die.config?.meshName
  if (!theme) return null
  const data = scene.themeData?.[theme]
  const faceMap = data?.colliderFaceMap?.[dieType]
  const collider = scene.getMeshByName(`${theme}_${dieType}_collider`)
  if (!faceMap || !collider) return null
  const wanted = faceNormal(collider, faceMap, want) ?? (dieType === 'd10' && want === 10 ? faceNormal(collider, faceMap, 0) : null)
  if (!wanted) return null
  // какая грань оказалась сверху (у d4 — снизу)
  const target: Vec = dieType === 'd4' && data.d4FaceDown !== false ? [0, -1, 0] : [0, 1, 0]
  let best: Vec | null = null
  let bestDot = -2
  for (const n of faceList(collider, faceMap)) {
    const d = dot(rotate(finalQ, n), target)
    if (d > bestDot) {
      bestDot = d
      best = n
    }
  }
  return best ? shortestArc(wanted, best) : null
}

/** Довернуть остановившийся кубик так, чтобы вверх смотрела грань с заданным значением */
async function snapToValue(die: DieLike, scene: SceneLike): Promise<void> {
  // записанный полёт уже лёг нужной гранью
  if (replayed.has(die)) return
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

/* ---------- ускоренная физика: воркер с подменёнными часами ---------- */

/** Длительность одного записанного кадра: воркер считает за него два внутренних шага */
const REC_DT_MS = 1000 / 45
/** Дольше ждать запись незачем: значит, что-то пошло не так, катим обычным путём */
const REC_LIMIT_MS = 4000
/** Показ чуть быстрее реального времени: за столом бросок не должен тянуться */
const PLAY_SPEED = 1.3
/** Движение меньше этого уже не видно: хвост записи можно отрезать */
const REST_POS = 0.004
const REST_ROT = 0.0015

let physicsWorker: Worker | null = null

/**
 * Воркер физики вшит в бандл строкой, снаружи его часы не поменять. Поэтому
 * конструктор Worker подменяется на время создания: текст читается по blob-ссылке,
 * в нём правятся часы, и запускается уже он. Не нашли нужных мест (другая версия
 * библиотеки) — работает оригинал, а кубики идут запасным путём.
 */
function wrapPhysicsWorker(): void {
  const Original = window.Worker
  const Patched = function (this: unknown, url: string | URL, options?: WorkerOptions) {
    const restore = () => {
      window.Worker = Original
    }
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', String(url), false)
      xhr.send()
      const source = xhr.responseText
      const clock = /let (\w+)=new Date\(\)\.getTime\(\);const (\w+)=\1-(\w+);/
      const onMessage = /self\.onmessage=(\w+)=>\{switch\(\1\.data\.action\)\{/
      if (clock.test(source) && onMessage.test(source)) {
        const text = source
          .replace(clock, `let $1=new Date().getTime();const $2=self.__fast?${REC_DT_MS}:$1-$3;`)
          .replace(onMessage, 'self.onmessage=$1=>{switch($1.data.action){case"__fast":self.__fast=$1.data.on;break;')
        const link = URL.createObjectURL(new Blob([text], { type: 'text/javascript;charset=utf-8' }))
        const worker = new Original(link, options)
        URL.revokeObjectURL(link)
        physicsWorker = worker
        restore()
        return worker
      }
    } catch (e) {
      console.warn('dice: не удалось подготовить физику заранее', e)
    }
    restore()
    return new Original(url, options)
  }
  window.Worker = Patched as unknown as typeof Worker
}

/* ---------- запись и показ ---------- */

interface Frames {
  /** с какого записанного кадра тело существует */
  start: number
  data: number[]
}

interface Recording {
  expected: number
  step: number
  bodies: Map<number, Frames>
  sleepers: Map<number, DieLike>
  world: object | null
  done: boolean
  limit: ReturnType<typeof setTimeout>
}

let recording: Recording | null = null
const replayed = new WeakSet<object>()

const setFast = (on: boolean) => physicsWorker?.postMessage({ action: '__fast', on })

/** Подготовить следующий бросок к записи. expected — сколько тел создаст библиотека */
export function armForcedReplay(expected: number): void {
  if (!physicsWorker || expected <= 0) return
  if (recording) clearTimeout(recording.limit)
  const rec: Recording = {
    expected,
    step: 0,
    bodies: new Map(),
    sleepers: new Map(),
    world: null,
    done: false,
    limit: setTimeout(() => abandon(rec), REC_LIMIT_MS),
  }
  recording = rec
  setFast(true)
}

let origHandleAsleep: ((this: object, die: DieLike) => Promise<void>) | null = null

/** Записать не вышло: дальше кубики катятся обычным путём и доворачиваются в конце */
function abandon(rec: Recording): void {
  if (recording !== rec || rec.done) return
  rec.done = true
  recording = null
  setFast(false)
  console.warn('dice: запись броска не завершилась, идём запасным путём')
  for (const die of rec.sleepers.values()) void origHandleAsleep?.call(rec.world as object, die)
}

/** Где движение кончилось: дальше кубик лежит, ждать незачем */
function lastMoveFrame(f: Frames): number {
  const d = f.data
  const total = d.length / 7
  for (let i = total - 1; i > 0; i--) {
    const a = (i - 1) * 7
    const b = i * 7
    const move = Math.hypot(d[b] - d[a], d[b + 1] - d[a + 1], d[b + 2] - d[a + 2])
    const turn = Math.hypot(d[b + 3] - d[a + 3], d[b + 4] - d[a + 4], d[b + 5] - d[a + 5], d[b + 6] - d[a + 6])
    if (move > REST_POS || turn > REST_ROT) return i + 1
  }
  return 0
}

function play(rec: Recording): void {
  const world = rec.world as object
  const items = [...rec.sleepers.entries()].map(([id, die]) => {
    const frames = rec.bodies.get(id) ?? { start: 0, data: [] }
    const total = frames.data.length / 7
    const last = Math.max(0, total - 1) * 7
    const finalQ: Quat = total ? [frames.data[last + 3], frames.data[last + 4], frames.data[last + 5], frames.data[last + 6]] : [0, 0, 0, 1]
    const scene = die.mesh?.getScene?.()
    const offset = scene && total ? faceOffset(die, scene, finalQ) : null
    if (offset) replayed.add(die)
    return { die, frames, total, offset, end: frames.start + lastMoveFrame(frames) }
  })
  const endFrame = Math.max(1, ...items.map((i) => i.end))
  const frameMs = REC_DT_MS / PLAY_SPEED
  const duration = endFrame * frameMs

  const apply = (frame: number) => {
    for (const { die, frames, total, offset } of items) {
      const mesh = die.mesh
      if (!mesh || total === 0 || mesh.isDisposed?.()) continue
      const local = Math.max(0, Math.min(total - 1, frame - frames.start))
      const i = Math.floor(local)
      const j = Math.min(total - 1, i + 1)
      const k = local - i
      const d = frames.data
      const a = i * 7
      const b = j * 7
      mesh.position.set(d[a] + (d[b] - d[a]) * k, d[a + 1] + (d[b + 1] - d[a + 1]) * k, d[a + 2] + (d[b + 2] - d[a + 2]) * k)
      const q = slerp([d[a + 3], d[a + 4], d[a + 5], d[a + 6]], [d[b + 3], d[b + 4], d[b + 5], d[b + 6]], k)
      const r = offset ? mul(q, offset) : q
      mesh.rotationQuaternion.set(r[0], r[1], r[2], r[3])
    }
  }

  apply(0)
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(guard)
    // сцену успели очистить: результата ждать не от чего
    if (items.some((i) => i.die.mesh?.isDisposed?.())) return
    apply(endFrame)
    for (const { die } of items) void origHandleAsleep?.call(world, die)
  }
  // вкладка скрыта и кадры не идут: страхуемся таймером
  const guard = setTimeout(finish, duration + 400)
  const t0 = performance.now()
  const tick = (now: number) => {
    if (finished) return
    const elapsed = now - t0
    if (elapsed >= duration) return finish()
    if (items.some((i) => i.die.mesh?.isDisposed?.())) {
      finished = true
      clearTimeout(guard)
      return
    }
    apply(elapsed / frameMs)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  if (import.meta.env.DEV || import.meta.env.VITE_DICE_TEST_HOOK) {
    const log = ((window as unknown as { __diceReplay?: unknown[] }).__diceReplay ??= [])
    log.push({ frames: endFrame, ms: Math.round(duration), steps: rec.step, dice: items.length, offsets: items.filter((i) => i.offset).length })
  }
}

interface WorldProto {
  updatesFromPhysics(this: object, buffer: ArrayBuffer): void
  handleAsleep(this: object, die: DieLike): Promise<void>
  renderLoop(this: object): void
}

/**
 * Класс мира нельзя просто импортировать: библиотека подгружает его динамически,
 * и сборщик может завести вторую копию модуля, а перехват попадёт не в ту. Поэтому
 * берём его у живого экземпляра: приватные поля библиотеки собраны на WeakMap,
 * и мир проходит через WeakMap.set, как только фасад его сохраняет.
 */
function catchWorld(): void {
  const original = WeakMap.prototype.set
  WeakMap.prototype.set = function (this: WeakMap<WeakKey, unknown>, key: WeakKey, value: unknown) {
    if (value && typeof (value as WorldProto).updatesFromPhysics === 'function') {
      WeakMap.prototype.set = original
      patchWorld(Object.getPrototypeOf(value) as WorldProto)
    }
    return original.call(this, key, value)
  } as typeof WeakMap.prototype.set
}

function patchWorld(proto: WorldProto): void {
  const origUpdates = proto.updatesFromPhysics
  const origRender = proto.renderLoop
  origHandleAsleep = proto.handleAsleep

  proto.updatesFromPhysics = function (buffer) {
    const rec = recording
    if (!rec || rec.done) return origUpdates.call(this, buffer)
    const view = new Float32Array(buffer)
    for (let i = 0, idx = 1, n = view[0]; i < n; i++, idx += 8) {
      if (view[idx + 1] === -1) continue
      const id = view[idx]
      let f = rec.bodies.get(id)
      if (!f) {
        f = { start: rec.step, data: [] }
        rec.bodies.set(id, f)
      }
      f.data.push(view[idx + 1], view[idx + 2], view[idx + 3], view[idx + 4], view[idx + 5], view[idx + 6], view[idx + 7])
    }
    rec.step++
    // пока добавляются кубики, шагаем не спеша (как у библиотеки, чтобы не слиплись), потом — без пауз
    const adding = rec.bodies.size + rec.sleepers.size < rec.expected
    const raf = window.requestAnimationFrame
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      if (adding) setTimeout(() => cb(0), 8)
      else cb(0)
      return 0
    }) as typeof window.requestAnimationFrame
    try {
      origUpdates.call(this, buffer)
    } finally {
      window.requestAnimationFrame = raf
    }
  }

  proto.handleAsleep = function (die) {
    const rec = recording
    if (!rec || rec.done || !die.mesh) return (origHandleAsleep as NonNullable<typeof origHandleAsleep>).call(this, die)
    rec.world = this
    rec.sleepers.set(die.id as number, die)
    if (rec.sleepers.size >= rec.expected) {
      rec.done = true
      recording = null
      clearTimeout(rec.limit)
      setFast(false)
      // сейчас ещё действует подмена кадров записи: показ начинаем уже после неё
      setTimeout(() => play(rec), 0)
    }
    return Promise.resolve()
  }

  // пока идёт запись, сцена не рисуется: промежуточных положений никто не видит
  proto.renderLoop = function () {
    if (recording && !recording.done) return
    origRender.call(this)
  }
}

let installed = false

/**
 * Включить заданные грани. Безопасно вызывать много раз. Перехват ставится на
 * классы из общих модулей dice-box, поэтому действует и на кубики, созданные
 * библиотекой позже. Вызывать до создания DiceBox: воркер физики создаётся в нём.
 */
export function installForcedFaces(): void {
  if (installed) return
  installed = true
  wrapPhysicsWorker()
  catchWorld()
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
