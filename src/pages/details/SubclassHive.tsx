import { useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Check,
  Plus,
  Shield,
} from 'lucide-react'
import {
  cleanDescription,
  realImage,
} from '../../api'
import type {
  Subclass,
} from '../../api'
import { Corners } from '../../ornaments'
import { whenRouteCommitted } from '../catalog/transitions'
import { OpenLinksInNewTab } from '../../classArticle'
import { Img } from '../../media'
import { HEX_DWELL_MS, layoutHive } from '../../ui/hive'

export type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
}

/** Общее имя view-transition: сота подкласса ⇄ обложка на его подробной странице. */
export const SUB_HERO = 'subclass-hero-img'

/** Снимаем имя перелёта с сот, чтобы на новом переходе не было дублей имени. */
function clearSubHeroNames() {
  document.querySelectorAll<HTMLElement>('.hex-cover').forEach((el) => {
    if (el.style.viewTransitionName === SUB_HERO) el.style.viewTransitionName = ''
  })
}

/* ---------- Соты подклассов (как соты книг; раскладка — src/ui/hive.ts) ---------- */

/** Короткая выжимка описания подкласса для меню соты (первый осмысленный абзац). */
function subclassPreview(text: string | null | undefined): string {
  const plain = cleanDescription(text)
  if (!plain) return ''
  const cut = plain.split(/[А-ЯЁ]{2,}(?:[ ]+[А-ЯЁ]+)+/)[0].trim() || plain.trim()
  return cut.length > 240 ? cut.slice(0, 237).trimEnd() + '…' : cut
}

function SubclassHexExpand({ sc, onOpen }: { sc: Subclass; onOpen?: (e: ReactMouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link to={`/subclasses/${sc.id}`} className="hex-expand hex-expand--sub" onClick={onOpen}>
      <div className="hex-expand-inner">
        <Corners size={20} />
        <div className="hex-expand-title">
          <span className="hex-expand-title-text">{sc.subclass_name}</span>
        </div>
        <p className="hex-expand-desc">{subclassPreview(sc.description) || sc.subclass_flavor || 'Открыть подкласс'}</p>
      </div>
    </Link>
  )
}

/** Обложка подкласса: картинка из image_gallery, иначе щит-заглушка. */
function SubclassCover({ sc, vtName }: { sc: Subclass; vtName?: string }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(sc.image_gallery)
  const style = vtName ? ({ viewTransitionName: vtName } as CSSProperties) : undefined
  if (!src || broken) {
    return (
      <span className="hex-cover hex-cover--empty" style={style}>
        <Shield aria-hidden="true" />
      </span>
    )
  }
  return (
    <Img
      className="hex-cover"
      src={src}
      alt=""
      loading="lazy"
      style={style}
      onError={() => setBroken(true)}
    />
  )
}

function SubclassHex({
  sc,
  index,
  selected = false,
  returning = false,
  onToggle,
}: {
  sc: Subclass
  index: number
  /** подкласс выбран для просмотра в статье класса */
  selected?: boolean
  /** сюда только что вернулись с подробной страницы — цель морфа-перелёта */
  returning?: boolean
  onToggle?: (id: string) => void
}) {
  const navigate = useNavigate()
  const cellRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = () => {
    if (dwell.current) clearTimeout(dwell.current)
    dwell.current = setTimeout(() => setExpanded(true), HEX_DWELL_MS)
  }
  const cancel = () => {
    if (dwell.current) {
      clearTimeout(dwell.current)
      dwell.current = null
    }
    setExpanded(false)
  }
  useEffect(() => () => {
    if (dwell.current) clearTimeout(dwell.current)
  }, [])

  // открытие с перелётом-морфом: обложка соты «летит» в шестиугольник-обложку
  // подробной страницы (общее имя SUB_HERO). Так же, как карточка класса.
  // Работает и по клику на саму соту, и по раскрытой карточке-описанию.
  const newTab = useContext(OpenLinksInNewTab)
  const open = (e?: ReactMouseEvent<HTMLElement>) => {
    if (e && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return
    e?.preventDefault()
    const to = `/subclasses/${sc.id}`
    if (newTab) {
      window.open(to, '_blank', 'noopener')
      return
    }
    const img = cellRef.current?.querySelector<HTMLElement>('.hex-cover')
    const doc = document as VTDocument
    if (!doc.startViewTransition || !img) {
      navigate(to)
      return
    }
    clearSubHeroNames()
    img.style.viewTransitionName = SUB_HERO
    document.documentElement.dataset.nav = '1'
    // ждём коммита навигации, потом снимаем новый кадр (см. whenRouteCommitted):
    // соту-обложку отсоединит от DOM размонтирование страницы класса
    const t = doc.startViewTransition(() => {
      navigate(to)
      return whenRouteCommitted(() => !img.isConnected)
    })
    const fin = () => delete document.documentElement.dataset.nav
    t.finished.then(fin, fin)
  }

  return (
    <div
      className={`hex-cell-wrap${expanded ? ' is-expanded' : ''}${selected ? ' is-picked' : ''}`}
      style={{ animationDelay: `${Math.min(index * 45, 700)}ms` }}
      onMouseEnter={start}
      onMouseLeave={cancel}
    >
      <div className="hex-unit">
        <div className="hex-unit-fill">
          <div
            className="hex-cell"
            ref={cellRef}
            role="link"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                open()
              }
            }}
          >
            <span className="hex-inner">
              <SubclassCover sc={sc} vtName={returning ? SUB_HERO : undefined} />
              <span className="hex-shade" />
              <span className="hex-body">
                <span className="hex-title" title={sc.subclass_name}>{sc.subclass_name}</span>
              </span>
            </span>
          </div>
          <SubclassHexExpand sc={sc} onOpen={open} />
        </div>
      </div>
      {onToggle && (
        <button
          type="button"
          className={`hex-pick hex-pick--hive${selected ? ' is-on' : ''}`}
          onClick={() => onToggle(sc.id)}
          title={selected ? 'Убрать подкласс' : 'Выбрать подкласс'}
          aria-label={selected ? 'Убрать подкласс' : 'Выбрать подкласс'}
          aria-pressed={selected}
        >
          {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}

export function SubclassHive({
  subclasses,
  selectedId,
  returningId,
  onToggle,
}: {
  subclasses: Subclass[]
  selectedId?: string | null
  /** сота, в которую прилетает морф при возврате с подробной страницы */
  returningId?: string
  onToggle?: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ s: 196, cols: 5 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w === 0) return
      const s = w < 620 ? 150 : w < 980 ? 172 : 196
      const cols = Math.max(1, Math.floor(w / (s + 14)))
      setLayout((prev) => (prev.s === s && prev.cols === cols ? prev : { s, cols }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = layoutHive(subclasses, layout.cols)

  return (
    <div className="hive" ref={ref} style={{ '--s': `${layout.s}px` } as CSSProperties}>
      {rows.map(({ items: row, pad, nested }, ri) => (
        <div key={ri} className={`hive-row${nested ? ' hive-row--nest' : ''}`}>
          {row.map((sc, ci) => (
            <SubclassHex
              key={sc.id}
              sc={sc}
              index={ri * layout.cols + ci}
              selected={sc.id === selectedId}
              returning={sc.id === returningId}
              onToggle={onToggle}
            />
          ))}
          {Array.from({ length: pad }, (_, pi) => (
            <span key={`pad-${pi}`} className="hex-cell-wrap hex-cell-wrap--spacer" aria-hidden="true" />
          ))}
        </div>
      ))}
    </div>
  )
}
