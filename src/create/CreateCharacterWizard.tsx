/**
 * Пошаговый конструктор персонажа.
 *
 * Порядок шагов повторяет порядок решений за столом: сначала кто ты (раса,
 * подраса), потом кем станешь (класс, уровень), затем характеристики, имя и
 * предыстория — и только после этого прокачка по уровням, где каждый уровень
 * выдаётся отдельно, с броском кости хитов и выбором, что он принёс.
 *
 * Черновик (CharacterDraft) хранит и выбранные объекты каталога, и решения по
 * уровням; в лист персонажа его превращает buildCharacter.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { createCharacter } from '../api'
import { useAuth } from '../auth/AuthContext'
import { Divider } from '../ornaments'
import { buildCharacter } from './deriveCharacter'
import { initialDraft, resizeLevels, type CharacterDraft, type DraftUpdate } from './draft'
import { ABILITY_KEYS } from '../types/character'
import { useClassBundle, useSubclassFeatures } from './useClassBundle'
import { useSubraces } from './useCatalog'
import RaceStep from './steps/RaceStep'
import SubraceStep from './steps/SubraceStep'
import ClassStep from './steps/ClassStep'
import LevelStep from './steps/LevelStep'
import AbilitiesStep from './steps/AbilitiesStep'
import IdentityStep from './steps/IdentityStep'
import BackgroundStep from './steps/BackgroundStep'
import LevelUpStep from './steps/LevelUpStep'
import ReviewStep from './steps/ReviewStep'

type StepId =
  | 'race'
  | 'subrace'
  | 'class'
  | 'level'
  | 'abilities'
  | 'identity'
  | 'background'
  | 'levelup'
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
  const { bundle, loading: classLoading } = useClassBundle(draft.cls?.id ?? null)
  const subclassFeatures = useSubclassFeatures(bundle, draft.subclass?.id ?? null)

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
      { id: 'level', label: 'Уровень' },
      { id: 'abilities', label: 'Характеристики' },
      { id: 'identity', label: 'Имя' },
      { id: 'background', label: 'Предыстория' },
      { id: 'levelup', label: 'Прокачка' },
      { id: 'review', label: 'Итог' },
    )
    return list
  }, [subraces.length])

  const safeIdx = Math.min(stepIdx, steps.length - 1)
  const step = steps[safeIdx]

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
        return draft.subrace !== null
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
      case 'levelup':
        return levelsReady
      case 'review':
        return true
    }
  })()

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = buildCharacter({
        draft,
        classFeatures: bundle?.features ?? [],
        subclassFeatures,
        playerDisplayName: user?.display_name ?? null,
      })
      const created = await createCharacter(body)
      if (!created.id) throw new Error('Сервер не вернул id персонажа')
      navigate(`/characters/${created.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать персонажа')
    } finally {
      setBusy(false)
    }
  }

  const isLast = step.id === 'review'

  return (
    <section className="cw">
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
          <SubraceStep draft={draft} update={update} subraces={subraces} />
        )}
        {step.id === 'class' && <ClassStep draft={draft} update={update} />}
        {step.id === 'level' && <LevelStep draft={draft} update={update} bundle={bundle} />}
        {step.id === 'abilities' && <AbilitiesStep draft={draft} update={update} />}
        {step.id === 'identity' && <IdentityStep draft={draft} update={update} />}
        {step.id === 'background' && <BackgroundStep draft={draft} update={update} />}
        {step.id === 'levelup' && (
          <LevelUpStep
            draft={draft}
            update={update}
            bundle={bundle}
            bundleLoading={classLoading}
            subclassFeatures={subclassFeatures}
          />
        )}
        {step.id === 'review' && (
          <ReviewStep
            draft={draft}
            update={update}
            bundle={bundle}
            subclassFeatures={subclassFeatures}
          />
        )}
      </div>

      {error && <p className="auth-error cw-error">{error}</p>}

      <footer className="cw-foot">
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
      </footer>
    </section>
  )
}
