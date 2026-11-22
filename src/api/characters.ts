import type {
  Character,
  CharacterInput,
} from '../types/character'
import { characterPayload } from '../types/character'
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
