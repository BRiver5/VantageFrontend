/**
 * Шаг 8 — прокачка по уровням.
 *
 * Уровни выдаются по одному: на каждом игрок бросает кость хитов (или вводит
 * значение), выбирает то, что уровень принёс — навыки, подкласс, усиление
 * характеристик или черту, новые заклинания — и видит умения класса и
 * подкласса. Принятый уровень проигрывается сценами награды.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  Award,
  Check,
  Dices,
  Heart,
  Lock,
  Shield,
  Sparkles,
  Swords,
  TrendingUp,
} from 'lucide-react'
import { cleanDescription, realImage } from '../../api'
import type { Feat, Spell, Subclass } from '../../api'
import { DieImage, hitDieType } from '../../dice/diceAssets'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../../types/character'
import type { AbilityName } from '../../types/character'
import { skillKeysFromNames } from '../../skills'
import {
  abilityMod,
  asiLevels,
  cantripsAt,
  casterKind,
  classSkillChoice,
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
import { FactChip, StepHeader, StepPanel } from './ui'

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
  classFeatures: FeatureEntry[]
  subFeatures: FeatureEntry[]
}

export default function LevelUpStep({
  draft,
  update,
  bundle,
  bundleLoading,
  subclassFeatures,
}: StepProps & {
  bundle: ClassBundle | null
  bundleLoading: boolean
  subclassFeatures: FeatureEntry[]
}) {
  const dice = useDice()
  const className = draft.cls?.class_name ?? ''
  const hitDie = draft.cls?.hit_dice ?? 10
  const kind = casterKind(className, draft.cls?.is_caster)
  const prepared = isPreparedCaster(className)

  // активный уровень — первый непройденный, но можно вернуться к любому пройденному
  const nextPending = draft.levels.findIndex((l) => !l.done)
  const [cursor, setCursor] = useState(() => (nextPending === -1 ? 0 : nextPending))
  const [scenes, setScenes] = useState<CelebrationScene[] | null>(null)
  const [diceError, setDiceError] = useState<string | null>(null)

  const active = Math.max(0, Math.min(cursor, draft.levels.length - 1))
  const choice = draft.levels[active] ?? emptyLevelChoice(1)
  const level = choice.level

  const subclassLevel =
    bundle?.subs.find((s) => s.level_available != null)?.level_available ??
    subclassLevelFallback(className)

  // тяжёлые списки грузим один раз на весь шаг и только если они вообще нужны
  const spellsEnabled = kind !== 'none' && !prepared
  const { items: allSpells } = useCatalogList<Spell>('spells', spellsEnabled)
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
    const newSlots = Object.entries(slotsNow)
      .map(([circle, count]) => ({
        circle: Number(circle),
        count,
        before: slotsBefore[circle] ?? 0,
      }))
      .filter((s) => s.count > s.before)
      .map(({ circle, count }) => ({ circle, count }))

    const circles = Object.keys(slotsNow).map(Number)
    return {
      skillsNeeded: level === 1 ? classSkills.count : 0,
      skillOptions: classSkills.options.filter((k) => !backgroundSkills.has(k)),
      needsSubclass: level === subclassLevel && (bundle?.subs.length ?? 0) > 0,
      isAsi: asiLevels(className).includes(level),
      cantripsNeeded: cantripsAt(className, level) - cantripsAt(className, level - 1),
      spellsNeeded: prepared ? 0 : spellsKnownAt(className, level) - spellsKnownAt(className, level - 1),
      maxCircle: circles.length > 0 ? Math.max(...circles) : 0,
      newSlots,
      classFeatures: (bundle?.features ?? []).filter((f) => f.level === level),
      subFeatures: subclassFeatures.filter((f) => f.level === level),
    }
  }, [className, kind, level, prepared, subclassLevel, bundle, subclassFeatures, backgroundSkills])

  /** Уже выбранные на других уровнях заклинания — чтобы не дублировать */
  const takenSpellIds = useMemo(() => {
    const set = new Set<string>()
    for (const l of draft.levels) {
      for (const s of l.spells) set.add(s.id)
      for (const s of l.cantrips) set.add(s.id)
    }
    return set
  }, [draft.levels])

  const classSpells = useMemo(() => {
    const name = className.toLocaleLowerCase('ru')
    return allSpells.filter((s) =>
      s.available_classes?.some((c) => c.toLocaleLowerCase('ru').trim() === name),
    )
  }, [allSpells, className])

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

  const hpReady = level === 1 || choice.hpRoll != null
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

  const hpGain = Math.max(1, hitPointsForLevel(choice, hitDie) + conMod)

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

  const hpValue = level === 1 ? hitDie : (choice.hpRoll ?? averageHitDie(hitDie))

  return (
    <div className="cw-step cw-step--levelup">
      <StepHeader
        title="Путь наверх"
        lead="Каждый уровень принимается отдельно: бросьте кость хитов и заберите то, что он даёт."
      />

      <nav className="cw-ladder" aria-label="Уровни">
        {draft.levels.map((l, i) => (
          <button
            key={l.level}
            type="button"
            className={`cw-ladder-step${l.level === level ? ' is-active' : ''}${l.done ? ' is-done' : ''}`}
            onClick={() => setCursor(i)}
            // вперёд через непройденные уровни не прыгаем — иначе порядок наград рассыплется
            disabled={!l.done && nextPending !== -1 && i > nextPending}
            title={`${l.level} уровень`}
          >
            {l.done ? <Check aria-hidden="true" /> : l.level}
          </button>
        ))}
      </nav>

      <StepPanel className="cw-level-card">
        <header className="cw-level-card-head">
          <DieImage type={hitDieType(hitDie)} size={48} />
          <div>
            <h3 className="cw-dossier-name gold-text">{level} уровень · {className}</h3>
            <p className="cw-dossier-line">
              Бонус мастерства +{proficiencyBonus(level)}
              {draft.subclass && level >= subclassLevel ? ` · ${draft.subclass.subclass_name}` : ''}
            </p>
          </div>
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
          {level === 1 ? (
            <p className="cw-block-note">
              Первый уровень даёт максимум кости: <b>{hitDie}</b> + {conMod} за Телосложение ={' '}
              <b className="gold-text">{hpGain}</b>
            </p>
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
              <span className="cw-hp-total">
                {choice.hpRoll != null ? (
                  <>
                    {hpValue} + {conMod} = <b className="gold-text">{hpGain}</b>
                  </>
                ) : (
                  'бросьте кость или введите значение'
                )}
              </span>
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
                  <button
                    key={sub.id}
                    type="button"
                    className={`cw-subclass${on ? ' is-on' : ''}`}
                    onClick={() => update({ subclass: sub })}
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
                onClick={() => patchLevel({ featName: null })}
              >
                +2 к характеристикам
              </button>
              <button
                type="button"
                className={`cs-btn cs-btn--ghost${choice.featName !== null ? ' is-active' : ''}`}
                onClick={() => patchLevel({ featName: '', asi: {} })}
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
              <label className="cw-field">
                <span>Черта</span>
                <select
                  value={choice.featName}
                  onChange={(e) => patchLevel({ featName: e.target.value })}
                >
                  <option value="">— выберите черту —</option>
                  {allFeats
                    .slice()
                    .sort((a, b) => a.feat_name.localeCompare(b.feat_name, 'ru'))
                    .map((f) => (
                      <option key={f.id} value={f.feat_name}>
                        {f.feat_name}
                      </option>
                    ))}
                </select>
              </label>
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
              <div className="cw-card-chips">
                {req.newSlots.map((s) => (
                  <FactChip key={s.circle} icon={Sparkles}>
                    {s.circle} круг — {s.count} {s.count === 1 ? 'ячейка' : 'ячеек'}
                  </FactChip>
                ))}
              </div>
            )}

            {prepared && (
              <p className="cw-block-note">
                {className} готовит заклинания из всего списка — конкретный набор выберете в листе
                персонажа.
              </p>
            )}

            {req.cantripsNeeded > 0 && (
              <SpellPicker
                title={`Заговоры — выберите ${req.cantripsNeeded}`}
                count={req.cantripsNeeded}
                picked={choice.cantrips}
                options={classSpells.filter(
                  (s) => s.spell_level === 0 && !takenSpellIds.has(s.id),
                )}
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
              />
            )}
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
                  <span>{cleanDescription(f.html).slice(0, 260)}</span>
                </li>
              ))}
              {req.subFeatures.map((f) => (
                <li key={`s-${f.name}`} className="cw-feature cw-feature--sub">
                  <b>{f.name}</b>
                  <span>{cleanDescription(f.html).slice(0, 260)}</span>
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
      </StepPanel>

      {scenes && <CelebrationOverlay scenes={scenes} onClose={closeScenes} />}
    </div>
  )
}

/** Выбор заклинаний с лимитом и поиском */
function SpellPicker({
  title,
  count,
  picked,
  options,
  onChange,
}: {
  title: string
  count: number
  picked: Spell[]
  options: Spell[]
  onChange: (next: Spell[]) => void
}) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    const list = q
      ? options.filter((s) => s.spell_name.toLocaleLowerCase('ru').includes(q))
      : options
    return [...list]
      .sort((a, b) => a.spell_level - b.spell_level || a.spell_name.localeCompare(b.spell_name, 'ru'))
      .slice(0, 60)
  }, [options, query])

  const full = picked.length >= count

  return (
    <div className="cw-spellpick">
      <h5 className="cw-block-subtitle">
        {title}
        <span className="cw-block-count">
          {picked.length} / {count}
        </span>
      </h5>

      {picked.length > 0 && (
        <div className="cw-card-chips">
          {picked.map((s) => (
            <button
              key={s.id}
              type="button"
              className="cw-chip cw-chip--removable"
              onClick={() => onChange(picked.filter((p) => p.id !== s.id))}
            >
              {s.spell_name} ✕
            </button>
          ))}
        </div>
      )}

      <input
        type="search"
        className="cw-spellsearch"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Искать заклинание…"
        aria-label="Поиск заклинания"
      />

      <div className="cw-spelllist">
        {visible.length === 0 && <p className="cw-block-note">Ничего не найдено.</p>}
        {visible.map((s) => {
          const on = picked.some((p) => p.id === s.id)
          return (
            <button
              key={s.id}
              type="button"
              className={`cw-spell${on ? ' is-on' : ''}`}
              disabled={!on && full}
              onClick={() => onChange(on ? picked.filter((p) => p.id !== s.id) : [...picked, s])}
            >
              <span className="cw-spell-circle">
                {s.spell_level === 0 ? <Sparkles aria-hidden="true" /> : s.spell_level}
              </span>
              <span className="cw-spell-name">{s.spell_name}</span>
              <span className="cw-spell-school">{s.school ?? ''}</span>
              {!on && full && <Lock aria-hidden="true" className="cw-spell-lock" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
