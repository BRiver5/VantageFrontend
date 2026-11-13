/** Кнопки страницы базы знаний: «На карту» (поставить метку) и «Показать на карте» */
import { useState } from 'react'
import { LocateFixed, MapPinPlus } from 'lucide-react'
import { useRoom } from '../../rooms/RoomProvider'
import { notesOfPage } from '../layers/api'
import { placePageOnMap, showPageOnMap } from './bus'

export function PageMapChips({ pageId, title, onClose }: { pageId: string; title: string; onClose: () => void }) {
  const { roomId } = useRoom()
  const [msg, setMsg] = useState<string | null>(null)
  const say = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg((m) => (m === t ? null : m)), 3200)
  }
  return (
    <>
      <button
        type="button"
        className="kb-chip"
        title="Следующий клик по карте на столе поставит метку этой страницы"
        onClick={() => (placePageOnMap(pageId, title || 'Без названия') ? onClose() : say('Сначала положите карту на стол'))}
      >
        <MapPinPlus aria-hidden="true" /> на карту
      </button>
      <button
        type="button"
        className="kb-chip"
        title="Показать метку этой страницы на карте"
        onClick={async () => {
          if (showPageOnMap(pageId)) return onClose()
          const where = await notesOfPage(roomId, pageId).catch(() => [])
          say(where.length ? `Метка есть на карте «${where[0].map_name}», но эта карта сейчас не на столе` : 'Метки этой страницы на картах нет')
        }}
      >
        <LocateFixed aria-hidden="true" /> показать на карте
      </button>
      {msg && (
        <small className="kb-save is-error" role="status">
          {msg}
        </small>
      )}
    </>
  )
}
