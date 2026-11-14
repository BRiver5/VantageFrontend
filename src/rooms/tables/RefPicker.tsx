/**
 * Выбор ссылки для результата таблицы: страницы базы знаний, заготовки и каталог
 * предметов, существа комнаты и бестиарий, другие таблицы. Строку можно нажать
 * (ссылка уйдёт в выбранную строку редактора) или перетащить на любую строку.
 */
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Crown, Gem, Package, Search, Skull, Table2, Swords } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { fetchPage, realImage, type Creature, type Equipment, type Item } from '../../api'
import { Img } from '../../media'
import { useKnowledge } from '../kb/context'
import { useRoom } from '../RoomProvider'
import { listTemplates } from '../roomsApi'
import { isFullCreature, type ScreenItemTemplate } from '../../types/rooms'
import { creatureArt, creatureName } from '../table/parts'
import { encodeRef, REF_MIME } from './logic'
import type { RefPick, RollTable } from './types'

type Source = 'pages' | 'own' | 'equipment' | 'magic' | 'room' | 'bestiary' | 'tables'

const SOURCES: [Source, string, LucideIcon][] = [
  ['pages', 'Страницы', BookOpen],
  ['own', 'Заготовки', Crown],
  ['equipment', 'Снаряжение', Package],
  ['magic', 'Магия', Gem],
  ['room', 'Существа', Skull],
  ['bestiary', 'Бестиарий', Swords],
  ['tables', 'Таблицы', Table2],
]

const REMOTE = new Set<Source>(['equipment', 'magic', 'bestiary'])

/** Каталог ищется на сервере: списки большие */
function useCatalogSearch(source: Source, q: string): RefPick[] {
  const [found, setFound] = useState<{ key: string; items: RefPick[] }>({ key: '', items: [] })
  const key = `${source}:${q.trim()}`
  useEffect(() => {
    if (!REMOTE.has(source)) return
    let alive = true
    const t = setTimeout(() => {
      const query = { q: q.trim() || undefined, limit: 40 }
      const load: Promise<RefPick[]> =
        source === 'equipment'
          ? fetchPage<Equipment>('equipment', query).then((r) => r.items.map((e) => ({ type: 'item', ref_id: e.id, ref_kind: 'equipment', text: e.equipment_name, image: realImage(e.equipment_image_gallery) })))
          : source === 'magic'
            ? fetchPage<Item>('items', query).then((r) => r.items.map((m) => ({ type: 'item', ref_id: m.id, ref_kind: 'magic_item', text: m.item_name, image: realImage(m.item_image_gallery) })))
            : fetchPage<Creature>('creatures', query).then((r) => r.items.map((c) => ({ type: 'creature', ref_id: c.id, ref_kind: 'catalog', text: c.name, image: realImage(c.image_gallery) ?? realImage(c.image_url) })))
      load.then((items) => alive && setFound({ key, items }), () => alive && setFound({ key, items: [] }))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [source, q, key])
  return found.key === key ? found.items : []
}

export function RefPicker({ tables, selfId, onPick }: { tables: RollTable[]; selfId: string | null; onPick: (pick: RefPick) => void }) {
  const { data, roomId } = useRoom()
  const kb = useKnowledge()
  const [source, setSource] = useState<Source>('pages')
  const [q, setQ] = useState('')
  const [templates, setTemplates] = useState<ScreenItemTemplate[] | null>(null)
  const remote = useCatalogSearch(source, q)

  useEffect(() => {
    if (source !== 'own' || templates) return
    let alive = true
    listTemplates(roomId).then((t) => alive && setTemplates(t), () => alive && setTemplates([]))
    return () => {
      alive = false
    }
  }, [source, templates, roomId])

  const local = useMemo<RefPick[]>(() => {
    if (source === 'pages') return (kb?.notes ?? []).map((n) => ({ type: 'kb_page', ref_id: n.id, ref_kind: null, text: n.title || 'Без названия', image: null }))
    if (source === 'own') return (templates ?? []).map((t) => ({ type: 'item', ref_id: t.id, ref_kind: 'template', text: t.name, image: t.image_url }))
    if (source === 'room')
      return (data?.creatures ?? []).filter(isFullCreature).map((c) => ({ type: 'creature', ref_id: c.id, ref_kind: 'room', text: creatureName(c), image: creatureArt(c) }))
    if (source === 'tables') return tables.filter((t) => t.id !== selfId).map((t) => ({ type: 'table', ref_id: t.id, ref_kind: null, text: t.name, image: t.image }))
    return []
  }, [source, kb?.notes, templates, data?.creatures, tables, selfId])

  const needle = q.trim().toLocaleLowerCase('ru')
  const list = (REMOTE.has(source) ? remote : local.filter((p) => !needle || p.text.toLocaleLowerCase('ru').includes(needle))).slice(0, 80)

  return (
    <aside className="rt-picker" aria-label="Ссылки для результатов">
      <div className="rt-picker-tabs" role="tablist">
        {SOURCES.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={source === id} className={source === id ? 'is-on' : ''} title={label} onClick={() => setSource(id)}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <label className="sc-search">
        <Search aria-hidden="true" />
        <input type="search" value={q} placeholder="Найти…" onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul className="rt-picker-list">
        {list.map((p) => (
          <li key={`${p.ref_kind ?? p.type}-${p.ref_id}`}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(REF_MIME, encodeRef(p))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onPick(p)}
              title="Нажмите, чтобы вставить в выбранную строку, или перетащите на строку"
            >
              {p.image ? <Img src={p.image} alt="" loading="lazy" draggable={false} /> : <span className="rt-picker-dot" aria-hidden="true" />}
              <b>{p.text}</b>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="tb-hint">Ничего не нашли.</li>}
      </ul>
    </aside>
  )
}
