/**
 * Шаг «Снаряжение»: варианты «а / б / в» из стартового набора класса и
 * предыстории, выбор конкретных предметов для «любое воинское оружие». Сверху —
 * живая сводка: КД с надетым доспехом, атаки и кошель.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Backpack, Check, ChevronDown, Search, Shield, Swords } from 'lucide-react'
import { realImage } from '../../api'
import type { Currency, Equipment, EquipmentGrant, EquipmentIndex, GrantEntry } from '../../api'
import { CoinImg, PriceMark } from '../../coins'
import { categoryIcon, entryChoiceLabel, formatDice } from '../../equipment'
import { useEquipmentIndex } from '../../equipmentIndex'
import { finalScores } from '../deriveCharacter'
import type { StepProps } from '../draft'
import {
  choiceCandidates,
  draftGrants,
  pickOf,
  resolveGear,
  wornDefense,
  type GearPick,
  type GrantRef,
} from '../startingGear'
import { StepHeader, StepStatus } from './ui'

const COIN_CURRENCY: Record<string, Currency> = {
  copper: 'cp',
  silver: 'sp',
  electrum: 'ep',
  gold: 'gp',
  platinum: 'pp',
}
const CURRENCY_ORDER: Currency[] = ['pp', 'gp', 'ep', 'sp', 'cp']

/** Картинка предмета с запасной иконкой категории */
function GearImage({ eq, src, category }: { eq?: Equipment; src?: string | null; category?: string }) {
  const [broken, setBroken] = useState(false)
  const url = src ?? realImage(eq?.equipment_image_gallery)
  const Icon = categoryIcon(eq?.category ?? category)
  return url && !broken ? (
    <img src={url} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
  ) : (
    <Icon aria-hidden="true" />
  )
}

/** Коротко о предмете: урон оружия или КД доспеха, иначе категория */
function gearMeta(eq: Equipment): string {
  const w = eq.weapon
  if (w?.damage_dice) {
    return [formatDice(w.damage_dice), w.damage_type?.toLocaleLowerCase('ru')].filter(Boolean).join(' ')
  }
  const d = eq.defense
  if (d?.armor_class) {
    if (d.armor_kind === 'Щит') return `+${d.armor_class} КД`
    const dex = d.add_dex_modifier ? (d.dex_modifier_cap != null ? ` + Лов (макс. ${d.dex_modifier_cap})` : ' + Лов') : ''
    return `КД ${d.armor_class}${dex}`
  }
  return eq.subcategory ?? eq.category
}

/** Плитка предмета: картинка, подпись, количество, монеты внутри */
function GearTile({
  entry,
  slug,
  index,
}: {
  entry: GrantEntry
  /** выбранный slug для choice-записи */
  slug?: string | null
  index: EquipmentIndex | null
}) {
  const realSlug = entry.slug ?? slug ?? null
  const eq = realSlug ? index?.bySlug.get(realSlug) : undefined
  const name = eq?.equipment_name ?? (realSlug ? realSlug : entryChoiceLabel(entry))
  const coins = entry.contents.filter((c) => COIN_CURRENCY[c.slug.split('-')[0]] && c.slug.includes('-coin'))

  return (
    <span className={`cw-gear-tile${!realSlug ? ' is-open' : ''}`} title={name}>
      <span className="cw-gear-face">
        {!realSlug ? (
          <b aria-hidden="true">?</b>
        ) : (
          <GearImage
            key={realSlug}
            eq={eq}
            src={entry.slug ? realImage(entry.image_gallery) : null}
            category={entry.choose_from_categories[0]}
          />
        )}
        {entry.quantity > 1 && <i className="cw-gear-qty">×{entry.quantity}</i>}
        {coins.map((c) => (
          <span key={c.slug} className="cw-gear-purse" title={`${c.quantity} монет`}>
            <CoinImg currency={COIN_CURRENCY[c.slug.split('-')[0]]} size={16} />
            {c.quantity}
          </span>
        ))}
      </span>
      <span className="cw-gear-name">{name}</span>
    </span>
  )
}

/**
 * Выпадающий список предметов с картинками, уроном/КД и ценой. Меню рисуется
 * в body: карточка варианта обрезана по углам и срезала бы его.
 */
function GearSelect({
  entry,
  value,
  index,
  onChange,
}: {
  entry: GrantEntry
  value: string | null
  index: EquipmentIndex | null
  onChange: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const candidates = useMemo(() => choiceCandidates(entry, index), [entry, index])
  const current = value ? index?.bySlug.get(value) : undefined
  const label = entryChoiceLabel(entry)

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    return q ? candidates.filter((eq) => eq.equipment_name.toLocaleLowerCase('ru').includes(q)) : candidates
  }, [candidates, query])

  // меню под кнопкой; если внизу не хватает места — над ней
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 340 && r.top > window.innerHeight - r.bottom
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 320), up })
  }, [open])

  // закрытие: клик мимо, Escape, прокрутка страницы (меню привязано к кнопке)
  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (popRef.current?.contains(t) || btnRef.current?.contains(t))
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`cw-gsel${current ? '' : ' is-empty'}${open ? ' is-open' : ''}`}
        onClick={() => {
          setQuery('')
          setOpen((v) => !v)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cw-gsel-face">
          {current ? <GearImage key={current.slug} eq={current} /> : <b>?</b>}
        </span>
        <span className="cw-gsel-text">
          <b>{current?.equipment_name ?? `${label}…`}</b>
          <i>{current ? gearMeta(current) : 'выберите предмет'}</i>
        </span>
        <ChevronDown className="cw-gsel-chevron" aria-hidden="true" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className={`cw-gsel-pop${pos.up ? ' is-up' : ''}`}
            style={{
              left: Math.min(pos.left, window.innerWidth - pos.width - 12),
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
          >
            {candidates.length > 8 && (
              <label className="cw-gsel-search">
                <Search aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Найти…"
                  aria-label="Найти предмет"
                />
              </label>
            )}
            <div className="cw-gsel-list" role="listbox" aria-label={label}>
              {visible.map((eq) => {
                const on = eq.slug === value
                return (
                  <button
                    key={eq.slug}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`cw-gsel-opt${on ? ' is-on' : ''}`}
                    onClick={() => {
                      onChange(eq.slug)
                      setOpen(false)
                    }}
                  >
                    <span className="cw-gsel-face">
                      <GearImage eq={eq} />
                    </span>
                    <span className="cw-gsel-text">
                      <b>{eq.equipment_name}</b>
                      <i>{gearMeta(eq)}</i>
                    </span>
                    <PriceMark cost={eq.cost} costCopper={eq.cost_copper} className="cw-gsel-price" />
                    {on && <Check className="cw-gsel-check" aria-hidden="true" />}
                  </button>
                )
              })}
              {visible.length === 0 && <p className="cw-gsel-empty">Ничего не нашлось</p>}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** Списки для «любое …»: по одному на choose_count */
function ChoiceSelects({
  entry,
  chosen,
  index,
  onChange,
}: {
  entry: GrantEntry
  chosen: string[]
  index: EquipmentIndex | null
  onChange: (next: string[]) => void
}) {
  return (
    <span className="cw-gear-selects">
      {Array.from({ length: entry.choose_count }, (_, n) => (
        <GearSelect
          key={n}
          entry={entry}
          value={chosen[n] || null}
          index={index}
          onChange={(slug) => {
            const next = [...chosen]
            next[n] = slug
            onChange(next)
          }}
        />
      ))}
    </span>
  )
}

function GrantRow({
  grantRef,
  pick,
  index,
  onPick,
}: {
  grantRef: GrantRef
  pick: GearPick
  index: EquipmentIndex | null
  onPick: (next: GearPick) => void
}) {
  const { grant } = grantRef
  const isChoice = grant.options.length > 1

  return (
    <div className={`cw-gear-grant${isChoice ? ' is-choice' : ''}`}>
      {grant.label && <p className="cw-gear-label">{grant.label}</p>}
      <div className="cw-gear-options">
        {grant.options.map((option, oi) => {
          const active = !isChoice || pick.option === oi
          const body = (
            <>
              {option.marker && <span className="cw-gear-marker">{option.marker}</span>}
              <span className="cw-gear-items">
                {option.entries.map((entry, ei) => (
                  <GearTile
                    key={ei}
                    entry={entry}
                    slug={active ? pick.choices[ei]?.find(Boolean) : null}
                    index={index}
                  />
                ))}
              </span>
              {option.note && <span className="cw-gear-note">{option.note}</span>}
            </>
          )
          return (
            <Fragment key={oi}>
              {oi > 0 && <span className="cw-gear-or">или</span>}
              <div className={`cw-gear-option${active ? ' is-active' : ''}`}>
                <div className="cw-gear-option-inner">
                  {isChoice ? (
                    <button
                      type="button"
                      className="cw-gear-option-btn"
                      onClick={() => onPick({ option: oi, choices: pick.option === oi ? pick.choices : {} })}
                      aria-pressed={active}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="cw-gear-option-btn">{body}</div>
                  )}
                  {active &&
                    option.entries.map((entry, ei) =>
                      entry.slug ? null : (
                        <ChoiceSelects
                          key={ei}
                          entry={entry}
                          chosen={pick.choices[ei] ?? []}
                          index={index}
                          onChange={(next) =>
                            onPick({ option: oi, choices: { ...pick.choices, [ei]: next } })
                          }
                        />
                      ),
                    )}
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function GearSection({
  title,
  grants,
  draft,
  index,
  onPick,
}: {
  title: string
  grants: GrantRef[]
  draft: StepProps['draft']
  index: EquipmentIndex | null
  onPick: (key: string, next: GearPick) => void
}) {
  if (grants.length === 0) return null
  return (
    <section className="cw-gear-section">
      <h3 className="cw-gear-title">{title}</h3>
      {grants.map((ref) => (
        <GrantRow
          key={ref.key}
          grantRef={ref}
          pick={pickOf(draft, ref.key)}
          index={index}
          onPick={(next) => onPick(ref.key, next)}
        />
      ))}
    </section>
  )
}

/** Текст из книги для класса/предыстории без размеченных грантов */
function hasGrants(grants: EquipmentGrant[] | null | undefined): boolean {
  return !!grants && grants.length > 0
}

export default function EquipmentStep({ draft, update }: StepProps) {
  const index = useEquipmentIndex()
  const grants = draftGrants(draft)
  const classGrants = grants.filter((g) => g.source === 'class')
  const bgGrants = grants.filter((g) => g.source === 'background')

  const summary = useMemo(() => {
    const gear = resolveGear(draft, index)
    const items = gear.items.map((g) => g.eq)
    const worn = wornDefense(items, draft.cls?.class_name ?? '', finalScores(draft))
    return {
      ac: worn.ac,
      armor: worn.armor?.equipment_name ?? null,
      shield: worn.shield !== null,
      weapons: items.filter((eq) => eq.weapon?.damage_dice).length,
      total: gear.items.reduce((n, g) => n + g.quantity, 0),
      purse: CURRENCY_ORDER.filter((c) => gear.currency[c]).map((c) => [c, gear.currency[c]!] as const),
    }
  }, [draft, index])

  const setPick = (key: string, next: GearPick) => update({ gear: { ...draft.gear, [key]: next } })

  return (
    <div className="cw-step">
      <StepHeader title="Чем ты снаряжён?" />

      <div className="cw-gear-summary">
        <span className="cw-gear-stat">
          <Shield aria-hidden="true" />
          <b>{summary.ac}</b>
          <i>КД{summary.armor ? ` · ${summary.armor}` : ''}{summary.shield ? ' + щит' : ''}</i>
        </span>
        <span className="cw-gear-stat">
          <Swords aria-hidden="true" />
          <b>{summary.weapons}</b>
          <i>оружие</i>
        </span>
        <span className="cw-gear-stat">
          <Backpack aria-hidden="true" />
          <b>{summary.total}</b>
          <i>предметов</i>
        </span>
        <span className="cw-gear-stat cw-gear-stat--purse">
          <CoinImg currency="gp" size={26} />
          <b className="cw-gear-coins">
            {summary.purse.length
              ? summary.purse.map(([c, v]) => (
                  <span key={c}>
                    <CoinImg currency={c} size={16} />
                    {v}
                  </span>
                ))
              : '—'}
          </b>
          <i>кошель</i>
        </span>
      </div>

      <StepStatus loading={!index} error={null} />

      <GearSection
        title={`От класса «${draft.cls?.class_name ?? ''}»`}
        grants={classGrants}
        draft={draft}
        index={index}
        onPick={setPick}
      />
      {!hasGrants(draft.cls?.starting_equipment) && draft.cls?.starting_equipment_text && (
        <p className="cw-gear-fallback">{draft.cls.starting_equipment_text}</p>
      )}

      <GearSection
        title={`От предыстории «${draft.background?.background_name ?? ''}»`}
        grants={bgGrants}
        draft={draft}
        index={index}
        onPick={setPick}
      />
      {draft.background && !hasGrants(draft.background.starting_equipment) && draft.background.equipment && (
        <p className="cw-gear-fallback">{draft.background.equipment}</p>
      )}
    </div>
  )
}
