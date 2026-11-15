/**
 * Согласование существительного с числом по правилам русского языка.
 *
 *   plural(n, ['результат', 'результата', 'результатов'])
 *   countLabel(5, ['результат', 'результата', 'результатов']) → «5 результатов»
 *
 * Формы: [одна, несколько, много] — как для 1, 2 и 5.
 * - 1, 21, 101 → первая; 2–4, 22–24 → вторая; 0, 5–20, 25–30, 111 → третья;
 * - знак не важен: −1 — как 1;
 * - дробное число берёт вторую форму: «1,5 фута», «0,5 клетки».
 */

export type PluralForms = readonly [one: string, few: string, many: string]

export function plural(n: number, forms: PluralForms): string {
  const [one, few, many] = forms
  if (!Number.isFinite(n)) return many
  const abs = Math.abs(n)
  if (!Number.isInteger(abs)) return few
  const d10 = abs % 10
  const d100 = abs % 100
  if (d10 === 1 && d100 !== 11) return one
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few
  return many
}

/** Число и слово: «5 результатов», «1,5 фута» (дробь — через запятую) */
export function countLabel(n: number, forms: PluralForms): string {
  const num = Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
  return `${num} ${plural(n, forms)}`
}
