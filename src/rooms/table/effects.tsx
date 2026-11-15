/**
 * Состояния и эффекты: не плашки с текстом, а то, что видно на самой фигуре.
 * У каждого состояния 5e — своя печать (значок по ободу жетона) и своя «аура»:
 * отравленный в зелёной дымке, окаменевший серый, невидимый мерцает, сбитый с ног
 * завален набок, оглушённого обходят звёзды. Одно и то же на столе и в бою.
 *
 * Состояние узнаём по коду (src/rules/codes.ts), у старых данных — по подписи;
 * таблица печатей и разбор — в effectDefs.ts.
 */
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Sparkle, X } from 'lucide-react'
import type { StatKey } from '../../types/rooms'
import { CONDITIONS, type EffectDraft, type ShownEffect } from './effectDefs'

/**
 * Печати по ободу: стоят дугой над жетоном или фигурой и чуть покачиваются.
 * Концентрация — не печать, а кольцо рун под ногами (аура conc).
 */
export function EffectSigils({ effects, size = 'md', onPick }: { effects: ShownEffect[]; size?: 'sm' | 'md' | 'lg'; onPick?: (e: ShownEffect) => void }) {
  const shown = effects.filter((e) => e.def.key !== 'concentration')
  if (shown.length === 0) return null
  const max = size === 'sm' ? 4 : 6
  const list = shown.slice(0, max)
  const more = shown.length - list.length
  const n = list.length + (more > 0 ? 1 : 0)
  // дуга от −60° до +60° над центром
  const angle = (i: number) => (n === 1 ? 0 : -60 + (120 / (n - 1)) * i)
  return (
    <span className={`fx-sigils is-${size}`} aria-label={`Состояния: ${shown.map((e) => e.title).join(', ')}`}>
      {list.map((e, i) => {
        const Icon = e.def.icon
        const style = { '--a': `${angle(i)}deg`, '--d': `${i * 0.35}s` } as CSSProperties
        const body = (
          <>
            <Icon aria-hidden="true" />
            {e.rounds != null && e.rounds > 0 && <b>{e.rounds}</b>}
          </>
        )
        return onPick ? (
          <button key={`${e.label}-${i}`} type="button" className={`fx-sigil is-${e.def.key}`} style={style} title={e.title} onClick={() => onPick(e)}>
            {body}
          </button>
        ) : (
          <span key={`${e.label}-${i}`} className={`fx-sigil is-${e.def.key}`} style={style} title={e.title}>
            {body}
          </span>
        )
      })}
      {more > 0 && (
        <span className="fx-sigil is-more" style={{ '--a': `${angle(list.length)}deg` } as CSSProperties} title={shown.slice(max).map((e) => e.title).join(', ')}>
          +{more}
        </span>
      )}
    </span>
  )
}

/** Список состояний в карточке: печать + название + подсказка правила; у мастера — снять */
export function EffectList({ effects, onRemove, onAdd }: { effects: ShownEffect[]; onRemove?: (e: ShownEffect) => void | Promise<unknown>; onAdd?: () => void }) {
  // снимаем эффект — его крестик не жмётся второй раз, пока сервер не ответил
  const [removing, setRemoving] = useState<string | null>(null)
  const remove = (e: ShownEffect, key: string) => {
    if (!onRemove || removing) return
    const pending = onRemove(e)
    if (!pending) return
    setRemoving(key)
    void Promise.resolve(pending)
      .catch(() => undefined)
      .finally(() => setRemoving(null))
  }
  return (
    <div className="fx-list">
      {effects.length === 0 && !onAdd && <p className="fx-calm">Ни состояний, ни эффектов</p>}
      {effects.map((e, i) => {
        const Icon = e.def.icon
        const key = `${e.label}-${i}`
        return (
          <div key={key} className={`fx-row is-${e.def.key}`}>
            <span className="fx-seal">
              <Icon aria-hidden="true" />
            </span>
            <span className="fx-text">
              <b>{e.def.key === 'concentration' ? `Концентрация: ${e.title}` : e.title}</b>
              {(e.def.hint || e.rounds) && (
                <i>
                  {e.rounds ? `ещё ${e.rounds} р. · ` : ''}
                  {e.def.hint}
                </i>
              )}
            </span>
            {onRemove && (
              <button type="button" className="fx-off" disabled={removing === key} onClick={() => remove(e, key)} aria-label={`Снять: ${e.title}`} title="Снять">
                <X aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
      {onAdd && (
        <button type="button" className="fx-add" onClick={onAdd}>
          <Sparkle aria-hidden="true" /> наложить состояние
        </button>
      )}
    </div>
  )
}

const SAVE_RU: { key: StatKey; label: string }[] = [
  { key: 'str', label: 'Сил' },
  { key: 'dex', label: 'Лов' },
  { key: 'con', label: 'Тел' },
  { key: 'int', label: 'Инт' },
  { key: 'wis', label: 'Мдр' },
  { key: 'cha', label: 'Хар' },
]

/** Выбор состояния: сетка печатей, своя подпись, длительность */
export function ConditionPicker({ title, inCombat, onApply, onClose }: { title: string; inCombat: boolean; onApply: (d: EffectDraft) => Promise<void>; onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [how, setHow] = useState<'never' | 'rounds' | 'save_ends'>('never')
  const [rounds, setRounds] = useState(3)
  const [ability, setAbility] = useState<StatKey>('con')
  const [dc, setDc] = useState(13)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const custom = label.trim()
  const name = custom || CONDITIONS.find((c) => c.key === pick)?.label || ''

  const apply = async () => {
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      await onApply({
        label: name,
        // выбранная печать — код; своя подпись — без кода (сервер выведет его сам, если узнает)
        code: custom ? null : pick,
        expires: how,
        rounds_left: how === 'rounds' ? rounds : null,
        ...(how === 'save_ends' ? { save_ability: ability, save_dc: dc } : {}),
        concentration: false,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="tb-drawer-layer fx-layer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fx-picker" role="dialog" aria-label={`Состояние: ${title}`}>
        <header>
          <b>Состояние</b>
          <i>{title}</i>
          <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="fx-grid" role="radiogroup" aria-label="Состояния">
          {CONDITIONS.filter((c) => c.key !== 'concentration').map((c) => {
            const Icon = c.icon
            return (
              <button key={c.key} type="button" role="radio" aria-checked={pick === c.key} className={`fx-cell is-${c.key}${pick === c.key ? ' is-on' : ''}`} onClick={() => (setPick(c.key), setLabel(''))} title={c.hint}>
                <span className="fx-seal">
                  <Icon aria-hidden="true" />
                </span>
                <i>{c.label}</i>
              </button>
            )
          })}
        </div>
        <input className="bt-in" value={label} maxLength={120} placeholder="или своё: «Метка охотника», «Проклят»…" onChange={(e) => (setLabel(e.target.value), setPick(null))} />
        <div className="fx-how" role="radiogroup" aria-label="Сколько длится">
          <button type="button" role="radio" aria-checked={how === 'never'} className={how === 'never' ? 'is-on' : ''} onClick={() => setHow('never')}>
            пока не снимут
          </button>
          {inCombat && (
            <>
              <button type="button" role="radio" aria-checked={how === 'rounds'} className={how === 'rounds' ? 'is-on' : ''} onClick={() => setHow('rounds')}>
                раунды
              </button>
              <button type="button" role="radio" aria-checked={how === 'save_ends'} className={how === 'save_ends' ? 'is-on' : ''} onClick={() => setHow('save_ends')}>
                до спасброска
              </button>
            </>
          )}
        </div>
        {how === 'rounds' && (
          <label className="fx-num">
            <span>раундов</span>
            <input className="bt-in" type="number" min={1} max={100} value={rounds} onChange={(e) => setRounds(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        )}
        {how === 'save_ends' && (
          <div className="fx-save">
            <select className="bt-in" value={ability} onChange={(e) => setAbility(e.target.value as StatKey)} aria-label="Спасбросок">
              {SAVE_RU.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <label className="fx-num">
              <span>Сл</span>
              <input className="bt-in" type="number" min={1} max={40} value={dc} onChange={(e) => setDc(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
        )}
        {error && <p className="tb-err">{error}</p>}
        <button type="button" className="tb-goldbtn" disabled={!name || busy} onClick={() => void apply()}>
          {busy ? 'накладываем…' : name ? `Наложить: ${name}` : 'Выберите состояние'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
