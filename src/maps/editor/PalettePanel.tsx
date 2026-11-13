/** Палитра: свойства новых стен, объектов и жетонов; массовая правка выбранного */
import { useState, type ReactNode } from 'react'
import { Copy, Paintbrush, RotateCcw } from 'lucide-react'
import type { BattleMap, MapObject, VisionMode } from '../types'
import { applyPalette, applyWallPreset, clonePalette, countKinds, presetOf, resetPalette, setPaletteField, WALL_PRESETS, type Palette, type PaletteKind, type Styles } from './palette'
import type { Change } from './types'

type Props = {
  map: BattleMap
  picked: readonly string[]
  palette: Palette
  setPalette: (fn: (p: Palette) => Palette) => void
  change: Change
  flash: (t: string) => void
  /** вкладка при открытии */
  initial: PaletteKind
}

const TABS: { id: PaletteKind; label: string }[] = [
  { id: 'walls', label: 'Стены' },
  { id: 'objects', label: 'Объекты' },
  { id: 'tokens', label: 'Жетоны' },
]

const COVER: { id: MapObject['cover']; label: string }[] = [
  { id: 'none', label: 'нет' },
  { id: 'half', label: 'половинное' },
  { id: 'three_quarters', label: 'на ¾' },
  { id: 'full', label: 'полное' },
]

const VISION: { id: VisionMode; label: string }[] = [
  { id: 'normal', label: 'обычное' },
  { id: 'darkvision', label: 'тёмное зрение' },
  { id: 'blindsight', label: 'слепое зрение' },
  { id: 'truesight', label: 'истинное зрение' },
  { id: 'tremorsense', label: 'чувство вибрации' },
]

export function PalettePanel({ map, picked, palette, setPalette, change, flash, initial }: Props) {
  const [tab, setTab] = useState<PaletteKind>(initial)
  const counts = countKinds(map, picked)
  const n = counts[tab]
  const touched = new Set<string>(palette.touched[tab] as string[])
  const set = <K extends PaletteKind>(kind: K, patch: Partial<Styles[K]>) => setPalette((p) => setPaletteField(p, kind, patch))
  const mark = (key: string) => (touched.has(key) ? 'is-touched' : undefined)
  const check = (key: string, label: ReactNode, value: boolean, on: (v: boolean) => void) => (
    <label className={`me-check ${mark(key) ?? ''}`}>
      <input type="checkbox" checked={value} onChange={(e) => on(e.target.checked)} /> {label}
    </label>
  )
  const w = palette.walls
  const o = palette.objects
  const t = palette.tokens
  const preset = presetOf(w)

  return (
    <section className="me-palette" aria-label="Палитра">
      <h3>
        <Paintbrush aria-hidden="true" /> Палитра
      </h3>
      <nav className="me-tabs is-top">
        {TABS.map((x) => (
          <button key={x.id} type="button" className={tab === x.id ? 'is-on' : ''} aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
            {x.label}
            {counts[x.id] > 0 && <i>{counts[x.id]}</i>}
          </button>
        ))}
      </nav>

      {tab === 'walls' && (
        <>
          <div className="me-presets" role="group" aria-label="Заготовки стен">
            {WALL_PRESETS.map((p) => (
              <button key={p.id} type="button" className={preset === p.id ? 'is-on' : ''} aria-pressed={preset === p.id} title={p.hint} onClick={() => setPalette((x) => applyWallPreset(x, p.id))}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="me-palette-sub">Преграждает</p>
          <div className="me-palette-blocks">
            {check('move', 'ход', w.move, (v) => set('walls', { move: v }))}
            {check('sight', 'взгляд', w.sight, (v) => set('walls', { sight: v }))}
            {check('light', 'свет', w.light, (v) => set('walls', { light: v }))}
            {check('sound', 'звук', w.sound, (v) => set('walls', { sound: v }))}
          </div>
          <label className={mark('height_ft')}>
            Высота, фт
            <input type="number" min={0} step={5} value={w.height_ft} onChange={(e) => set('walls', { height_ft: Number(e.target.value) || 0 })} />
          </label>
          {check('one_way', 'односторонняя', w.one_way, (v) => set('walls', { one_way: v }))}
          <p className="me-palette-hint">Так рисуются новые стены (W).</p>
        </>
      )}

      {tab === 'objects' && (
        <>
          <label className={mark('height_ft')}>
            Высота, фт
            <input type="number" min={0} step={5} value={o.height_ft} onChange={(e) => set('objects', { height_ft: Number(e.target.value) || 0 })} />
          </label>
          <label className={mark('cover')}>
            Укрытие
            <select value={o.cover} onChange={(e) => set('objects', { cover: e.target.value as MapObject['cover'] })}>
              {COVER.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {check('blocks_move', 'мешает ходу', o.blocks_move, (v) => set('objects', { blocks_move: v }))}
          {check('blocks_sight', 'закрывает обзор', o.blocks_sight, (v) => set('objects', { blocks_sight: v }))}
          {check('blocks_light', 'не пропускает свет', o.blocks_light, (v) => set('objects', { blocks_light: v }))}
          {check('climbable', 'можно залезть', o.climbable, (v) => set('objects', { climbable: v }))}
          {check('walkable_top', 'можно встать сверху', o.walkable_top, (v) => set('objects', { walkable_top: v }))}
          {check('hidden', 'скрыт от игроков', o.hidden, (v) => set('objects', { hidden: v }))}
          <label className="me-check me-palette-new">
            <input type="checkbox" checked={palette.forNew.objects} onChange={(e) => setPalette((p) => ({ ...p, forNew: { ...p.forNew, objects: e.target.checked } }))} /> и новым объектам
          </label>
        </>
      )}

      {tab === 'tokens' && (
        <>
          <label className={mark('side')}>
            Сторона
            <select value={t.side} onChange={(e) => set('tokens', { side: e.target.value as Styles['tokens']['side'] })}>
              <option value="party">отряд</option>
              <option value="enemies">враги</option>
              <option value="neutral">нейтралы</option>
            </select>
          </label>
          <label className={mark('vision_mode')}>
            Зрение
            <select value={t.vision_mode} onChange={(e) => set('tokens', { vision_mode: e.target.value as VisionMode })}>
              {VISION.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className={mark('elevation_ft')}>
            Высота, фт
            <input type="number" step={5} value={t.elevation_ft} onChange={(e) => set('tokens', { elevation_ft: Number(e.target.value) || 0 })} />
          </label>
          {check('hidden', 'скрыт от игроков', t.hidden, (v) => set('tokens', { hidden: v }))}
          <label className="me-check me-palette-new">
            <input type="checkbox" checked={palette.forNew.tokens} onChange={(e) => setPalette((p) => ({ ...p, forNew: { ...p.forNew, tokens: e.target.checked } }))} /> и новым жетонам
          </label>
        </>
      )}

      <div className="me-palette-acts">
        <button
          type="button"
          className="me-ghost is-main"
          disabled={!n}
          title={n ? (touched.size ? 'Изменённые поля палитры — на выбранное' : 'Все поля палитры — на выбранное') : 'Выберите объекты этого вида (рамка с Shift или Shift+клик)'}
          onClick={() => {
            change((m) => applyPalette(m, picked, tab, palette))
            flash(`Палитра применена: ${n}`)
          }}
        >
          <Paintbrush aria-hidden="true" /> Применить{n > 0 ? ` (${n})` : ''}
        </button>
        <button
          type="button"
          className="me-ghost"
          disabled={!n}
          title="Свойства выбранного — в палитру"
          onClick={() => setPalette((p) => clonePalette(p, map, picked, tab) ?? p)}
        >
          <Copy aria-hidden="true" /> Клонировать
        </button>
        <button type="button" className="me-ghost" title={n ? 'Изменённые поля — к значениям выбранного' : 'Поля — к исходным'} onClick={() => setPalette((p) => resetPalette(p, map, picked, tab))}>
          <RotateCcw aria-hidden="true" /> Сбросить
        </button>
      </div>
    </section>
  )
}
