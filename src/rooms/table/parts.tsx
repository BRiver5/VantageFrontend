/**
 * Детали сцены комнаты: шестигранные жетоны, спидометр хитов под ногами,
 * карточка, которая вылетает из той точки, по которой нажали, и закрывается
 * обратно в неё. Всё, что видно на столе, собрано из этих кирпичей.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, Skull } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCharacter, getOne, listMyCharacters, realImage, roomCharacterRef, type GameClass, type Race } from '../../api'
import { useRoom } from '../RoomProvider'
import { setRoomCharacterAvatar } from '../roomsApi'
import { FaceImage } from '../../characters/FacePortrait'
import { parsePortrait } from '../../characters/portrait'
import type { AnyCreature, CharacterCard, HpBand, RoomItem } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { Img } from '../../media'

/* ---------- данные ---------- */

export const BAND_RU: Record<HpBand, string> = { healthy: 'здоров', bloodied: 'ранен', critical: 'при смерти', down: 'повержен' }
/** Словом: заполнение до верха зоны, а не «примерно столько», иначе дуга намекала бы на точные хиты */
const BAND_RATIO: Record<HpBand, number> = { healthy: 1, bloodied: 0.5, critical: 0.25, down: 0 }

export const SIZE_RU: Record<string, string> = { Tiny: 'крошечный', Small: 'маленький', Medium: 'средний', Large: 'большой', Huge: 'огромный', Gargantuan: 'громадный' }

export const creatureArt = (c: AnyCreature): string | null => (isFullCreature(c) ? (c.image_url ?? realImage(c.snapshot.image_gallery) ?? realImage(c.snapshot.image_url)) : c.image_url)
export const creatureName = (c: AnyCreature): string => (isFullCreature(c) ? c.display_name : c.name)
export const creatureSize = (c: AnyCreature): string | null | undefined => (isFullCreature(c) ? c.snapshot.size : c.size)

export const itemName = (it: RoomItem) => it.equipment?.equipment_name ?? it.magic_item?.item_name ?? 'Предмет'
export const itemArt = (it: RoomItem) => realImage(it.equipment?.equipment_image_gallery) ?? realImage(it.magic_item?.item_image_gallery)

/**
 * В событии передачи нет картинки предмета. Отправитель её знает, поэтому
 * оставляет подсказку, и у него вещь летит с настоящей картинкой.
 */
export const relayArt = new Map<string, string>()
export const relayKey = (from: string, to: string, name: string) => `${from}>${to}>${name}`
export const itemSub = (it: RoomItem) => it.magic_item?.rarity ?? it.equipment?.subcategory ?? it.equipment?.category ?? ''

/** Хиты существа в долях; у игрока могут быть только словом или не быть совсем */
export function creatureHp(c: AnyCreature): { ratio: number | null; current?: number; max?: number; temp?: number; band?: HpBand } {
  if (isFullCreature(c)) return { ratio: c.hp_max > 0 ? clamp01(c.hp_current / c.hp_max) : 0, current: c.hp_current, max: c.hp_max, temp: c.hp_temp }
  if (c.hp) return { ratio: c.hp.max > 0 ? clamp01(c.hp.current / c.hp.max) : 0, current: c.hp.current, max: c.hp.max, temp: c.hp.temp }
  if (c.hp_band) return { ratio: BAND_RATIO[c.hp_band], band: c.hp_band }
  return { ratio: null }
}
export const cardRatio = (c: CharacterCard) => (c.hp.max > 0 ? clamp01(c.hp.current / c.hp.max) : 0)

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const hpTone = (r: number | null) => (r == null ? 'none' : r <= 0 ? 'down' : r <= 0.3 ? 'low' : r <= 0.6 ? 'mid' : 'ok')

/** Псевдослучайное число от id: у всех игроков предмет лежит одинаково */
export function seed(id: string, k = 0): number {
  let h = 2166136261 ^ k
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

export const errText = (e: unknown, fallback = 'Ошибка сервера') => (e instanceof Error && e.message ? e.message : fallback)

/* ---------- картинка героя, как в листе ---------- */

const heroArtCache = new Map<string, Promise<string | null>>()

/**
 * В комнате лежит копия героя, снятая при входе. Картинку, загруженную в
 * оригинал позже, копия не знает: ищем оригинал среди своих героев (по имени
 * и расе) и заодно переносим картинку в копию, чтобы её увидела вся партия.
 */
const originalCache = new Map<string, Promise<string | null>>()

function avatarFromOriginal(roomId: string, characterId: string, name: string, raceId: string | null | undefined): Promise<string | null> {
  const key = `${roomId}/${characterId}`
  const known = originalCache.get(key)
  if (known) return known
  const job = findOriginalAvatar(roomId, characterId, name, raceId)
  originalCache.set(key, job)
  return job
}

async function findOriginalAvatar(roomId: string, characterId: string, name: string, raceId: string | null | undefined): Promise<string | null> {
  const mine = await listMyCharacters().catch(() => [])
  const same = mine.filter((x) => x.avatar_url && x.character_name === name)
  const hit = same.find((x) => !raceId || x.race_id === raceId) ?? (same.length === 1 ? same[0] : undefined)
  if (!hit?.avatar_url) return null
  void setRoomCharacterAvatar(roomId, characterId, hit.avatar_url).catch(() => undefined)
  return hit.avatar_url
}

/** Своя картинка героя, а без неё — картинка расы (или класса), как в листе */
function loadHeroArt(roomId: string, characterId: string, own: boolean): Promise<string | null> {
  const key = `${roomId}/${characterId}/${own ? 'own' : ''}`
  const known = heroArtCache.get(key)
  if (known) return known
  const job = getCharacter(roomCharacterRef(roomId, characterId))
    .then(async (c) => {
      if (c.avatar_url) return c.avatar_url
      const original = own ? await avatarFromOriginal(roomId, characterId, c.character_name, c.race_id) : null
      if (original) return original
      const race = c.race_id ? await getOne<Race>('races', c.race_id).catch(() => null) : null
      const fromRace = realImage(race?.image_gallery)
      if (fromRace) return fromRace
      const cls = c.classes[0]?.class_id ? await getOne<GameClass>('classes', c.classes[0].class_id).catch(() => null) : null
      return realImage(cls?.image_gallery)
    })
    .catch(() => null)
  heroArtCache.set(key, job)
  return job
}

/**
 * Картинка своего героя из оригинала, если в комнатной копии её нет: её
 * подставляет подробный лист героя в комнате.
 */
export function useOriginalAvatar(roomId: string, characterId: string, copyAvatar: string | null | undefined): string | null {
  const [art, setArt] = useState<string | null>(null)
  const own = useRoom().data?.me.room_character_id === characterId
  useEffect(() => {
    if (copyAvatar || !own) return
    let alive = true
    void getCharacter(roomCharacterRef(roomId, characterId))
      .then((c) => (c.avatar_url ? null : avatarFromOriginal(roomId, characterId, c.character_name, c.race_id)))
      .catch(() => null)
      .then((a) => alive && setArt(a))
    return () => {
      alive = false
    }
  }, [roomId, characterId, copyAvatar, own])
  return copyAvatar ? null : art
}

/**
 * Картинка героя для стола: из карточки, а если там пусто — из листа. Чужой лист
 * игроку не открыт, поэтому догружаем только свой (мастеру — все).
 */
export function useHeroArt(roomId: string, characterId: string | null | undefined, cardAvatar: string | null | undefined, allowed: boolean): string | null {
  const [art, setArt] = useState<string | null>(null)
  const own = useRoom().data?.me.room_character_id === characterId
  useEffect(() => {
    if (cardAvatar || !characterId || !(allowed || own)) return
    let alive = true
    void loadHeroArt(roomId, characterId, own).then((a) => alive && setArt(a))
    return () => {
      alive = false
    }
  }, [roomId, characterId, cardAvatar, allowed, own])
  return cardAvatar || art
}

/* ---------- шестигранник ---------- */

const HEX_PATH = 'M50 2 L98 29.7 V85.8 L50 113.5 L2 85.8 V29.7 Z'

export function Hex({
  raw,
  plain,
  name,
  ratio,
  online,
  tone,
  icon: Icon,
  children,
}: {
  /** ссылка портрета героя: может содержать кадр лица */
  raw?: string | null
  /** обычная картинка: существо, предмет */
  plain?: string | null
  name?: string
  /** доля хитов: рисуется по ободу */
  ratio?: number | null
  online?: boolean
  tone?: string
  icon?: LucideIcon
  children?: ReactNode
}) {
  const info = parsePortrait(raw)
  const [broken, setBroken] = useState(false)
  const src = plain ?? info.src
  const initial = (name ?? '').trim().charAt(0).toUpperCase()
  // у существа без открытой картинки — череп, а не буква «С» от слова «Существо»
  const Fallback = Icon ?? (tone === 'enemy' ? Skull : null)
  useEffect(() => setBroken(false), [src])
  return (
    <span className={`tb-hex${tone ? ` is-${tone}` : ''}`}>
      <span className="tb-hex-clip">
        {src && !broken ? (
          !plain && info.face && info.face.shape !== 'full' ? (
            <FaceImage src={src} crop={info.face} />
          ) : (
            <Img className="tb-hex-img" src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
          )
        ) : Fallback ? (
          <Fallback className="tb-hex-icon" aria-hidden="true" />
        ) : initial ? (
          <b>{initial}</b>
        ) : (
          <ImageOff className="tb-hex-icon" aria-hidden="true" />
        )}
      </span>
      <svg className="tb-hex-rim" viewBox="0 0 100 115.47" aria-hidden="true">
        <path className="tb-hex-base" d={HEX_PATH} />
        {ratio != null && <path className={`tb-hex-hp is-${hpTone(ratio)}`} d={HEX_PATH} pathLength={100} style={{ strokeDasharray: `${ratio * 100} 100` }} />}
      </svg>
      {online != null && <i className={`tb-hex-dot${online ? ' is-on' : ''}`} title={online ? 'в сети' : 'не в сети'} />}
      {children}
    </span>
  )
}

/* ---------- спидометр хитов: перевёрнутая сплюснутая дуга под ногами ---------- */

/** Сколько хитов в одном делении: круглое число, делений не больше двадцати */
const HP_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
const hpStep = (max: number) => HP_STEPS.find((s) => max / s <= 20) ?? Math.ceil(max / 20)

const ARC = 'M8 8 A 92 44 0 0 0 192 8'
const TICK = 0.7

/**
 * Деления честные только для тех, кому хиты открыты: 4 хита — 4 деления, 143 — 15
 * по десять. Кому открыто лишь состояние (игрок видит «ранен»), дуга делится на
 * зоны состояний: по ней нельзя вычислить ни запас хитов, ни сколько осталось.
 * Скрытые хиты — пунктир без всего.
 */
export function HpArc({
  ratio,
  current,
  max,
  temp,
  band,
}: {
  ratio: number | null
  current?: number
  max?: number
  temp?: number
  band?: HpBand
}) {
  const tone = hpTone(ratio)
  const known = ratio != null
  const exact = current != null && !!max
  const step = exact ? hpStep(max as number) : 0
  const seg = exact ? (100 * step) / (max as number) : 0
  // метка на дуге: параметр эллипса от левого края через низ к правому
  const t = (known ? (ratio as number) : 0) * Math.PI
  const x = 100 - 92 * Math.cos(t)
  const y = 8 + 44 * Math.sin(t)
  const label = exact ? `Хиты: ${current} из ${max}` : band ? `Состояние: ${BAND_RU[band]}` : 'Хиты неизвестны'
  return (
    <span className={`bt-arc is-${tone}`} role="img" aria-label={label} title={exact && step > 1 ? `Одно деление: ${step} хитов` : undefined}>
      <svg viewBox="0 0 200 66" aria-hidden="true">
        <path className="bt-arc-track" d={ARC} pathLength={100} />
        {band && (
          <>
            <path className="bt-arc-zone is-low" d={ARC} pathLength={100} style={{ strokeDasharray: '25 100' }} />
            <path className="bt-arc-zone is-mid" d={ARC} pathLength={100} style={{ strokeDasharray: '0 25 25 100' }} />
            <path className="bt-arc-zone is-ok" d={ARC} pathLength={100} style={{ strokeDasharray: '0 50 50 100' }} />
          </>
        )}
        {known && <path className="bt-arc-fill" d={ARC} pathLength={100} style={{ strokeDasharray: `${(ratio as number) * 100} 100` }} />}
        {exact && <path className="bt-arc-ticks" d={ARC} pathLength={100} style={{ strokeDasharray: `${TICK} ${seg - TICK}` }} />}
        {exact && (max as number) / step > 5 && <path className="bt-arc-ticks is-major" d={ARC} pathLength={100} style={{ strokeDasharray: `${TICK * 1.8} ${seg * 5 - TICK * 1.8}` }} />}
        {band && <path className="bt-arc-ticks is-major" d={ARC} pathLength={100} style={{ strokeDasharray: `0 25 ${TICK * 1.8} ${25 - TICK * 1.8} ${TICK * 1.8} ${50 - TICK * 1.8}` }} />}
        {!!temp && exact && <path className="bt-arc-temp" d="M2 12 A 98 48 0 0 0 198 12" pathLength={100} style={{ strokeDasharray: `${Math.min(100, ((temp as number) / (max as number)) * 100)} 100` }} />}
        {known && <path className="bt-arc-mark" d="M0 -6 L5 0 L0 6 L-5 0 Z" style={{ transform: `translate(${x}px, ${y}px)` }} />}
      </svg>
      {current != null ? (
        <b>
          {current}
          <i>/{max}</i>
          {!!temp && <em> +{temp}</em>}
        </b>
      ) : (
        <b className="is-word">{band ? BAND_RU[band] : '?'}</b>
      )}
    </span>
  )
}

/* ---------- карточка «из точки» ---------- */

export interface Origin {
  x: number
  y: number
}

export const originOf = (el: Element | null): Origin => {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
export const originFromEvent = (e: MouseEvent<Element>): Origin => originOf(e.currentTarget)

const EmergeClose = createContext<() => void>(() => {})
/** Закрыть карточку с анимацией: изнутри карточки */
export const useEmergeClose = () => useContext(EmergeClose)

const CLOSE_MS = 230

export function Emerge({
  origin,
  kind = 'paper',
  rotate = 0,
  label,
  className = '',
  onClose,
  children,
}: {
  origin: Origin
  kind?: 'paper' | 'flip' | 'map' | 'object'
  rotate?: number
  label: string
  className?: string
  onClose: () => void
  children: ReactNode
}) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // родитель перерисовывается от каждого события комнаты: закрытие не должно от этого сбрасываться
  const latestClose = useRef(onClose)
  useEffect(() => {
    latestClose.current = onClose
  })
  const close = useCallback(() => {
    setClosing(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => latestClose.current(), CLOSE_MS)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.cw-modal-layer')) close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(timer.current)
    }
  }, [close])

  const vars = {
    '--ox': `${origin.x - window.innerWidth / 2}px`,
    '--oy': `${origin.y - window.innerHeight / 2}px`,
    '--or': `${rotate}deg`,
  } as CSSProperties

  return createPortal(
    <div className={`tb-layer${closing ? ' is-closing' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`tb-emerge is-${kind} ${className}`} style={vars} role="dialog" aria-modal="true" aria-label={label}>
        <EmergeClose.Provider value={close}>{children}</EmergeClose.Provider>
      </div>
    </div>,
    document.body,
  )
}

/* ---------- круглая кнопка шапки ---------- */

export function Round({ icon: Icon, label, badge, on, alert, onClick }: { icon: LucideIcon; label: string; badge?: number; on?: boolean; alert?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`tb-round${on ? ' is-on' : ''}${alert ? ' is-alert' : ''}`} onClick={onClick} aria-label={label} aria-expanded={on} title={label}>
      <Icon aria-hidden="true" />
      {badge ? <em>{badge}</em> : null}
    </button>
  )
}

/* ---------- силуэт для тех, у кого нет картинки ---------- */

export function Silhouette({ enemy }: { enemy?: boolean }) {
  return (
    <svg className={`bt-sil${enemy ? ' is-enemy' : ''}`} viewBox="0 0 120 240" aria-hidden="true">
      <path d="M60 8c13 0 23 11 23 25 0 9-4 17-11 21 18 5 30 17 33 38l6 52c1 7-9 10-12 3l-9-40-3 58 7 67c1 7-12 9-14 2l-14-62h-12l-14 62c-2 7-15 5-14-2l7-67-3-58-9 40c-3 7-13 4-12-3l6-52c3-21 15-33 33-38-7-4-11-12-11-21 0-14 10-25 23-25z" />
      {enemy && (
        <>
          <circle className="bt-sil-eye" cx="52" cy="31" r="2.6" />
          <circle className="bt-sil-eye" cx="68" cy="31" r="2.6" />
        </>
      )}
    </svg>
  )
}
