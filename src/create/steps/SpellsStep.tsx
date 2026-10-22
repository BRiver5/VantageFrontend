/**
 * Шаг «Заклинания» — перед итогом, только у заклинателей.
 *
 * Заговоры и известные заклинания выбираются по уровням на шаге прокачки, здесь
 * они собраны вместе. Готовящие заклинатели (жрец, друид, паладин, изобретатель)
 * выбирают подготовленные из всего списка класса, волшебник — из своей книги.
 * У каждого заклинания можно открыть подробности.
 */
import { useCallback, useMemo, useState } from 'react'
import { BookOpen, Check, Eye, Hourglass, Lock, Sparkles, Star, Target, X } from 'lucide-react'
import type { Spell } from '../../api'
import { spellSchoolIcon } from '../../spellSchools'
import { RichText } from '../../terms/terms'
import { ABILITY_LABELS } from '../../types/character'
import {
  abilityMod,
  casterKind,
  isPreparedCaster,
  preparedSpellsMax,
  proficiencyBonus,
  spellSlotsAt,
  spellcastingAbility,
} from '../dnd5e'
import { finalScores } from '../deriveCharacter'
import type { StepProps } from '../draft'
import { useCatalogList } from '../useCatalog'
import type { GrantedSpell } from '../grantedSpells'
import {
  ChoiceModal,
  FactChip,
  ModalSection,
  PickEmpty,
  PickToolbar,
  StepHeader,
  StepStatus,
  usePicker,
  type PickFilterGroup,
} from './ui'

const spellName = (s: Spell) => s.spell_name
const circleLabel = (n: number) => (n === 0 ? 'заговор' : `${n} круг`)

function SchoolIcon({ school }: { school: string | null }) {
  const src = spellSchoolIcon(school)
  return src ? <img src={src} alt="" /> : <Sparkles aria-hidden="true" />
}

/** Карточка заклинания: круг, школа, время и дистанция, концентрация/ритуал */
export function SpellCard({
  spell,
  state,
  onToggle,
  onDetails,
}: {
  spell: Spell
  /** on — выбрано, off — можно выбрать, locked — лимит исчерпан, fixed — только просмотр */
  state: 'on' | 'off' | 'locked' | 'fixed'
  onToggle?: () => void
  onDetails: () => void
}) {
  const body = (
    <>
      <span className="cw-sp-circle">{spell.spell_level === 0 ? '◈' : spell.spell_level}</span>
      <span className="cw-sp-school">
        <SchoolIcon school={spell.school} />
      </span>
      <span className="cw-sp-body">
        <b>{spell.spell_name}</b>
        <i>{[spell.casting_time, spell.range].filter(Boolean).join(' · ')}</i>
      </span>
      <span className="cw-sp-tags">
        {spell.concentration && <em title="Концентрация">К</em>}
        {spell.ritual && <em title="Ритуал">Р</em>}
      </span>
    </>
  )
  return (
    <div className={`cw-sp is-${state}`}>
      {onToggle && state !== 'fixed' ? (
        <button
          type="button"
          className="cw-sp-main"
          onClick={onToggle}
          disabled={state === 'locked'}
          aria-pressed={state === 'on'}
          title={state === 'locked' ? 'Лимит подготовки исчерпан' : undefined}
        >
          {body}
          {state === 'on' && <Check className="cw-sp-mark" aria-hidden="true" />}
          {state === 'locked' && <Lock className="cw-sp-mark" aria-hidden="true" />}
        </button>
      ) : (
        <span className="cw-sp-main">{body}</span>
      )}
      <button type="button" className="cw-sp-more" onClick={onDetails} title="Подробнее" aria-label="Подробнее">
        <BookOpen aria-hidden="true" />
      </button>
    </div>
  )
}

export function SpellDetails({ spell, onClose }: { spell: Spell; onClose: () => void }) {
  const comps = [
    spell.components?.verbal && 'В',
    spell.components?.somatic && 'С',
    spell.components?.material && 'М',
  ]
    .filter(Boolean)
    .join(', ')
  const icon = spellSchoolIcon(spell.school)
  return (
    <ChoiceModal
      title={spell.spell_name}
      visual={icon ? <img className="cw-sp-hero" src={icon} alt="" /> : undefined}
      icon={Sparkles}
      selected={false}
      chooseLabel="Закрыть"
      onChoose={onClose}
      onClose={onClose}
      facts={
        <>
          <FactChip icon={Sparkles}>
            {circleLabel(spell.spell_level)}
            {spell.school ? ` · ${spell.school}` : ''}
          </FactChip>
          {spell.casting_time && <FactChip icon={Hourglass}>{spell.casting_time}</FactChip>}
          {spell.range && <FactChip icon={Target}>{spell.range}</FactChip>}
          {spell.duration && <FactChip icon={Hourglass}>{spell.duration}</FactChip>}
          {comps && <FactChip>{comps}</FactChip>}
          {spell.concentration && <FactChip icon={Eye}>концентрация</FactChip>}
          {spell.ritual && <FactChip icon={Star}>ритуал</FactChip>}
        </>
      }
    >
      {spell.material_components && (
        <p className="cw-field-note">Материальные компоненты: {spell.material_components}</p>
      )}
      <ModalSection title="Описание">
        <RichText text={spell.description} />
        {spell.higher_levels && <RichText text={spell.higher_levels} />}
      </ModalSection>
    </ChoiceModal>
  )
}

export default function SpellsStep({
  draft,
  update,
  granted,
}: StepProps & { granted: GrantedSpell[] }) {
  const className = draft.cls?.class_name ?? ''
  const level = draft.targetLevel
  const kind = casterKind(className, draft.cls?.is_caster)
  const prepares = isPreparedCaster(className)
  const isWizard = className.toLocaleLowerCase('ru') === 'волшебник'
  const { items: allSpells, loading, error } = useCatalogList<Spell>('spells', kind !== 'none')
  const [details, setDetails] = useState<Spell | null>(null)
  const closeDetails = useCallback(() => setDetails(null), [])

  const ability = spellcastingAbility(className)
  const scores = finalScores(draft)
  const mod = ability ? abilityMod(scores[ability]) : 0
  const pb = proficiencyBonus(level)
  const prepMax = preparedSpellsMax(className, level, mod) ?? 0
  const slots = Object.entries(spellSlotsAt(kind, level)).sort((a, b) => Number(a[0]) - Number(b[0]))
  const maxCircle = Math.max(0, ...slots.map(([c]) => Number(c)))

  const cantrips = draft.levels.flatMap((l) => l.cantrips)
  // дарованное расой и подклассом до выбранного уровня
  const grantedHere = granted.filter(
    (g) => g.level <= level && (g.origin === 'race' || !!draft.subclass),
  )
  const known = draft.levels.flatMap((l) => l.spells)
  const prepared = draft.preparedSpells
  const preparedIds = new Set(prepared.map((s) => s.id))

  // откуда готовить: волшебник — из книги, остальные готовящие — из списка класса
  const pool = useMemo(() => {
    if (!prepares) return []
    if (isWizard) return known
    const name = className.toLocaleLowerCase('ru')
    return allSpells.filter(
      (s) =>
        s.spell_level >= 1 &&
        s.spell_level <= maxCircle &&
        s.available_classes?.some((c) => c.toLocaleLowerCase('ru').trim() === name),
    )
  }, [prepares, isWizard, known, allSpells, className, maxCircle])

  const groups = useMemo<PickFilterGroup<Spell>[]>(() => {
    const circles = [...new Set(pool.map((s) => s.spell_level))].sort((a, b) => a - b)
    const schools = [...new Set(pool.map((s) => s.school).filter((x): x is string => !!x))].sort((a, b) =>
      a.localeCompare(b, 'ru'),
    )
    return [
      {
        key: 'circle',
        label: 'Круг',
        options: circles.map((c) => ({ key: String(c), label: circleLabel(c) })),
        match: (s, sel) => sel.includes(String(s.spell_level)),
      },
      {
        key: 'school',
        label: 'Школа',
        options: schools.map((sc) => ({ key: sc, label: sc })),
        match: (s, sel) => !!s.school && sel.includes(s.school),
      },
      {
        key: 'trait',
        label: 'Особое',
        options: [
          { key: 'ritual', label: 'Ритуал' },
          { key: 'conc', label: 'Концентрация' },
          { key: 'noconc', label: 'Без концентрации' },
        ],
        match: (s, sel) =>
          sel.some((k) => (k === 'ritual' ? s.ritual : k === 'conc' ? s.concentration : !s.concentration)),
      },
    ]
  }, [pool])

  const picker = usePicker(pool, spellName, groups)
  const visible = [...picker.visible].sort((a, b) => a.spell_level - b.spell_level || a.spell_name.localeCompare(b.spell_name, 'ru'))
  const full = prepared.length >= prepMax

  const toggle = (s: Spell) =>
    update({
      preparedSpells: preparedIds.has(s.id)
        ? prepared.filter((p) => p.id !== s.id)
        : full
          ? prepared
          : [...prepared, s],
    })

  return (
    <div className="cw-step cw-spells-step">
      <StepHeader title="Книга заклинаний" />

      {kind !== 'none' && (
      <div className="cw-spells-top">
        <div className="cw-magic-stats">
          <span>
            <b>{ability ? ABILITY_LABELS[ability].abbr : '—'}</b>
            <i>характеристика</i>
          </span>
          <span>
            <b>{8 + pb + mod}</b>
            <i>Сл спасброска</i>
          </span>
          <span>
            <b>{mod + pb >= 0 ? `+${mod + pb}` : mod + pb}</b>
            <i>атака</i>
          </span>
          {prepares && (
            <span>
              <b>
                {prepared.length} / {prepMax}
              </b>
              <i>подготовлено</i>
            </span>
          )}
        </div>
        {slots.length > 0 && (
          <div className="cw-slots">
            {slots.map(([circle, count]) => (
              <span key={circle} className="cw-slot" title={`${circle} круг: ${count} ячеек`}>
                <i>{circle}</i>
                {Array.from({ length: count }, (_, j) => (
                  <span key={j} className="cw-slot-gem" />
                ))}
              </span>
            ))}
          </div>
        )}
      </div>

      )}

      {grantedHere.length > 0 && (
        <section className="cw-spells-section">
          <h3 className="cw-id-title">Дарованные · {grantedHere.length}</h3>
          <p className="cw-field-note">
            Приходят сами — от расы и подкласса; уровень получения указан на карточке.
          </p>
          <div className="cw-sp-grid">
            {grantedHere.map((g) => (
              <div key={g.spell.id} className="cw-sp-granted">
                <SpellCard spell={g.spell} state="fixed" onDetails={() => setDetails(g.spell)} />
                <span className={`cw-sp-origin cw-sp-origin--${g.origin}`}>
                  {g.origin === 'race' ? 'раса' : g.from} · с {g.level} ур.
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {cantrips.length > 0 && (
        <section className="cw-spells-section">
          <h3 className="cw-id-title">Заговоры · {cantrips.length}</h3>
          <div className="cw-sp-grid">
            {cantrips.map((s) => (
              <SpellCard key={s.id} spell={s} state="fixed" onDetails={() => setDetails(s)} />
            ))}
          </div>
        </section>
      )}

      {known.length > 0 && (
        <section className="cw-spells-section">
          <h3 className="cw-id-title">
            {isWizard ? 'Книга волшебника' : 'Известные заклинания'} · {known.length}
          </h3>
          {!isWizard && <p className="cw-field-note">Выбираются по уровням на шаге прокачки.</p>}
          {!isWizard && (
            <div className="cw-sp-grid">
              {known.map((s) => (
                <SpellCard key={s.id} spell={s} state="fixed" onDetails={() => setDetails(s)} />
              ))}
            </div>
          )}
        </section>
      )}

      {prepares && (
        <section className="cw-spells-section">
          <h3 className="cw-id-title">
            Подготовленные · {prepared.length} / {prepMax}
          </h3>
          <p className="cw-field-note">
            {isWizard
              ? 'Отметьте, какие заклинания из книги подготовлены на сегодня.'
              : `${className} готовит заклинания из всего списка класса до ${maxCircle} круга. Набор можно менять после продолжительного отдыха.`}
          </p>

          {prepared.length > 0 && (
            <div className="cw-sp-picked">
              {prepared.map((s) => (
                <button key={s.id} type="button" className="cw-chip cw-chip--removable" onClick={() => toggle(s)}>
                  {s.spell_name} <X aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {!isWizard && <StepStatus loading={loading} error={error} />}
          {pool.length > 0 && (
            <>
              <PickToolbar picker={picker} groups={groups} placeholder="Искать заклинание…" />
              <PickEmpty show={visible.length === 0} />
              <div className="cw-sp-grid">
                {visible.map((s) => (
                  <SpellCard
                    key={s.id}
                    spell={s}
                    state={preparedIds.has(s.id) ? 'on' : full ? 'locked' : 'off'}
                    onToggle={() => toggle(s)}
                    onDetails={() => setDetails(s)}
                  />
                ))}
              </div>
            </>
          )}
          {isWizard && pool.length === 0 && (
            <p className="cw-field-note">Книга пока пуста — заклинания в неё записываются на шаге прокачки.</p>
          )}
        </section>
      )}

      {details && <SpellDetails spell={details} onClose={closeDetails} />}
    </div>
  )
}
