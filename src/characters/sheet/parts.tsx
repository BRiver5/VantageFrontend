import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  Dices,
  Trash2,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DIE_IMAGE_URLS, hitDieType } from '../../dice/diceAssets'
import { Corners } from '../../ornaments'
import { RichText } from '../../terms/terms'
import { AbilityText } from '../../abilities/AbilityText'
import { useAbility } from '../../abilities/abilityData'
import { ChoicePortrait } from '../../create/steps/ui'
import { Img } from '../../media'
import { type FeatureRow, type RollShown, signed } from './rules'

/**
 * История бросков — закреплена в правом нижнем углу экрана. Новый бросок
 * появляется сверху и подсвечивается; список можно свернуть или очистить.
 */
export function RollLog({ rolls, onClear, inline = false }: { rolls: RollShown[]; onClear: () => void; inline?: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  if (rolls.length === 0) return null
  if (inline) {
    return (
      <div className="hud-rolls">
        <ol className="cw-rolllog-list">
          {rolls.map((r) => (
            <li key={r.id} className={r.crit ? 'is-crit' : r.fumble ? 'is-fumble' : ''}>
              <span>{r.label}</span>
              <small>{r.dice.length > 0 ? `${r.dice.length}к${r.sides} [${r.dice.join(', ')}]${r.bonus ? ` ${signed(r.bonus)}` : ''}` : ''}</small>
              <b>{r.total}</b>
            </li>
          ))}
        </ol>
        <button type="button" className="cw-mini-btn" onClick={onClear}>
          <Trash2 aria-hidden="true" /> очистить
        </button>
      </div>
    )
  }
  const [last, ...older] = rolls
  const mark = (r: RollShown) => (r.crit ? ' is-crit' : r.fumble ? ' is-fumble' : '')
  return createPortal(
    <aside className={`cw-rolllog${collapsed ? ' is-collapsed' : ''}`} aria-label="История бросков">
      <header className="cw-rolllog-head">
        <Dices aria-hidden="true" />
        <span>Броски · {rolls.length}</span>
        <button type="button" onClick={onClear} title="Очистить историю" aria-label="Очистить историю">
          <Trash2 aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          aria-expanded={!collapsed}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </header>
      <div key={last.id} className={`cw-rolllog-last${mark(last)}`} role="status" aria-live="polite">
        <span className="cw-rolllog-label">{last.label}</span>
        <span className="cw-rolllog-math">
          {last.dice.length > 0 && (
            <>
              {last.dice.length}к{last.sides} [<b>{last.dice.join(', ')}</b>]
            </>
          )}{' '}
          {last.bonus !== 0 && signed(last.bonus)}
        </span>
        <strong>{last.total}</strong>
      </div>
      {!collapsed && older.length > 0 && (
        <ol className="cw-rolllog-list">
          {older.map((r) => (
            <li key={r.id} className={mark(r).trim()}>
              <span>{r.label}</span>
              <b>{r.total}</b>
            </li>
          ))}
        </ol>
      )}
    </aside>,
    document.body,
  )
}

/* ---------- мелкие кирпичи ---------- */

/** Текст умения: у способностей движка — опрятный, со ссылками и сводкой механики */
export function FeatureText({ row }: { row: FeatureRow }) {
  const ability = useAbility(row.slug)
  if (!row.slug) return row.text ? <RichText text={row.text} /> : <p className="cw-field-note">Описания нет.</p>
  return (
    <>
      {row.text || ability?.description ? (
        <AbilityText text={row.text || ability?.description} />
      ) : (
        <p className="cw-field-note">Описания нет.</p>
      )}
    </>
  )
}

export function Card({
  title,
  icon: Icon,
  className = '',
  aside,
  children,
}: {
  title: string
  icon: LucideIcon
  className?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`beast-card cw-sheet-card ${className}`}>
      <Corners size={18} />
      <h3 className="beast-card-title">
        <Icon aria-hidden="true" /> {title}
        {aside && <span className="cw-sheet-aside">{aside}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Портрет: свой арт героя, иначе арт расы; битая ссылка — силуэт */
export function HeroPortrait({ own, fallback }: { own: string | null; fallback: string | null }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [own])
  return own && !broken ? (
    <Img src={own} alt="" onError={() => setBroken(true)} />
  ) : (
    <ChoicePortrait src={fallback} icon={UserRound} />
  )
}

/** Картинка оружия из инвентаря; без картинки — значок вида атаки */
export function WeaponArt({ src, icon: Icon }: { src: string | null; icon: LucideIcon }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="cw-wpn-art">
      {src && !broken ? <Img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Icon aria-hidden="true" />}
    </span>
  )
}

/** Кнопка-кость: сама кость за числом; «горячая» — следующий урон критический */
export function DieButton({
  sides,
  value,
  label,
  hot,
  title,
  disabled,
  onClick,
}: {
  sides: number
  value: ReactNode
  label: string
  hot?: boolean
  title?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`cw-die${sides === 20 ? ' cw-die--hit' : ' cw-die--dmg'}${hot ? ' is-hot' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="cw-die-shape" aria-hidden="true">
        {sides > 0 ? <Img src={DIE_IMAGE_URLS[hitDieType(sides)]} alt="" draggable={false} /> : <i className="cw-die-flat" />}
      </span>
      <b>{value}</b>
      <i>{label}</i>
    </button>
  )
}
