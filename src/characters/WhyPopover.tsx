/**
 * «Откуда число» — поп-ап у числа листа: основа, каждый вклад со своим
 * источником (раса, класс, черта, предмет, облик, правка мастера) и итог.
 * Открывается кликом по КД, скорости, хитам, мастерству, значению
 * характеристики; у бросаемых чисел — по значку «i» в углу.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  Feather,
  Gem,
  GraduationCap,
  PawPrint,
  ScrollText,
  Sparkles,
  Sprout,
  UserCog,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Contribution } from '../types/character'
import { contributionsOf, type WhyRow } from './sheetView'

const KIND: Record<string, { icon: LucideIcon; label: string }> = {
  race: { icon: Sprout, label: 'раса' },
  subrace: { icon: Sprout, label: 'подраса' },
  class: { icon: GraduationCap, label: 'класс' },
  subclass: { icon: GraduationCap, label: 'подкласс' },
  background: { icon: ScrollText, label: 'предыстория' },
  feat: { icon: Feather, label: 'черта' },
  item: { icon: Gem, label: 'предмет' },
  form: { icon: PawPrint, label: 'облик' },
  override: { icon: UserCog, label: 'мастер' },
  core: { icon: BookOpen, label: 'правила' },
  ability: { icon: Sparkles, label: 'умение' },
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** Значение вклада словами: +2, ×2, = 15, не меньше 60, варианты списком */
function rowValue(r: WhyRow): string {
  if (r.value == null) return r.text
  switch (r.op) {
    case 'add':
      return signed(r.value)
    case 'mul':
      return `×${r.value}`
    case 'max':
      return `≥ ${r.value}`
    case 'min':
      return `≤ ${r.value}`
    case 'candidate':
      return `вариант ${r.value}`
    default:
      return `= ${r.value}`
  }
}

export interface WhyRequest {
  title: string
  path: string
  /** итоговое значение — из него и вкладов «add» выводится основа */
  total?: number | string
  /** подпись основы: «База характеристики», «10 + Ловкость» */
  baseLabel?: string
}

interface WhyApi {
  /** есть ли у числа расшифровка — чтобы не делать кликабельным пустое */
  has: (path: string) => boolean
  open: (anchor: HTMLElement, req: WhyRequest) => void
}

const WhyContext = createContext<WhyApi>({ has: () => false, open: () => {} })

export function useWhy(): WhyApi {
  return useContext(WhyContext)
}

function Popover({
  anchor,
  req,
  rows,
  onClose,
}: {
  anchor: HTMLElement
  req: WhyRequest
  rows: WhyRow[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const w = Math.min(320, window.innerWidth - 24)
      const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12)
      const h = ref.current?.offsetHeight ?? 200
      // снизу, а если не помещается — сверху
      const below = r.bottom + 10
      const top = below + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 10) : below
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  // основа = итог − сумма прибавок, если итог числовой и все вклады — прибавки
  const total = typeof req.total === 'number' ? req.total : null
  const adds = rows.filter((r) => r.op === 'add' && r.value != null)
  const onlyAdds = rows.length > 0 && adds.length === rows.length
  const base = total != null && onlyAdds ? total - adds.reduce((s, r) => s + (r.value ?? 0), 0) : null

  return createPortal(
    <div
      ref={ref}
      className="why-pop"
      role="dialog"
      aria-label={`Откуда: ${req.title}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      <header className="why-pop-head">
        <b>{req.title}</b>
        {req.total != null && <strong>{req.total}</strong>}
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <ul className="why-pop-rows">
        {base != null && (
          <li className="why-row is-base">
            <span className="why-row-ico">
              <BookOpen aria-hidden="true" />
            </span>
            <span className="why-row-text">
              <b>{req.baseLabel ?? 'Основа'}</b>
            </span>
            <span className="why-row-val">{base}</span>
          </li>
        )}
        {rows.map((r, i) => {
          const k = KIND[r.kind] ?? KIND.ability
          return (
            <li key={i} className={`why-row is-${r.kind}${r.value != null && r.value < 0 ? ' is-neg' : ''}`}>
              <span className="why-row-ico">
                <k.icon aria-hidden="true" />
              </span>
              <span className="why-row-text">
                <b>{r.label}</b>
                <i>{k.label}</i>
              </span>
              <span className="why-row-val">{rowValue(r)}</span>
            </li>
          )
        })}
      </ul>
    </div>,
    document.body,
  )
}

/** Поставщик поп-апа для листа: знает вклады и названия способностей */
export function WhyProvider({
  breakdown,
  names,
  children,
}: {
  breakdown: Record<string, Contribution[]> | undefined
  names?: Record<string, string>
  children: ReactNode
}) {
  const [state, setState] = useState<{ anchor: HTMLElement; req: WhyRequest } | null>(null)
  const close = useCallback(() => setState(null), [])
  const has = useCallback((path: string) => (breakdown?.[path]?.length ?? 0) > 0, [breakdown])
  const open = useCallback(
    (anchor: HTMLElement, req: WhyRequest) =>
      setState((cur) => (cur && cur.anchor === anchor ? null : { anchor, req })),
    [],
  )
  const api = { has, open }
  return (
    <WhyContext.Provider value={api}>
      {children}
      {state && (
        <Popover anchor={state.anchor} req={state.req} rows={contributionsOf(breakdown, state.req.path, names)} onClose={close} />
      )}
    </WhyContext.Provider>
  )
}

/** Маленький значок «i» у бросаемого числа: открыть расшифровку, не бросая */
export function WhyDot({ req, className = '' }: { req: WhyRequest; className?: string }) {
  const why = useWhy()
  if (!why.has(req.path)) return null
  return (
    <span
      role="button"
      tabIndex={0}
      className={`why-dot ${className}`}
      aria-label={`Откуда: ${req.title}`}
      title="Откуда это число"
      onClick={(e) => {
        e.stopPropagation()
        why.open(e.currentTarget, req)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          why.open(e.currentTarget, req)
        }
      }}
    >
      i
    </span>
  )
}
