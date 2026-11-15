/**
 * Логика окна «Управление» поверх реестра горячих клавиш: группы с поиском,
 * правка сочетаний действия (заменить, добавить, удалить), конфликты для
 * подсказки. Конфликт — только предупреждение, назначить всё равно можно.
 */
import {
  ACTIONS,
  CATEGORY_LABELS,
  combosOf,
  conflicts,
  isLocked,
  isOverridden,
  normalizeCombo,
  setCombos,
  type ActionId,
  type KeyAction,
  type KeyCategory,
} from '../input/keybindings'

export type ActionGroup = { category: KeyCategory; label: string; actions: KeyAction[] }

const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim()

/** Действия по разделам; запрос ищет в названии, разделе и сочетаниях */
export function groupActions(query = ''): ActionGroup[] {
  const q = norm(query)
  const out: ActionGroup[] = []
  for (const category of Object.keys(CATEGORY_LABELS) as KeyCategory[]) {
    const label = CATEGORY_LABELS[category]
    const actions = (ACTIONS as readonly KeyAction[]).filter((a) => {
      if (a.category !== category) return false
      if (!q) return true
      const hay = norm([a.label, label, ...combosOf(a.id as ActionId)].join(' '))
      return q.split(/\s+/).every((w) => hay.includes(w))
    })
    if (actions.length) out.push({ category, label, actions })
  }
  return out
}

/** Заменить сочетание под номером index (index = длине — добавить новое) */
export function putCombo(id: ActionId, index: number, combo: string): void {
  if (isLocked(id)) return
  const c = normalizeCombo(combo)
  if (!c) return
  const list = [...combosOf(id)]
  if (index >= list.length) list.push(c)
  else list[index] = c
  setCombos(id, list)
}

/** Убрать сочетание под номером index */
export function removeCombo(id: ActionId, index: number): void {
  if (isLocked(id)) return
  setCombos(
    id,
    combosOf(id).filter((_, i) => i !== index),
  )
}

/** Есть ли свои назначения — тогда «Сбросить все» спрашивает подтверждение */
export const hasCustomBinds = (): boolean => ACTIONS.some((a) => isOverridden(a.id))

export type ActionConflict = { combo: string; with: ActionId[] }

/** Для каждого действия: с какими действиями совпадает каждое его сочетание */
export function conflictIndex(): Map<ActionId, ActionConflict[]> {
  const byAction = new Map<ActionId, Map<string, Set<ActionId>>>()
  const add = (a: ActionId, combo: string, b: ActionId) => {
    let m = byAction.get(a)
    if (!m) byAction.set(a, (m = new Map()))
    let s = m.get(combo)
    if (!s) m.set(combo, (s = new Set()))
    s.add(b)
  }
  for (const c of conflicts()) {
    add(c.a, c.combo, c.b)
    add(c.b, c.combo, c.a)
  }
  const out = new Map<ActionId, ActionConflict[]>()
  for (const [id, m] of byAction) out.set(id, [...m].map(([combo, s]) => ({ combo, with: [...s] })))
  return out
}

/** Подсказка о конфликте: «Ctrl+K — также: Открыть поиск; Ссылка на страницу» */
export function conflictText(list: readonly ActionConflict[], labelOf: (id: ActionId) => string): string {
  return list.map((c) => `${c.combo} — также: ${c.with.map(labelOf).join('; ')}`).join('\n')
}
