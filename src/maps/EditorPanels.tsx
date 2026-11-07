/**
 * Панели конструктора: свойства зоны, объекта и предмета, триггеры,
 * циклы появления, библиотека ассетов. Всё правит карту через change()
 * конструктора, сохранение — общим пакетом.
 */
import { useEffect, useMemo, useState } from 'react'
import { Play, Plus, Search, Trash2 } from 'lucide-react'
import { BlockList, type BlockRefs } from './blocks'
import { assetCategories, assetThumb, assetTitle, searchAssets, type Asset, type AssetCategory } from './assets'
import { allPresets, type VfxPreset } from './vfx'
import type { BattleMap, MapInteraction, MapItem, MapObject, MapTrigger, MapZone, SceneAction, SpawnCycle, TriggerEvent } from './types'

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`

/** Ссылки для полей блоков: двери, свет, зоны, объекты, триггеры, пресеты */
export function useRefs(map: BattleMap): BlockRefs {
  const [presets, setPresets] = useState<VfxPreset[]>([])
  useEffect(() => {
    void allPresets().then(setPresets)
  }, [])
  return useMemo(
    () => ({
      wall_id: map.walls.filter((w) => w.kind === 'door' || w.kind === 'secret').map((w, i) => ({ id: w.id, label: `${w.kind === 'secret' ? 'Тайная дверь' : 'Дверь'} ${i + 1}` })),
      light_id: map.lights.map((l, i) => ({ id: l.id, label: `Свет ${i + 1}` })),
      zone_id: map.zones.map((z) => ({ id: z.id, label: z.name || 'Зона' })),
      object_id: map.objects.map((o) => ({ id: o.id, label: o.name || 'Объект' })),
      trigger_id: (map.triggers ?? []).map((t) => ({ id: t.id, label: t.name || 'Триггер' })),
      preset: presets.map((p) => ({ id: p.id, label: p.name })),
    }),
    [map.walls, map.lights, map.zones, map.objects, map.triggers, presets],
  )
}

/* ---------- зона ---------- */

const ZONE_TABS: { key: 'on_enter' | 'on_start_turn' | 'on_end_turn' | 'on_leave'; label: string }[] = [
  { key: 'on_enter', label: 'Вход' },
  { key: 'on_start_turn', label: 'Начало хода' },
  { key: 'on_end_turn', label: 'Конец хода' },
  { key: 'on_leave', label: 'Выход' },
]

/** Готовые зоны: одним кликом */
export const ZONE_TEMPLATES: { label: string; patch: Partial<MapZone> }[] = [
  {
    label: 'Лужа кислоты',
    patch: { name: 'Лужа кислоты', vfx_preset: 'zone.acid', frequency: 'once_per_turn', on_enter: [{ op: 'damage', target: 'subject', dice: '2d4', type: 'acid' }], on_start_turn: [{ op: 'damage', target: 'subject', dice: '2d4', type: 'acid' }] },
  },
  {
    label: 'Ловушка-сеть',
    patch: { name: 'Ловушка-сеть', visible_to_players: false, frequency: 'once', on_enter: [{ op: 'save', target: 'subject', ability: 'dex', dc: '16', on_fail: [{ op: 'apply_effect', target: 'subject', label: 'Опутан', rounds: '3' }], on_success: [] }] },
  },
  {
    label: 'Огонь',
    patch: { name: 'Огонь', vfx_preset: 'zone.fire', frequency: 'once_per_turn', on_enter: [{ op: 'damage', target: 'subject', dice: '1d10', type: 'fire' }], on_start_turn: [{ op: 'damage', target: 'subject', dice: '1d10', type: 'fire' }] },
  },
  { label: 'Трясина', patch: { name: 'Трясина', difficult_terrain: true, vfx_preset: 'zone.nature' } },
  { label: 'Туман', patch: { name: 'Туман', obscured: 'heavily', vfx_preset: 'zone.shadow' } },
]

export function ZoneProps({ zone, map, onChange, onRemove }: { zone: MapZone; map: BattleMap; onChange: (z: Partial<MapZone>) => void; onRemove: () => void }) {
  const refs = useRefs(map)
  const [tab, setTab] = useState<(typeof ZONE_TABS)[number]['key']>('on_enter')
  const zonePresets = (refs.preset ?? []).filter((p) => /^(zone|aura)\./.test(p.id))
  return (
    <section>
      <h3>Зона</h3>
      <label>
        Название
        <input value={zone.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <div className="me-chips">
        {ZONE_TEMPLATES.map((t) => (
          <button key={t.label} type="button" onClick={() => onChange(t.patch)}>
            {t.label}
          </button>
        ))}
      </div>
      <label>
        Эффект
        <select value={zone.vfx_preset ?? ''} onChange={(e) => onChange({ vfx_preset: e.target.value || null })}>
          <option value="">без эффекта</option>
          {zonePresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Срабатывает
        <select value={zone.frequency ?? 'every_time'} onChange={(e) => onChange({ frequency: e.target.value as MapZone['frequency'] })}>
          <option value="every_time">каждый раз</option>
          <option value="once_per_turn">раз за ход</option>
          <option value="once_per_creature">раз на существо</option>
          <option value="once">один раз</option>
        </select>
      </label>
      <label>
        На кого
        <select value={zone.affects ?? 'all'} onChange={(e) => onChange({ affects: e.target.value as MapZone['affects'] })}>
          <option value="all">на всех</option>
          <option value="party">на отряд</option>
          <option value="enemies">на врагов</option>
        </select>
      </label>
      <label>
        Заслоняет обзор
        <select value={zone.obscured ?? 'none'} onChange={(e) => onChange({ obscured: e.target.value as MapZone['obscured'] })}>
          <option value="none">нет</option>
          <option value="lightly">слегка</option>
          <option value="heavily">сильно</option>
        </select>
      </label>
      <label>
        Раундов
        <input type="number" min={0} placeholder="∞" value={zone.duration_rounds ?? ''} onChange={(e) => onChange({ duration_rounds: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="me-check">
        <input type="checkbox" checked={!!zone.difficult_terrain} onChange={(e) => onChange({ difficult_terrain: e.target.checked })} /> сложная местность
      </label>
      <label className="me-check">
        <input type="checkbox" checked={zone.visible_to_players} onChange={(e) => onChange({ visible_to_players: e.target.checked })} /> видна игрокам
      </label>
      <label className="me-check">
        <input type="checkbox" checked={zone.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> включена
      </label>
      <nav className="me-tabs">
        {ZONE_TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'is-on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {(zone[t.key]?.length ?? 0) > 0 && <i>{zone[t.key]!.length}</i>}
          </button>
        ))}
      </nav>
      <BlockList key={tab} value={zone[tab] ?? []} onChange={(v) => onChange({ [tab]: v })} refs={refs} />
      <button type="button" className="me-del" onClick={onRemove}>
        <Trash2 aria-hidden="true" /> Удалить зону
      </button>
    </section>
  )
}

/* ---------- объект и предмет ---------- */

export function ObjectProps({ obj, map, onChange, onRemove }: { obj: MapObject; map: BattleMap; onChange: (o: Partial<MapObject>) => void; onRemove: () => void }) {
  const num = (k: 'height_ft' | 'base_ft' | 'rotation' | 'w' | 'h', label: string, step = 5) => (
    <label>
      {label}
      <input type="number" step={step} value={obj[k]} onChange={(e) => onChange({ [k]: Number(e.target.value) || 0 })} />
    </label>
  )
  const flag = (k: 'climbable' | 'blocks_move' | 'blocks_sight' | 'blocks_light' | 'walkable_top' | 'container' | 'hidden', label: string) => (
    <label className="me-check">
      <input type="checkbox" checked={!!obj[k]} onChange={(e) => onChange({ [k]: e.target.checked })} /> {label}
    </label>
  )
  return (
    <section>
      <h3>Объект</h3>
      <label>
        Название
        <input value={obj.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {num('height_ft', 'Высота, фт')}
      {num('base_ft', 'Основание, фт')}
      {num('rotation', 'Поворот, °', 15)}
      {num('w', 'Ширина, px', 10)}
      {num('h', 'Глубина, px', 10)}
      <label>
        Укрытие
        <select value={obj.cover} onChange={(e) => onChange({ cover: e.target.value as MapObject['cover'] })}>
          <option value="none">нет</option>
          <option value="half">половинное</option>
          <option value="three_quarters">на три четверти</option>
          <option value="full">полное</option>
        </select>
      </label>
      {flag('blocks_move', 'не пройти')}
      {flag('blocks_sight', 'закрывает обзор')}
      {flag('blocks_light', 'отбрасывает тень')}
      {flag('climbable', 'можно залезть')}
      {flag('walkable_top', 'можно встать сверху')}
      {flag('container', 'контейнер (сундук)')}
      {flag('hidden', 'скрыт от игроков')}
      <Interactions obj={obj} map={map} onChange={(interactions) => onChange({ interactions })} />
      <button type="button" className="me-del" onClick={onRemove}>
        <Trash2 aria-hidden="true" /> Удалить
      </button>
    </section>
  )
}

const SKILLS: [string, string][] = [
  ['', 'без проверки'],
  ['athletics', 'Атлетика'],
  ['acrobatics', 'Акробатика'],
  ['sleight_of_hand', 'Ловкость рук'],
  ['stealth', 'Скрытность'],
  ['arcana', 'Магия'],
  ['history', 'История'],
  ['investigation', 'Анализ'],
  ['nature', 'Природа'],
  ['religion', 'Религия'],
  ['perception', 'Внимательность'],
  ['insight', 'Проницательность'],
  ['survival', 'Выживание'],
  ['str', 'Сила'],
  ['dex', 'Ловкость'],
  ['con', 'Телосложение'],
  ['int', 'Интеллект'],
  ['wis', 'Мудрость'],
  ['cha', 'Харизма'],
]
const ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const QUICK: { label: string; skill: string; dc: number }[] = [
  { label: 'Обыскать', skill: 'investigation', dc: 12 },
  { label: 'Открыть', skill: '', dc: 0 },
  { label: 'Взломать', skill: 'sleight_of_hand', dc: 15 },
  { label: 'Потянуть рычаг', skill: '', dc: 0 },
]

/** Действия на объекте: «Обыскать» с проверкой Анализа Сл 12 → сценарий успеха и провала */
function Interactions({ obj, map, onChange }: { obj: MapObject; map: BattleMap; onChange: (list: MapInteraction[]) => void }) {
  const refs = useRefs(map)
  const list = obj.interactions ?? []
  const [open, setOpen] = useState<string | null>(null)
  const set = (id: string, patch: Partial<MapInteraction>) => onChange(list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  return (
    <div className="me-inter">
      <p className="me-say">Действия на объекте</p>
      <ul className="me-list">
        {list.map((x) => {
          const key = x.check?.skill ?? x.check?.ability ?? ''
          return (
            <li key={x.id} className={open === x.id ? 'is-open' : ''}>
              <button type="button" className="me-list-head" onClick={() => setOpen(open === x.id ? null : x.id)}>
                <b>{x.label}</b>
                <i>{x.check ? `${SKILLS.find(([k]) => k === key)?.[1] ?? key}, Сл ${x.check.dc}` : 'без проверки'}</i>
              </button>
              {open === x.id && (
                <div className="me-trig">
                  <label>
                    Название
                    <input value={x.label} onChange={(e) => set(x.id, { label: e.target.value })} />
                  </label>
                  <label>
                    Проверка
                    <select
                      value={key}
                      onChange={(e) => {
                        const v = e.target.value
                        set(x.id, { check: v ? { ...(ABILITIES.has(v) ? { ability: v } : { skill: v }), dc: x.check?.dc ?? 13 } : null })
                      }}
                    >
                      {SKILLS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  {x.check && (
                    <label>
                      Сл
                      <input type="number" min={1} max={30} value={x.check.dc} onChange={(e) => set(x.id, { check: { ...x.check!, dc: Number(e.target.value) || 10 } })} />
                    </label>
                  )}
                  <label>
                    Стоит
                    <select value={x.economy} onChange={(e) => set(x.id, { economy: e.target.value as MapInteraction['economy'] })}>
                      <option value="free">ничего</option>
                      <option value="object">взаимодействие</option>
                      <option value="action">действие</option>
                      <option value="bonus">бонусное</option>
                    </select>
                  </label>
                  <label>
                    Дотянуться, фт
                    <input type="number" min={0} step={5} value={x.reach_ft} onChange={(e) => set(x.id, { reach_ft: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={!!x.once} onChange={(e) => set(x.id, { once: e.target.checked })} /> один раз
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={!!x.dm_only} onChange={(e) => set(x.id, { dm_only: e.target.checked })} /> только мастеру
                  </label>
                  <p className="me-say">{x.check ? 'При успехе:' : 'Что происходит:'}</p>
                  <BlockList value={x.on_success ?? []} onChange={(v) => set(x.id, { on_success: v })} refs={refs} />
                  {x.check && (
                    <>
                      <p className="me-say">При провале:</p>
                      <BlockList value={x.on_fail ?? []} onChange={(v) => set(x.id, { on_fail: v })} refs={refs} />
                    </>
                  )}
                  <button type="button" className="me-del" onClick={() => onChange(list.filter((y) => y.id !== x.id))}>
                    <Trash2 aria-hidden="true" /> Убрать действие
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <span className="me-chips">
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              const x: MapInteraction = { id: uid('ia'), label: q.label, economy: 'object', reach_ft: 5, check: q.skill ? { skill: q.skill, dc: q.dc } : null, on_success: [], on_fail: [], once: false, dm_only: false }
              onChange([...list, x])
              setOpen(x.id)
            }}
          >
            <Plus aria-hidden="true" /> {q.label}
          </button>
        ))}
      </span>
    </div>
  )
}

export function ItemProps({ item, map, onChange, onRemove }: { item: MapItem; map: BattleMap; onChange: (i: Partial<MapItem>) => void; onRemove: () => void }) {
  const boxes = map.objects.filter((o) => o.container)
  return (
    <section>
      <h3>Предмет на карте</h3>
      <label>
        Название
        <input value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {boxes.length > 0 && (
        <label>
          Лежит в
          <select value={item.container_object_id ?? ''} onChange={(e) => onChange({ container_object_id: e.target.value || null })}>
            <option value="">на полу</option>
            {boxes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name || 'контейнер'}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="me-check">
        <input type="checkbox" checked={!!item.hidden} onChange={(e) => onChange({ hidden: e.target.checked })} /> спрятан
      </label>
      <button type="button" className="me-del" onClick={onRemove}>
        <Trash2 aria-hidden="true" /> Убрать
      </button>
    </section>
  )
}

/* ---------- триггеры ---------- */

const EVENTS: { id: TriggerEvent; label: string; match?: 'zone_id' | 'wall_id' | 'object_id' | 'group' | 'variable' }[] = [
  { id: 'token_enters_zone', label: 'входит в зону', match: 'zone_id' },
  { id: 'token_leaves_zone', label: 'выходит из зоны', match: 'zone_id' },
  { id: 'turn_start_in_zone', label: 'начинает ход в зоне', match: 'zone_id' },
  { id: 'turn_end_in_zone', label: 'заканчивает ход в зоне', match: 'zone_id' },
  { id: 'door_opened', label: 'дверь открыли', match: 'wall_id' },
  { id: 'door_closed', label: 'дверь закрыли', match: 'wall_id' },
  { id: 'object_interacted', label: 'тронули объект', match: 'object_id' },
  { id: 'item_picked', label: 'подняли предмет' },
  { id: 'round_start', label: 'начался раунд' },
  { id: 'turn_start', label: 'начался ход' },
  { id: 'turn_end', label: 'закончился ход' },
  { id: 'combat_started', label: 'начался бой' },
  { id: 'combat_ended', label: 'бой окончен' },
  { id: 'creature_died', label: 'существо погибло' },
  { id: 'hp_below', label: 'хиты ниже порога' },
  { id: 'group_activated', label: 'группа проснулась', match: 'group' },
  { id: 'variable_changed', label: 'переменная изменилась', match: 'variable' },
  { id: 'manual', label: 'вручную (кнопкой)' },
]

export function TriggersPanel({ map, onChange, onFire }: { map: BattleMap; onChange: (list: MapTrigger[]) => void; onFire?: (id: string) => void }) {
  const refs = useRefs(map)
  const list = map.triggers ?? []
  const [open, setOpen] = useState<string | null>(null)
  const set = (id: string, patch: Partial<MapTrigger>) => onChange(list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  return (
    <section>
      <h3>Триггеры</h3>
      <ul className="me-list">
        {list.map((t) => {
          const ev = EVENTS.find((e) => e.id === t.event)
          const matchRefs = ev?.match ? (refs[ev.match as keyof BlockRefs] ?? null) : null
          return (
            <li key={t.id} className={open === t.id ? 'is-open' : ''}>
              <button type="button" className="me-list-head" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <b>{t.name || 'Триггер'}</b>
                <i>Когда {ev?.label ?? t.event}</i>
              </button>
              {open === t.id && (
                <div className="me-trig">
                  <label>
                    Название
                    <input value={t.name} onChange={(e) => set(t.id, { name: e.target.value })} />
                  </label>
                  <label>
                    Когда
                    <select value={t.event} onChange={(e) => set(t.id, { event: e.target.value as TriggerEvent, match: {} })}>
                      {EVENTS.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {ev?.match &&
                    (matchRefs ? (
                      <label>
                        Какая
                        <select value={String(t.match[ev.match] ?? '')} onChange={(e) => set(t.id, { match: e.target.value ? { [ev.match!]: e.target.value } : {} })}>
                          <option value="">любая</option>
                          {matchRefs.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        {ev.match === 'group' ? 'Группа' : 'Переменная'}
                        <input value={String(t.match[ev.match] ?? '')} onChange={(e) => set(t.id, { match: e.target.value ? { [ev.match!]: e.target.value } : {} })} />
                      </label>
                    ))}
                  <label>
                    Если
                    <input className="is-expr" placeholder="token.side == 'party'" value={t.condition ?? ''} onChange={(e) => set(t.id, { condition: e.target.value || null })} />
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={t.once} onChange={(e) => set(t.id, { once: e.target.checked })} /> только один раз
                  </label>
                  <label className="me-check">
                    <input type="checkbox" checked={t.enabled} onChange={(e) => set(t.id, { enabled: e.target.checked })} /> включён
                  </label>
                  <p className="me-say">Сделать:</p>
                  <BlockList value={t.actions} onChange={(actions: SceneAction[]) => set(t.id, { actions })} refs={refs} />
                  <span className="me-row">
                    {onFire && (
                      <button type="button" className="me-ghost" onClick={() => onFire(t.id)} title="Запустить сейчас (на сохранённой карте)">
                        <Play aria-hidden="true" /> Запустить
                      </button>
                    )}
                    <button type="button" className="me-del" onClick={() => onChange(list.filter((x) => x.id !== t.id))}>
                      <Trash2 aria-hidden="true" /> Удалить
                    </button>
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="me-ghost"
        onClick={() => {
          const t: MapTrigger = { id: uid('tr'), name: 'Новый триггер', enabled: true, event: 'token_enters_zone', match: {}, condition: null, actions: [], once: false, cooldown_rounds: 0 }
          onChange([...list, t])
          setOpen(t.id)
        }}
      >
        <Plus aria-hidden="true" /> Триггер
      </button>
    </section>
  )
}

/* ---------- циклы появления ---------- */

export function SpawnsPanel({ map, creatures, onChange }: { map: BattleMap; creatures: { ref: string; name: string }[]; onChange: (list: SpawnCycle[]) => void }) {
  const list = map.spawns ?? []
  const set = (id: string, patch: Partial<SpawnCycle>) => onChange(list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  return (
    <section>
      <h3>Подкрепления</h3>
      {list.map((s) => (
        <div key={s.id} className="me-spawn">
          <p className="me-say">
            Каждые
            <input type="number" min={1} value={s.every_rounds} onChange={(e) => set(s.id, { every_rounds: Number(e.target.value) || 1 })} />
            раунда с
            <input type="number" min={1} value={s.start_round} onChange={(e) => set(s.id, { start_round: Number(e.target.value) || 1 })} />
            -го —
            <input type="number" min={1} value={s.count} onChange={(e) => set(s.id, { count: Number(e.target.value) || 1 })} />
            шт., не больше
            <input type="number" min={1} value={s.max_total} onChange={(e) => set(s.id, { max_total: Number(e.target.value) || 1 })} />
          </p>
          <label>
            Кто
            <select value={s.creature.catalog_ref ?? ''} onChange={(e) => set(s.id, { creature: { catalog_ref: e.target.value || null, name: creatures.find((c) => c.ref === e.target.value)?.name ?? null } })}>
              <option value="">—</option>
              {creatures.map((c) => (
                <option key={c.ref} value={c.ref}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Где
            <select value={s.at.zone_id ?? ''} onChange={(e) => set(s.id, { at: { zone_id: e.target.value || null } })}>
              <option value="">—</option>
              {map.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name || 'зона'}
                </option>
              ))}
            </select>
          </label>
          <span className="me-row">
            <label className="me-check">
              <input type="checkbox" checked={s.enabled} onChange={(e) => set(s.id, { enabled: e.target.checked })} /> включено
            </label>
            <button type="button" className="me-del" onClick={() => onChange(list.filter((x) => x.id !== s.id))}>
              <Trash2 aria-hidden="true" />
            </button>
          </span>
        </div>
      ))}
      <button
        type="button"
        className="me-ghost"
        disabled={map.zones.length === 0}
        title={map.zones.length === 0 ? 'Сначала нарисуйте зону появления' : undefined}
        onClick={() => onChange([...list, { id: uid('sp'), name: 'Подкрепление', enabled: true, start_round: 2, every_rounds: 2, max_total: 4, count: 1, creature: {}, at: { zone_id: map.zones[0]?.id ?? null }, side: 'enemies' }])}
      >
        <Plus aria-hidden="true" /> Подкрепление
      </button>
    </section>
  )
}

/* ---------- библиотека ассетов ---------- */

const LIB_KINDS: { id: string; label: string }[] = [
  { id: 'terrain', label: 'Пол' },
  { id: 'decor', label: 'Декор' },
  { id: 'token', label: 'Жетоны' },
  { id: 'icon', label: 'Иконки' },
  { id: 'map_background', label: 'Фоны' },
]

/** Перетаскивание из библиотеки: id ассета в dataTransfer */
export const ASSET_MIME = 'application/x-vantage-asset'

export function AssetLibrary({ picked, onPick }: { picked: Asset | null; onPick: (a: Asset | null) => void }) {
  const [kind, setKind] = useState('decor')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [cats, setCats] = useState<AssetCategory[]>([])
  const [items, setItems] = useState<Asset[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void assetCategories(kind).then(setCats)
    setCat('')
  }, [kind])
  useEffect(() => {
    let on = true
    setBusy(true)
    const t = setTimeout(() => {
      searchAssets({ kind, q: q.trim(), category: cat, limit: 60 }).then(
        (r) => {
          if (!on) return
          setItems(r.items)
          setTotal(r.total)
          setBusy(false)
        },
        () => on && setBusy(false),
      )
    }, 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [kind, q, cat])
  // категории верхнего уровня: «Подземелье / Пол / Floor» → «Подземелье / Пол»
  const tops = [...new Set(cats.map((c) => c.category.split(' / ').slice(0, 2).join(' / ')))].sort()
  return (
    <div className="me-lib">
      <nav className="me-lib-kinds">
        {LIB_KINDS.map((k) => (
          <button key={k.id} type="button" className={kind === k.id ? 'is-on' : ''} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
        <label className="me-lib-q">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: бочка, дверь, огонь" aria-label="Поиск ассетов" />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категория">
          <option value="">все категории</option>
          {tops.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="me-lib-count">{busy ? '…' : total}</span>
      </nav>
      <ul className="me-lib-grid">
        {items.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className={picked?.id === a.id ? 'is-on' : ''}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_MIME, JSON.stringify(a))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onPick(picked?.id === a.id ? null : a)}
              title={`${assetTitle(a)} · ${a.category}${a.license.id.startsWith('CC-BY') ? ` · ${a.author ?? ''}` : ''}`}
            >
              <img src={assetThumb(a)} alt="" loading="lazy" draggable={false} />
            </button>
          </li>
        ))}
        {!busy && items.length === 0 && <li className="me-lib-empty">Ничего не нашлось</li>}
      </ul>
    </div>
  )
}
