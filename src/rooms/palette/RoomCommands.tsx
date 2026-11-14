/**
 * Действия комнаты для палитры Ctrl+K: лист, стол, линейка, статьи, а мастеру —
 * существа, таблицы, сцена, кодекс и пауза. Каждое действие вызывает то же,
 * что кнопка на экране: переход, команду ширме или тот же запрос к серверу.
 * Ничего не рисует; пока смонтирован, палитра открывается и в комнате.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Clapperboard, ExternalLink, Hexagon, Pause, Play, Ruler, ScrollText, Skull, Swords, Table2, UserRound } from 'lucide-react'
import { emitRoomCommand } from '../commands'
import { canTogglePause, isPausedStatus, nextPauseStatus } from '../pause'
import { useRoom } from '../RoomProvider'
import { listNotes, setRoomStatus } from '../roomsApi'
import { openPopout } from '../../popout/store'
import { onPaletteOpen, setPaletteCommands, type PaletteCommand } from '../../search/paletteCommands'

const ACT = 'Действия'
const DM = 'Мастер'
const PAGES = 'Статьи'
const HEROES = 'Герои'

export function RoomCommands() {
  const { roomId, data, isDm } = useRoom()
  const navigate = useNavigate()
  const [dmNotes, setDmNotes] = useState<{ id: string; title: string; folder: string | null }[]>([])

  // страницы кодекса мастера: свежие при каждом открытии палитры
  useEffect(() => {
    if (!isDm) return
    let alive = true
    const load = () =>
      listNotes(roomId).then(
        (list) => alive && setDmNotes(list.map((n) => ({ id: n.id, title: n.title, folder: n.folder }))),
        () => undefined,
      )
    void load()
    const off = onPaletteOpen(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [isDm, roomId])

  const mine = data?.me.room_character_id ?? null
  const status = data?.room.status
  const inCombat = !!data?.combat && data.combat.status !== 'ended'
  const hasMap = !!data?.activeMap
  const shared = data?.sharedNotes
  const characters = data?.characters

  const list = useMemo<PaletteCommand[]>(() => {
    const out: PaletteCommand[] = []
    const heroName = (id: string) => characters?.find((c) => c.id === id)?.name ?? 'Лист героя'
    if (mine) {
      out.push({ id: 'sheet.me', group: ACT, label: 'Открыть мой лист', icon: UserRound, keywords: ['персонаж', 'герой', 'character sheet'], run: () => navigate(`/rooms/${roomId}?hero=me`) })
      out.push({
        id: 'sheet.me.popout',
        group: ACT,
        label: 'Вынести мой лист в окно',
        icon: ExternalLink,
        keywords: ['окно', 'второй экран', 'pop out'],
        run: () => openPopout('sheet', mine, heroName(mine)),
      })
    }
    out.push({ id: 'go.table', group: ACT, label: inCombat ? 'К схватке' : 'К столу и карте', icon: inCombat ? Swords : Hexagon, keywords: ['карта', 'сцена', 'стол', 'map'], run: () => navigate(`/rooms/${roomId}`) })
    if (hasMap) out.push({ id: 'ruler', group: ACT, label: 'Линейка: включить или выключить', icon: Ruler, hint: 'R', keywords: ['измерить', 'расстояние', 'ruler'], run: () => emitRoomCommand({ type: 'ruler.toggle' }) })
    if (isDm) {
      out.push({ id: 'dm.creatures', group: DM, label: 'Разместить существо', icon: Skull, hint: 'мастер', keywords: ['монстр', 'бестиарий', 'добавить', 'creature'], run: () => emitRoomCommand({ type: 'screen.leaf', leaf: 'creatures' }) })
      out.push({ id: 'dm.tables', group: DM, label: 'Таблицы случайных результатов', icon: Table2, hint: 'мастер', keywords: ['бросить таблицу', 'roll table', 'случайно'], run: () => emitRoomCommand({ type: 'screen.leaf', leaf: 'tables' }) })
      out.push({ id: 'dm.theatre', group: DM, label: 'Показать всем: реплика, рассказ, картинка', icon: Clapperboard, hint: 'мастер', keywords: ['сцена', 'нпс', 'портрет', 'раздаточный материал'], run: () => emitRoomCommand({ type: 'screen.leaf', leaf: 'theatre' }) })
      out.push({ id: 'dm.kb', group: DM, label: 'Кодекс мастера', icon: BookOpen, hint: 'мастер', keywords: ['база знаний', 'заметки', 'kb'], run: () => emitRoomCommand({ type: 'kb.open' }) })
      if (canTogglePause(status)) {
        const paused = isPausedStatus(status)
        out.push({
          id: 'dm.pause',
          group: DM,
          label: paused ? 'Продолжить игру' : 'Пауза',
          icon: paused ? Play : Pause,
          hint: 'Пробел',
          keywords: ['остановить', 'pause'],
          run: () => {
            const next = nextPauseStatus(status)
            if (next) void setRoomStatus(roomId, next).catch(() => undefined)
          },
        })
      }
      for (const c of characters ?? []) {
        out.push({ id: `hero.${c.id}`, group: HEROES, label: `Лист: ${c.name}`, icon: UserRound, run: () => navigate(`/rooms/${roomId}?hero=${c.id}`) })
      }
    }
    const pages = isDm ? dmNotes : (shared ?? [])
    for (const n of pages) {
      out.push({
        id: `page.${n.id}`,
        group: PAGES,
        label: n.title || 'Без названия',
        icon: ScrollText,
        hint: n.folder ?? undefined,
        keywords: ['статья', 'страница', ...(n.folder ? [n.folder] : [])],
        run: () => emitRoomCommand({ type: 'article.open', id: n.id }),
      })
    }
    return out
  }, [mine, inCombat, hasMap, isDm, status, characters, dmNotes, shared, navigate, roomId])

  useEffect(() => {
    setPaletteCommands(list)
  }, [list])
  useEffect(() => () => setPaletteCommands(null), [])
  return null
}
