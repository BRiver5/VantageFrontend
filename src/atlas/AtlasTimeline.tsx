/**
 * Хронология мира: эпохи → годы → события. Все ~6000 событий не грузим:
 * сервер отдаёт страницы по фильтру (эпоха, с какого года, рубрики, поиск,
 * ссылка на статью). Год из адреса (?year=1358) открывает его эпоху с этого года.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, ChevronDown, Hourglass, MapPin, Search, SlidersHorizontal, X } from 'lucide-react'
import { formatDR, getEra, getEvents } from '../api/atlas'
import type { AtlasEra, AtlasEvent, AtlasTimeline as TimelineData, AtlasYear } from '../api/atlas'
import { useAtlas, useWorldParams } from './AtlasContext'
import { AtlasText, WikiSource } from './AtlasText'
import { countLabel } from '../lib/plural'

const PAGE = 250

/** Цвет рубрики: приглушённые тона одной светлоты — метка, а не пятно */
const CAT_COLORS: Record<string, string> = {
  politics: '#d2ad62',
  conflicts: '#d97a68',
  deaths: '#a3a1ae',
  births: '#86bf9c',
  misc: '#aea692',
  magic: '#a593dc',
  people: '#d9a277',
  environment: '#79b8b1',
  organizations: '#d290ae',
  migrations: '#93acd9',
  deities: '#e3cd85',
  realmspace: '#8ea2d6',
  wildlife: '#a0bd78',
  abeir: '#c8977c',
}

function eraRange(e: AtlasEra): string {
  const end = e.end == null ? 'наши дни' : formatDR(e.end)
  return `${formatDR(e.start)} — ${end}`
}

export default function AtlasTimeline() {
  const { timeline } = useAtlas()
  if (!timeline) return <p className="status-line">Разворачиваем свиток лет…</p>
  return <TimelineView data={timeline} />
}

function TimelineView({ data }: { data: TimelineData }) {
  const { world, map, links, go, pick } = useAtlas()
  const { params, set } = useWorldParams()
  const yearParam = params.get('year')
  const year = yearParam != null && yearParam !== '' ? Number(yearParam) : null
  const link = params.get('link')
  const q = params.get('q') ?? ''
  const cats = useMemo(() => (params.get('cat') ? params.get('cat')!.split(',') : []), [params])

  const yearsByNum = useMemo(() => new Map(data.years.map((y) => [y.year, y])), [data])
  const eraParam = params.get('era')
  // эпоха: явная, иначе эпоха выбранного года, иначе нынешняя (последняя)
  const era = eraParam != null ? Number(eraParam) : year != null ? nearestYear(data.years, year)?.era ?? data.eras.length - 1 : data.eras.length - 2
  const searching = Boolean(q || link)

  const [draft, setDraft] = useState(q)
  useEffect(() => setDraft(q), [q])
  useEffect(() => {
    if (draft === q) return
    const t = setTimeout(() => set({ q: draft || null }, true), 350)
    return () => clearTimeout(t)
  }, [draft, q, set])

  const [items, setItems] = useState<AtlasEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const query = useMemo(
    () => ({
      era: searching ? undefined : era,
      from: !searching && year != null ? year : undefined,
      cat: cats,
      q: q || undefined,
      link: link || undefined,
    }),
    [searching, era, year, cats, q, link],
  )
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getEvents(world.world, { ...query, skip: 0, limit: PAGE })
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setTotal(r.total)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.world, queryKey])

  const more = () => {
    if (loading || items.length >= total) return
    setLoading(true)
    getEvents(world.world, { ...query, skip: items.length, limit: PAGE })
      .then((r) => setItems((prev) => [...prev, ...r.items]))
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }
  const sentinel = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef(more)
  moreRef.current = more
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && moreRef.current(), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // прокрутка к началу списка при смене фильтра — к выбранному году
  const listTop = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (year != null) listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [year])

  const groups = useMemo(() => groupByYear(items), [items])
  const current = data.eras[era]
  const linkLabel = useMemo(() => {
    if (!link || !links) return link
    const t = links.resolve(link)
    const place = t.kind === 'place' ? map?.markers.find((m) => m.id === t.id) : null
    return place?.name_ru ? `${place.name_ru} (${link})` : link
  }, [link, links, map])

  const [jump, setJump] = useState('')
  const doJump = () => {
    const raw = jump.trim().replace(/\s/g, '')
    const neg = /^(-|−)|до/i.test(jump)
    const n = Number(raw.replace(/[^\d]/g, ''))
    if (!raw || Number.isNaN(n)) return
    const target = nearestYear(data.years, neg ? -n : n)
    if (target) set({ year: target.year, era: null, q: null, link: null })
  }

  const [catsOpen, setCatsOpen] = useState(false)
  const catsRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!catsOpen) return
    const close = (e: MouseEvent) => {
      if (catsRef.current && !catsRef.current.contains(e.target as Node)) setCatsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [catsOpen])
  const toggleCat = (key: string) =>
    set({ cat: (cats.includes(key) ? cats.filter((c) => c !== key) : [...cats, key]).join(',') || null }, true)
  const catOrder = Object.keys(data.categories)
  const hasFilters = cats.length > 0 || Boolean(link) || Boolean(q)

  return (
    <div className="tl">
      <nav className="tl-eras" aria-label="Эпохи">
        <div className="tl-eras-track">
          {data.eras.map((e) => (
            <button
              key={e.index}
              type="button"
              className={`tl-era-stop${!searching && e.index === era ? ' is-active' : ''}`}
              onClick={() => set({ era: e.index, year: null, q: null, link: null })}
              title={`${e.title} · ${countLabel(e.events, ['событие', 'события', 'событий'])}`}
            >
              <span className="tl-era-dot" aria-hidden="true" />
              <span className="tl-era-name">{e.name_ru}</span>
              <span className="tl-era-range">{eraRange(e)}</span>
            </button>
          ))}
        </div>
      </nav>

      {!searching && current && <EraIntro era={current} position={`${era + 1} из ${data.eras.length}`} />}

      <div className="tl-bar">
        <label className="tl-field tl-search">
          <Search aria-hidden="true" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Поиск по всей истории — Нетерил, Эльминстер…" />
          {draft && (
            <button type="button" className="tl-clear" onClick={() => { setDraft(''); set({ q: null }) }} aria-label="Очистить">
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        <form className="tl-field tl-jump" onSubmit={(e) => { e.preventDefault(); doJump() }}>
          <Hourglass aria-hidden="true" />
          <input value={jump} onChange={(e) => setJump(e.target.value)} placeholder="К году: 1358" inputMode="numeric" aria-label="Перейти к году" />
        </form>
        <div className="tl-cats" ref={catsRef}>
          <button type="button" className={`tl-field tl-cats-btn${catsOpen ? ' is-open' : ''}`} onClick={() => setCatsOpen((v) => !v)} aria-expanded={catsOpen}>
            <SlidersHorizontal aria-hidden="true" />
            Рубрики
            {cats.length > 0 && <span className="tl-badge">{cats.length}</span>}
            <ChevronDown className="tl-caret" aria-hidden="true" />
          </button>
          {catsOpen && (
            <div className="tl-cats-pop" role="menu">
              {catOrder.map((key) => {
                const on = cats.includes(key)
                return (
                  <button key={key} type="button" role="menuitemcheckbox" aria-checked={on} className={`tl-cat-opt${on ? ' is-on' : ''}`} style={{ ['--cat' as string]: CAT_COLORS[key] }} onClick={() => toggleCat(key)}>
                    <span className="tl-check" aria-hidden="true">{on && <Check />}</span>
                    {data.categories[key]}
                  </button>
                )
              })}
              <div className="tl-cats-foot">
                <button type="button" onClick={() => set({ cat: null }, true)} disabled={cats.length === 0}>Сбросить</button>
                <button type="button" onClick={() => setCatsOpen(false)}>Готово</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {hasFilters && (
        <div className="tl-chips">
          {link && (
            <span className="tl-chip">
              <MapPin aria-hidden="true" /> {linkLabel}
              <button type="button" onClick={() => set({ link: null })} aria-label="Снять фильтр"><X aria-hidden="true" /></button>
            </span>
          )}
          {cats.map((key) => (
            <span key={key} className="tl-chip" style={{ ['--cat' as string]: CAT_COLORS[key] }}>
              <span className="tl-chip-dot" aria-hidden="true" /> {data.categories[key]}
              <button type="button" onClick={() => toggleCat(key)} aria-label="Убрать рубрику"><X aria-hidden="true" /></button>
            </span>
          ))}
          <button type="button" className="tl-reset" onClick={() => { setDraft(''); set({ cat: null, link: null, q: null }) }}>
            сбросить всё
          </button>
        </div>
      )}

      <div ref={listTop} className="tl-status">
        {error ? (
          <span className="is-error">Не удалось загрузить события: {error}</span>
        ) : (
          <>
            <span>
              {searching ? 'Найдено ' : ''}
              {countLabel(total, ['событие', 'события', 'событий'])}
              {!searching && year != null && ` · с ${formatDR(year)}`}
            </span>
            {year != null && !searching && (
              <button type="button" className="tl-link" onClick={() => set({ year: null, era })}>
                с начала эпохи
              </button>
            )}
          </>
        )}
      </div>

      <div className="tl-years">
        {groups.map(([y, evs]) => {
          const info = yearsByNum.get(y)
          const byCat = new Map<string, AtlasEvent[]>()
          for (const ev of evs) byCat.set(ev.cat, [...(byCat.get(ev.cat) ?? []), ev])
          const ordered = catOrder.filter((c) => byCat.has(c))
          return (
            <section key={y} className={`tl-year${y === year ? ' is-target' : ''}`} id={`year-${y}`}>
              <header className="tl-year-head">
                <div className="tl-year-sticky">
                  <span className="tl-year-num">
                    {Math.abs(y) >= 10000 ? Math.abs(y).toLocaleString('ru-RU') : Math.abs(y)}
                    <small>{y < 0 ? 'до ЛД' : 'ЛД'}</small>
                  </span>
                  {info?.name && <span className="tl-year-name">{pick(info.name_ru, info.name)}</span>}
                </div>
              </header>
              <div className="tl-year-body">
                {info?.headline && (
                  <div className="tl-headline">
                    <AtlasText src={pick(info.headline_ru, info.headline)} inline />
                  </div>
                )}
                {ordered.map((c) => (
                  <div key={c} className="tl-group" style={{ ['--cat' as string]: CAT_COLORS[c] }}>
                    <h4 className="tl-group-title">{data.categories[c]}</h4>
                    <ul>
                      {byCat.get(c)!.map((ev) => (
                        <li key={ev.id} className={ev.sub ? 'is-sub' : ''}>
                          {ev.approx && <span className="tl-approx">ок.</span>}
                          <AtlasText src={pick(ev.text_ru, ev.text)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
        {!loading && items.length === 0 && !error && <p className="tl-empty">Событий по этому фильтру нет.</p>}
        <div ref={sentinel} />
        {loading && <p className="status-line">Листаем летописи…</p>}
        {!loading && items.length < total && (
          <button type="button" className="tl-more" onClick={more}>
            Показать ещё {Math.min(PAGE, total - items.length)} · осталось {total - items.length}
          </button>
        )}
      </div>
      <p className="tl-credits">
        Летопись — годовые статьи Forgotten Realms Wiki (CC BY-SA). Золотые ссылки ведут на карту, в лор и к другим годам.{' '}
        <button type="button" className="tl-link" onClick={() => go({ kind: 'wiki', url: 'https://forgottenrealms.fandom.com/wiki/Category:Years' })}>
          Источник
        </button>
      </p>
    </div>
  )
}

function EraIntro({ era, position }: { era: AtlasEra; position: string }) {
  const { world, pick } = useAtlas()
  const [full, setFull] = useState<AtlasEra | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setFull(null)
    setOpen(false)
  }, [era.index])
  const toggle = () => {
    setOpen((v) => !v)
    if (!full) getEra(world.world, era.index).then(setFull).catch(() => undefined)
  }
  return (
    <section className={`tl-era${era.image ? ' has-art' : ''}`}>
      <div className="tl-era-text">
        <span className="tl-kicker">Эпоха {position}</span>
        <h2 className="tl-era-title gold-text">{era.name_ru}</h2>
        <p className="tl-era-meta">
          <span>{era.title}</span>
          <span>{eraRange(era)}</span>
          <span>{countLabel(era.years, ['год', 'года', 'лет'])} в летописи</span>
          <span>{countLabel(era.events, ['событие', 'события', 'событий'])}</span>
        </p>
        {era.summary && <p className="tl-era-summary">{pick(era.summary_ru, era.summary)}</p>}
        <button type="button" className="tl-link tl-era-more" onClick={toggle} aria-expanded={open}>
          <BookOpen aria-hidden="true" /> {open ? 'Свернуть' : 'Об эпохе подробнее'}
          <ChevronDown className={open ? 'is-up' : ''} aria-hidden="true" />
        </button>
      </div>
      {era.image && (
        <div className="tl-era-art" aria-hidden="true">
          <img src={era.image} alt="" loading="lazy" />
        </div>
      )}
      {open && (
        <div className="tl-era-full">
          {full ? (
            <div className="atlas-article">
              <AtlasText src={pick(full.body_ru, full.body ?? '')} />
              <WikiSource url={full.url} title={full.title} />
            </div>
          ) : (
            <p className="status-line">Открываем…</p>
          )}
        </div>
      )}
    </section>
  )
}

function groupByYear(items: AtlasEvent[]): [number, AtlasEvent[]][] {
  const out: [number, AtlasEvent[]][] = []
  for (const ev of items) {
    const last = out[out.length - 1]
    if (last && last[0] === ev.year) last[1].push(ev)
    else out.push([ev.year, [ev]])
  }
  return out
}

/** Ближайший год летописи к заданному (не каждый год описан) */
function nearestYear(years: AtlasYear[], target: number): AtlasYear | null {
  let best: AtlasYear | null = null
  for (const y of years) {
    if (!best || Math.abs(y.year - target) < Math.abs(best.year - target)) best = y
  }
  return best
}
