/**
 * Здоровье и имена так, как их положено видеть зрителю. Игрок знает о враге
 * только то, что открыл мастер: точные хиты (visibility.hp = exact), состояние
 * словом (band) или ничего. Имя — public_name, пока настоящее скрыто: сервер
 * уже кладёт его в `name` игрового вида существа.
 */
import type { AnyCreature, CharacterCard, HpBand } from '../types/rooms'
import { isFullCreature } from '../types/rooms'

export const BAND_LABEL: Record<HpBand, string> = {
  healthy: 'Невредим',
  bloodied: 'Ранен',
  critical: 'При смерти',
  down: 'Повержен',
}

/** Заполнение по состоянию: до верха зоны, чтобы по полоске нельзя было вычислить хиты */
export const BAND_RATIO: Record<HpBand, number> = { healthy: 1, bloodied: 0.5, critical: 0.25, down: 0 }

/** Те же пороги, что на сервере (app/rooms/creatures.hp_band) */
export function bandOf(current: number, max: number): HpBand {
  if (current <= 0) return 'down'
  if (current * 2 > max) return 'healthy'
  return current * 4 > max ? 'bloodied' : 'critical'
}

/** Что показать о здоровье: точная доля, или только состояние, или ничего */
export type HealthView = { kind: 'exact'; ratio: number; current: number; max: number; temp: number; band: HpBand } | { kind: 'band'; ratio: number; band: HpBand } | { kind: 'hidden' }

const ratioOf = (current: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, current / max)) : 0)

const exact = (current: number, max: number, temp: number): HealthView => ({ kind: 'exact', ratio: ratioOf(current, max), current, max, temp, band: bandOf(current, max) })

/**
 * Здоровье существа для зрителя. Полный вид (snapshot) приходит только мастеру;
 * если он почему-то оказался у игрока, точные хиты всё равно не показываем.
 */
export function creatureHealth(c: AnyCreature, isDm: boolean): HealthView {
  if (isFullCreature(c)) {
    if (isDm) return exact(c.hp_current, c.hp_max, c.hp_temp)
    const band = bandOf(c.hp_current, c.hp_max)
    return c.visibility?.hp === 'hidden' ? { kind: 'hidden' } : { kind: 'band', ratio: BAND_RATIO[band], band }
  }
  if (c.hp) return exact(c.hp.current, c.hp.max, c.hp.temp)
  if (c.hp_band) return { kind: 'band', ratio: BAND_RATIO[c.hp_band], band: c.hp_band }
  return { kind: 'hidden' }
}

/** Герои отряда друг у друга на виду: хиты в карточке открыты всем */
export const heroHealth = (card: CharacterCard): HealthView => exact(card.hp.current, card.hp.max, card.hp.temp ?? 0)

/** Имя существа для зрителя: мастеру настоящее, игроку — то, что прислал сервер */
export function creatureLabel(c: AnyCreature, isDm: boolean): string {
  if (isFullCreature(c)) return isDm ? c.display_name : c.public_name || 'Существо'
  return c.name
}

/** Подпись для чтения с экрана */
export function healthText(h: HealthView): string {
  if (h.kind === 'exact') return `Хиты: ${h.current} из ${h.max}${h.temp ? `, временные ${h.temp}` : ''}`
  if (h.kind === 'band') return `Состояние: ${BAND_LABEL[h.band]}`
  return 'Хиты скрыты'
}
