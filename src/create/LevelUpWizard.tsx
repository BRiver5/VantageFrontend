/**
 * Повышение уровня сохранённого героя — тем же пошаговым мастером, что и
 * создание: класс (свой или новый — мультикласс), затем шаг «Прокачка» для
 * одного уровня (хиты, навыки, подкласс, усиление или черта, заговоры и
 * заклинания), для готовящих заклинателей — их набор, и итог.
 *
 * Отправка: один `POST /level-up` — класс, подкласс, бросок хитов, черта и
 * новые заклинания в одной ревизии; затем ответы на выборы способностей (ASI,
 * навык мультикласса) теми же решениями, что игрок принял на шагах. Требования
 * мультикласса (Сила 13…) проверяет сервер — его текст показывается как ошибка.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GraduationCap, Loader2 } from 'lucide-react'
import { ApiError, levelUp, type Background, type GameClass } from '../api'
import { AbilityList } from '../abilities/AbilityList'
import { useCharacterEngine } from '../characters/useCharacterEngine'
import { useNames } from '../characters/useNames'
import { Divider } from '../ornaments'
import { normSpellName } from '../spellIndex'
import { ABILITY_LABELS, DEFAULT_SKILLS } from '../types/character'
import type { AbilityName, SpellKnown } from '../types/character'
import { autoResolveDecisions } from './autoDecisions'
import { isPreparedCaster } from './dnd5e'
import { draftFromCharacter } from './draftFromCharacter'
import type { CharacterDraft, DraftUpdate } from './draft'
import ClassStep from './steps/ClassStep'
import LevelUpStep from './steps/LevelUpStep'
import SpellsStep from './steps/SpellsStep'
import { useCatalogList } from './useCatalog'
import { useClassBundle, useSubclassFeatures } from './useClassBundle'

type StepId = 'class' | 'levelup' | 'spells' | 'review'

export default function LevelUpWizard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { character, sheet, loadError } = useCharacterEngine(id)
  const { names, classes } = useNames(character)
  const { items: backgrounds } = useCatalogList<Background>('backgrounds', !!character?.background_id)
  const [draft, setDraft] = useState<CharacterDraft | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changes, setChanges] = useState<string[] | null>(null)

  const update = useCallback<DraftUpdate>((patch) => setDraft((d) => (d ? { ...d, ...patch } : d)), [])
  const { bundle, loading: bundleLoading } = useClassBundle(draft?.cls?.id ?? null)
  const subclassFeatures = useSubclassFeatures(bundle, draft?.subclass?.id ?? null)

  const total = character?.classes.reduce((s, c) => s + c.level, 0) ?? 0
  const own = draft?.cls ? character?.classes.find((c) => c.class_id === draft.cls!.id) : undefined
  const multiclassEntry = !!draft?.cls && !own

  /** Выбор класса: черновик под него — прошлые уровни класса и новый */
  const pickClass = useCallback(
    (cls: GameClass) => {
      if (!character || !sheet) return
      const mine = character.classes.find((c) => c.class_id === cls.id)
      const sub = mine?.subclass_id ? (bundle?.subs.find((s) => s.id === mine.subclass_id) ?? null) : null
      const bg = backgrounds.find((b) => b.id === character.background_id) ?? null
      setDraft(draftFromCharacter(character, sheet, cls, sub, bg))
    },
    [character, sheet, bundle, backgrounds],
  )

  // подкласс своего класса подтягиваем, когда загрузятся подклассы
  useEffect(() => {
    if (!draft?.cls || draft.subclass || !own?.subclass_id || !bundle) return
    const sub = bundle.subs.find((s) => s.id === own.subclass_id)
    if (sub) update({ subclass: sub })
  }, [bundle, draft?.cls, draft?.subclass, own?.subclass_id, update])

  // сразу предлагаем основной класс героя
  useEffect(() => {
    if (draft || !character || !sheet || classes.length === 0) return
    const main = classes.find((c) => c.id === character.classes[0]?.class_id)
    if (main) pickClass(main)
  }, [draft, character, sheet, classes, pickClass])

  const steps = useMemo(() => {
    const list: { id: StepId; label: string }[] = [
      { id: 'class', label: 'Класс' },
      { id: 'levelup', label: 'Уровень' },
    ]
    if (draft?.cls && isPreparedCaster(draft.cls.class_name)) list.push({ id: 'spells', label: 'Заклинания' })
    list.push({ id: 'review', label: 'Итог' })
    return list
  }, [draft?.cls])

  const knownSpells = useMemo(() => new Set((character?.spells ?? []).map((s) => normSpellName(s.name))), [character?.spells])
  const ownSkills = useMemo(() => {
    const out = new Set<string>()
    for (const [path, v] of Object.entries(sheet?.values ?? {})) {
      const m = /^char\.skills\.([^.]+)\.prof$/.exec(path)
      if (m && typeof v === 'number' && v >= 1) out.add(m[1])
    }
    return out
  }, [sheet?.values])

  if (loadError) return <section className="cw"><p className="auth-error">{loadError}</p></section>
  if (!character || !sheet) {
    return (
      <section className="cw">
        <p className="muted cw-live-loading">
          <Loader2 className="cw-spin" aria-hidden="true" /> Загрузка героя…
        </p>
      </section>
    )
  }

  const step = steps[Math.min(stepIdx, steps.length - 1)]
  const newLevel = draft?.levels[draft.levels.length - 1]
  const canAdvance = step.id === 'class' ? !!draft?.cls : step.id === 'levelup' ? !!newLevel?.done : true
  const go = (i: number) => {
    setStepIdx(Math.max(0, Math.min(steps.length - 1, i)))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    if (!draft?.cls || !newLevel) return
    setBusy(true)
    setError(null)
    try {
      const subNow = draft.subclass && !own?.subclass_id ? draft.subclass.id : null
      // новые заговоры и заклинания и черта вместо усиления — тем же запросом, в одной ревизии
      const have = new Set(character.spells.map((sp) => normSpellName(sp.name)))
      const spells: SpellKnown[] = [...newLevel.cantrips, ...newLevel.spells, ...draft.preparedSpells]
        .filter((sp) => !have.has(normSpellName(sp.spell_name)) && (have.add(normSpellName(sp.spell_name)), true))
        .map((sp) => ({ name: sp.spell_name, level: sp.spell_level, prepared: true, spell_source: sp.spell_source ?? null, snapshot: { spell_id: sp.id } }))
      const body = {
        class_id: draft.cls.id,
        subclass_id: subNow,
        hp_roll: newLevel.hpMode === 'average' || newLevel.hpRoll == null ? null : newLevel.hpRoll,
        feat_id: newLevel.featId && !character.feat_ids.includes(newLevel.featId) ? newLevel.featId : null,
        spells,
      }
      const res = await levelUp(character.id, body).catch((e: unknown) => {
        // 409 — лист обновили в другом месте: один повтор на свежей ревизии
        if (e instanceof ApiError && e.status === 409) return levelUp(character.id, body)
        throw e
      })
      // ASI и навыки нового уровня — ответами на выборы способностей
      await autoResolveDecisions(character.id, { ...draft, levels: [newLevel] }).catch(() => {})
      setChanges(res.changes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось повысить уровень')
    } finally {
      setBusy(false)
    }
  }

  if (changes) {
    const added = changes.map((c) => /^\+\s*(.+)$/.exec(c.trim())?.[1]).filter((x): x is string => !!x)
    return (
      <section className="cw">
        <header className="cw-top">
          <h1 className="section-title gold-text cw-title">
            <GraduationCap aria-hidden="true" /> Уровень {total + 1}
          </h1>
        </header>
        <Divider />
        <div className="cw-stage">
          <p className="act-desc">
            {draft?.cls?.class_name} {(own?.level ?? 0) + 1} уровня.{' '}
            {added.length ? 'Новые умения:' : 'Новых умений на этом уровне нет.'}
          </p>
          {added.length > 0 && <AbilityList refs={added.map((slug) => ({ slug }))} />}
          <p className="cw-field-note">Если умения требуют выбора, он появится плашкой «Требует решения» над листом.</p>
          <button type="button" className="cs-btn cw-next" onClick={() => navigate(`/characters/${character.id}`, { replace: true })}>
            К листу героя
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="cw">
      <header className="cw-top">
        <Link to={`/characters/${character.id}`} className="back-link back-link--btn">
          <ChevronLeft aria-hidden="true" /> к листу
        </Link>
        <h1 className="section-title gold-text cw-title">
          <GraduationCap aria-hidden="true" /> {character.character_name}: уровень {total + 1}
        </h1>
      </header>

      <nav className="cw-rail" aria-label="Шаги повышения">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`cw-rail-step ${i === stepIdx ? 'is-current' : i < stepIdx ? 'is-done' : ''}`}
            onClick={() => i <= stepIdx && go(i)}
            disabled={i > stepIdx}
          >
            <span className="cw-rail-hex">{i + 1}</span>
            <span className="cw-rail-label">{s.label}</span>
          </button>
        ))}
      </nav>

      <Divider />

      <div className="cw-stage">
        {step.id === 'class' && draft && (
          <>
            <p className="act-desc">
              Сейчас: {character.classes.map((c) => `${names.cls(c.class_id)?.class_name ?? 'класс'} ${c.level}`).join(' / ')}. Выберите
              класс, в котором растёт герой, — другой класс будет мультиклассом.
            </p>
            <ClassStep draft={draft} update={(p) => p.cls && pickClass(p.cls)} />
          </>
        )}
        {step.id === 'levelup' && draft && (
          <LevelUpStep
            draft={draft}
            update={update}
            bundle={bundle}
            bundleLoading={bundleLoading}
            subclassFeatures={subclassFeatures}
            granted={[]}
            options={{ characterLevel: total + 1, multiclassEntry, knownSpells, ownSkills, onlyLatest: true }}
          />
        )}
        {step.id === 'spells' && draft && <SpellsStep draft={draft} update={update} granted={[]} />}
        {step.id === 'review' && draft && newLevel && (
          <div className="cw-step lvw-review">
            <h2 className="cw-step-title gold-text">
              {draft.cls?.class_name} {newLevel.level} · уровень героя {total + 1}
            </h2>
            <ul className="lvw-sum">
              <li>
                Хиты: {newLevel.hpMode === 'average' || newLevel.hpRoll == null ? 'среднее' : `бросок ${newLevel.hpRoll}`} + Телосложение
              </li>
              {multiclassEntry && <li>Мультикласс: новый класс героя</li>}
              {draft.subclass && !own?.subclass_id && <li>Подкласс: {draft.subclass.subclass_name}</li>}
              {newLevel.featName && <li>Черта: {newLevel.featName}</li>}
              {Object.entries(newLevel.asi).filter(([, v]) => v).length > 0 && (
                <li>
                  Усиление:{' '}
                  {Object.entries(newLevel.asi)
                    .filter(([, v]) => v)
                    .map(([k, v]) => `${ABILITY_LABELS[k as AbilityName].label} +${v}`)
                    .join(', ')}
                </li>
              )}
              {newLevel.skills.length > 0 && (
                <li>Навыки: {newLevel.skills.map((k) => DEFAULT_SKILLS.find((x) => x.key === k)?.label ?? k).join(', ')}</li>
              )}
              {[...newLevel.cantrips, ...newLevel.spells, ...draft.preparedSpells].length > 0 && (
                <li>
                  Заклинания: {[...newLevel.cantrips, ...newLevel.spells, ...draft.preparedSpells].map((s) => s.spell_name).join(', ')}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {error && <p className="auth-error cw-error">{error}</p>}

      {createPortal(
        <footer className="cw-foot">
          <div className="cw-foot-inner">
            <button type="button" className="cs-btn cs-btn--ghost" onClick={() => go(stepIdx - 1)} disabled={stepIdx === 0 || busy}>
              <ChevronLeft aria-hidden="true" /> Назад
            </button>
            <span className="cw-foot-hint">{!canAdvance && step.id === 'levelup' && 'Примите уровень, чтобы продолжить'}</span>
            {step.id === 'review' ? (
              <button type="button" className="auth-submit cw-create" onClick={() => void submit()} disabled={busy}>
                {busy ? 'Повышаем…' : 'Повысить уровень'}
              </button>
            ) : (
              <button type="button" className="cs-btn cw-next" onClick={() => go(stepIdx + 1)} disabled={!canAdvance || busy}>
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
