/**
 * Состояния и эффекты: не плашки с текстом, а то, что видно на самой фигуре.
 * У каждого состояния 5e — своя печать (значок по ободу жетона) и своя «аура»:
 * отравленный в зелёной дымке, окаменевший серый, невидимый мерцает, сбитый с ног
 * завален набок, оглушённого обходят звёзды. Одно и то же на столе и в бою.
 *
 * Сервер хранит эффекты подписями (у героя в карточке — строки), поэтому
 * состояние узнаём по началу слова: «Отравлен», «отравление» → poisoned.
 */
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownToLine,
  BatteryLow,
  CircleAlert,
  CircleSlash,
  EarOff,
  EyeOff,
  FastForward,
  FlaskConical,
  Ghost,
  Hand,
  Heart,
  Link2,
  Moon,
  Mountain,
  Snowflake,
  Sparkle,
  Sparkles,
  Sun,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { EffectExpiry, StatKey } from '../../types/rooms'

export interface ConditionDef {
  key: string
  label: string
  /** по началу подписи узнаём состояние */
  match: RegExp
  icon: LucideIcon
  /** класс ауры на фигуре */
  aura: string
  hint: string
}

export const CONDITIONS: ConditionDef[] = [
  { key: 'poisoned', label: 'Отравлен', match: /^отравл/i, icon: FlaskConical, aura: 'poison', hint: 'помеха к атакам и проверкам' },
  { key: 'blinded', label: 'Ослеплён', match: /^ослепл/i, icon: EyeOff, aura: 'blind', hint: 'не видит, атаки по нему с преимуществом' },
  { key: 'charmed', label: 'Очарован', match: /^очаров/i, icon: Heart, aura: 'charm', hint: 'не нападает на очаровавшего' },
  { key: 'deafened', label: 'Оглох', match: /^оглох/i, icon: EarOff, aura: 'deaf', hint: 'не слышит' },
  { key: 'frightened', label: 'Испуган', match: /^(испуг|напуг|страх)/i, icon: Ghost, aura: 'fear', hint: 'помеха, пока видит источник страха' },
  { key: 'grappled', label: 'Схвачен', match: /^схвач/i, icon: Hand, aura: 'grapple', hint: 'скорость 0' },
  { key: 'incapacitated', label: 'Недееспособен', match: /^недеесп/i, icon: CircleSlash, aura: 'daze', hint: 'ни действий, ни реакций' },
  { key: 'invisible', label: 'Невидим', match: /^невидим/i, icon: Wind, aura: 'invisible', hint: 'его не видно без особых чувств' },
  { key: 'paralyzed', label: 'Парализован', match: /^парализ/i, icon: Snowflake, aura: 'freeze', hint: 'недееспособен, критуют вблизи' },
  { key: 'petrified', label: 'Окаменел', match: /^окамен/i, icon: Mountain, aura: 'stone', hint: 'превращён в камень' },
  { key: 'prone', label: 'Сбит с ног', match: /^(сбит|лежит|ничком)/i, icon: ArrowDownToLine, aura: 'prone', hint: 'вблизи по нему с преимуществом' },
  { key: 'restrained', label: 'Опутан', match: /^(опута|скова)/i, icon: Link2, aura: 'bind', hint: 'скорость 0, помеха к атакам' },
  { key: 'stunned', label: 'Ошеломлён', match: /^(ошелом|оглуш)/i, icon: Zap, aura: 'stun', hint: 'недееспособен, проваливает спасы Сил и Лов' },
  { key: 'unconscious', label: 'Без сознания', match: /^без\s*созн/i, icon: Moon, aura: 'sleep', hint: 'падает и роняет всё из рук' },
  { key: 'exhaustion', label: 'Истощение', match: /^истощ/i, icon: BatteryLow, aura: 'tired', hint: 'уровни истощения складываются' },
  { key: 'concentration', label: 'Концентрация', match: /^концентрац/i, icon: Sparkles, aura: 'conc', hint: 'держит заклинание' },
  { key: 'blessed', label: 'Благословение', match: /^благослов/i, icon: Sun, aura: 'bless', hint: '+к4 к атакам и спасброскам' },
  { key: 'hasted', label: 'Ускорение', match: /^ускор/i, icon: FastForward, aura: 'haste', hint: 'двойная скорость, +2 КД' },
]

const GENERIC: Omit<ConditionDef, 'label' | 'match'> = { key: 'other', icon: Sparkle, aura: 'magic', hint: '' }

/** Застигнут врасплох: не состояние 5e, но в первом раунде видно так же */
export const SURPRISED: ShownEffect = { label: 'Врасплох', title: 'Застигнут врасплох', def: { key: 'surprised', icon: CircleAlert, aura: 'surprise', hint: 'в первом раунде без действий и реакций' } }

export interface ShownEffect {
  /** подпись как на сервере */
  label: string
  /** что показать: без «Концентрация:» */
  title: string
  def: Omit<ConditionDef, 'label' | 'match'>
  id?: string
  rounds?: number | null
}

export function describeEffect(label: string, extra?: { id?: string; rounds?: number | null }): ShownEffect {
  const clean = label.trim()
  const def = CONDITIONS.find((c) => c.match.test(clean)) ?? GENERIC
  const title = def.key === 'concentration' ? clean.replace(/^концентрац[а-яё]*:?\s*/i, '') || 'Концентрация' : clean
  return { label: clean, title, def, id: extra?.id, rounds: extra?.rounds }
}

/** Классы аур для фигуры: по одному на состояние */
export const auraClass = (list: ShownEffect[]) => [...new Set(list.map((e) => `fx-${e.def.aura}`))].join(' ')

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

export interface EffectDraft {
  label: string
  expires: EffectExpiry
  rounds_left: number | null
  save_ability?: StatKey | null
  save_dc?: number | null
  concentration: boolean
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
  const name = label.trim() || CONDITIONS.find((c) => c.key === pick)?.label || ''

  const apply = async () => {
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      await onApply({
        label: name,
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
