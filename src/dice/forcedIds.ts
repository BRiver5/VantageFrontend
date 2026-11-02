/**
 * Идентификаторы костей с заданным исходом. Лёгкий модуль: сам перехват в
 * forcedFaces.ts тянет за собой весь dice-box, поэтому грузится лениво.
 */

/** Какие кости умеем доворачивать до нужной грани */
export const FORCEABLE_SIDES = new Set([4, 6, 8, 10, 12, 20])

/** rollId с зашитым значением; суффикс делает идентификатор уникальным (без точек: dice-box их разбирает) */
export const forcedRollId = (value: number, uniq: string | number) => `F${value}_${uniq}`

/** Значение, зашитое в rollId; null — кость катится как обычно */
export const forcedValueOf = (rollId: unknown): number | null => {
  const m = /^F(\d+)_/.exec(String(rollId ?? ''))
  return m ? Number(m[1]) : null
}
