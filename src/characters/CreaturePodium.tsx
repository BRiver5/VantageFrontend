/**
 * Выбор существа (дикий облик) — карусель на подиуме: в центре крупно
 * выбранный зверь на печати, по сторонам — соседние поменьше и в тени.
 * Листается стрелками, свайпом, колесом и клавишами; под зверем — ПО, хиты,
 * КД и скорости. Картинки и числа берутся из бестиария лениво — только для
 * видимых карточек.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Footprints, Heart, PawPrint, Search, Shield } from 'lucide-react'
import { getCachedEntity, getOne, realImage, type Creature } from '../api'
import type { PromptInput } from '../types/character'

/** Видно по столько карточек с каждой стороны от центральной */
const SIDE = 2

function useCreature(id: string | null): Creature | null {
  const [c, setC] = useState<Creature | null>(() => getCachedEntity<Creature>('creatures', id ?? undefined))
  useEffect(() => {
    if (!id) return
    const cached = getCachedEntity<Creature>('creatures', id)
    if (cached) {
      setC(cached)
      return
    }
    let alive = true
    getOne<Creature>('creatures', id)
      .then((x) => alive && setC(x))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [id])
  return c
}

function Slot({ id, label, offset, onPick }: { id: string; label: string; offset: number; onPick: () => void }) {
  const c = useCreature(id)
  const img = c ? (realImage(c.image_gallery) ?? realImage(c.image_url)) : null
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      className={`cpod-slot${offset === 0 ? ' is-center' : ''}`}
      style={{ '--off': offset, '--abs': Math.abs(offset) } as CSSProperties}
      onClick={onPick}
      tabIndex={offset === 0 ? 0 : -1}
      aria-label={label}
    >
      <span className="cpod-art">
        {img && !broken ? <img src={img} alt="" draggable={false} onError={() => setBroken(true)} /> : <PawPrint aria-hidden="true" />}
      </span>
    </button>
  )
}

function Facts({ id, label }: { id: string; label: string }) {
  const c = useCreature(id)
  const speeds = c
    ? [
        c.speed ? `${c.speed} фт.` : null,
        c.flight_speed ? `полёт ${c.flight_speed}` : null,
        c.swim_speed ? `плавание ${c.swim_speed}` : null,
        c.climb_speed ? `лазание ${c.climb_speed}` : null,
      ].filter(Boolean)
    : []
  return (
    <div className="cpod-facts">
      <b className="gold-text">{c?.name ?? label.replace(/\s*\(ПО.*\)$/, '')}</b>
      <span className="cpod-cr">{/\(ПО [^)]+\)/.exec(label)?.[0]?.slice(1, -1) ?? ''}</span>
      {c && (
        <span className="cpod-stats">
          <span title="Хиты">
            <Heart aria-hidden="true" /> {c.hp}
          </span>
          <span title="Класс доспеха">
            <Shield aria-hidden="true" /> {c.ac}
          </span>
          {speeds.length > 0 && (
            <span title="Скорость">
              <Footprints aria-hidden="true" /> {speeds.join(' · ')}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

export function CreaturePodium({
  inp,
  value,
  onChange,
}: {
  inp: PromptInput
  value: unknown
  onChange: (v: unknown) => void
}) {
  const [q, setQ] = useState('')
  const options = useMemo(() => {
    const all = inp.options ?? []
    const needle = q.trim().toLocaleLowerCase('ru')
    return needle ? all.filter((o) => o.label.toLocaleLowerCase('ru').includes(needle)) : all
  }, [inp.options, q])
  const index = Math.max(0, options.findIndex((o) => String(o.value) === String(value)))
  const touch = useRef<number | null>(null)

  // центр карусели и есть выбор: при открытии сразу выбран первый зверь
  useEffect(() => {
    if (options.length && !options.some((o) => String(o.value) === String(value))) onChange(options[0].value)
  }, [options, value, onChange])

  if (!(inp.options ?? []).length) {
    return <p className="cw-field-note act-empty">{inp.filtered ? 'Нет подходящих зверей.' : 'Вариантов нет.'}</p>
  }

  const go = (d: number) => {
    if (!options.length) return
    const next = (index + d + options.length) % options.length
    onChange(options[next].value)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(1)
    }
  }

  const visible = options.length
    ? Array.from({ length: Math.min(options.length, SIDE * 2 + 1) }, (_, i) => i - Math.min(SIDE, Math.floor((options.length - 1) / 2)))
        .map((off) => ({ off, opt: options[(index + off + options.length) % options.length] }))
    : []

  return (
    <div className="cpod" onKeyDown={onKey}>
      <label className="act-search">
        <Search aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти зверя…" aria-label="Поиск зверя" />
      </label>
      {options.length === 0 ? (
        <p className="cw-field-note">Ничего не нашлось.</p>
      ) : (
        <>
          <div
            className="cpod-stage"
            onWheel={(e) => {
              if (Math.abs(e.deltaX) + Math.abs(e.deltaY) > 20) go(e.deltaY + e.deltaX > 0 ? 1 : -1)
            }}
            onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touch.current == null) return
              const dx = e.changedTouches[0].clientX - touch.current
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
              touch.current = null
            }}
          >
            <span className="cpod-floor" aria-hidden="true" />
            <svg className="cpod-sigil" viewBox="0 0 200 200" aria-hidden="true">
              <polygon points="100,6 181,53 181,147 100,194 19,147 19,53" />
              <polygon points="100,22 167,61 167,139 100,178 33,139 33,61" />
            </svg>
            {visible.map(({ off, opt }) => (
              <Slot key={`${String(opt.value)}-${off}`} id={String(opt.value)} label={opt.label} offset={off} onPick={() => go(off)} />
            ))}
            <button type="button" className="cpod-nav is-prev" onClick={() => go(-1)} aria-label="Предыдущий">
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="cpod-nav is-next" onClick={() => go(1)} aria-label="Следующий">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <Facts id={String(options[index].value)} label={options[index].label} />
          <span className="cpod-count">
            {index + 1} / {options.length}
          </span>
        </>
      )}
    </div>
  )
}
