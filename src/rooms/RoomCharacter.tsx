/**
 * Живой лист героя внутри комнаты. Это тот же LiveCharacter, что и у обычного
 * персонажа, но все его запросы идут на копию в комнате
 * (`/rooms/{rid}/characters/{cid}`), кости бросает сервер, а владельцу закрыты
 * то, что принадлежит мастеру: состав инвентаря, кошелёк, уровень.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Hexagon, LogOut, Swords } from 'lucide-react'
import { getCharacter, roomCharacterRef, type Currency } from '../api'
import type { SheetTab } from '../characters/CharacterSheet'
import type { HudExtra } from '../characters/GameHud'
import { LiveCharacter } from '../pages/CharacterEditorPage'
import { TransferCoinsDialog, TransferItemDialog, dropToTable } from './Items'
import { useRoom } from './RoomProvider'
import { RoomLog } from './RoomLog'
import type { InventoryItemInstance } from '../types/character'

/** Экран героя на телефоне: кнопка обратно к столу (или в бой), меню и общий журнал */
function useHudExtra(): HudExtra {
  const { data, roomId } = useRoom()
  const navigate = useNavigate()
  const rolls = data?.log.filter((e) => e.kind === 'roll').length ?? 0
  const onTable = data?.items.filter((i) => i.holder === 'table').length ?? 0
  const inCombat = !!data?.combat && data.combat.status !== 'ended'
  return useMemo<HudExtra>(
    () => ({
      windows: [
        {
          id: 'table',
          label: inCombat ? 'Схватка' : 'Стол',
          icon: inCombat ? Swords : Hexagon,
          badge: (!inCombat && onTable) || undefined,
          onOpen: () => navigate(`/rooms/${roomId}`),
        },
      ],
      menu: (
        <Link to="/rooms" className="hud-menu-item">
          <LogOut aria-hidden="true" /> Все комнаты
        </Link>
      ),
      rollLog: <RoomLog bare limit={40} />,
      rollCount: rolls,
    }),
    [rolls, onTable, inCombat, navigate, roomId],
  )
}

/** Лист одного героя комнаты: свой — игроку, любой — мастеру */
export function RoomHero({ characterId }: { characterId: string }) {
  const { roomId, isDm } = useRoom()
  const [tab, setTab] = useState<SheetTab>('main')
  const hudExtra = useHudExtra()
  const [transfer, setTransfer] = useState<InventoryItemInstance | null>(null)
  const [coins, setCoins] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const room = useMemo(
    () => ({
      roomId,
      isDm,
      backTo: { to: `/rooms/${roomId}`, label: 'К столу' },
      hudExtra,
      items: {
        onTransfer: (item: InventoryItemInstance) => setTransfer(item),
        onDropToTable: (item: InventoryItemInstance) => {
          setDropError(null)
          dropToTable(roomId, characterId, item).catch((e) => setDropError(e instanceof Error ? e.message : 'Не удалось положить на стол'))
        },
        onTransferCoins: () => setCoins(true),
      },
    }),
    [roomId, isDm, hudExtra, characterId],
  )
  return (
    <>
      <LiveCharacter key={characterId} characterRef={roomCharacterRef(roomId, characterId)} tab={tab} onTab={setTab} room={room} />
      {dropError && <p className="auth-error rm-float-error" role="alert">{dropError}</p>}
      {transfer && <TransferItemDialog characterId={characterId} item={transfer} onClose={() => setTransfer(null)} />}
      {coins && <CoinsHost characterId={characterId} onClose={() => setCoins(false)} />}
    </>
  )
}

/** Кошелёк берём из свежего листа героя: он нужен только для проверки лимита в диалоге */
function CoinsHost({ characterId, onClose }: { characterId: string; onClose: () => void }) {
  const { roomId } = useRoom()
  const [purse, setPurse] = useState<Record<Currency, number> | null>(null)
  useEffect(() => {
    let alive = true
    getCharacter(roomCharacterRef(roomId, characterId))
      .then((c) => alive && setPurse({ ...c.inventory.currency }))
      .catch(() => alive && setPurse({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }))
    return () => {
      alive = false
    }
  }, [roomId, characterId])
  if (!purse) return null
  return <TransferCoinsDialog characterId={characterId} purse={purse} onClose={onClose} />
}
