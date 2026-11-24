/**
 * Описание предыстории 2024 приходит плоским текстом: сначала строки-параметры
 * («Характеристики: …», «Черта: …», «Навыки: …», «Инструменты: …», «Снаряжение: …»),
 * потом пустая строка и рассказ. Параметры страница показывает плитками и картинками
 * снаряжения, поэтому в тексте остаётся только рассказ.
 */

const HEADER = /^(Характеристики|Черта|Навыки|Инструменты|Снаряжение|Языки)\s*:\s*(.*)$/

export interface BackgroundText {
  /** параметры из шапки: «Черта» → «Посвящённый в магию (Волшебник)» */
  header: Record<string, string>
  /** рассказ без шапки */
  lore: string
}

export function splitBackgroundText(text: string | null | undefined): BackgroundText {
  const lines = (text ?? '').split('\n')
  const header: Record<string, string> = {}
  let i = 0
  for (; i < lines.length; i++) {
    const m = HEADER.exec(lines[i].trim())
    if (!m) break
    header[m[1]] = m[2].trim()
  }
  if (!Object.keys(header).length) return { header, lore: (text ?? '').trim() }
  return { header, lore: lines.slice(i).join('\n').trim() }
}
