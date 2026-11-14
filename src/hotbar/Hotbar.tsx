/**
 * Панель быстрых действий игрока (и мастера) на столе: 10 ячеек, 5 страниц.
 * Клавиши 1…0 нажимают ячейки, Alt+1…5 листают страницы (не в поле ввода).
 * Ячейки наполняются перетаскиванием из листа, экрана героя и лотка боя;
 * правый клик очищает ячейку, перетаскивание внутри панели переставляет.
 */
import { useEffect, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Crosshair, Package, ScrollText, Sparkles, Swords, UserRound, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { matches, type ActionId } from '../input/keybindings'
import { Img } from '../media'
import { emitRoomCommand } from '../rooms/commands'
import { isTypingTarget } from '../rooms/pause'
import { useRoom } from '../rooms/RoomProvider'
import { clearSlot, decodeDrag, encodeDrag, HOTBAR_MIME, KIND_LABEL, PAGES, setSlot, SLOTS, slotKeyLabel, swapSlots, type HotbarSlot, type SlotKind } from './model'
import { invokeSlot } from './registry'
import { useHotbarPages } from './useHotbarPages'

const ICON: Record<SlotKind, LucideIcon> = {
  attack: Swords,
  spell: Sparkles,
  feature: Zap,
  item: Package,
  sheet: UserRound,
  article: ScrollText,
}

const SLOT_IDS = Array.from({ length: SLOTS }, (_, i) => `hotbar.slot.${i + 1}` as ActionId)
const PAGE_IDS = Array.from({ length: PAGES }, (_, i) => `hotbar.page.${i + 1}` as ActionId)

function SlotFace({ slot }: { slot: HotbarSlot }) {
  const [broken, setBroken] = useState(false)
  if (slot.icon && !broken) return <Img src={slot.icon} alt="" draggable={false} onError={() => setBroken(true)} />
  const Icon = slot.kind === 'attack' && /лук|арбалет|дротик|праща/i.test(slot.label) ? Crosshair : ICON[slot.kind] ?? BookOpen
  return <Icon aria-hidden="true" />
}

export function Hotbar() {
  const { roomId, data, isDm } = useRoom()
  const navigate = useNavigate()
  const { pages, update, error } = useHotbarPages(roomId)
  const [page, setPage] = useState(0)
  const [over, setOver] = useState<number | null>(null)
  const [flash, setFlash] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const row = pages[page]

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 3200)
    return () => clearTimeout(t)
  }, [note])

  const heroOk = (cid: string | null | undefined) => {
    if (!cid || !data) return false
    if (!data.characters.some((c) => c.id === cid)) return false
    return isDm || data.me.room_character_id === cid
  }

  const run = (slot: HotbarSlot, index: number) => {
    setFlash(index)
    setTimeout(() => setFlash((f) => (f === index ? null : f)), 220)
    if (slot.kind === 'sheet') {
      if (heroOk(slot.ref)) navigate(`/rooms/${roomId}?hero=${slot.ref}`)
      else setNote('Этого героя нет в комнате')
      return
    }
    if (slot.kind === 'article') {
      if (!emitRoomCommand({ type: 'article.open', id: slot.ref })) setNote('Статью сейчас не открыть')
      return
    }
    const res = invokeSlot(slot, (s) => {
      if (!heroOk(s.character_id)) return false
      navigate(`/rooms/${roomId}?hero=${s.character_id}`)
      return true
    })
    if (res === 'none') setNote(`«${slot.label}»: этого героя нет в комнате или он не ваш`)
  }

  // клавиши: читаем назначения в момент нажатия — переназначения подхватываются сразу
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented) return
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return
      const p = PAGE_IDS.findIndex((id) => matches(e, id))
      if (p >= 0) {
        e.preventDefault()
        setPage(p)
        return
      }
      const i = SLOT_IDS.findIndex((id) => matches(e, id))
      if (i < 0) return
      const slot = row[i]
      if (!slot) return
      e.preventDefault()
      run(slot, i)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault()
    setOver(null)
    const got = decodeDrag(e.dataTransfer.getData(HOTBAR_MIME))
    if (!got) return
    if (got.from && got.from.page === page) update((p) => swapSlots(p, page, got.from!.index, index))
    else update((p) => setSlot(p, page, index, got.slot))
  }

  const accepts = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(HOTBAR_MIME)

  return (
    <nav className="hb" aria-label="Панель быстрых действий">
      <div className="hb-pages" role="radiogroup" aria-label="Страница панели">
        {Array.from({ length: PAGES }, (_, p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === page}
            className={p === page ? 'is-on' : ''}
            onClick={() => setPage(p)}
            title={`Страница ${p + 1} (Alt+${p + 1})`}
          >
            {p + 1}
          </button>
        ))}
      </div>
      <ol className="hb-slots">
        {row.map((slot, i) => (
          <li key={i}>
            <button
              type="button"
              className={`hb-slot${slot ? ` is-${slot.kind}` : ' is-empty'}${over === i ? ' is-over' : ''}${flash === i ? ' is-flash' : ''}`}
              aria-label={slot ? `${slotKeyLabel(i)}: ${KIND_LABEL[slot.kind]} «${slot.label}»` : `Ячейка ${slotKeyLabel(i)}: пусто`}
              title={slot ? `${slot.label} — ${KIND_LABEL[slot.kind].toLowerCase()} (${slotKeyLabel(i)}). Правый клик — убрать` : 'Перетащите сюда атаку, заклинание, умение или предмет из листа'}
              draggable={!!slot}
              onDragStart={(e) => {
                if (!slot) return
                e.dataTransfer.setData(HOTBAR_MIME, encodeDrag({ slot, from: { page, index: i } }))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (!accepts(e)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
                setOver(i)
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => onDrop(e, i)}
              onClick={() => slot && run(slot, i)}
              onContextMenu={(e) => {
                if (!slot) return
                e.preventDefault()
                update((p) => clearSlot(p, page, i))
              }}
            >
              <span className="hb-face">{slot && <SlotFace slot={slot} />}</span>
              <kbd>{slotKeyLabel(i)}</kbd>
              {slot && <span className="hb-label">{slot.label}</span>}
            </button>
          </li>
        ))}
      </ol>
      {(note || error) && (
        <p className="hb-note" role="status">
          {note ?? error}
        </p>
      )}
    </nav>
  )
}
