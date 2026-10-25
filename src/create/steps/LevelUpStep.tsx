/**
 * Шаг 8 — прокачка по уровням.
 *
 * Уровни выдаются по одному: на каждом игрок бросает кость хитов (или вводит
 * значение), выбирает то, что уровень принёс — навыки, подкласс, усиление
 * характеристик или черту, новые заклинания — и видит умения класса и
 * подкласса. Принятый уровень проигрывается сценами награды.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Award,
  BookOpen,
  ChevronDown,
  Search,
  Check,
  Dices,
  Heart,
  X,
  Shield,
  Sparkles,
  Swords,
  TrendingUp,
} from 'lucide-react'
import { realImage } from '../../api'
import type { Feat, Spell, Subclass } from '../../api'
import { DieImage, hitDieType } from '../../dice/diceAssets'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../../types/character'
import type { AbilityName } from '../../types/character'
import { skillKeysFromNames } from '../../skills'
import { normSpellName } from '../../spellIndex'
import {
  abilityMod,
  asiLevels,
  cantripsAt,
  casterKind,
  classSkillChoice,
  multiclassSkillCount,
  isPreparedCaster,
  proficiencyBonus,
  spellSlotsAt,
  spellsKnownAt,
  subclassLevelFallback,
} from '../dnd5e'
import { averageHitDie, finalScores, hitPointsForLevel } from '../deriveCharacter'
import { emptyLevelChoice, type LevelChoice, type StepProps } from '../draft'
import type { ClassBundle } from '../useClassBundle'
import type { FeatureEntry } from '../../classArticle'
import { useDice } from '../../dice/diceControl'
import CelebrationOverlay, { type CelebrationScene } from '../CelebrationOverlay'
import { useCatalogList } from '../useCatalog'
import { RichText } from '../../terms/terms'
import { Constellation } from '../../characters/SpellBook'
import { FeatPicker } from './FeatPicker'
import { featureText } from '../featureText'
import type { GrantedSpell } from '../grantedSpells'
import { checkPrereq, type PrereqContext } from '../prereq'
import { ChoiceModal, FactChip, ModalSection, MoreTab, StepHeader } from './ui'
import { SpellDetails } from './SpellsStep'
import { spellSchoolIcon } from '../../spellSchools'

const SKILL_BY_KEY = new Map(DEFAULT_SKILLS.map((s) => [s.key, s]))

/** Сколько нового даёт уровень по сравнению с предыдущим */
interface LevelRequirements {
  skillsNeeded: number
  skillOptions: string[]
  needsSubclass: boolean
  isAsi: boolean
  cantripsNeeded: number
  spellsNeeded: number
  maxCircle: number
  newSlots: { circle: number; count: number }[]
  /** все ячейки на этом уровне и сколько их было до него */
  slots: { circle: number; count: number; before: number }[]
  classFeatures: FeatureEntry[]
  subFeatures: FeatureEntry[]
}

/** Хиты уровня жетонами: [кость → значение] + [ТЕЛ ±n] = [итог] */
function HpEquation({
  die,
  value,
  conMod,
  total,
}: {
  die: number
  value: number
  conMod: number
  total: number
}) {
  return (
    <div className="cw-hp-eq" aria-label={`${value} ${conMod >= 0 ? '+' : '−'} ${Math.abs(conMod)} = ${total} хитов`}>
      <span className="cw-hp-token">
        <DieImage type={hitDieType(die)} size={22} />
        <b>{value}</b>
        <i>к{die}</i>
      </span>
      <span className="cw-hp-op">{conMod >= 0 ? '+' : '−'}</span>
      <span className="cw-hp-token">
        <b>{Math.abs(conMod)}</b>
        <i>ТЕЛ</i>
      </span>
      <span className="cw-hp-op">=</span>
      <span className="cw-hp-token cw-hp-token--total">
        <Heart aria-hidden="true" />
        <b>{total}</b>
        <i>хитов</i>
      </span>
    </div>
  )
}

/**
 * Повышение уровня у сохранённого героя: тот же шаг, но про один новый уровень
 * одного класса. Уровень героя ≠ уровень класса при мультиклассе.
 */
export interface LevelUpOptions {
  /** общий уровень героя после повышения — бонус мастерства и требования черт */
  characterLevel?: number
  /** первый уровень нового класса (мультикласс): хиты бросаются, навыков меньше */
  multiclassEntry?: boolean
  /** уже известные герою заклинания (normSpellName) — не предлагать снова */
  knownSpells?: Set<string>
  /** навыки, которыми герой уже владеет */
  ownSkills?: Set<string>
  /** показывать только последний уровень, без дороги уровней */
  onlyLatest?: boolean
}

export default function LevelUpStep({
  draft,
  update,
  bundle,
  bundleLoading,
  subclassFeatures,
  granted,
  options: opts = {},
}: StepProps & {
  bundle: ClassBundle | null
  bundleLoading: boolean
  subclassFeatures: FeatureEntry[]
  /** заклинания от расы и подкласса с уровнем получения */
  granted: GrantedSpell[]
  options?: LevelUpOptions
}) {
  const dice = useDice()
  const [subDetails, setSubDetails] = useState<Subclass | null>(null)
  const closeSubDetails = useCallback(() => setSubDetails(null), [])
  const className = draft.cls?.class_name ?? ''
  const hitDie = draft.cls?.hit_dice ?? 10
  const kind = casterKind(className, draft.cls?.is_caster)
  const prepared = isPreparedCaster(className)

  // активный уровень — первый непройденный, но можно вернуться к любому пройденному
  const nextPending = draft.levels.findIndex((l) => !l.done)
  // принятые уровни — линия дороги заливается до следующего непринятого
  const doneCount = draft.levels.filter((l) => l.done).length
  const [cursor, setCursor] = useState(() => (opts.onlyLatest ? draft.levels.length - 1 : nextPending === -1 ? 0 : nextPending))
  const [scenes, setScenes] = useState<CelebrationScene[] | null>(null)
  const [diceError, setDiceError] = useState<string | null>(null)

  const active = Math.max(0, Math.min(cursor, draft.levels.length - 1))
  const choice = draft.levels[active] ?? emptyLevelChoice(1)
  const level = choice.level
  // первый уровень класса даёт максимум кости — кроме мультикласса
  const maxFirst = level === 1 && !opts.multiclassEntry
  const charLevel = opts.characterLevel ?? level

  const subclassLevel =
    bundle?.subs.find((s) => s.level_available != null)?.level_available ??
    subclassLevelFallback(className)

  // тяжёлые списки грузим один раз на весь шаг и только если они вообще нужны
  // заговоры выбирают здесь и «готовящие» классы — каталог нужен любому заклинателю
  const spellsEnabled = kind !== 'none'
  const { items: allSpells, loading: spellsLoading } = useCatalogList<Spell>('spells', spellsEnabled)
  const featsEnabled = asiLevels(className).some((l) => l <= draft.targetLevel)
  const { items: allFeats } = useCatalogList<Feat>('feats', featsEnabled)

  const scores = useMemo(() => finalScores(draft), [draft])
  // характеристики без усилений текущего уровня — чтобы показать «было → стало»
  const scoresBefore = useMemo(
    () => finalScores({ ...draft, levels: draft.levels.filter((l) => l.level !== level) }),
    [draft, level],
  )
  const conMod = abilityMod(scores.constitution)

  /** Навыки, которые уже дала предыстория — их не предлагаем выбирать снова */
  const backgroundSkills = useMemo(
    () => new Set(skillKeysFromNames(draft.background?.skill_proficiencies)),
    [draft.background],
  )

  const req = useMemo<LevelRequirements>(() => {
    const classSkills = classSkillChoice(className)
    const slotsNow = spellSlotsAt(kind, level)
    const slotsBefore = spellSlotsAt(kind, level - 1)
    const slots = Object.entries(slotsNow)
      .map(([circle, count]) => ({
        circle: Number(circle),
        count,
        before: slotsBefore[circle] ?? 0,
      }))
      .sort((a, b) => a.circle - b.circle)
    const newSlots = slots.filter((s) => s.count > s.before).map(({ circle, count }) => ({ circle, count }))

    const circles = Object.keys(slotsNow).map(Number)
    return {
      skillsNeeded: level === 1 ? (opts.multiclassEntry ? multiclassSkillCount(className) : classSkills.count) : 0,
      skillOptions: classSkills.options.filter((k) => !backgroundSkills.has(k) && !opts.ownSkills?.has(k)),
      needsSubclass: level === subclassLevel && (bundle?.subs.length ?? 0) > 0,
      isAsi: asiLevels(className).includes(level),
      cantripsNeeded: cantripsAt(className, level) - cantripsAt(className, level - 1),
      spellsNeeded: prepared ? 0 : spellsKnownAt(className, level) - spellsKnownAt(className, level - 1),
      maxCircle: circles.length > 0 ? Math.max(...circles) : 0,
      newSlots,
      slots,
      classFeatures: (bundle?.features ?? []).filter((f) => f.level === level),
      subFeatures: subclassFeatures.filter((f) => f.level === level),
    }
  }, [className, kind, level, prepared, subclassLevel, bundle, subclassFeatures, backgroundSkills, opts.multiclassEntry, opts.ownSkills])

  /** Уже выбранные на других уровнях заклинания — чтобы не дублировать */
  const takenSpellIds = useMemo(() => {
    const set = new Set<string>()
    for (const l of draft.levels) {
      for (const s of l.spells) set.add(s.id)
      for (const s of l.cantrips) set.add(s.id)
    }
    // уже известные сохранённому герою — по названию
    if (opts.knownSpells?.size) {
      for (const s of allSpells) if (opts.knownSpells.has(normSpellName(s.spell_name))) set.add(s.id)
    }
    return set
  }, [draft.levels, opts.knownSpells, allSpells])

  const classSpells = useMemo(() => {
    const name = className.toLocaleLowerCase('ru')
    return allSpells.filter((s) =>
      s.available_classes?.some((c) => c.toLocaleLowerCase('ru').trim() === name),
    )
  }, [allSpells, className])
  /** Заговоры класса; если каталог не знает класс по названию — все заговоры */
  const cantripOptions = useMemo(() => {
    const own = classSpells.filter((s) => s.spell_level === 0)
    return own.length > 0 ? own : allSpells.filter((s) => s.spell_level === 0)
  }, [classSpells, allSpells])

  const patchLevel = useCallback(
    (patch: Partial<LevelChoice>) => {
      update({
        levels: draft.levels.map((l) => (l.level === level ? { ...l, ...patch } : l)),
      })
    },
    [draft.levels, level, update],
  )

  const asiSpent = Object.values(choice.asi).reduce<number>((sum, v) => sum + (v ?? 0), 0)

  /* ---------- проверка готовности уровня ---------- */

  const hpReady = maxFirst || choice.hpRoll != null
  const skillsReady = choice.skills.length === req.skillsNeeded
  const subclassReady = !req.needsSubclass || draft.subclass !== null
  const asiReady =
    !req.isAsi ||
    (choice.featName !== null ? choice.featName.trim().length > 0 : asiSpent === 2)
  const cantripsReady = choice.cantrips.length === Math.max(0, req.cantripsNeeded)
  const spellsReady = choice.spells.length === Math.max(0, req.spellsNeeded)
  const levelReady =
    hpReady && skillsReady && subclassReady && asiReady && cantripsReady && spellsReady

  /* ---------- бросок кости хитов ---------- */

  const rollHp = async () => {
    setDiceError(null)
    try {
      const [value] = await dice.roll(`1d${hitDie}`)
      patchLevel({ hpRoll: value, hpMode: 'roll' })
    } catch {
      setDiceError('Кости не отозвались — введите значение вручную.')
    }
  }

  /* ---------- приём уровня и сцены награды ---------- */

  const hpGain = Math.max(1, (maxFirst ? hitDie : (choice.hpRoll ?? averageHitDie(hitDie))) + conMod)

  // что раса и подкласс дают именно на этом уровне
  const grantedNow = granted.filter(
    (g) => g.level === level && (g.origin === 'race' || (draft.subclass && level >= subclassLevel)),
  )

  // требования черт проверяем на тот уровень, где черта берётся
  const prereqContext: PrereqContext = {
    level: charLevel,
    scores,
    raceName: draft.race?.race_name ?? '',
    subraceName: draft.subrace?.subrace_name ?? '',
    raceSize: draft.race?.size ?? null,
    className,
    casterKind: kind,
    armorProficiencies: draft.cls?.armor_proficiencies ?? [],
    weaponProficiencies: draft.cls?.weapon_proficiencies ?? [],
    backgroundName: draft.background?.background_name ?? '',
    feats: draft.levels.filter((l) => l.level < level && l.featName).map((l) => l.featName!),
  }

  const hpTotal = useMemo(() => {
    let total = 0
    for (const l of draft.levels) {
      if (l.level > level) break
      total += Math.max(1, hitPointsForLevel(l, hitDie) + conMod)
    }
    return total
  }, [draft.levels, level, hitDie, conMod])

  const acceptLevel = () => {
    const built: CelebrationScene[] = [{ kind: 'level', level, className }]

    built.push({ kind: 'hp', amount: hpGain, total: hpTotal })

    if (req.needsSubclass && draft.subclass) {
      built.push({ kind: 'subclass', name: draft.subclass.subclass_name })
    }

    for (const skillKey of choice.skills) {
      built.push({ kind: 'skill', name: SKILL_BY_KEY.get(skillKey)?.label ?? skillKey })
    }

    for (const [ability, value] of Object.entries(choice.asi)) {
      if (!value) continue
      const key = ability as AbilityName
      built.push({
        kind: 'ability',
        ability: key,
        from: scoresBefore[key],
        to: Math.min(20, scoresBefore[key] + value),
      })
    }

    if (choice.featName) built.push({ kind: 'feat', name: choice.featName })

    for (const g of grantedNow) {
      built.push(
        g.spell.spell_level === 0
          ? { kind: 'cantrip', name: g.spell.spell_name }
          : { kind: 'spell', name: g.spell.spell_name, circle: g.spell.spell_level },
      )
    }

    for (const slot of req.newSlots) {
      built.push({ kind: 'slot', circle: slot.circle, count: slot.count })
    }
    for (const c of choice.cantrips) built.push({ kind: 'cantrip', name: c.spell_name })
    for (const s of choice.spells) {
      built.push({ kind: 'spell', name: s.spell_name, circle: s.spell_level })
    }
    for (const f of req.classFeatures) {
      built.push({ kind: 'feature', name: f.name, origin: 'class' })
    }
    for (const f of req.subFeatures) {
      built.push({ kind: 'feature', name: f.name, origin: 'subclass' })
    }

    patchLevel({ done: true })
    setScenes(built)
  }

  const closeScenes = () => {
    setScenes(null)
    if (active + 1 < draft.levels.length) setCursor(active + 1)
  }

  if (!choice) return null

  const hpValue = maxFirst ? hitDie : (choice.hpRoll ?? averageHitDie(hitDie))

  return (
    <div className="cw-step cw-step--levelup">
      <StepHeader
        title="Путь наверх"
        lead="Каждый уровень принимается отдельно: бросьте кость хитов и заберите то, что он даёт."
      />

      {/* дорога уровней: золото заливает линию до последнего принятого */}
      {!opts.onlyLatest && (
      <nav
        className="cw-climb"
        aria-label="Уровни"
        style={
          {
            '--n': draft.levels.length,
            '--fill': `${draft.levels.length > 1 ? (Math.min(doneCount, draft.levels.length - 1) / (draft.levels.length - 1)) * 100 : 0}%`,
          } as CSSProperties
        }
      >
        {draft.levels.length > 1 && <span className="cw-climb-line" aria-hidden="true" />}
        {draft.levels.map((l, i) => (
          <button
            key={l.level}
            type="button"
            className={`cw-climb-node${l.level === level ? ' is-active' : ''}${l.done ? ' is-done' : ''}`}
            onClick={() => setCursor(i)}
            // вперёд через непройденные уровни не прыгаем — иначе порядок наград рассыплется
            disabled={!l.done && nextPending !== -1 && i > nextPending}
            title={`${l.level} уровень`}
          >
            <span className="cw-climb-hex">{l.done ? <Check aria-hidden="true" /> : l.level}</span>
          </button>
        ))}
      </nav>
      )}

      <div className="cw-lvl">
        <header className="cw-lvl-hero">
          <span className="cw-path-medal cw-lvl-medal">
            <span>
              <b key={level}>{level}</b>
              <i>уровень</i>
            </span>
          </span>
          <div className="cw-lvl-title">
            <b className="gold-text">{className}</b>
            <span>
              {opts.characterLevel ? `${opts.characterLevel} ур. героя · ` : ''}бонус мастерства +{proficiencyBonus(charLevel)}
              {draft.subclass && level >= subclassLevel ? ` · ${draft.subclass.subclass_name}` : ''}
            </span>
          </div>
          <span className="cw-lvl-die" title={`Кость хитов к${hitDie}`}>
            <DieImage type={hitDieType(hitDie)} size={54} />
            <i>к{hitDie}</i>
          </span>
          {choice.done && (
            <span className="cw-level-done" aria-label="Уровень принят">
              <Check aria-hidden="true" /> принят
            </span>
          )}
        </header>

        {/* ---------- хиты ---------- */}
        <section className="cw-block">
          <h4 className="cw-block-title">
            <Heart aria-hidden="true" /> Хиты
          </h4>
          {maxFirst ? (
            <>
              <HpEquation die={hitDie} value={hitDie} conMod={conMod} total={hpGain} />
              <p className="cw-block-note">Первый уровень всегда даёт максимум кости хитов.</p>
            </>
          ) : (
            <div className="cw-hp-row">
              <button
                type="button"
                className="cs-btn cw-roll-btn"
                onClick={() => void rollHp()}
                disabled={dice.rolling}
              >
                <Dices aria-hidden="true" />
                {dice.rolling ? 'Кость катится…' : `Бросить 1к${hitDie}`}
              </button>
              <button
                type="button"
                className={`cs-btn cs-btn--ghost${choice.hpMode === 'average' ? ' is-active' : ''}`}
                onClick={() => patchLevel({ hpMode: 'average', hpRoll: averageHitDie(hitDie) })}
              >
                Среднее ({averageHitDie(hitDie)})
              </button>
              <label className="cw-field cw-field--tiny">
                <span>Своё значение</span>
                <input
                  type="number"
                  min={1}
                  max={hitDie}
                  value={choice.hpRoll ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    patchLevel({
                      hpMode: 'manual',
                      hpRoll: Number.isNaN(v) ? null : Math.max(1, Math.min(hitDie, v)),
                    })
                  }}
                />
              </label>
              {choice.hpRoll != null ? (
                <HpEquation die={hitDie} value={hpValue} conMod={conMod} total={hpGain} />
              ) : (
                <span className="cw-hp-total">бросьте кость или введите значение</span>
              )}
            </div>
          )}
          {diceError && <p className="auth-error">{diceError}</p>}
        </section>

        {/* ---------- навыки ---------- */}
        {req.skillsNeeded > 0 && (
          <section className="cw-block">
            <h4 className="cw-block-title">
              <Award aria-hidden="true" /> Навыки — выберите {req.skillsNeeded}
              <span className="cw-block-count">
                {choice.skills.length} / {req.skillsNeeded}
              </span>
            </h4>
            {backgroundSkills.size > 0 && (
              <p className="cw-block-note">
                Предыстория уже дала:{' '}
                {[...backgroundSkills].map((k) => SKILL_BY_KEY.get(k)?.label ?? k).join(', ')}
              </p>
            )}
            <div className="cw-pills">
              {req.skillOptions.map((key) => {
                const skill = SKILL_BY_KEY.get(key)
                const on = choice.skills.includes(key)
                const full = choice.skills.length >= req.skillsNeeded
                return (
                  <button
                    key={key}
                    type="button"
                    className={`cw-pill${on ? ' is-on' : ''}`}
                    disabled={!on && full}
                    onClick={() =>
                      patchLevel({
                        skills: on
                          ? choice.skills.filter((s) => s !== key)
                          : [...choice.skills, key],
                      })
                    }
                  >
                    {skill?.label ?? key}
                    <i>{skill ? ABILITY_LABELS[skill.ability].abbr : ''}</i>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ---------- подкласс ---------- */}
        {req.needsSubclass && (
          <section className="cw-block">
            <h4 className="cw-block-title">
              <Shield aria-hidden="true" /> Подкласс
            </h4>
            <div className="cw-subclasses">
              {bundle?.subs.map((sub: Subclass) => {
                const art = realImage(sub.image_gallery)
                const on = draft.subclass?.id === sub.id
                return (
                  <div key={sub.id} className="cw-pick-slot cw-pick-slot--sub">
                    <button
                      type="button"
                      className={`cw-subclass${on ? ' is-on' : ''}`}
                      onClick={() => update({ subclass: sub })}
                      aria-pressed={on}
                    >
                      {art ? (
                        <img src={art} alt="" loading="lazy" className="cw-subclass-art" />
                      ) : (
                        <span className="cw-subclass-art cw-subclass-art--empty">
                          <Shield aria-hidden="true" />
                        </span>
                      )}
                      <span className="cw-subclass-name">{sub.subclass_name}</span>
                      {sub.subclass_flavor && (
                        <span className="cw-subclass-flavor">{sub.subclass_flavor}</span>
                      )}
                    </button>
                    <MoreTab onClick={() => setSubDetails(sub)} />
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ---------- усиление характеристик или черта ---------- */}
        {req.isAsi && (
          <section className="cw-block">
            <h4 className="cw-block-title">
              <TrendingUp aria-hidden="true" /> Усиление характеристик или черта
            </h4>
            <div className="cw-asi-modes">
              <button
                type="button"
                className={`cs-btn cs-btn--ghost${choice.featName === null ? ' is-active' : ''}`}
                onClick={() => patchLevel({ featName: null, featId: null })}
              >
                +2 к характеристикам
              </button>
              <button
                type="button"
                className={`cs-btn cs-btn--ghost${choice.featName !== null ? ' is-active' : ''}`}
                onClick={() => patchLevel({ featName: '', featId: null, asi: {} })}
              >
                Взять черту
              </button>
            </div>

            {choice.featName === null ? (
              <>
                <p className="cw-block-note">
                  Распределите два очка: {asiSpent} / 2
                </p>
                <div className="cw-asi-grid">
                  {ABILITY_KEYS.map((key) => {
                    const added = choice.asi[key] ?? 0
                    const current = scoresBefore[key]
                    const capped = current + added >= 20
                    return (
                      <div key={key} className="cw-asi-cell">
                        <span className="cw-asi-name">{ABILITY_LABELS[key].abbr}</span>
                        <span className="cw-asi-value">
                          {current}
                          {added > 0 && <i className="gold-text">+{added}</i>}
                        </span>
                        <span className="cw-asi-buttons">
                          <button
                            type="button"
                            aria-label={`Убрать очко из ${ABILITY_LABELS[key].label}`}
                            disabled={added === 0}
                            onClick={() =>
                              patchLevel({ asi: { ...choice.asi, [key]: added - 1 } })
                            }
                          >
                            −
                          </button>
                          <button
                            type="button"
                            aria-label={`Добавить очко в ${ABILITY_LABELS[key].label}`}
                            disabled={asiSpent >= 2 || capped}
                            onClick={() =>
                              patchLevel({ asi: { ...choice.asi, [key]: added + 1 } })
                            }
                          >
                            +
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <FeatPicker
                feats={allFeats}
                value={choice.featName}
                onChange={(name) =>
                  patchLevel({ featName: name, featId: allFeats.find((f) => f.feat_name === name)?.id ?? null })
                }
                check={(f) => checkPrereq(f.prerequisite, prereqContext)}
              />
            )}
          </section>
        )}

        {/* ---------- заклинания ---------- */}
        {kind !== 'none' && (req.newSlots.length > 0 || req.cantripsNeeded > 0 || req.spellsNeeded > 0) && (
          <section className="cw-block">
            <h4 className="cw-block-title">
              <Sparkles aria-hidden="true" /> Магия
            </h4>

            {req.newSlots.length > 0 && (
              <div className="cw-slot-rail cw-slot-rail--levelup">
                {req.slots.map((s) => (
                  <Constellation
                    key={s.circle}
                    circle={s.circle}
                    max={s.count}
                    used={0}
                    fresh={Math.max(0, s.count - s.before)}
                    locked
                  />
                ))}
              </div>
            )}

            {prepared && (
              <p className="cw-block-note">
                {className} готовит заклинания из всего списка — набор выберете на шаге «Заклинания».
              </p>
            )}

            {req.cantripsNeeded > 0 && (
              <SpellPicker
                title={`Заговоры — выберите ${req.cantripsNeeded}`}
                count={req.cantripsNeeded}
                picked={choice.cantrips}
                options={cantripOptions.filter((s) => !takenSpellIds.has(s.id))}
                loading={spellsLoading}
                onChange={(cantrips) => patchLevel({ cantrips })}
              />
            )}

            {req.spellsNeeded > 0 && (
              <SpellPicker
                title={`Заклинания — выберите ${req.spellsNeeded}`}
                count={req.spellsNeeded}
                picked={choice.spells}
                options={classSpells.filter(
                  (s) =>
                    s.spell_level >= 1 &&
                    s.spell_level <= req.maxCircle &&
                    !takenSpellIds.has(s.id),
                )}
                onChange={(spells) => patchLevel({ spells })}
                loading={spellsLoading}
              />
            )}
          </section>
        )}

        {/* ---------- дарованные заклинания: от расы и подкласса ---------- */}
        {grantedNow.length > 0 && (
          <section className="cw-block">
            <h4 className="cw-block-title">
              <Sparkles aria-hidden="true" /> Дарованные заклинания
            </h4>
            <div className="cw-granted">
              {grantedNow.map((g) => (
                <span key={g.spell.id} className={`cw-granted-item cw-granted-item--${g.origin}`}>
                  <span className="cw-sp-circle">{g.spell.spell_level === 0 ? '◈' : g.spell.spell_level}</span>
                  <span className="cw-granted-text">
                    <b>{g.spell.spell_name}</b>
                    <i>
                      {g.origin === 'race'
                        ? `доступно от расы${g.spell.spell_level === 0 ? ' · заговор' : ' · раз в продолжительный отдых'}`
                        : `от подкласса «${g.from}» · всегда подготовлено`}
                    </i>
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ---------- умения уровня ---------- */}
        {(req.classFeatures.length > 0 || req.subFeatures.length > 0) && (
          <section className="cw-block">
            <h4 className="cw-block-title">
              <Swords aria-hidden="true" /> Умения этого уровня
            </h4>
            <ul className="cw-features">
              {req.classFeatures.map((f) => (
                <li key={`c-${f.name}`} className="cw-feature">
                  <b>{f.name}</b>
                  <span>{featureText(f.html, f.name, className, 260)}</span>
                </li>
              ))}
              {req.subFeatures.map((f) => (
                <li key={`s-${f.name}`} className="cw-feature cw-feature--sub">
                  <b>{f.name}</b>
                  <span>{featureText(f.html, f.name, draft.subclass?.subclass_name ?? className, 260)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {bundleLoading && <p className="cw-status">Читаем статью класса…</p>}
        {!bundleLoading && (bundle?.features.length ?? 0) === 0 && (
          <p className="cw-block-note">
            Умения этого класса не размечены по уровням — допишите их в листе персонажа.
          </p>
        )}

        <footer className="cw-level-foot">
          {!levelReady && (
            <span className="cw-foot-hint">
              {!hpReady && 'Определите хиты. '}
              {!skillsReady && 'Выберите навыки. '}
              {!subclassReady && 'Выберите подкласс. '}
              {!asiReady && 'Распределите усиление или выберите черту. '}
              {(!cantripsReady || !spellsReady) && 'Выберите заклинания.'}
            </span>
          )}
          <button
            type="button"
            className="auth-submit cw-accept"
            onClick={acceptLevel}
            disabled={!levelReady}
          >
            {choice.done ? 'Пересмотреть награды' : `Принять ${level} уровень`}
          </button>
        </footer>
      </div>

      {subDetails && (
        <ChoiceModal
          art={realImage(subDetails.image_gallery)}
          icon={Shield}
          title={subDetails.subclass_name}
          selected={draft.subclass?.id === subDetails.id}
          onChoose={() => {
            update({ subclass: subDetails })
            setSubDetails(null)
          }}
          onClose={closeSubDetails}
          facts={
            <>
              {subDetails.level_available != null && (
                <FactChip>с {subDetails.level_available} уровня</FactChip>
              )}
              {subDetails.is_caster && <FactChip>заклинатель</FactChip>}
            </>
          }
        >
          {subDetails.subclass_flavor && (
            <p className="cw-dossier-desc">{subDetails.subclass_flavor}</p>
          )}
          {subDetails.description && (
            <ModalSection title="Описание">
              <RichText text={subDetails.description} />
            </ModalSection>
          )}
        </ChoiceModal>
      )}

      {scenes && <CelebrationOverlay scenes={scenes} onClose={closeScenes} />}
    </div>
  )
}

/** Значок школы магии, без него — искра */
function SchoolFace({ school }: { school: string | null }) {
  const src = spellSchoolIcon(school)
  return src ? <img src={src} alt="" draggable={false} /> : <Sparkles aria-hidden="true" />
}

const spellMeta = (s: Spell) =>
  [s.spell_level === 0 ? 'заговор' : `${s.spell_level} круг`, s.school, s.casting_time, s.range].filter(Boolean).join(' · ')

/**
 * Одно место под заклинание — выпадающее меню, как выбор оружия в снаряжении:
 * внутри поиск и полный список доступного. Меню рисуется в body и держится
 * под кнопкой (над ней, если внизу не хватает места).
 */
function SpellSelect({
  value,
  options,
  placeholder,
  onChange,
  onClear,
  onDetails,
  loading = false,
}: {
  value: Spell | null
  options: Spell[]
  loading?: boolean
  placeholder: string
  onChange: (s: Spell) => void
  onClear: () => void
  onDetails: (s: Spell) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е')
    const list = q
      ? options.filter((s) => s.spell_name.toLocaleLowerCase('ru').replace(/ё/g, 'е').includes(q))
      : options
    return [...list].sort((a, b) => a.spell_level - b.spell_level || a.spell_name.localeCompare(b.spell_name, 'ru'))
  }, [options, query])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 380 && r.top > window.innerHeight - r.bottom
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 340), up })
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
    <span className="cw-spsel">
      <button
        ref={btnRef}
        type="button"
        className={`cw-gsel${value ? '' : ' is-empty'}${open ? ' is-open' : ''}`}
        onClick={() => {
          setQuery('')
          setOpen((v) => !v)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cw-gsel-face cw-spsel-face">{value ? <SchoolFace school={value.school} /> : <b>?</b>}</span>
        <span className="cw-gsel-text">
          <b>{value?.spell_name ?? placeholder}</b>
          <i>{value ? spellMeta(value) : loading ? 'загружаем список…' : `доступно: ${options.length}`}</i>
        </span>
        <ChevronDown className="cw-gsel-chevron" aria-hidden="true" />
      </button>
      {value && (
        <span className="cw-spsel-tools">
          <button type="button" onClick={() => onDetails(value)} title="Подробнее" aria-label="Подробнее">
            <BookOpen aria-hidden="true" />
          </button>
          <button type="button" onClick={onClear} title="Очистить" aria-label="Очистить">
            <X aria-hidden="true" />
          </button>
        </span>
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className={`cw-gsel-pop cw-spsel-pop${pos.up ? ' is-up' : ''}`}
            style={{
              left: Math.min(pos.left, window.innerWidth - pos.width - 12),
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
          >
            <label className="cw-gsel-search">
              <Search aria-hidden="true" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти заклинание…" aria-label="Найти заклинание" />
            </label>
            <div className="cw-gsel-list" role="listbox" aria-label={placeholder}>
              {visible.map((s) => {
                const on = s.id === value?.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`cw-gsel-opt${on ? ' is-on' : ''}`}
                    onClick={() => {
                      onChange(s)
                      setOpen(false)
                    }}
                  >
                    <span className="cw-gsel-face cw-spsel-face">
                      <SchoolFace school={s.school} />
                    </span>
                    <span className="cw-gsel-text">
                      <b>{s.spell_name}</b>
                      <i>{spellMeta(s)}</i>
                    </span>
                    <span className="cw-spsel-tags">
                      {s.concentration && <em title="Концентрация">К</em>}
                      {s.ritual && <em title="Ритуал">Р</em>}
                    </span>
                    {on && <Check className="cw-gsel-check" aria-hidden="true" />}
                  </button>
                )
              })}
              {visible.length === 0 && (
                <p className="cw-gsel-empty">{loading ? 'Загружаем список заклинаний…' : query ? 'Ничего не нашлось' : 'Доступных заклинаний нет'}</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  )
}

/**
 * Выбор заклинаний уровня: столько выпадающих меню, сколько положено, — как
 * выбор оружия в снаряжении. Выбранное в одном меню из соседних пропадает.
 */
function SpellPicker({
  title,
  count,
  picked,
  options,
  onChange,
  loading = false,
}: {
  title: string
  count: number
  picked: Spell[]
  options: Spell[]
  onChange: (next: Spell[]) => void
  loading?: boolean
}) {
  const [details, setDetails] = useState<Spell | null>(null)
  const closeDetails = useCallback(() => setDetails(null), [])
  const label = title.startsWith('Заговор') ? 'Выберите заговор' : 'Выберите заклинание'

  const setSlot = (n: number, s: Spell | null) => {
    const next: (Spell | undefined)[] = Array.from({ length: count }, (_, i) => picked[i])
    next[n] = s ?? undefined
    onChange(next.filter((x): x is Spell => !!x))
  }

  return (
    <div className="cw-spellpick">
      <h5 className="cw-block-subtitle">
        {title}
        <span className="cw-block-count">
          {picked.length} / {count}
        </span>
      </h5>
      <div className="cw-spsel-list">
        {Array.from({ length: count }, (_, n) => {
          const value = picked[n] ?? null
          // нельзя выбрать то же, что в соседнем меню
          const taken = new Set(picked.filter((_, i) => i !== n).map((s) => s.id))
          return (
            <SpellSelect
              key={n}
              value={value}
              options={options.filter((s) => !taken.has(s.id))}
              placeholder={`${label}…`}
              loading={loading}
              onChange={(s) => setSlot(n, s)}
              onClear={() => setSlot(n, null)}
              onDetails={setDetails}
            />
          )
        })}
      </div>
      {details && <SpellDetails spell={details} onClose={closeDetails} />}
    </div>
  )
}
