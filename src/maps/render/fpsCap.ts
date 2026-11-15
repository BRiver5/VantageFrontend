/**
 * Предел кадров для холста карты. requestAnimationFrame идёт с частотой
 * экрана; лишние кадры пропускаем. Небольшой допуск — чтобы при пределе 30
 * на экране 60 Гц рисовался ровно каждый второй кадр, несмотря на дрожание.
 */
const SLACK_MS = 1.5

export const frameInterval = (maxFps: number): number => (maxFps > 0 ? 1000 / maxFps : 0)

/** Счётчик: true — этот кадр рисуем. maxFps ≤ 0 — без предела */
export function createFrameCap(): (now: number, maxFps: number) => boolean {
  let last = -Infinity
  return (now, maxFps) => {
    const iv = frameInterval(maxFps)
    if (iv <= 0) {
      last = now
      return true
    }
    const passed = now - last
    if (passed < iv - SLACK_MS) return false
    // сохраняем ритм: остаток переносим, но не копим долг после долгой паузы
    last = passed < iv * 2 ? last + iv : now
    return true
  }
}
