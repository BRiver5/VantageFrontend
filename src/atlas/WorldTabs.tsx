/**
 * Вкладки страницы мира: Обзор (книги и нововведения) · Лор · Карта · Хронология.
 * Атлас есть не у каждого мира — тогда вкладка честно говорит, что данных нет.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BookOpen, Hourglass, Map as MapIcon, ScrollText } from 'lucide-react'
import { getAtlasWorlds } from '../api/atlas'
import type { AtlasWorld } from '../api/atlas'
import { AtlasProvider, useAtlas, useWorldParams, type WorldTab } from './AtlasContext'

const AtlasMap = lazy(() => import('./AtlasMap'))
const AtlasTimeline = lazy(() => import('./AtlasTimeline'))
const AtlasLore = lazy(() => import('./AtlasLore'))

let worldsPromise: Promise<AtlasWorld[]> | null = null
const loadWorlds = () =>
  (worldsPromise ??= getAtlasWorlds().catch((e: unknown) => {
    worldsPromise = null
    throw e
  }))

/** Атлас мира по английскому названию сеттинга; null — атласа нет, undefined — ещё грузится */
export function useAtlasWorld(settingEn: string | null | undefined): AtlasWorld | null | undefined {
  const [world, setWorld] = useState<AtlasWorld | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setWorld(undefined)
    loadWorlds()
      .then((list) => alive && setWorld(list.find((w) => settingEn && w.setting_en.toLowerCase() === settingEn.toLowerCase()) ?? null))
      .catch(() => alive && setWorld(null))
    return () => {
      alive = false
    }
  }, [settingEn])
  return world
}

const TABS: { id: WorldTab; label: string; icon: typeof MapIcon }[] = [
  { id: 'overview', label: 'Обзор', icon: BookOpen },
  { id: 'lore', label: 'Лор', icon: ScrollText },
  { id: 'map', label: 'Карта', icon: MapIcon },
  { id: 'timeline', label: 'Хронология', icon: Hourglass },
]

export function WorldTabs({ world, worldName, overview }: { world: AtlasWorld | null | undefined; worldName: string; overview: ReactNode }) {
  const { tab, set } = useWorldParams()
  const has = (id: WorldTab) => id === 'overview' || Boolean(world?.has[id as keyof AtlasWorld['has']])

  const bar = (
    <div className="atlas-tabs" role="tablist" aria-label="Разделы мира">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={`atlas-tab${tab === id ? ' is-active' : ''}${has(id) ? '' : ' is-empty'}`}
          onClick={() => set({ tab: id, place: null, section: null, year: null, era: null, q: null, cat: null, link: null })}
          title={has(id) ? label : `${label}: для этого мира пока нет данных`}
        >
          <Icon aria-hidden="true" />
          {label}
          {world && id === 'map' && <small>{world.counts.markers}</small>}
          {world && id === 'timeline' && <small>{world.counts.events}</small>}
        </button>
      ))}
    </div>
  )

  if (tab === 'overview') {
    return (
      <>
        {bar}
        {overview}
      </>
    )
  }
  if (world === undefined) {
    return (
      <>
        {bar}
        <p className="status-line">Открываем атлас…</p>
      </>
    )
  }
  if (!world || !has(tab)) {
    return (
      <>
        {bar}
        <EmptyAtlas tab={tab} worldName={worldName} />
      </>
    )
  }
  return (
    <AtlasProvider world={world}>
      <div className="atlas-tabs-row">
        {bar}
        <LangToggle />
      </div>
      <AtlasBody tab={tab} />
    </AtlasProvider>
  )
}

function LangToggle() {
  const { lang, setLang } = useAtlas()
  return (
    <div className="atlas-lang" role="group" aria-label="Язык текстов">
      <button type="button" className={lang === 'ru' ? 'is-on' : ''} onClick={() => setLang('ru')} title="Перевод на русский">
        RU
      </button>
      <button type="button" className={lang === 'en' ? 'is-on' : ''} onClick={() => setLang('en')} title="Английский оригинал (Forgotten Realms Wiki)">
        EN
      </button>
    </div>
  )
}

function AtlasBody({ tab }: { tab: WorldTab }) {
  const { error, world } = useAtlas()
  if (error) return <p className="status-line is-error">Атлас не загрузился: {error}</p>
  return (
    <Suspense fallback={<p className="status-line">Открываем атлас…</p>}>
      {tab === 'map' && <AtlasMap />}
      {tab === 'timeline' && <AtlasTimeline />}
      {tab === 'lore' && <AtlasLore />}
      <footer className="atlas-sources">
        Источники:{' '}
        {world.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ' · '}
            <a href={s.url} target="_blank" rel="noreferrer noopener">
              {s.name}
            </a>
          </span>
        ))}
        . Переключатель RU / EN над вкладками показывает перевод или английский оригинал; где перевода ещё нет — оригинал.
      </footer>
    </Suspense>
  )
}

const EMPTY: Record<Exclude<WorldTab, 'overview'>, { icon: typeof MapIcon; what: string }> = {
  lore: { icon: ScrollText, what: 'летописей и статей о мире' },
  map: { icon: MapIcon, what: 'интерактивной карты' },
  timeline: { icon: Hourglass, what: 'хронологии' },
}

function EmptyAtlas({ tab, worldName }: { tab: WorldTab; worldName: string }) {
  if (tab === 'overview') return null
  const { icon: Icon, what } = EMPTY[tab]
  return (
    <div className="atlas-empty">
      <Icon aria-hidden="true" />
      <h3>У мира «{worldName}» пока нет {what}</h3>
      <p>
        Атлас собирается из открытых источников по миру — карт, вики и летописей. Для Забытых Королевств их много; для
        этого мира подходящих источников пока не нашлось.
      </p>
    </div>
  )
}
