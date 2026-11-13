import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  ChevronDown,
  Search,
  Check,
  X,
  Sparkles,
} from 'lucide-react'
import type { Spell } from '../../../api'
import { SpellDetails } from '../SpellsStep'
import { spellSchoolIcon } from '../../../spellSchools'
import { Img } from '../../../media'
import { spellMeta } from './spellMeta'

/** Значок школы магии, без него — искра */
function SchoolFace({ school }: { school: string | null }) {
  const src = spellSchoolIcon(school)
  return src ? <Img src={src} alt="" draggable={false} /> : <Sparkles aria-hidden="true" />
}

/**
 * Одно место под заклинание — выпадающее меню, как выбор оружия в снаряжении:
 * внутри поиск и полный список доступного. Меню рисуется в body и держится
 * под кнопкой (над ней, если внизу не хватает места).
 */
function SpellSelect({
  value,
  options,
  placeholder,
  onChange,
  onClear,
  onDetails,
  loading = false,
}: {
  value: Spell | null
  options: Spell[]
  loading?: boolean
  placeholder: string
  onChange: (s: Spell) => void
  onClear: () => void
  onDetails: (s: Spell) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е')
    const list = q
      ? options.filter((s) => s.spell_name.toLocaleLowerCase('ru').replace(/ё/g, 'е').includes(q))
      : options
    return [...list].sort((a, b) => a.spell_level - b.spell_level || a.spell_name.localeCompare(b.spell_name, 'ru'))
  }, [options, query])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 380 && r.top > window.innerHeight - r.bottom
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 340), up })
  }, [open])

  // закрытие: клик мимо, Escape, прокрутка страницы (меню привязано к кнопке)
  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (popRef.current?.contains(t) || btnRef.current?.contains(t))
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <span className="cw-spsel">
      <button
        ref={btnRef}
        type="button"
        className={`cw-gsel${value ? '' : ' is-empty'}${open ? ' is-open' : ''}`}
        onClick={() => {
          setQuery('')
          setOpen((v) => !v)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cw-gsel-face cw-spsel-face">{value ? <SchoolFace school={value.school} /> : <b>?</b>}</span>
        <span className="cw-gsel-text">
          <b>{value?.spell_name ?? placeholder}</b>
          <i>{value ? spellMeta(value) : loading ? 'загружаем список…' : `доступно: ${options.length}`}</i>
        </span>
        <ChevronDown className="cw-gsel-chevron" aria-hidden="true" />
      </button>
      {value && (
        <span className="cw-spsel-tools">
          <button type="button" onClick={() => onDetails(value)} title="Подробнее" aria-label="Подробнее">
            <BookOpen aria-hidden="true" />
          </button>
          <button type="button" onClick={onClear} title="Очистить" aria-label="Очистить">
            <X aria-hidden="true" />
          </button>
        </span>
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className={`cw-gsel-pop cw-spsel-pop${pos.up ? ' is-up' : ''}`}
            style={{
              left: Math.min(pos.left, window.innerWidth - pos.width - 12),
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
          >
            <label className="cw-gsel-search">
              <Search aria-hidden="true" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти заклинание…" aria-label="Найти заклинание" />
            </label>
            <div className="cw-gsel-list" role="listbox" aria-label={placeholder}>
              {visible.map((s) => {
                const on = s.id === value?.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`cw-gsel-opt${on ? ' is-on' : ''}`}
                    onClick={() => {
                      onChange(s)
                      setOpen(false)
                    }}
                  >
                    <span className="cw-gsel-face cw-spsel-face">
                      <SchoolFace school={s.school} />
                    </span>
                    <span className="cw-gsel-text">
                      <b>{s.spell_name}</b>
                      <i>{spellMeta(s)}</i>
                    </span>
                    <span className="cw-spsel-tags">
                      {s.concentration && <em title="Концентрация">К</em>}
                      {s.ritual && <em title="Ритуал">Р</em>}
                    </span>
                    {on && <Check className="cw-gsel-check" aria-hidden="true" />}
                  </button>
                )
              })}
              {visible.length === 0 && (
                <p className="cw-gsel-empty">{loading ? 'Загружаем список заклинаний…' : query ? 'Ничего не нашлось' : 'Доступных заклинаний нет'}</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  )
}

/**
 * Выбор заклинаний уровня: столько выпадающих меню, сколько положено, — как
 * выбор оружия в снаряжении. Выбранное в одном меню из соседних пропадает.
 */
export function SpellPicker({
  title,
  count,
  picked,
  options,
  onChange,
  loading = false,
}: {
  title: string
  count: number
  picked: Spell[]
  options: Spell[]
  onChange: (next: Spell[]) => void
  loading?: boolean
}) {
  const [details, setDetails] = useState<Spell | null>(null)
  const closeDetails = useCallback(() => setDetails(null), [])
  const label = title.startsWith('Заговор') ? 'Выберите заговор' : 'Выберите заклинание'

  const setSlot = (n: number, s: Spell | null) => {
    const next: (Spell | undefined)[] = Array.from({ length: count }, (_, i) => picked[i])
    next[n] = s ?? undefined
    onChange(next.filter((x): x is Spell => !!x))
  }

  return (
    <div className="cw-spellpick">
      <h5 className="cw-block-subtitle">
        {title}
        <span className="cw-block-count">
          {picked.length} / {count}
        </span>
      </h5>
      <div className="cw-spsel-list">
        {Array.from({ length: count }, (_, n) => {
          const value = picked[n] ?? null
          // нельзя выбрать то же, что в соседнем меню
          const taken = new Set(picked.filter((_, i) => i !== n).map((s) => s.id))
          return (
            <SpellSelect
              key={n}
              value={value}
              options={options.filter((s) => !taken.has(s.id))}
              placeholder={`${label}…`}
              loading={loading}
              onChange={(s) => setSlot(n, s)}
              onClear={() => setSlot(n, null)}
              onDetails={setDetails}
            />
          )
        })}
      </div>
      {details && <SpellDetails spell={details} onClose={closeDetails} />}
    </div>
  )
}
