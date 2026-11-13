import type {
  CharacterEvent,
  LevelUpResult,
  RunInputs,
  RunResult,
  Sheet,
  SpellKnown,
} from '../types/character'
import { request } from './http'

/* ---------- Лист и движок ---------- */

/**
 * Ссылка на персонажа для всех игровых запросов: обычный id (`/characters/{id}`)
 * или готовая база пути — у персонажа в комнате это
 * `/rooms/{rid}/characters/{cid}` (см. roomCharacterRef). Маршруты листа в комнате
 * те же, что у обычного персонажа, только с этим префиксом.
 */
export type CharacterRef = string

/** Признак готовой базы: id персонажа слэшей не содержит */
export const ch = (ref: CharacterRef, path = '') => (ref.startsWith('/') ? `${ref}${path}` : `/characters/${ref}${path}`)

/**
 * Сотворить заклинание с листа: сервер тратит ячейку, ставит концентрацию,
 * лечит и накладывает эффект на себя (target: self). Урон вне боя не
 * применяется — кости приходят в rolls для показа.
 */
export function castSpellFromSheet(
  ref: CharacterRef,
  body: { spell_name: string; slot_level?: number | null; pool?: 'spell' | 'pact'; ritual?: boolean; repeat?: boolean; damage_type?: string | null; target?: 'self' | 'other'; summon_count?: number | null },
): Promise<{ log?: { kind?: string; message?: string }[]; spell?: Record<string, unknown>; rolls?: { label?: string; total?: number; expression?: string }[] }> {
  return request(ch(ref, '/cast'), { method: 'POST', body, auth: true })
}

/** Ссылка на копию персонажа внутри комнаты */
export const roomCharacterRef = (roomId: string, characterId: string): CharacterRef => `/rooms/${roomId}/characters/${characterId}`

/** Вычисленный лист: все числа, ресурсы, ячейки и доступные действия */
export function getSheet(id: string): Promise<Sheet> {
  return request<Sheet>(ch(id, '/sheet'), { auth: 'optional' })
}

/** Действие способности; при needs_input повторяется с накопленными ответами */
export function runAction(
  id: string,
  grantId: string,
  actionKey: string,
  inputs: RunInputs = {},
  dryRun = false,
): Promise<RunResult> {
  return request<RunResult>(ch(id, `/actions/${encodeURIComponent(grantId)}/${encodeURIComponent(actionKey)}`), {
    method: 'POST',
    body: { inputs, dry_run: dryRun },
    auth: true,
  })
}

/** Отдых; для короткого — сколько костей хитов какого класса бросить */
export function rest(id: string, kind: 'short' | 'long', hitDice: Record<string, number> = {}): Promise<RunResult> {
  return request<RunResult>(ch(id, '/rest'), {
    method: 'POST',
    body: kind === 'short' ? { kind, hit_dice: hitDice } : { kind },
    auth: true,
  })
}

export type VitalsOp = 'damage' | 'heal' | 'temp' | 'inspiration' | 'death_save'

/**
 * Хиты от игрока: урон (с типом — учтутся сопротивления и облик), лечение,
 * временные хиты, вдохновение (amount — прибавка, может быть отрицательной),
 * спасброски от смерти (amount — новое значение дорожки success/failure).
 */
export function applyVitals(
  id: string,
  body: { op: VitalsOp; amount: number; damage_type?: string | null; success?: boolean },
): Promise<RunResult> {
  return request<RunResult>(ch(id, '/vitals'), { method: 'POST', body, auth: true })
}

export type TurnEvent = 'turn.start' | 'turn.end' | 'combat.start' | 'combat.end'

export function sendEvent(id: string, name: TurnEvent, payload: Record<string, unknown> = {}): Promise<RunResult> {
  return request<RunResult>(ch(id, `/events/${name}`), { method: 'POST', body: { payload }, auth: true })
}

/** Новый уровень в классе; новый class_id — мультикласс; без hp_roll — среднее */
export function levelUp(
  id: string,
  body: {
    class_id: string
    subclass_id?: string | null
    hp_roll?: number | null
    /** черта вместо увеличения характеристик */
    feat_id?: string | null
    /** новые заговоры и заклинания уровня — в той же ревизии */
    spells?: SpellKnown[]
  },
): Promise<LevelUpResult> {
  return request<LevelUpResult>(ch(id, '/level-up'), { method: 'POST', body, auth: true })
}

/**
 * Потратить (amount > 0) или вернуть ресурс без программы способности —
 * реакции после броска: кость превосходства, Везунчик, Удача темнейшего.
 * Не хватает — status: rejected.
 */
export function spendResource(id: string, key: string, body: { amount?: number; reason?: string }): Promise<RunResult> {
  return request<RunResult>(ch(id, `/resources/${encodeURIComponent(key)}/spend`), {
    method: 'POST',
    body: { amount: body.amount ?? 1, reason: body.reason },
    auth: true,
  })
}

export function resolvePending(id: string, decisionId: string, inputs: RunInputs = {}): Promise<RunResult> {
  return request<RunResult>(ch(id, `/pending/${encodeURIComponent(decisionId)}`), {
    method: 'POST',
    body: { inputs },
    auth: true,
  })
}

export function dismissPending(id: string, decisionId: string): Promise<Sheet> {
  return request<Sheet>(ch(id, `/pending/${encodeURIComponent(decisionId)}`), { method: 'DELETE', auth: true })
}

export function attachAbility(
  id: string,
  slug: string,
  choices: Record<string, unknown> = {},
): Promise<{ grant_id: string; sheet: Sheet }> {
  return request(ch(id, '/abilities'), { method: 'POST', body: { slug, choices }, auth: true })
}

export function detachAbility(id: string, grantId: string): Promise<Sheet> {
  return request<Sheet>(ch(id, `/abilities/${encodeURIComponent(grantId)}`), { method: 'DELETE', auth: true })
}

export function toggleAbility(id: string, grantId: string, enabled: boolean): Promise<Sheet> {
  return request<Sheet>(ch(id, `/abilities/${encodeURIComponent(grantId)}`), {
    method: 'PATCH',
    body: { enabled },
    auth: true,
  })
}

export function syncAbilities(id: string): Promise<{ changes: string[]; sheet: Sheet }> {
  return request(ch(id, '/sync'), { method: 'POST', auth: true })
}

export function listEvents(id: string, limit = 50): Promise<CharacterEvent[]> {
  return request<CharacterEvent[]>(ch(id, `/events?limit=${limit}`), { auth: true })
}

export function undoEvent(id: string, eventId: string): Promise<Sheet> {
  return request<Sheet>(ch(id, `/events/${encodeURIComponent(eventId)}/undo`), { method: 'POST', auth: true })
}

/** Правка мастера (только админ): хранимые значения и оверрайды; null снимает оверрайд */
export function patchStore(
  id: string,
  body: { set?: Record<string, unknown>; overrides?: Record<string, unknown> },
): Promise<Sheet> {
  return request<Sheet>(ch(id, '/store'), { method: 'PATCH', body, auth: true })
}

/** Словари движка: русские подписи навыков, типов урона, состояний */
export interface EngineDictionaries {
  abilities: { value: string; label: string }[]
  skills: { value: string; label: string; ability: string }[]
  damage_types: { value: string; label: string }[]
  conditions: { value: string; label: string }[]
  classes: { value: string; label: string }[]
}

/** Словари и подписи переменных персонажа: var.sneak_attack_dice → «Кости скрытой атаки» */
export interface EngineCatalog {
  dictionaries: EngineDictionaries | null
  labels: Record<string, string>
}

/** Каталог с переменными, которые объявили способности этого персонажа */
export async function getEngineCatalog(characterId: string): Promise<EngineCatalog> {
  const c = await request<{ dictionaries?: EngineDictionaries; paths?: { path: string; label?: string }[] }>(
    `/engine/catalog?character_id=${encodeURIComponent(characterId)}`,
    { auth: 'optional' },
  )
  const labels: Record<string, string> = {}
  for (const p of c.paths ?? []) if (p.label) labels[p.path] = p.label
  return { dictionaries: c.dictionaries ?? null, labels }
}

let dictionariesPromise: Promise<EngineDictionaries | null> | null = null

export function getEngineDictionaries(): Promise<EngineDictionaries | null> {
  if (!dictionariesPromise) {
    dictionariesPromise = request<{ dictionaries?: EngineDictionaries }>('/engine/catalog')
      .then((c) => c.dictionaries ?? null)
      .catch(() => {
        dictionariesPromise = null
        return null
      })
  }
  return dictionariesPromise
}
