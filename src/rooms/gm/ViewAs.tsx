/**
 * «Глазами игрока»: мастер выбирает игрока и видит стол или бой так, как их
 * получает этот игрок — его проекцию карты при честном тумане, его часы,
 * календарь и метки. Данные — GET /rooms/{id}/view-as/{user} (только мастеру),
 * поверх — баннер и кнопка выхода. Сцена инертна: ни кликов, ни фокуса, так что
 * никаких действий от имени мастера отсюда не уйдёт.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, LogOut, RefreshCw } from 'lucide-react'
import { fromSnapshot } from '../applyEvent'
import { RoomClocks } from '../Clocks'
import { RoomPreviewProvider, useRoom } from '../RoomProvider'
import { BattleScene } from '../table/BattleScene'
import { errText } from '../table/parts'
import { TableScene } from '../table/TableScene'
import { viewAs, type PlayerView } from './api'
import { RoomCalendar } from './RoomCalendar'

/** Кнопка ширмы и список игроков */
export function ViewAsButton() {
  const { data } = useRoom()
  const [open, setOpen] = useState(false)
  const [who, setWho] = useState<string | null>(null)
  const players = (data?.members ?? []).filter((m) => m.role === 'player' && m.status === 'approved')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [open])
  return (
    <div className="vp-pick" ref={ref}>
      <button type="button" className="tb-round" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Глазами игрока" title="Глазами игрока">
        <Eye aria-hidden="true" />
      </button>
      {open && (
        <div className="vp-menu" role="menu" aria-label="Чьими глазами смотреть">
          <b>Глазами игрока</b>
          {players.length === 0 && <p>В комнате пока нет игроков.</p>}
          {players.map((m) => (
            <button
              key={m.user_id}
              type="button"
              role="menuitem"
              onClick={() => {
                setWho(m.user_id)
                setOpen(false)
              }}
            >
              {m.display_name || m.nickname || 'Игрок'}
              {!m.online && <i>не в сети</i>}
            </button>
          ))}
        </div>
      )}
      {who && <PlayerPreview userId={who} onExit={() => setWho(null)} />}
    </div>
  )
}

function PlayerPreview({ userId, onExit }: { userId: string; onExit: () => void }) {
  const { roomId, subscribe } = useRoom()
  const [view, setView] = useState<PlayerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setView(await viewAs(roomId, userId))
      setError(null)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }, [roomId, userId])

  useEffect(() => {
    void load()
  }, [load])

  // комната живёт дальше: после событий перечитываем проекцию, не чаще раза в секунду
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const off = subscribe((msg) => {
      if (msg.seq == null) return
      clearTimeout(t)
      t = setTimeout(() => void load(), 1000)
    })
    return () => {
      off()
      clearTimeout(t)
    }
  }, [subscribe, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onExit()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const data = useMemo(
    () => (view ? fromSnapshot(view.state, [], { chat: [], clocks: view.clocks, sharedNotes: view.shared_notes, revealed: [], activeMap: view.map }) : null),
    [view],
  )
  const info = useMemo(() => (view ? { userId, name: view.user.name, layers: view.layers, calendar: view.calendar } : null), [view, userId])
  const inCombat = !!data?.combat && data.combat.status !== 'ended'

  return createPortal(
    <div className="vp-root" role="dialog" aria-modal="true" aria-label="Глазами игрока">
      <div className="vp-stage" inert>
        {data && info && (
          <RoomPreviewProvider data={data} viewAs={info} reload={load}>
            {inCombat ? <BattleScene /> : <TableScene />}
            <RoomClocks />
            <RoomCalendar />
          </RoomPreviewProvider>
        )}
      </div>
      <div className="vp-banner" role="status">
        <Eye aria-hidden="true" />
        <span>
          Глазами игрока: <b>{view?.user.name ?? '…'}</b>
          <i>только просмотр, действия выключены</i>
        </span>
        {error && <em className="tb-err">{error}</em>}
        <button type="button" className="vp-reload" onClick={() => void load()} disabled={busy} title="Обновить">
          <RefreshCw aria-hidden="true" />
        </button>
        <button type="button" className="tb-goldbtn" onClick={onExit}>
          <LogOut aria-hidden="true" /> Выйти
        </button>
      </div>
    </div>,
    document.body,
  )
}
