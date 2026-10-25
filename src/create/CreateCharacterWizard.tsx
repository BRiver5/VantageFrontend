/**
 * Пошаговый конструктор персонажа.
 *
 * Порядок шагов: кто ты (раса, подраса), кем стал (класс, предыстория), из чего
 * сделан (характеристики — навыки предыстории уже видны в них), с чем выходишь
 * в путь (снаряжение — его КД и атаки считаются от характеристик), как тебя
 * зовут — и только в конце уровень и прокачка, где каждый уровень выдаётся
 * отдельно, с броском кости хитов и выбором того, что он принёс.
 *
 * Черновик (CharacterDraft) хранит и выбранные объекты каталога, и решения по
 * уровням; в лист персонажа его превращает buildCharacter.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { ApiError, createCharacter, isLegacySchemaError, levelUp } from '../api'
import { useAuth } from '../auth/AuthContext'
import { Divider } from '../ornaments'
import { autoResolveDecisions } from './autoDecisions'
import { buildCharacter, draftToInput, levelUpPlan } from './deriveCharacter'
import { initialDraft, resizeLevels, type CharacterDraft, type DraftUpdate } from './draft'
import { ABILITY_KEYS } from '../types/character'
import { useClassBundle, useSubclassFeatures } from './useClassBundle'
import { useCatalogList, useSubraces } from './useCatalog'
import { grantedSpells } from './grantedSpells'
import type { Spell } from '../api'
import { useEquipmentIndex } from '../equipmentIndex'
import { WorldBackdrop } from '../creatureSheet'
import { useBookWorld } from '../worldArt'
import { gearReady } from './startingGear'
import EquipmentStep from './steps/EquipmentStep'
import RaceStep from './steps/RaceStep'
import SubraceStep from './steps/SubraceStep'
import ClassStep from './steps/ClassStep'
import LevelStep from './steps/LevelStep'
import AbilitiesStep from './steps/AbilitiesStep'
import IdentityStep from './steps/IdentityStep'
import BackgroundStep from './steps/BackgroundStep'
import LevelUpStep from './steps/LevelUpStep'
import ReviewStep from './steps/ReviewStep'
import SpellsStep from './steps/SpellsStep'
import { casterKind } from './dnd5e'

type StepId =
  | 'race'
  | 'subrace'
  | 'class'
  | 'level'
  | 'abilities'
  | 'identity'
  | 'background'
  | 'equipment'
  | 'levelup'
  | 'spells'
  | 'review'

interface StepDef {
  id: StepId
  label: string
}

function Stepper({
  steps,
  current,
  maxVisited,
  onJump,
}: {
  steps: StepDef[]
  current: number
  maxVisited: number
  onJump: (index: number) => void
}) {
  return (
    <nav className="cw-rail" aria-label="Шаги создания">
      {steps.map((step, i) => {
        const state = i === current ? 'is-current' : i < current ? 'is-done' : ''
        const reachable = i <= maxVisited
        return (
          <button
            key={step.id}
            type="button"
            className={`cw-rail-step ${state}`}
            onClick={() => reachable && onJump(i)}
            disabled={!reachable}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className="cw-rail-hex">{i + 1}</span>
            <span className="cw-rail-label">{step.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default function CreateCharacterWizard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [draft, setDraft] = useState<CharacterDraft>(() =>
    initialDraft(user?.preferences?.default_character_visibility ?? 'private'),
  )
  const [stepIdx, setStepIdx] = useState(0)
  const [maxVisited, setMaxVisited] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = useCallback<DraftUpdate>((patch) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  const { items: subraces } = useSubraces(draft.race?.id ?? null)
  // ветви, которые заменяют расу, не обязательны: базовый народ можно оставить
  const subraceOptional = subraces.length > 0 && subraces.every((sr) => sr.replaces_race)
  const { bundle, loading: classLoading } = useClassBundle(draft.cls?.id ?? null)
  const subclassFeatures = useSubclassFeatures(bundle, draft.subclass?.id ?? null)
  const equipmentIndex = useEquipmentIndex()
  // каталог заклинаний — и для расовых (у любого класса), и для подкласса
  const { items: spellCatalog } = useCatalogList<Spell>('spells')
  const granted = useMemo(
    () =>
      grantedSpells(
        {
          raceName: draft.race?.race_name ?? '',
          raceText: draft.race?.description,
          subraceName: draft.subrace?.subrace_name ?? null,
          subraceText: draft.subrace?.traits ?? draft.subrace?.description,
          className: draft.cls?.class_name ?? '',
          subclassName: draft.subclass?.subclass_name ?? null,
        },
        spellCatalog,
      ),
    [draft.race, draft.subrace, draft.cls, draft.subclass, spellCatalog],
  )

  // целевой уровень управляет длиной списка решений по уровням
  useEffect(() => {
    setDraft((prev) =>
      prev.levels.length === prev.targetLevel
        ? prev
        : { ...prev, levels: resizeLevels(prev.levels, prev.targetLevel) },
    )
  }, [draft.targetLevel])

  const steps = useMemo<StepDef[]>(() => {
    const list: StepDef[] = [{ id: 'race', label: 'Раса' }]
    if (subraces.length > 0) list.push({ id: 'subrace', label: 'Подраса' })
    list.push(
      { id: 'class', label: 'Класс' },
      { id: 'background', label: 'Предыстория' },
      { id: 'abilities', label: 'Характеристики' },
      { id: 'equipment', label: 'Снаряжение' },
      { id: 'identity', label: 'Имя' },
      { id: 'level', label: 'Уровень' },
      { id: 'levelup', label: 'Прокачка' },
    )
    // заклинания — только у заклинателей
    if (
      (draft.cls && casterKind(draft.cls.class_name, draft.cls.is_caster) !== 'none') ||
      granted.some((g) => g.level <= draft.targetLevel)
    ) {
      list.push({ id: 'spells', label: 'Заклинания' })
    }
    list.push({ id: 'review', label: 'Итог' })
    return list
  }, [subraces.length, draft.cls, granted, draft.targetLevel])

  const safeIdx = Math.min(stepIdx, steps.length - 1)
  const step = steps[safeIdx]

  // на шагах расы и подрасы за мастером — мир, откуда родом выбранная раса
  const raceWorld = useBookWorld(draft.race?.book_source_id)
  const showWorld = (step.id === 'race' || step.id === 'subrace') && raceWorld

  const go = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(steps.length - 1, index))
      setStepIdx(next)
      setMaxVisited((m) => Math.max(m, next))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [steps.length],
  )

  // у бросков и стандартного набора значения раскладываются вручную — пока
  // хоть одна характеристика пуста, дальше не пускаем
  const abilitiesReady = useMemo(() => {
    if (draft.abilityMethod !== 'roll' && draft.abilityMethod !== 'array') return true
    return ABILITY_KEYS.every((k) => draft.baseScores[k] != null)
  }, [draft.abilityMethod, draft.baseScores])

  const levelsReady = draft.levels.every((l) => l.done)

  const canAdvance = (() => {
    switch (step.id) {
      case 'race':
        return draft.race !== null
      case 'subrace':
        return subraceOptional || draft.subrace !== null
      case 'class':
        return draft.cls !== null
      case 'level':
        return true
      case 'abilities':
        return abilitiesReady
      case 'identity':
        return draft.name.trim().length > 0
      case 'background':
        return true
      case 'equipment':
        return gearReady(draft)
      case 'levelup':
        return levelsReady
      case 'spells':
        return true
      case 'review':
        return true
    }
  })()

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      // предпросмотр нужен только ради снаряжения, атак и заклинаний —
      // числа листа сервер посчитает сам
      const preview = buildCharacter({
        draft,
        classFeatures: bundle?.features ?? [],
        subclassFeatures,
        playerDisplayName: user?.display_name ?? null,
        equipmentIndex,
        granted,
      })
      const created = await createCharacter(draftToInput(draft, preview))
      if (!created.id) throw new Error('Сервер не вернул id персонажа')
      // уровни выше первого — по одному, как при игре: хиты и умения выдаёт сервер
      try {
        for (const step of levelUpPlan(draft)) {
          // 409 — ревизия ещё не догнала прошлый шаг: один повтор с новой ревизией
          await levelUp(created.id, step).catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 409) return levelUp(created.id, step)
            throw e
          })
        }
        // навыки класса и ASI, выбранные на шагах, — ответами на выборы способностей
        await autoResolveDecisions(created.id, draft)
      } catch {
        // герой уже создан — остальные уровни и выборы можно добрать на листе
      }
      navigate(`/characters/${created.id}`, { replace: true })
    } catch (err) {
      setError(
        isLegacySchemaError(err)
          ? 'Сервер API ещё старой версии и не знает новую схему персонажа (v2). Создание заработает, когда на сервере развернут новый бэкенд.'
          : err instanceof Error
            ? err.message
            : 'Не удалось создать персонажа',
      )
    } finally {
      setBusy(false)
    }
  }

  const isLast = step.id === 'review'

  return (
    <section className={`cw${showWorld ? ' has-world' : ''}`}>
      {showWorld && <WorldBackdrop key={showWorld.art} art={showWorld.art} />}
      <header className="cw-top">
        <Link to="/characters" className="back-link back-link--btn">
          <ChevronLeft aria-hidden="true" /> к персонажам
        </Link>
        <h1 className="section-title gold-text cw-title">
          <ScrollText aria-hidden="true" /> Создание героя
        </h1>
      </header>

      <Stepper steps={steps} current={safeIdx} maxVisited={maxVisited} onJump={go} />

      <Divider />

      <div className="cw-stage">
        {step.id === 'race' && <RaceStep draft={draft} update={update} />}
        {step.id === 'subrace' && (
          <SubraceStep draft={draft} update={update} subraces={subraces} allowBase={subraceOptional} />
        )}
        {step.id === 'class' && <ClassStep draft={draft} update={update} />}
        {step.id === 'level' && <LevelStep draft={draft} update={update} bundle={bundle} />}
        {step.id === 'abilities' && <AbilitiesStep draft={draft} update={update} />}
        {step.id === 'identity' && <IdentityStep draft={draft} update={update} />}
        {step.id === 'background' && <BackgroundStep draft={draft} update={update} />}
        {step.id === 'equipment' && <EquipmentStep draft={draft} update={update} />}
        {step.id === 'levelup' && (
          <LevelUpStep
            draft={draft}
            update={update}
            bundle={bundle}
            bundleLoading={classLoading}
            subclassFeatures={subclassFeatures}
            granted={granted}
          />
        )}
        {step.id === 'spells' && <SpellsStep draft={draft} update={update} granted={granted} />}
        {step.id === 'review' && (
          <ReviewStep
            draft={draft}
            update={update}
            bundle={bundle}
            subclassFeatures={subclassFeatures}
            granted={granted}
          />
        )}
      </div>

      {error && <p className="auth-error cw-error">{error}</p>}

      {/* панель шагов — в body и fixed: всегда внизу экрана и поверх содержимого,
          её не сдвигают ни прокрутка, ни transform анимаций страницы */}
      {createPortal(
        <footer className="cw-foot">
          <div className="cw-foot-inner">
            <button
              type="button"
              className="cs-btn cs-btn--ghost"
              onClick={() => go(safeIdx - 1)}
              disabled={safeIdx === 0 || busy}
            >
              <ChevronLeft aria-hidden="true" /> Назад
            </button>

            <span className="cw-foot-hint">
              {!canAdvance && step.id === 'levelup' && 'Пройдите все уровни, чтобы продолжить'}
              {!canAdvance && step.id === 'abilities' && 'Разложите значения по всем характеристикам'}
              {!canAdvance && step.id === 'identity' && 'Герою нужно имя'}
              {!canAdvance && step.id === 'equipment' && 'Выберите предметы во всех пунктах «на выбор»'}
              {!canAdvance && (step.id === 'race' || step.id === 'subrace' || step.id === 'class') &&
                'Сделайте выбор, чтобы продолжить'}
            </span>

            {isLast ? (
              <button
                type="button"
                className="auth-submit cw-create"
                onClick={() => void submit()}
                disabled={busy}
              >
                {busy ? 'Вписываем в хроники…' : 'Создать героя'}
              </button>
            ) : (
              <button
                type="button"
                className="cs-btn cw-next"
                onClick={() => go(safeIdx + 1)}
                disabled={!canAdvance || busy}
              >
                Далее <ChevronRight aria-hidden="true" />
              </button>
            )}
          </div>
        </footer>,
        document.body,
      )}
    </section>
  )
}
