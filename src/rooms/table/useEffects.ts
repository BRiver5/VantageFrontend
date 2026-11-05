/**
 * Эффекты цели и управление ими. В бою состояние уходит действием боя
 * (сервер уже применяет effect к целям); вне боя — отдельным маршрутом,
 * которого пока нет на сервере (docs/BACKEND_REQUESTS.md).
 */
import { useEffect, useMemo, useState } from 'react'
import { ApiError, getSheet, roomCharacterRef } from '../../api'
import type { AnyCreature, CharacterCard } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { useRoom } from '../RoomProvider'
import { addEffect, combatEffects, removeEffect } from '../roomsApi'
import { describeEffect, type EffectDraft, type ShownEffect } from './effects'

export interface EffectTargetRef {
  card?: CharacterCard | null
  creature?: AnyCreature | null
}

const SERVER_LATER = 'Сервер пока не умеет это вне боя: нужно обновление (см. отчёт для бэкенда)'

/** Эффекты цели в виде для показа. Мастеру у героя догружаем id из листа — чтобы снимать */
export function useTargetEffects({ card, creature }: EffectTargetRef): ShownEffect[] {
  const { roomId, isDm } = useRoom()
  const labels = card?.effects ?? []
  const key = labels.join('\u0001')
  const [ids, setIds] = useState<Record<string, { id: string; rounds: number | null }>>({})
  // сервер шлёт id прямо в карточке; лист читаем, только если карточка старая
  const detail = card?.effects_detail
  useEffect(() => {
    if (!card || !isDm || labels.length === 0 || detail?.length) return
    let alive = true
    getSheet(roomCharacterRef(roomId, card.id))
      .then((s) => alive && setIds(Object.fromEntries((s.active_effects ?? []).map((e) => [e.label, { id: e.id, rounds: e.rounds_left }]))))
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // перечитываем, только когда сменился набор подписей
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, card?.id, isDm, key])
  return useMemo(() => {
    if (creature) {
      if (isFullCreature(creature)) return (creature.conditions ?? []).map((e) => describeEffect(e.label, { id: e.id, rounds: e.rounds_left }))
      if (creature.effects_detail?.length) return creature.effects_detail.map((e) => describeEffect(e.label, { id: e.id, rounds: e.rounds_left }))
      return (creature.effects ?? []).map((l) => describeEffect(l))
    }
    if (detail?.length) return detail.map((e) => describeEffect(e.label, { id: e.id, rounds: e.rounds_left }))
    return labels.map((l) => describeEffect(l, ids[l]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creature, key, ids, detail])
}

/** Наложить и снять: мастер */
export function useEffectControl({ card, creature }: EffectTargetRef) {
  const { roomId, data } = useRoom()
  const combat = data?.combat && data.combat.status !== 'ended' ? data.combat : null
  const unit = combat?.combatants.find((c) => (card ? c.kind === 'character' && c.ref_id === card.id : c.kind === 'creature' && c.ref_id === creature?.id))
  const target = card ? ({ kind: 'character', id: card.id } as const) : creature ? ({ kind: 'creature', id: creature.id } as const) : null

  const apply = async (d: EffectDraft) => {
    if (!target) return
    if (combat && unit) {
      // в бою — на участника без действующего: в журнале нет «Брина: Отравлен → Брина»
      await combatEffects(roomId, combat.id, [unit.id], { label: d.label, expires: d.expires, rounds_left: d.rounds_left, save_ability: d.save_ability ?? null, save_dc: d.save_dc ?? null })
      return
    }
    try {
      await addEffect(roomId, target, { label: d.label, expires: d.expires === 'rounds' || d.expires === 'save_ends' ? 'never' : d.expires, rounds_left: null, concentration: d.concentration })
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) throw new Error(SERVER_LATER)
      throw e
    }
  }

  const remove = async (e: ShownEffect) => {
    if (!target) return
    if (!e.id) throw new Error('Не нашли этот эффект в листе: обновите страницу')
    try {
      await removeEffect(roomId, target, e.id)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) throw new Error(SERVER_LATER)
      throw err
    }
  }

  return { apply, remove, inCombat: !!(combat && unit) }
}
