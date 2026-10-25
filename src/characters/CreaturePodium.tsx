/**
 * Выбор существа (дикий облик) — карусель на подиуме: в центре крупно
 * выбранный зверь на печати, по сторонам — соседние поменьше и в тени.
 * Листается стрелками, свайпом, колесом и клавишами; под зверем — ПО, хиты,
 * КД и скорости. Картинку и статы сервер присылает в самих вариантах; у
 * старого сервера они берутся из бестиария лениво — только для видимых карточек.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Footprints, Heart, PawPrint, Search, Shield } from 'lucide-react'
import { getCachedEntity, getOne, realImage, type Creature } from '../api'
import type { PromptInput, PromptOption } from '../types/character'

/** Видно по столько карточек с каждой стороны от центральной */
const SIDE = 2

/** Есть ли в варианте картинка и статы с сервера — тогда в бестиарий не ходим */
const hasStats = (o: PromptOption) => o.image !== undefined || o.hp !== undefined

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

/** Картинка и статы зверя: из варианта сервера, а у старого сервера — из бестиария */
function useBeast(opt: PromptOption) {
  const c = useCreature(hasStats(opt) ? null : String(opt.value))
  if (hasStats(opt)) {
    return {
      name: opt.label.replace(/\s*\(ПО.*\)$/, ''),
      image: opt.image ?? null,
      hp: opt.hp ?? null,
      ac: opt.ac ?? null,
      speed: opt.speed ?? 0,
      fly: opt.fly_speed ?? 0,
      swim: opt.swim_speed ?? 0,
      climb: 0,
    }
  }
  return {
    name: c?.name ?? opt.label.replace(/\s*\(ПО.*\)$/, ''),
    image: c ? (realImage(c.image_gallery) ?? realImage(c.image_url)) : null,
    hp: c?.hp ?? null,
    ac: c?.ac ?? null,
    speed: c?.speed ?? 0,
    fly: c?.flight_speed ?? 0,
    swim: c?.swim_speed ?? 0,
    climb: c?.climb_speed ?? 0,
  }
}

function Slot({ opt, offset, onPick }: { opt: PromptOption; offset: number; onPick: () => void }) {
  const beast = useBeast(opt)
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      className={`cpod-slot${offset === 0 ? ' is-center' : ''}`}
      style={{ '--off': offset, '--abs': Math.abs(offset) } as CSSProperties}
      onClick={onPick}
      tabIndex={offset === 0 ? 0 : -1}
      aria-label={opt.label}
    >
      <span className="cpod-art">
        {beast.image && !broken ? (
          <img src={beast.image} alt="" draggable={false} onError={() => setBroken(true)} />
        ) : (
          <PawPrint aria-hidden="true" />
        )}
      </span>
    </button>
  )
}

function Facts({ opt }: { opt: PromptOption }) {
  const b = useBeast(opt)
  const speeds = [
    b.speed ? `${b.speed} фт.` : null,
    b.fly ? `полёт ${b.fly}` : null,
    b.swim ? `плавание ${b.swim}` : null,
    b.climb ? `лазание ${b.climb}` : null,
  ].filter(Boolean)
  return (
    <div className="cpod-facts">
      <b className="gold-text">{b.name}</b>
      <span className="cpod-cr">{/\(ПО [^)]+\)/.exec(opt.label)?.[0]?.slice(1, -1) ?? ''}</span>
      {b.hp != null && (
        <span className="cpod-stats">
          <span title="Хиты">
            <Heart aria-hidden="true" /> {b.hp}
          </span>
          {b.ac != null && (
            <span title="Класс доспеха">
              <Shield aria-hidden="true" /> {b.ac}
            </span>
          )}
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
              <Slot key={`${String(opt.value)}-${off}`} opt={opt} offset={off} onPick={() => go(off)} />
            ))}
            <button type="button" className="cpod-nav is-prev" onClick={() => go(-1)} aria-label="Предыдущий">
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="cpod-nav is-next" onClick={() => go(1)} aria-label="Следующий">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <Facts opt={options[index]} />
          <span className="cpod-count">
            {index + 1} / {options.length}
          </span>
        </>
      )}
    </div>
  )
}
