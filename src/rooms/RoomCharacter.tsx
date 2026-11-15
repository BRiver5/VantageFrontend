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
import { useOriginalAvatar } from './table/parts'
import { RoomLog } from './RoomLog'
import type { InventoryItemInstance } from '../types/character'
import { useAppShell } from '../shell'
import { HotbarSourceContext } from '../hotbar/source'
import { pendingSlot, subscribePending } from '../hotbar/registry'
import { tabFor, type HotbarSlot } from '../hotbar/model'
import { PopOutButton } from '../popout/PopOutWindow'
import { closePopout, popoutKey, usePopout } from '../popout/store'

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

/** Лист одного героя комнаты: свой — игроку, любой — мастеру. inWindow — лист в отдельном окне */
export function RoomHero({ characterId, inWindow = false }: { characterId: string; inWindow?: boolean }) {
  const { roomId, isDm, data } = useRoom()
  const navigate = useNavigate()
  const { app } = useAppShell()
  const [tab, setTab] = useState<SheetTab>('main')
  const popped = usePopout('sheet', characterId)
  const name = data?.characters.find((c) => c.id === characterId)?.name ?? 'Лист героя'
  // панель быстрых действий ждёт кнопку из другой вкладки листа — открыть её
  useEffect(() => {
    const follow = (slot: HotbarSlot | null) => {
      const want = slot && slot.character_id === characterId ? tabFor(slot.kind, app) : null
      if (want) setTab(want)
    }
    follow(pendingSlot())
    return subscribePending(follow)
  }, [characterId, app])
  const hotbarSource = useMemo(() => ({ characterId }), [characterId])
  const copyAvatar = data?.characters.find((c) => c.id === characterId)?.avatar_url
  const original = useOriginalAvatar(roomId, characterId, copyAvatar)
  // карточка обновляется раньше листа: пока лист не перечитан, картинка берётся из неё
  const avatarFallback = copyAvatar || original
  const hudExtra = useHudExtra()
  const [transfer, setTransfer] = useState<InventoryItemInstance | null>(null)
  const [coins, setCoins] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const room = useMemo(
    () => ({
      roomId,
      isDm,
      backTo: { to: `/rooms/${roomId}`, label: 'К столу' },
      avatarFallback,
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
    [roomId, isDm, hudExtra, characterId, avatarFallback],
  )
  // лист вынесен в окно: здесь — только заглушка, чтобы не было двух листов сразу
  if (popped && !inWindow) {
    return (
      <div className="po-placeholder is-sheet" role="status">
        <p>{name}: лист открыт в отдельном окне</p>
        <button type="button" className="po-btn" onClick={() => closePopout(popoutKey('sheet', characterId))}>
          вернуть сюда
        </button>
      </div>
    )
  }
  return (
    <HotbarSourceContext.Provider value={hotbarSource}>
      {!inWindow && !app && (
        <PopOutButton
          kind="sheet"
          id={characterId}
          title={name}
          className="po-btn po-fab"
          onOpened={() => navigate(`/rooms/${roomId}`)}
          onReturn={() => navigate(`/rooms/${roomId}?hero=${characterId}`)}
          dragSlot={{ kind: 'sheet', ref: characterId, label: name }}
        />
      )}
      <LiveCharacter key={characterId} characterRef={roomCharacterRef(roomId, characterId)} tab={tab} onTab={setTab} room={room} />
      {dropError && <p className="auth-error rm-float-error" role="alert">{dropError}</p>}
      {transfer && <TransferItemDialog characterId={characterId} item={transfer} onClose={() => setTransfer(null)} />}
      {coins && <CoinsHost characterId={characterId} onClose={() => setCoins(false)} />}
    </HotbarSourceContext.Provider>
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
