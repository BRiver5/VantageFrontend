/**
 * Интерактивная карта мира: пирамида тайлов (Leaflet, CRS.Simple — координаты
 * меток в пикселях исходной картинки, как у LoreMaps), слои меток, поиск и
 * карточка места: сводка, полная статья, события хронологии со ссылкой на место.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BookOpen, Crosshair, Eye, EyeOff, Hourglass, Search, X } from 'lucide-react'
import { formatDR, getAtlasArticle, getEvents } from '../api/atlas'
import type { AtlasArticle, AtlasEvent, AtlasMap as MapData, AtlasMarker } from '../api/atlas'
import { useAtlas, useWorldParams } from './AtlasContext'
import { AtlasText, InfoboxCard, WikiSource } from './AtlasText'
import { wikiUrl } from './links'

const placeName = (m: AtlasMarker) => m.name_ru ?? m.name

function pin(color: string, selected: boolean): L.DivIcon {
  const s = selected ? 1.35 : 1
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${26 * s}" height="${34 * s}" viewBox="0 0 26 34">` +
    `<path d="M13 1C6.4 1 1 6.4 1 13c0 9 12 20 12 20s12-11 12-20C25 6.4 19.6 1 13 1z" fill="${color}" stroke="#1a1510" stroke-width="1.5"/>` +
    `<circle cx="13" cy="13" r="4.5" fill="#f5eeda"/></svg>`
  return L.divIcon({
    className: `atlas-pin${selected ? ' is-selected' : ''}`,
    html: svg,
    iconSize: [26 * s, 34 * s],
    iconAnchor: [13 * s, 33 * s],
    tooltipAnchor: [0, -30 * s],
  })
}

/** С какого зума подпись видна постоянно: столицы раньше, остальное ближе */
const LABEL_ZOOM: Record<string, number> = { capitals: 0, portcapitals: 0, cities: 3.5, ports: 3.5 }

export default function AtlasMap() {
  const { world, map } = useAtlas()
  const { params, set } = useWorldParams()
  const placeId = params.get('place')
  if (!map) return <p className="status-line">Разворачиваем карту…</p>
  return <MapView key={world.world} data={map} placeId={placeId} onSelect={(id) => set({ place: id }, !placeId === !id)} />
}

function MapView({ data, placeId, onSelect }: { data: MapData; placeId: string | null; onSelect: (id: string | null) => void }) {
  const host = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const groupsRef = useRef(new Map<string, L.LayerGroup>())
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(0)

  const colors = useMemo(() => new Map(data.layers.map((l) => [l.id, l.color])), [data])
  const byId = useMemo(() => new Map(data.markers.map((m) => [m.id, m])), [data])
  const selected = placeId ? byId.get(placeId) ?? null : null

  // карта создаётся один раз на данные
  useEffect(() => {
    const el = host.current
    if (!el) return
    const img = data.image
    const map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: 0,
      maxZoom: img.max_zoom + 2,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      attributionControl: true,
      zoomControl: false,
    })
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map)
    map.attributionControl.setPrefix(false)
    const at = (x: number, y: number) => map.unproject([x, y], img.max_zoom)
    const bounds = L.latLngBounds(at(0, 0), at(img.width, img.height))
    L.tileLayer(img.tiles_url, {
      bounds,
      noWrap: true,
      minZoom: 0,
      maxZoom: img.max_zoom + 2,
      maxNativeZoom: img.max_zoom,
      attribution: img.attribution,
    }).addTo(map)
    map.setMaxBounds(bounds.pad(0.15))
    map.fitBounds(bounds)
    map.setMinZoom(Math.max(0, map.getZoom() - 0.5))

    const groups = new Map<string, L.LayerGroup>()
    for (const layer of data.layers) groups.set(layer.id, L.layerGroup().addTo(map))
    const markers = new Map<string, L.Marker>()
    for (const m of data.markers) {
      const color = colors.get(m.layer) ?? '#c49a3c'
      const marker = L.marker(at(m.x, m.y), { icon: pin(color, false), title: placeName(m), riseOnHover: true })
      marker.bindTooltip(placeName(m), {
        permanent: true,
        direction: 'top',
        className: `atlas-label is-${m.layer}`,
      })
      marker.on('click', () => selectRef.current(m.id))
      marker.addTo(groups.get(m.layer)!)
      markers.set(m.id, marker)
    }
    const syncZoom = () => setZoom(map.getZoom())
    map.on('zoomend', syncZoom)
    syncZoom()
    mapRef.current = map
    markersRef.current = markers
    groupsRef.current = groups
    // карта внутри вкладки: размер известен только после раскладки
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [data, colors])

  // видимость слоёв
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const [id, g] of groupsRef.current) {
      if (hidden.has(id)) g.removeFrom(map)
      else g.addTo(map)
    }
  }, [hidden])

  // выбранная метка: крупный значок и перелёт
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selected) return
    const marker = markersRef.current.get(selected.id)
    if (!marker) return
    marker.setIcon(pin(colors.get(selected.layer) ?? '#c49a3c', true))
    marker.setZIndexOffset(1000)
    if (hidden.has(selected.layer)) setHidden((h) => new Set([...h].filter((x) => x !== selected.layer)))
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 3), { duration: 0.8 })
    return () => {
      marker.setIcon(pin(colors.get(selected.layer) ?? '#c49a3c', false))
      marker.setZIndexOffset(0)
    }
    // hidden намеренно не в зависимостях: перелёт — только при смене места
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, colors])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return data.markers
      .filter((m) => m.name.toLowerCase().includes(q) || (m.name_ru ?? '').toLowerCase().includes(q))
      .slice(0, 12)
  }, [query, data])

  const labelClass = Object.entries(LABEL_ZOOM)
    .filter(([, z]) => zoom >= z)
    .map(([l]) => `show-${l}`)
    .join(' ')

  return (
    <div className="atlas-map-shell">
      <div ref={host} className={`atlas-map ${labelClass}${zoom >= 4.5 ? ' show-all' : ''}${zoom < 2 ? ' is-far' : zoom < 3.5 ? ' is-mid' : ''}`} />

      <div className="atlas-map-panel">
        <label className="atlas-search">
          <Search aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти место: Уотердип, Waterdeep…" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Очистить">
              <X aria-hidden="true" />
            </button>
          )}
        </label>
        {results.length > 0 && (
          <ul className="atlas-results">
            {results.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => { onSelect(m.id); setQuery('') }}>
                  <span className="atlas-dot" style={{ background: colors.get(m.layer) }} />
                  {placeName(m)}
                  {m.name_ru && <small>{m.name}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="atlas-layers">
          {data.layers.map((l) => {
            const off = hidden.has(l.id)
            return (
              <button
                key={l.id}
                type="button"
                className={`atlas-layer${off ? ' is-off' : ''}`}
                onClick={() => setHidden((h) => { const n = new Set(h); if (off) n.delete(l.id); else n.add(l.id); return n })}
                title={off ? 'Показать слой' : 'Скрыть слой'}
              >
                <span className="atlas-dot" style={{ background: l.color }} />
                {l.name_ru}
                <small>{l.count}</small>
                {off ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>

      {selected && (
        <PlaceCard
          key={selected.id}
          place={selected}
          color={colors.get(selected.layer)}
          layerName={data.layers.find((l) => l.id === selected.layer)?.name_ru ?? ''}
          onClose={() => onSelect(null)}
          onFocus={() => {
            const m = markersRef.current.get(selected.id)
            if (m) mapRef.current?.flyTo(m.getLatLng(), 4, { duration: 0.6 })
          }}
        />
      )}
    </div>
  )
}

function PlaceCard({ place, color, layerName, onClose, onFocus }: { place: AtlasMarker; color?: string; layerName: string; onClose: () => void; onFocus: () => void }) {
  const { world, go, pick } = useAtlas()
  const { set } = useWorldParams()
  const [article, setArticle] = useState<AtlasArticle | null>(null)
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<{ total: number; items: AtlasEvent[] } | null>(null)

  useEffect(() => {
    if (!place.wiki) return
    let alive = true
    getAtlasArticle(world.world, place.id).then((a) => alive && setArticle(a)).catch(() => undefined)
    getEvents(world.world, { link: place.wiki, limit: 40 }).then((r) => alive && setEvents(r)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [world.world, place])

  return (
    <article className={`atlas-place${open ? ' is-open' : ''}`}>
      <header>
        <span className="atlas-place-kind" style={{ color }}>
          <span className="atlas-dot" style={{ background: color }} />
          {layerName}
        </span>
        <button type="button" className="atlas-icon-btn" onClick={onFocus} title="Показать на карте">
          <Crosshair aria-hidden="true" />
        </button>
        <button type="button" className="atlas-icon-btn" onClick={onClose} title="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="atlas-place-scroll">
        {place.image && <img className="atlas-place-img" src={place.image} alt={place.name} loading="lazy" />}
        <h3 className="gold-text">{placeName(place)}</h3>
        {place.name_ru && <div className="atlas-place-en">{place.name}</div>}
        {!place.wiki && <p className="atlas-muted">О месте пока нет статьи в Forgotten Realms Wiki.</p>}
        {place.summary && !open && <p className="atlas-place-summary">{pick(place.summary_ru, place.summary)}</p>}

        {article && (
          <>
            {open ? (
              <div className="atlas-article">
                {article.infobox && <InfoboxCard box={pick(article.infobox_ru, article.infobox)} title={article.title} />}
                <AtlasText src={pick(article.body_ru, article.body)} />
                <WikiSource url={article.url} title={article.title} />
              </div>
            ) : (
              <button type="button" className="atlas-btn" onClick={() => setOpen(true)}>
                <BookOpen aria-hidden="true" /> Вся статья
              </button>
            )}
          </>
        )}

        {events && events.total > 0 && (
          <section className="atlas-place-events">
            <h4>
              <Hourglass aria-hidden="true" /> В хронологии · {events.total}
            </h4>
            <ol>
              {events.items.map((ev) => (
                <li key={ev.id}>
                  <button type="button" className="atlas-year-link" onClick={() => go({ kind: 'year', year: ev.year })}>
                    {formatDR(ev.year)}
                  </button>
                  <AtlasText src={pick(ev.text_ru, ev.text)} />
                </li>
              ))}
            </ol>
            {events.total > events.items.length && place.wiki && (
              <button type="button" className="atlas-btn is-ghost" onClick={() => set({ tab: 'timeline', link: place.wiki, year: null, era: null })}>
                Все {events.total} — в хронологии
              </button>
            )}
          </section>
        )}
        {place.wiki && !article && <a className="atlas-source" href={wikiUrl(place.wiki)} target="_blank" rel="noreferrer noopener">Forgotten Realms Wiki</a>}
      </div>
    </article>
  )
}
