/**
 * Хронология мира: эпохи → годы → события. Все ~6000 событий не грузим:
 * сервер отдаёт страницы по фильтру (эпоха, с какого года, рубрики, поиск,
 * ссылка на статью). Год из адреса (?year=1358) открывает его эпоху с этого года.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Hourglass, MapPin, Search, X } from 'lucide-react'
import { formatDR, getEra, getEvents } from '../api/atlas'
import type { AtlasEra, AtlasEvent, AtlasTimeline as TimelineData, AtlasYear } from '../api/atlas'
import { useAtlas, useWorldParams } from './AtlasContext'
import { AtlasText, WikiSource } from './AtlasText'
import { countLabel } from '../lib/plural'

const PAGE = 250

const CAT_COLORS: Record<string, string> = {
  politics: '#c49a3c',
  conflicts: '#d0563f',
  deaths: '#8d8a99',
  births: '#6fb38a',
  misc: '#9a8f78',
  magic: '#8f74d6',
  people: '#d08a52',
  environment: '#5ba7a0',
  organizations: '#c76f9a',
  migrations: '#7d9bd1',
  deities: '#e3c46e',
  realmspace: '#5f86c9',
  wildlife: '#86a858',
  abeir: '#b0765a',
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

  return (
    <div className="atlas-timeline">
      <nav className="atlas-eras" aria-label="Эпохи">
        {data.eras.map((e) => (
          <button
            key={e.index}
            type="button"
            className={`atlas-era${!searching && e.index === era ? ' is-active' : ''}`}
            onClick={() => set({ era: e.index, year: null, q: null, link: null })}
            style={e.image ? { ['--era-art' as string]: `url("${e.image}")` } : undefined}
          >
            <span className="atlas-era-name">{e.name_ru}</span>
            <span className="atlas-era-en">{e.title}</span>
            <span className="atlas-era-range">{eraRange(e)}</span>
            <span className="atlas-era-count">{countLabel(e.events, ['событие', 'события', 'событий'])}</span>
          </button>
        ))}
      </nav>

      <div className="atlas-tl-tools">
        <label className="atlas-search">
          <Search aria-hidden="true" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Поиск по всей истории: Нетерил, Elminster…" />
          {draft && (
            <button type="button" onClick={() => { setDraft(''); set({ q: null }) }} aria-label="Очистить">
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        <form className="atlas-jump" onSubmit={(e) => { e.preventDefault(); doJump() }}>
          <Hourglass aria-hidden="true" />
          <input value={jump} onChange={(e) => setJump(e.target.value)} placeholder="К году: 1358, −339" inputMode="numeric" />
        </form>
      </div>

      <div className="atlas-cats">
        {Object.entries(data.categories).map(([key, label]) => {
          const on = cats.includes(key)
          return (
            <button
              key={key}
              type="button"
              className={`atlas-cat${on ? ' is-on' : ''}`}
              style={{ ['--cat' as string]: CAT_COLORS[key] ?? '#9a8f78' }}
              onClick={() => set({ cat: (on ? cats.filter((c) => c !== key) : [...cats, key]).join(',') || null }, true)}
            >
              {label}
            </button>
          )
        })}
        {cats.length > 0 && (
          <button type="button" className="atlas-cat is-reset" onClick={() => set({ cat: null }, true)}>
            все рубрики
          </button>
        )}
      </div>

      {link && (
        <div className="atlas-filter-chip">
          <MapPin aria-hidden="true" /> Только события, где упомянуто: <strong>{linkLabel}</strong>
          <button type="button" onClick={() => set({ link: null })} aria-label="Снять фильтр">
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {!searching && current && <EraIntro era={current} />}

      <div ref={listTop} className="atlas-tl-status">
        {error ? (
          <span className="is-error">Не удалось загрузить события: {error}</span>
        ) : (
          <>
            {searching ? 'Найдено' : year != null ? `С ${formatDR(year)} —` : 'В эпохе'} {countLabel(total, ['событие', 'события', 'событий'])}
            {year != null && !searching && (
              <button type="button" className="atlas-link-btn" onClick={() => set({ year: null, era })}>
                показать с начала эпохи
              </button>
            )}
          </>
        )}
      </div>

      <div className="atlas-years">
        {groups.map(([y, evs]) => {
          const info = yearsByNum.get(y)
          return (
            <section key={y} className={`atlas-year${y === year ? ' is-target' : ''}`} id={`year-${y}`}>
              <header>
                <span className="atlas-year-num">{formatDR(y)}</span>
                {info?.name && <span className="atlas-year-name">{pick(info.name_ru, info.name)}</span>}
                {info?.headline && (
                  <span className="atlas-year-headline">
                    <AtlasText src={pick(info.headline_ru, info.headline)} inline />
                  </span>
                )}
              </header>
              <ul>
                {evs.map((ev) => (
                  <li key={ev.id} className={ev.sub ? 'is-sub' : ''}>
                    <span className="atlas-cat-dot" style={{ background: CAT_COLORS[ev.cat] }} title={data.categories[ev.cat]} />
                    <div>
                      {ev.approx && <span className="atlas-approx">около</span>}
                      <AtlasText src={pick(ev.text_ru, ev.text)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {!loading && items.length === 0 && !error && <p className="atlas-muted">Событий по этому фильтру нет.</p>}
        <div ref={sentinel} />
        {loading && <p className="status-line">Листаем летописи…</p>}
        {!loading && items.length < total && (
          <button type="button" className="atlas-btn is-ghost" onClick={more}>
            Ещё {Math.min(PAGE, total - items.length)} из {total - items.length}
          </button>
        )}
      </div>
      <p className="atlas-credits">
        Летопись — годовые статьи Forgotten Realms Wiki (CC BY-SA). Ссылки на места открывают карту, на годы — хронологию.
        <button type="button" className="atlas-link-btn" onClick={() => go({ kind: 'wiki', url: 'https://forgottenrealms.fandom.com/wiki/Category:Years' })}>
          Источник
        </button>
      </p>
    </div>
  )
}

function EraIntro({ era }: { era: AtlasEra }) {
  const { world, pick } = useAtlas()
  const [full, setFull] = useState<AtlasEra | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setFull(null)
    setOpen(false)
  }, [era.index])
  const expand = () => {
    setOpen(true)
    if (!full) getEra(world.world, era.index).then(setFull).catch(() => undefined)
  }
  return (
    <section className="atlas-era-intro">
      <h2 className="section-title gold-text">{era.name_ru}</h2>
      <p className="section-sub">
        {era.title} · {eraRange(era)} · {countLabel(era.years, ['год', 'года', 'лет'])} в летописи
      </p>
      {!open && era.summary && <p className="atlas-era-summary">{pick(era.summary_ru, era.summary)}</p>}
      {open ? (
        full ? (
          <div className="atlas-article">
            <AtlasText src={pick(full.body_ru, full.body ?? '')} />
            <WikiSource url={full.url} title={full.title} />
          </div>
        ) : (
          <p className="status-line">Открываем…</p>
        )
      ) : (
        <button type="button" className="atlas-btn is-ghost" onClick={expand}>
          <BookOpen aria-hidden="true" /> Об эпохе подробнее
        </button>
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
