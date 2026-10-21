/** Общие кирпичики шагов визарда: заголовок, карточка выбора с попапом, плитка факта. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Image as ImageIcon, Search, SlidersHorizontal, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Corners } from '../../ornaments'
import type { BookMap } from '../../api'

export function StepHeader({
  kicker,
  title,
  lead,
}: {
  kicker?: string
  title: string
  lead?: string
}) {
  return (
    <header className="cw-step-head">
      {kicker && <p className="cw-step-kicker">{kicker}</p>}
      <h2 className="cw-step-title gold-text">{title}</h2>
      {lead && <p className="cw-step-lead">{lead}</p>}
    </header>
  )
}

/** Арт сущности каталога с фолбэком на иконку — ссылки на внешние картинки бьются */
export function ChoiceArt({ src, icon: Icon }: { src: string | null; icon: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span className="cw-card-art cw-card-art--empty">
        <Icon aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="cw-card-art">
      <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      <span className="cw-card-art-shade" aria-hidden="true" />
    </span>
  )
}

/** Портрет «в полный рост», как в каталоге: фигура целиком, без обрезки */
export function ChoicePortrait({ src, icon: Icon }: { src: string | null; icon: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="cw-portrait">
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon className="cw-portrait-fallback" aria-hidden="true" />
      )}
    </span>
  )
}

/**
 * Серебряный язычок «Подробнее»: спрятан под карточкой и выезжает снизу при
 * наведении (на тач-устройствах виден всегда). Кладётся в `.cw-pick-slot`
 * рядом с карточкой — кнопка в кнопке невалидна.
 */
export function MoreTab({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="cw-more" onClick={onClick}>
      Подробнее
    </button>
  )
}

/**
 * Короткая карточка подрасы / класса / предыстории: клик — выбор, язычок
 * «Подробнее» под ней — попап с описанием.
 */
export function PickCard({
  art,
  icon = ImageIcon,
  name,
  badge,
  glow = false,
  selected,
  onSelect,
  onDetails,
  children,
}: {
  art: string | null
  icon?: LucideIcon
  name: string
  /** пометка в углу портрета (напр. «подрасы») */
  badge?: string | null
  /** свечение позади портрета — у заклинателей */
  glow?: boolean
  selected: boolean
  onSelect: () => void
  onDetails: () => void
  children?: ReactNode
}) {
  return (
    <div className="cw-pick-slot">
      <button
        type="button"
        className={`cw-pick${selected ? ' is-selected' : ''}`}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className="cw-pick-visual">
          {glow && <span className="cw-pick-aura" aria-hidden="true" />}
          <ChoicePortrait src={art} icon={icon} />
          {badge && <span className="cw-pick-badge">{badge}</span>}
          {selected && (
            <span className="cw-card-check" aria-hidden="true">
              <Check />
            </span>
          )}
        </span>
        <span className="cw-pick-body">
          <span className="cw-pick-name">{name}</span>
          {children}
        </span>
      </button>
      <MoreTab onClick={onDetails} />
    </div>
  )
}

/** Сетка карточек выбора: фиксированная ширина, ряд по центру */
export function PickGrid({ children }: { children: ReactNode }) {
  return <div className="cw-pick-grid">{children}</div>
}

/* ---------- Поиск и фильтры-чипы ---------- */

export interface PickFilterGroup<T> {
  key: string
  label: string
  options: { key: string; label: string; hint?: string }[]
  /** `selected` — отмеченные опции группы; внутри группы — «или» */
  match: (item: T, selected: string[]) => boolean
}

export interface Picker<T> {
  query: string
  setQuery: (q: string) => void
  selected: Record<string, string[]>
  toggle: (group: string, key: string) => void
  /** снять все фильтры, поиск оставить */
  clearFilters: () => void
  reset: () => void
  visible: T[]
}

/** Группа «Книга»: только книги, которые встречаются в списке шага */
export function bookFilterGroup<T>(
  items: T[],
  books: BookMap,
  bookOf: (item: T) => string | null,
): PickFilterGroup<T> {
  const ids = new Set(items.map(bookOf).filter((id): id is string => !!id && !!books[id]))
  return {
    key: 'book',
    label: 'Книга',
    options: [...ids]
      .map((id) => ({ key: id, label: books[id].book_code || books[id].title, hint: books[id].title }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    match: (item, sel) => {
      const id = bookOf(item)
      return !!id && sel.includes(id)
    },
  }
}

/** Поиск по имени + фильтры: внутри группы «или», между группами «и» */
export function usePicker<T>(
  items: T[],
  nameOf: (item: T) => string,
  groups: PickFilterGroup<T>[],
): Picker<T> {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, string[]>>({})

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    const list = items.filter((item) => {
      if (q && !nameOf(item).toLocaleLowerCase('ru').includes(q)) return false
      return groups.every((g) => {
        const sel = selected[g.key]
        return !sel?.length || g.match(item, sel)
      })
    })
    return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ru'))
  }, [items, nameOf, groups, query, selected])

  const toggle = useCallback((group: string, key: string) => {
    setSelected((prev) => {
      const cur = prev[group] ?? []
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
      return { ...prev, [group]: next }
    })
  }, [])

  const clearFilters = useCallback(() => setSelected({}), [])
  const reset = useCallback(() => {
    setQuery('')
    setSelected({})
  }, [])

  return { query, setQuery, selected, toggle, clearFilters, reset, visible }
}

export function PickToolbar<T>({
  picker,
  groups,
  placeholder,
  extra,
}: {
  picker: Picker<T>
  groups: PickFilterGroup<T>[]
  placeholder: string
  /** кнопка рядом с поиском (напр. «Без предыстории») */
  extra?: ReactNode
}) {
  return (
    <div className="cw-toolbar">
      <div className="cw-search-row">
        <label className="cw-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={picker.query}
            onChange={(e) => picker.setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </label>
        <PickFilterMenu picker={picker} groups={groups} />
        {extra}
      </div>
    </div>
  )
}

/**
 * Кнопка «Фильтры» с выпадающей панелью галочек — как в каталоге. Внутри
 * группы галочки складываются по «или», между группами — по «и».
 */
function PickFilterMenu<T>({ picker, groups }: { picker: Picker<T>; groups: PickFilterGroup<T>[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const shown = groups.filter((g) => g.options.length > 0)
  const count = Object.values(picker.selected).reduce((n, v) => n + v.length, 0)

  // закрывается по клику мимо и по Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (shown.length === 0) return null

  return (
    <div className="cw-filter-menu" ref={ref}>
      <button
        type="button"
        className={`rec-filter-btn quest-filter-btn${open ? ' is-open' : ''}${count ? ' has-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <SlidersHorizontal aria-hidden="true" />
        Фильтры
        {count > 0 && <span className="rec-filter-count">{count}</span>}
      </button>

      {open && (
        <div className="quest-filter-panel cw-filter-panel">
          <div className="rec-filter-panel-head">
            <span>Фильтры</span>
            {count > 0 && (
              <button type="button" className="rec-filter-reset" onClick={picker.clearFilters}>
                Сбросить всё
              </button>
            )}
          </div>
          {shown.map((g) => (
            <fieldset className="quest-filter-group cw-check-group" key={g.key}>
              <legend className="quest-filter-group-label">{g.label}</legend>
              <div className="cw-checks">
                {g.options.map((o) => {
                  const on = picker.selected[g.key]?.includes(o.key) ?? false
                  return (
                    <label key={o.key} className={`cw-check${on ? ' is-on' : ''}`} title={o.hint}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => picker.toggle(g.key, o.key)}
                      />
                      <span className="cw-check-box" aria-hidden="true">
                        {on && <Check />}
                      </span>
                      <span className="cw-check-label">{o.label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </div>
  )
}

/** Пустой результат поиска или фильтров */
export function PickEmpty({ show }: { show: boolean }) {
  return show ? <p className="cw-status">Ничего не нашлось — ослабьте фильтры.</p> : null
}

/* ---------- Попап с подробностями ---------- */

export function ChoiceModal({
  art,
  icon = ImageIcon,
  visual,
  world,
  bare = false,
  chooseLabel,
  glow = false,
  title,
  facts,
  selected,
  onChoose,
  onClose,
  children,
}: {
  art?: string | null
  icon?: LucideIcon
  /** своя картинка вместо портрета */
  visual?: ReactNode
  /** арт мира — фоном шапки попапа */
  world?: string | null
  /** без своей шапки: содержимое целиком своё (напр. страница расы из каталога) */
  bare?: boolean
  /** своя подпись нижней кнопки (напр. «Закрыть» у просмотра) */
  chooseLabel?: string
  glow?: boolean
  title: string
  facts?: ReactNode
  selected: boolean
  onChoose: () => void
  onClose: () => void
  children?: ReactNode
}) {
  const chooseRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    chooseRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      // поверх может быть открыта панель снаряжения — Escape закрывает её первой
      if (e.key === 'Escape' && !document.querySelector('.eq-drawer-layer')) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // портал в body: внутри `.page` fixed прилип бы к колонке из-за transform
  return createPortal(
    <div className="cw-modal-layer" onClick={onClose}>
      <div
        className={`cw-modal${bare ? ' cw-modal--sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {world && (
          <span className="cw-modal-world" aria-hidden="true">
            <span style={{ backgroundImage: `url("${world}")` }} />
          </span>
        )}
        <button type="button" className="cw-modal-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
        <div className="cw-modal-scroll">
          {bare ? (
            children
          ) : (
            <>
              <div className="cw-modal-hero">
                <div className="cw-modal-visual">
                  {glow && <span className="cw-pick-aura" aria-hidden="true" />}
                  {visual ?? <ChoicePortrait src={art ?? null} icon={icon} />}
                </div>
                <div className="cw-modal-head">
                  <h3 className="cw-modal-title gold-text">{title}</h3>
                  {facts && <div className="cw-card-chips">{facts}</div>}
                </div>
              </div>
              <div className="cw-modal-body">{children}</div>
            </>
          )}
        </div>
        <footer className="cw-modal-foot">
          <button ref={chooseRef} type="button" className="cs-btn cw-next" onClick={onChoose}>
            <Check aria-hidden="true" /> {chooseLabel ?? (selected ? 'Выбрано' : 'Выбрать')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/** Раздел попапа: подзаголовок и содержимое */
export function ModalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cw-modal-section">
      <h4 className="cw-modal-section-title">{title}</h4>
      {children}
    </section>
  )
}

/** Строка факта в попапе: иконка и текст */
export function ModalLine({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <p className="cw-dossier-line">
      {Icon && <Icon aria-hidden="true" />}
      <span>{children}</span>
    </p>
  )
}

/** Маленький жетон-факт: иконка + значение + подпись */
export function FactChip({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <span className="cw-chip">
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Панель с серебряными углами — контейнер содержимого шага */
export function StepPanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`cw-panel${className ? ` ${className}` : ''}`}>
      <Corners size={20} />
      {children}
    </div>
  )
}

/** Строка состояния загрузки/ошибки для шагов каталога */
export function StepStatus({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <p className="status-line is-error">Архив недоступен: {error}</p>
  if (loading) return <p className="cw-status">Разворачиваем свитки…</p>
  return null
}
