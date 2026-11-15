/**
 * Содержимое в отдельном окне браузера: портал того же React-дерева в документ
 * окна, поэтому состояние комнаты, сокет и данные общие с главным окном.
 * Закрыли окно — содержимое возвращается на место.
 */
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Undo2, X } from 'lucide-react'
import { mirrorStyles } from './mirrorStyles'
import { writeSlotDrag } from '../hotbar/source'
import type { HotbarSlot } from '../hotbar/model'
import { closePopout, dismissPopoutNotice, openPopout, usePopout, usePopoutNotice, type PopoutEntry, type PopoutKind } from './store'

export function PopOutWindow({ entry, children }: { entry: PopoutEntry; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const { win } = entry
    if (win.closed) {
      closePopout(entry.key, true)
      return
    }
    const doc = win.document
    // окно с тем же именем могло остаться от прошлой загрузки страницы
    doc.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    doc.body.innerHTML = ''
    doc.title = `${entry.title} — Vantage`
    const stop = mirrorStyles(document, doc)
    const root = doc.createElement('div')
    root.className = `po-root po-root--${entry.kind}`
    doc.body.appendChild(root)
    setHost(root)

    const onGone = () => closePopout(entry.key, true)
    win.addEventListener('pagehide', onGone)
    // pagehide приходит не везде: подстраховка опросом
    const poll = window.setInterval(() => win.closed && onGone(), 800)
    return () => {
      stop()
      window.clearInterval(poll)
      win.removeEventListener('pagehide', onGone)
      root.remove()
      setHost(null)
    }
  }, [entry])

  // главное окно закрывается — дочерние вместе с ним
  useEffect(() => {
    const onUnload = () => {
      if (!entry.win.closed) entry.win.close()
    }
    window.addEventListener('pagehide', onUnload)
    return () => window.removeEventListener('pagehide', onUnload)
  }, [entry])

  if (!host) return null
  return createPortal(children, host)
}

/** Кнопка «вынести в окно» */
export function PopOutButton({ kind, id, title, onOpened, onReturn, className = 'po-btn', compact = false, dragSlot }: { kind: PopoutKind; id: string; title: string; onOpened?: () => void; onReturn?: () => void; className?: string; compact?: boolean; /** кнопку можно перетащить на панель быстрых действий */ dragSlot?: HotbarSlot }) {
  return (
    <button
      type="button"
      className={className}
      draggable={!!dragSlot}
      onDragStart={dragSlot ? (e) => writeSlotDrag(e.dataTransfer, dragSlot) : undefined}
      title={dragSlot ? 'Вынести в отдельное окно. Перетащите на панель быстрых действий, чтобы открывать оттуда' : 'Вынести в отдельное окно'}
      aria-label="Вынести в отдельное окно"
      onClick={() => {
        if (openPopout(kind, id, title, onReturn)) onOpened?.()
      }}
    >
      <ExternalLink aria-hidden="true" />
      {!compact && <span>вынести в окно</span>}
    </button>
  )
}

/**
 * Место, откуда содержимое можно вынести: обычно рисует его на месте, а пока
 * открыто окно — в окне, оставляя здесь заглушку «вернуть».
 */
export function PopOutSlot({ kind, id, title, children }: { kind: PopoutKind; id: string; title: string; children: ReactNode }) {
  const entry = usePopout(kind, id)
  // место исчезло (например, начался бой) — окно закрывается
  useEffect(() => () => closePopout(`${kind}:${id}`), [kind, id])
  if (!entry) return <>{children}</>
  return (
    <>
      <div className="po-placeholder" role="status">
        <ExternalLink aria-hidden="true" />
        <p>{title}: открыто в отдельном окне</p>
        <button type="button" className="po-btn" onClick={() => closePopout(entry.key)}>
          <Undo2 aria-hidden="true" /> <span>вернуть сюда</span>
        </button>
      </div>
      <PopOutWindow entry={entry}>{children}</PopOutWindow>
    </>
  )
}

/** Сообщение, если браузер заблокировал окно */
export function PopoutNotice() {
  const text = usePopoutNotice()
  useEffect(() => {
    if (!text) return
    const t = setTimeout(dismissPopoutNotice, 9000)
    return () => clearTimeout(t)
  }, [text])
  if (!text) return null
  return (
    <div className="po-notice" role="alert">
      <p>{text}</p>
      <button type="button" className="tb-card-x" onClick={dismissPopoutNotice} aria-label="Закрыть">
        <X aria-hidden="true" />
      </button>
    </div>
  )
}
