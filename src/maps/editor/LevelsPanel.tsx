/**
 * Этажи карты в конструкторе: добавить, переименовать, высоты [низ, верх),
 * поднять или опустить (этажи меняются диапазонами высот), удалить, своя
 * подложка. Сохраняются сразу (PATCH levels), не пакетом /edit.
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { nextLevel, sortedLevels } from '../levels'
import type { BattleMap, MapLevel } from '../types'
import { uid } from './batch'

type Props = {
  map: BattleMap
  current: string | null
  onCurrent: (id: string | null) => void
  /** новый список этажей; removed — удалённый этаж (вещи с него — на все этажи) */
  onLevels: (levels: MapLevel[], removed?: string) => void
  flash: (t: string) => void
}

export function LevelsPanel({ map, current, onCurrent, onLevels, flash }: Props) {
  const levels = map.levels ?? []
  // сверху вниз, как этажи дома
  const list = sortedLevels(levels).reverse()
  const put = (id: string, patch: Partial<MapLevel>) => {
    const next = levels.map((l) => (l.id === id ? { ...l, ...patch } : l))
    const bad = next.find((l) => !(l.top_ft > l.bottom_ft))
    if (bad) return flash('Верх этажа должен быть выше низа')
    onLevels(next)
  }
  /** поменять местами диапазоны высот с соседом сверху (dir −1) или снизу (+1) */
  const swap = (i: number, dir: -1 | 1) => {
    const a = list[i]
    const b = list[i + dir]
    if (!a || !b) return
    onLevels(levels.map((l) => (l.id === a.id ? { ...l, bottom_ft: b.bottom_ft, top_ft: b.top_ft } : l.id === b.id ? { ...l, bottom_ft: a.bottom_ft, top_ft: a.top_ft } : l)))
  }
  const background = (l: MapLevel, url: string) => {
    const g = map.grid
    put(l.id, { background: url ? { id: l.background?.id ?? uid('bg'), image_url: url, x: g.offset_x, y: g.offset_y, w: g.cols * g.cell_px, h: g.rows * g.cell_px, rotation: 0, z: -1000, kind: 'background', opacity: 1 } : null })
  }

  return (
    <section className="me-levels" data-tour="map-levels">
      <h3>Этажи</h3>
      {!list.length && <p className="tb-hint">Одноуровневая карта. Этажи разделяют стены, свет и вещи по высоте: жетон видит и ходит по своему этажу.</p>}
      {list.map((l, i) => (
        <div key={l.id} className={`me-levels-row${current === l.id ? ' is-current' : ''}`}>
          <input key={`n${l.name}`} defaultValue={l.name} aria-label="Название этажа" onFocus={() => onCurrent(l.id)} onBlur={(e) => e.target.value !== l.name && put(l.id, { name: e.target.value.trim() })} />
          <input key={`b${l.bottom_ft}`} type="number" step={5} defaultValue={l.bottom_ft} aria-label="Низ, фт" title="Низ, фт" onBlur={(e) => Number(e.target.value) !== l.bottom_ft && put(l.id, { bottom_ft: Number(e.target.value) || 0 })} />
          <input key={`t${l.top_ft}`} type="number" step={5} defaultValue={l.top_ft} aria-label="Верх, фт" title="Верх, фт (не входит)" onBlur={(e) => Number(e.target.value) !== l.top_ft && put(l.id, { top_ft: Number(e.target.value) || 0 })} />
          <span className="me-levels-btns">
            <button type="button" title="Выше" aria-label="Поднять этаж" disabled={i === 0} onClick={() => swap(i, -1)}>
              <ArrowUp aria-hidden="true" />
            </button>
            <button type="button" title="Ниже" aria-label="Опустить этаж" disabled={i === list.length - 1} onClick={() => swap(i, 1)}>
              <ArrowDown aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Удалить этаж: его вещи станут «на всех этажах»"
              aria-label="Удалить этаж"
              onClick={() => {
                if (!window.confirm(`Удалить этаж «${l.name || 'Этаж'}»? Его стены, свет и вещи останутся на всех этажах.`)) return
                if (current === l.id) onCurrent(null)
                onLevels(
                  levels.filter((x) => x.id !== l.id),
                  l.id,
                )
              }}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </span>
          {current === l.id && (
            <label className="me-levels-bg">
              Подложка этажа (ссылка на картинку)
              <input key={`bg${l.background?.image_url ?? ''}`} defaultValue={l.background?.image_url ?? ''} placeholder="нет — фон карты" onBlur={(e) => e.target.value.trim() !== (l.background?.image_url ?? '') && background(l, e.target.value.trim())} />
            </label>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const lv = nextLevel(levels, uid('lv'))
          onLevels([...levels, lv])
          onCurrent(lv.id)
        }}
      >
        <Plus aria-hidden="true" /> Добавить этаж
      </button>
    </section>
  )
}
