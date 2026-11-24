/**
 * Черновик конструктора героя в браузере: перезагрузка страницы не теряет выбранное.
 * Хранится в localStorage этого устройства; после создания героя стирается.
 * Любая ошибка хранилища (приватный режим, переполнение) — просто без сохранения.
 */
import type { CharacterDraft } from './draft'

const KEY = 'vantage.create.draft.v1'

export interface SavedWizard {
  draft: CharacterDraft
  stepIdx: number
  maxVisited: number
}

export function loadWizard(): SavedWizard | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<SavedWizard>
    if (!v || typeof v !== 'object' || !v.draft || typeof v.draft !== 'object') return null
    return { draft: v.draft, stepIdx: Number(v.stepIdx) || 0, maxVisited: Number(v.maxVisited) || 0 }
  } catch {
    return null
  }
}

export function saveWizard(state: SavedWizard): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // не влезло (картинка-портрет в data:) — сохраняем без неё
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, draft: { ...state.draft, avatarUrl: '' } }))
    } catch {
      /* без сохранения */
    }
  }
}

export function clearWizard(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
