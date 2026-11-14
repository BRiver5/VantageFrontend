/**
 * Удобства стола одним узлом (p3/ux): панель быстрых действий, сцена для всех,
 * действия палитры Ctrl+K, статьи для чтения и листы героев в отдельных окнах.
 */
import { useEffect } from 'react'
import { useAppShell } from '../../shell'
import { Hotbar } from '../../hotbar/Hotbar'
import { PopOutWindow, PopoutNotice } from '../../popout/PopOutWindow'
import { closeAllPopouts, usePopouts } from '../../popout/store'
import { ArticlePopouts, ArticleReader } from '../article/ArticleView'
import { RoomCommands } from '../palette/RoomCommands'
import { RoomHero } from '../RoomCharacter'
import { useRoom } from '../RoomProvider'
import { TheatreOverlay } from '../theatre/TheatreOverlay'

/** Листы героев в отдельных окнах: живут, пока открыта комната, а не только лист */
function SheetPopouts() {
  const { data } = useRoom()
  const list = usePopouts().filter((e) => e.kind === 'sheet' && data?.characters.some((c) => c.id === e.id))
  return (
    <>
      {list.map((e) => (
        <PopOutWindow key={e.key} entry={e}>
          <div className="po-sheet">
            <RoomHero characterId={e.id} inWindow />
          </div>
        </PopOutWindow>
      ))}
    </>
  )
}

export function RoomUx() {
  const { isDm } = useRoom()
  const { app } = useAppShell()
  // ушли из комнаты — окна закрываются
  useEffect(() => () => closeAllPopouts(), [])
  return (
    <>
      <RoomCommands />
      {!app && <Hotbar />}
      <TheatreOverlay />
      <SheetPopouts />
      {/* у мастера статьи живут в ширме, рядом с его кодексом */}
      {!isDm && <ArticlePopouts />}
      {!isDm && <ArticleReader />}
      <PopoutNotice />
    </>
  )
}
