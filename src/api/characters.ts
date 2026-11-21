import type {
  Character,
  CharacterEdition,
  CharacterInput,
} from '../types/character'
import { characterPayload } from '../types/character'
import { catalogSearchPath, convertBody, entityName, resolveBody } from '../characters/editionConvert'
import { request } from './http'
import { ch } from './engine'

/* ---------- Characters (schema v2) ---------- */

/** Ответ списка: массив или страница { items } — сервер отдаёт по-разному */
function itemsOf<T>(data: T[] | { items: T[] } | null): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray(data.items)) return data.items
  return []
}

export async function listMyCharacters(): Promise<Character[]> {
  return itemsOf(await request<Character[] | { items: Character[] }>('/me/characters', { auth: true }))
}

export async function listCharacters(opts: { mine?: boolean; q?: string } = {}): Promise<Character[]> {
  const params = new URLSearchParams()
  if (opts.mine) params.set('mine', 'true')
  if (opts.q) params.set('q', opts.q)
  const qs = params.toString()
  return itemsOf(
    await request<Character[] | { items: Character[] }>(`/characters${qs ? `?${qs}` : ''}`, {
      auth: opts.mine ? true : 'optional',
    }),
  )
}

export function getCharacter(id: string): Promise<Character> {
  return request<Character>(ch(id), { auth: 'optional' })
}

/** Создать: только выбор игрока; способности по источникам сервер выдаст сам */
export function createCharacter(body: CharacterInput): Promise<Character> {
  return request<Character>('/characters', {
    method: 'POST',
    body: characterPayload(body),
    auth: true,
  })
}

/** PATCH — только изменённые поля; поля движка сервер не принимает */
export function updateCharacter(id: string, body: CharacterInput): Promise<Character> {
  return request<Character>(ch(id), {
    method: 'PATCH',
    body: characterPayload(body),
    auth: true,
  })
}

export function deleteCharacter(id: string): Promise<void> {
  return request<void>(ch(id), { method: 'DELETE', auth: true })
}

/* ---------- Редакция правил ---------- */

/**
 * Пересоздать персонажа по другой редакции: сервер делает копию (имя + « (2024)»),
 * оригинал остаётся. Что не сопоставилось — в edition_issues копии.
 */
export function convertCharacterEdition(id: string, to: CharacterEdition): Promise<Character> {
  return request<Character>(ch(id, '/convert-edition'), {
    method: 'POST',
    body: convertBody(to),
    auth: true,
  })
}

/** Ответ на вопрос после пересоздания: оставить старое или заменить записью каталога */
export function resolveEditionIssue(id: string, key: string, replacementId?: string | null): Promise<Character> {
  return request<Character>(ch(id, `/edition-issues/${encodeURIComponent(key)}/resolve`), {
    method: 'POST',
    body: resolveBody(replacementId),
    auth: true,
  })
}

/** Поиск замены в разделе каталога нужной редакции */
export async function searchEditionCatalog(
  resource: string,
  q: string,
  edition: CharacterEdition,
  signal?: AbortSignal,
): Promise<{ id: string; name: string }[]> {
  const page = await request<{ id: string }[] | { items: { id: string }[] }>(catalogSearchPath(resource, q, edition), { signal })
  return itemsOf(page).map((x) => ({ id: x.id, name: entityName(x as Record<string, unknown>) }))
}
