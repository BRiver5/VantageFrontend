/**
 * Попап листа: заклинание, умение, черта. Шапка с картинкой-знаком, фактами
 * жетонами и описанием; внизу — свои действия (сотворить, бросить, закрыть).
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function SheetModal({
  title,
  kicker,
  visual,
  facts,
  actions,
  tone,
  onClose,
  children,
}: {
  title: string
  kicker?: string
  /** знак слева от заголовка: иконка школы, картинка предмета */
  visual?: ReactNode
  facts?: ReactNode
  actions?: ReactNode
  /** оттенок рамки: магия, умение класса, раса… */
  tone?: string
  onClose: () => void
  children?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.eq-drawer-layer')) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="cw-modal-layer" onClick={onClose}>
      <div
        className={`cw-modal cw-smodal${tone ? ` cw-smodal--${tone}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="cw-modal-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
        <div className="cw-modal-scroll cw-smodal-scroll">
          <header className="cw-smodal-head">
            {visual && <span className="cw-smodal-visual">{visual}</span>}
            <div className="cw-smodal-titles">
              {kicker && <span className="cw-smodal-kicker">{kicker}</span>}
              <h3 className="cw-modal-title gold-text">{title}</h3>
              {facts && <div className="cw-card-chips">{facts}</div>}
            </div>
          </header>
          <div className="cw-smodal-body">{children}</div>
        </div>
        {actions && <footer className="cw-modal-foot cw-smodal-foot">{actions}</footer>}
      </div>
    </div>,
    document.body,
  )
}
