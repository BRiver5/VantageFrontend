/**
 * Шаг 8 — прокачка по уровням.
 *
 * Уровни выдаются по одному: на каждом игрок бросает кость хитов (или вводит
 * значение), выбирает то, что уровень принёс — навыки, подкласс, усиление
 * характеристик или черту, новые заклинания — и видит умения класса и
 * подкласса. Принятый уровень проигрывается сценами награды.
 */
import { useCallback, useMemo, useState } from 'react'
import type { Feat, Spell, Subclass } from '../../api'
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
  spellSlotsAt,
  spellsKnownAt,
  subclassLevelFallback,
} from '../dnd5e'
import { averageHitDie, finalScores, hitPointsForLevel } from '../deriveCharacter'
import { emptyLevelChoice, type LevelChoice, type StepProps } from '../draft'
import type { ClassBundle } from '../useClassBundle'
import type { FeatureEntry } from '../../classArticleHtml'
import { useDice } from '../../dice/diceControl'
import CelebrationOverlay, { type CelebrationScene } from '../CelebrationOverlay'
import { useCatalogList } from '../useCatalog'
import type { GrantedSpell } from '../grantedSpells'
import type { PrereqContext } from '../prereq'
import { StepHeader } from './ui'
import type { LevelRequirements } from './levelup/LevelParts'
import { AsiBlock } from './levelup/AsiBlock'
import { FeaturesBlock } from './levelup/FeaturesBlock'
import { GrantedBlock } from './levelup/GrantedBlock'
import { HpBlock } from './levelup/HpBlock'
import { LevelFooter } from './levelup/LevelFooter'
import { LevelHero } from './levelup/LevelHero'
import { LevelRoad } from './levelup/LevelRoad'
import { MagicBlock } from './levelup/MagicBlock'
import { SkillsBlock } from './levelup/SkillsBlock'
import { SKILL_BY_KEY } from './levelup/skillByKey'
import { SubclassBlock } from './levelup/SubclassBlock'
import { SubclassModal } from './levelup/SubclassModal'

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

  const hpValue = maxFirst ? hitDie : (choice.hpRoll ?? averageHitDie(hitDie))

  return (
    <div className="cw-step cw-step--levelup">
      <StepHeader
        title="Путь наверх"
        lead="Каждый уровень принимается отдельно: бросьте кость хитов и заберите то, что он даёт."
      />

      {/* дорога уровней: золото заливает линию до последнего принятого */}
      {!opts.onlyLatest && <LevelRoad levels={draft.levels} level={level} doneCount={doneCount} nextPending={nextPending} setCursor={setCursor} />}

      <div className="cw-lvl">
        <LevelHero draft={draft} choice={choice} level={level} className={className} hitDie={hitDie} charLevel={charLevel} subclassLevel={subclassLevel} characterLevel={opts.characterLevel} />

        {/* ---------- хиты ---------- */}
        <HpBlock choice={choice} maxFirst={maxFirst} hitDie={hitDie} conMod={conMod} hpGain={hpGain} hpValue={hpValue} rolling={dice.rolling} rollHp={rollHp} diceError={diceError} patchLevel={patchLevel} />

        {/* ---------- навыки ---------- */}
        {req.skillsNeeded > 0 && <SkillsBlock req={req} choice={choice} backgroundSkills={backgroundSkills} patchLevel={patchLevel} />}

        {/* ---------- подкласс ---------- */}
        {req.needsSubclass && <SubclassBlock draft={draft} update={update} bundle={bundle} setSubDetails={setSubDetails} />}

        {/* ---------- усиление характеристик или черта ---------- */}
        {req.isAsi && <AsiBlock choice={choice} asiSpent={asiSpent} scoresBefore={scoresBefore} allFeats={allFeats} prereqContext={prereqContext} patchLevel={patchLevel} />}

        {/* ---------- заклинания ---------- */}
        {kind !== 'none' && (req.newSlots.length > 0 || req.cantripsNeeded > 0 || req.spellsNeeded > 0) && (
          <MagicBlock
            req={req}
            choice={choice}
            className={className}
            prepared={prepared}
            cantripOptions={cantripOptions}
            classSpells={classSpells}
            takenSpellIds={takenSpellIds}
            spellsLoading={spellsLoading}
            patchLevel={patchLevel}
          />
        )}

        {/* ---------- дарованные заклинания: от расы и подкласса ---------- */}
        {grantedNow.length > 0 && <GrantedBlock grantedNow={grantedNow} />}

        {/* ---------- умения уровня ---------- */}
        {(req.classFeatures.length > 0 || req.subFeatures.length > 0) && <FeaturesBlock req={req} draft={draft} className={className} />}

        {bundleLoading && <p className="cw-status">Читаем статью класса…</p>}
        {!bundleLoading && (bundle?.features.length ?? 0) === 0 && (
          <p className="cw-block-note">
            Умения этого класса не размечены по уровням — допишите их в листе персонажа.
          </p>
        )}

        <LevelFooter
          levelReady={levelReady}
          hpReady={hpReady}
          skillsReady={skillsReady}
          subclassReady={subclassReady}
          asiReady={asiReady}
          cantripsReady={cantripsReady}
          spellsReady={spellsReady}
          done={choice.done}
          level={level}
          acceptLevel={acceptLevel}
        />
      </div>

      {subDetails && <SubclassModal subDetails={subDetails} draft={draft} update={update} setSubDetails={setSubDetails} closeSubDetails={closeSubDetails} />}

      {scenes && <CelebrationOverlay scenes={scenes} onClose={closeScenes} />}
    </div>
  )
}
