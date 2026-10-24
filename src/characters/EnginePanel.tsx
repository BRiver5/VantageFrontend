/**
 * Действия героя — компактной сеткой «чипов». Тип действия виден цветом
 * обводки: золото — действие, изумруд — бонусное, сапфир — реакция, серебро —
 * свободно и прочее; строка-легенда сверху ещё и фильтрует. Всё — с сервера:
 * кнопка шлёт действие, сервер решает, можно ли (enabled/reason), и
 * возвращает новый лист. Кнопку действия переиспользует карточка способности.
 */
import { useState } from 'react'
import { Sparkles, Zap } from 'lucide-react'
import type { Sheet, SheetAction } from '../types/character'
import { Corners } from '../ornaments'

/** Что видит панель и что она умеет; без canPlay — лист только для просмотра */
export interface EngineView {
  sheet: Sheet
  busy: boolean
  /** свой персонаж — можно действовать */
  canPlay: boolean
  /** подписи переменных персонажа из каталога движка: state.rage.active → «Ярость» */
  labels: Record<string, string>
  onAction: (a: SheetAction) => void
}

export const ECONOMY: { key: string; label: string }[] = [
  { key: 'action', label: 'Действие' },
  { key: 'bonus_action', label: 'Бонусное' },
  { key: 'reaction', label: 'Реакция' },
  { key: 'other', label: 'Прочее' },
]

/** free и none — в «Прочее»: за ход они ничего не стоят */
export const economyOf = (a: SheetAction) =>
  a.action_economy === 'action' || a.action_economy === 'bonus_action' || a.action_economy === 'reaction' ? a.action_economy : 'other'

const EXPIRES: Record<string, string> = {
  never: 'пока не снят',
  short_rest: 'до короткого отдыха',
  long_rest: 'до продолжительного отдыха',
  turn_start: 'до начала хода',
  turn_end: 'до конца хода',
}

/** «snake_case_key» → «Snake case key» — когда подписи в каталоге нет */
export const humanize = (key: string) => {
  const s = key.replace(/[._]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Стоимость действия по-человечески: res.ki.current → «1 Ци», slots.spell.3 →
 * «ячейка 3 ур.»; сумма-выражение (зависит от выбора) — «?».
 */
export function costText(a: SheetAction, sheet: Sheet, labels: Record<string, string>): string {
  return a.cost
    .map((c) => {
      const amount = /^\s*\d+\s*$/.test(String(c.amount)) ? String(c.amount).trim() : '?'
      const res = /^res\.([^.]+)\./.exec(c.path)?.[1]
      if (res) return `${amount} ${sheet.resources.find((r) => r.key === res)?.label ?? labels[`res.${res}.current`] ?? humanize(res)}`
      const slot = /^slots\.spell\.(\d+)/.exec(c.path)?.[1]
      if (slot) return `${amount === '1' ? '' : `${amount} × `}ячейка ${slot} ур.`
      if (c.path.startsWith('slots.pact')) return 'ячейка договора'
      if (c.path.startsWith('slots.')) return 'ячейка'
      if (c.path.startsWith('char.hit_dice')) return `${amount} к. хитов`
      return `${amount} ${labels[c.path] ?? humanize(c.path.split('.').slice(-2, -1)[0] ?? c.path)}`
    })
    .join(' · ')
}

/** Чип действия: подпись и стоимость; тип — цветом обводки; недоступный — с причиной */
export function ActionButton({
  a,
  engine,
  showAbility = true,
}: {
  a: SheetAction
  engine: EngineView
  showAbility?: boolean
}) {
  const cost = costText(a, engine.sheet, engine.labels)
  const tip = [showAbility ? a.ability_name : '', !a.enabled && a.reason ? a.reason : a.description ?? ''].filter(Boolean).join(' — ')
  return (
    <button
      type="button"
      className={`eng-action is-${economyOf(a)}`}
      disabled={!engine.canPlay || !a.enabled || engine.busy}
      title={tip || undefined}
      onClick={() => engine.onAction(a)}
    >
      <b>{a.label}</b>
      {cost && <span className="eng-cost">{cost}</span>}
      {!a.enabled && a.reason && <em>{a.reason}</em>}
    </button>
  )
}

/** Включённые состояния (Ярость, Песнь клинка): state.<ключ>.active = true */
export function activeStates(sheet: Sheet, labels: Record<string, string>): { key: string; label: string }[] {
  return Object.entries(sheet.values)
    .map(([path, v]) => ({ path, v, key: /^state\.([^.]+)\.active$/.exec(path)?.[1] }))
    .filter((x): x is { path: string; v: unknown; key: string } => !!x.key && x.v === true)
    .map(({ path, key }) => ({ key, label: labels[path]?.replace(/:\s*активн\S*$/i, '') ?? humanize(key) }))
}

const FILTER_KEY = 'vantage-actions-filter'
const COLLAPSED = 12

function savedFilter(): string {
  try {
    return localStorage.getItem(FILTER_KEY) ?? 'all'
  } catch {
    return 'all'
  }
}

export function EnginePanel({ engine }: { engine: EngineView }) {
  const { sheet } = engine
  const [filter, setFilterState] = useState(savedFilter)
  const [expanded, setExpanded] = useState(false)
  const setFilter = (f: string) => {
    setFilterState(f)
    setExpanded(false)
    try {
      localStorage.setItem(FILTER_KEY, f)
    } catch {
      /* фильтр — удобство, не обязателен */
    }
  }

  const states = activeStates(sheet, engine.labels)
  const count = (key: string) => sheet.actions.filter((a) => economyOf(a) === key).length
  // доступные — первыми: ими и пользуются
  const list = sheet.actions
    .filter((a) => filter === 'all' || economyOf(a) === filter)
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || ECONOMY.findIndex((e) => e.key === economyOf(a)) - ECONOMY.findIndex((e) => e.key === economyOf(b)))
  const shown = expanded ? list : list.slice(0, COLLAPSED)

  return (
    <section className="beast-card cw-sheet-card eng">
      <Corners size={18} />
      <h3 className="beast-card-title">
        <Zap aria-hidden="true" /> Действия
        <span className="cw-sheet-aside">{sheet.actions.length || null}</span>
      </h3>

      {(states.length > 0 || sheet.active_effects.length > 0) && (
        <ul className="eng-effects" aria-label="Активные состояния и эффекты">
          {states.map((s) => (
            <li key={`state-${s.key}`} className="is-state">
              <Zap aria-hidden="true" />
              <b>{s.label}</b>
              <i>включено</i>
            </li>
          ))}
          {sheet.active_effects.map((e) => (
            <li key={e.id}>
              <Sparkles aria-hidden="true" />
              <b>{e.label}</b>
              <i>{e.rounds_left != null ? `раундов: ${e.rounds_left}` : (EXPIRES[e.expires] ?? e.expires)}</i>
            </li>
          ))}
        </ul>
      )}

      {sheet.actions.length > 0 ? (
        <>
          <div className="eng-legend" role="tablist" aria-label="Тип действия">
            <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>
              Все <em>{sheet.actions.length}</em>
            </button>
            {ECONOMY.filter((e) => count(e.key) > 0).map((e) => (
              <button
                key={e.key}
                type="button"
                role="tab"
                aria-selected={filter === e.key}
                className={`is-${e.key}${filter === e.key ? ' is-on' : ''}`}
                onClick={() => setFilter(e.key)}
              >
                <i className="eng-dot" aria-hidden="true" /> {e.label} <em>{count(e.key)}</em>
              </button>
            ))}
          </div>
          <div className="eng-grid">
            {shown.map((a) => (
              <ActionButton key={`${a.grant_id}:${a.key}`} a={a} engine={engine} />
            ))}
          </div>
          {list.length > COLLAPSED && (
            <button type="button" className="cw-mini-btn eng-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'свернуть' : `ещё ${list.length - COLLAPSED}`}
            </button>
          )}
        </>
      ) : (
        <p className="cw-field-note">У героя пока нет действий — пассивные умения работают сами, их описание на странице «Умения».</p>
      )}
    </section>
  )
}
