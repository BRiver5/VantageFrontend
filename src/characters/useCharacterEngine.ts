/**
 * Сохранённый герой целиком: документ v2 и вычисленный лист сервера.
 *
 * Документ (выбор игрока: инвентарь, записи, кошелёк) правится обычным PATCH
 * с небольшой задержкой. Всё игровое — действия способностей, отдых, ход,
 * уровень, решения, отмена — выполняет сервер и возвращает новый лист; клиент
 * его только заменяет. Если ревизию персонажа успели поменять с другого
 * устройства (409), лист перезапрашивается и действие предлагается повторить.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  applyVitals,
  spendResource,
  dismissPending,
  getCharacter,
  getSheet,
  patchStore,
  rest as apiRest,
  runAction,
  resolvePending,
  sendEvent,
  toggleAbility,
  undoEvent,
  updateCharacter,
  type TurnEvent,
  type VitalsOp,
} from '../api'
import type {
  Character,
  CharacterInput,
  LogEntry,
  Prompt,
  RunInputs,
  RunResult,
  Sheet,
} from '../types/character'

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/** Поля документа, от которых лист не зависит: после них лист не перезапрашиваем */
const TEXT_FIELDS = new Set<keyof Character>([
  'personality',
  'backstory',
  'notes',
  'appearance',
  'gender',
  'age',
  'height',
  'weight',
  'eyes',
  'skin',
  'hair',
  'avatar_url',
  'visibility',
  'player_display_name',
  'attacks',
  'spells',
])

const SAVE_DELAY = 700

const VITALS_TITLE: Record<VitalsOp, string> = {
  damage: 'Урон',
  heal: 'Лечение',
  temp: 'Временные хиты',
  inspiration: 'Вдохновение',
  death_save: 'Спасброски от смерти',
}

/** Действие с поп-апами: запрос повторяется целиком с накопленными ответами */
export interface Flow {
  title: string
  run: (inputs: RunInputs) => Promise<RunResult>
  inputs: RunInputs
  prompt: Prompt | null
  errors: Record<string, string> | null
  /** rejected / error — текст для игрока */
  message: string | null
  busy: boolean
  /** после completed — например, сбросить отметки «до отдыха» в документе */
  onDone?: () => void
}

/** Итог действия для тоста и истории бросков */
export interface Outcome {
  id: number
  title: string
  log: LogEntry[]
  eventId: string | null
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка сервера')

export function useCharacterEngine(id: string | undefined) {
  const [character, setCharacter] = useState<Character | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flow, setFlow] = useState<Flow | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  /** персонажа изменили в другом месте — лист обновлён, действие нужно повторить */
  const [conflict, setConflict] = useState<string | null>(null)
  /** ошибка игрового запроса (отдых, ход, уровень) — короткой плашкой */
  const [notice, setNotice] = useState<string | null>(null)

  const latest = useRef<Character | null>(null)
  latest.current = character
  // правки документа, ещё не ушедшие на сервер
  const pendingPatch = useRef<CharacterInput>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    const [c, s] = await Promise.all([getCharacter(id), getSheet(id)])
    setCharacter(c)
    setSheet(s)
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadError(null)
    setCharacter(null)
    setSheet(null)
    Promise.all([getCharacter(id), getSheet(id)])
      .then(([c, s]) => {
        if (cancelled) return
        setCharacter(c)
        setSheet(s)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(errorText(e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  /** Новый лист с сервера; ревизия документа идёт за ним */
  const applySheet = useCallback((s: Sheet) => {
    setSheet(s)
    setCharacter((c) => (c ? { ...c, revision: s.revision, pending_decisions: s.pending_decisions } : c))
  }, [])

  /** 409 — лист устарел: перечитываем и просим повторить */
  const onConflict = useCallback(async () => {
    setConflict('Персонажа изменили на другом устройстве или мастер — лист обновлён. Повторите действие.')
    try {
      await reload()
    } catch {
      /* останется старый лист и плашка */
    }
  }, [reload])

  /* ---------- документ: PATCH с задержкой ---------- */

  const flush = useCallback(async () => {
    const c = latest.current
    const body = pendingPatch.current
    if (!c || Object.keys(body).length === 0) return
    pendingPatch.current = {}
    setSaveState('saving')
    setSaveError(null)
    try {
      const saved = await updateCharacter(c.id, body)
      // правки, сделанные пока шёл запрос, поверх ответа
      setCharacter({ ...saved, ...pendingPatch.current } as Character)
      setSaveState(Object.keys(pendingPatch.current).length ? 'pending' : 'saved')
      if (Object.keys(body).some((k) => !TEXT_FIELDS.has(k as keyof Character))) {
        setSheet(await getSheet(c.id))
      }
    } catch (e) {
      pendingPatch.current = { ...body, ...pendingPatch.current }
      if (e instanceof ApiError && e.status === 409) {
        pendingPatch.current = {}
        setSaveState('idle')
        void onConflict()
        return
      }
      setSaveState('error')
      setSaveError(errorText(e))
    }
  }, [onConflict])

  /** Правка документа: сразу в состоянии, на сервер — с задержкой одним PATCH */
  const patchDoc = useCallback(
    (fn: (c: Character) => CharacterInput) => {
      const prev = latest.current
      if (!prev) return
      const patch = fn(prev)
      const next = { ...prev, ...patch } as Character
      latest.current = next
      setCharacter(next)
      pendingPatch.current = { ...pendingPatch.current, ...patch }
      setSaveState('pending')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flush(), SAVE_DELAY)
    },
    [flush],
  )

  // уход со страницы не теряет последнюю правку
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendingPatch.current).length) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const c = latest.current
      if (c && Object.keys(pendingPatch.current).length) void updateCharacter(c.id, pendingPatch.current).catch(() => {})
    }
  }, [])

  /* ---------- цикл действия с поп-апами ---------- */

  const finish = useCallback(
    (title: string, res: RunResult) => {
      if (res.sheet) applySheet(res.sheet)
      setOutcome((o) => ({ id: (o?.id ?? 0) + 1, title, log: res.log ?? [], eventId: res.event_id ?? null }))
    },
    [applySheet],
  )

  /** Шаг цикла: шлём все собранные ответы, сервер просит следующий поп-ап или выполняет */
  const step = useCallback(
    async (f: Flow, inputs: RunInputs) => {
      setFlow({ ...f, inputs, busy: true, message: null })
      try {
        const res = await f.run(inputs)
        switch (res.status) {
          case 'completed':
            setFlow(null)
            finish(f.title, res)
            f.onDone?.()
            return
          case 'needs_input':
            setFlow({ ...f, inputs, prompt: res.prompt ?? null, errors: null, message: null, busy: false })
            return
          case 'invalid':
            setFlow({ ...f, inputs, prompt: res.prompt ?? f.prompt, errors: res.errors ?? null, message: res.message ?? null, busy: false })
            return
          default:
            // rejected — правило запретило; error — сбой в самой способности
            setFlow({ ...f, inputs, busy: false, errors: null, message: res.message ?? 'Действие не выполнено' })
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setFlow(null)
          void onConflict()
          return
        }
        setFlow({ ...f, inputs, busy: false, message: errorText(e) })
      }
    },
    [finish, onConflict],
  )

  const startFlow = useCallback(
    (title: string, run: (inputs: RunInputs) => Promise<RunResult>, onDone?: () => void) => {
      setConflict(null)
      void step({ title, run, onDone, inputs: {}, prompt: null, errors: null, message: null, busy: true }, {})
    },
    [step],
  )

  /** Ответ на текущий поп-ап — добавляется к прежним, запрос повторяется целиком */
  const answer = useCallback(
    (values: Record<string, unknown>) => {
      if (!flow?.prompt) return
      void step(flow, { ...flow.inputs, [flow.prompt.key]: values })
    },
    [flow, step],
  )

  const closeFlow = useCallback(() => setFlow(null), [])

  /* ---------- игровые операции ---------- */

  /** Запрос без поп-апов: лист в ответе или в поле sheet */
  const simple = useCallback(
    async <T,>(fn: () => Promise<T>, onDone: (res: T) => void) => {
      setBusy(true)
      setConflict(null)
      setNotice(null)
      try {
        onDone(await fn())
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) void onConflict()
        else setNotice(errorText(e))
      } finally {
        setBusy(false)
      }
    },
    [onConflict],
  )

  const cid = character?.id ?? ''

  const action = useCallback(
    (grantId: string, key: string, title: string) => startFlow(title, (inputs) => runAction(cid, grantId, key, inputs)),
    [cid, startFlow],
  )

  const decide = useCallback(
    (decisionId: string, title: string) => startFlow(title, (inputs) => resolvePending(cid, decisionId, inputs)),
    [cid, startFlow],
  )

  /** Отдых и события хода — тот же ответ, что у действия; поп-апов обычно нет, но цикл их выдержит */
  const longRest = useCallback(
    (onDone?: () => void) => startFlow('Продолжительный отдых', () => apiRest(cid, 'long'), onDone),
    [cid, startFlow],
  )
  const shortRest = useCallback(
    (hitDice: Record<string, number>) => startFlow('Короткий отдых', () => apiRest(cid, 'short', hitDice)),
    [cid, startFlow],
  )
  const turn = useCallback(
    (name: TurnEvent, title: string) => startFlow(title, () => sendEvent(cid, name)),
    [cid, startFlow],
  )

  /** Хиты, вдохновение, спасброски от смерти — через движок, с журналом и отменой */
  const vitals = useCallback(
    (op: VitalsOp, amount: number, opts: { damageType?: string | null; success?: boolean; title?: string } = {}) =>
      startFlow(opts.title ?? VITALS_TITLE[op], () =>
        applyVitals(cid, { op, amount, damage_type: opts.damageType ?? null, success: opts.success ?? true }),
      ),
    [cid, startFlow],
  )

  /**
   * Реакция после броска тратит ресурс (кость превосходства, Везунчик): тихо,
   * без тоста и поп-апа — кость бросает театр броска. false — не хватило.
   */
  const spend = useCallback(
    async (key: string, amount = 1, reason?: string): Promise<boolean> => {
      try {
        const res = await spendResource(cid, key, { amount, reason })
        if (res.status === 'completed') {
          if (res.sheet) applySheet(res.sheet)
          return true
        }
        setNotice(res.message ?? 'Ресурс не списан')
        return false
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) void onConflict()
        else setNotice(errorText(e))
        return false
      }
    },
    [cid, applySheet, onConflict],
  )

  const dismiss = useCallback(
    (decisionId: string) => simple(() => dismissPending(cid, decisionId), applySheet),
    [cid, simple, applySheet],
  )

  const toggle = useCallback(
    (grantId: string, enabled: boolean) => simple(() => toggleAbility(cid, grantId, enabled), applySheet),
    [cid, simple, applySheet],
  )

  const undo = useCallback(
    (eventId: string) =>
      simple(
        () => undoEvent(cid, eventId),
        (s) => {
          applySheet(s)
          setOutcome(null)
        },
      ),
    [cid, simple, applySheet],
  )

  /** Правка мастера (только админ): хранимые значения листа */
  const master = useCallback(
    (set: Record<string, unknown>) => simple(() => patchStore(cid, { set }), applySheet),
    [cid, simple, applySheet],
  )

  /** Оверрайд вычисляемых чисел (КД, мастерство, максимум хитов); null снимает */
  const override = useCallback(
    (overrides: Record<string, unknown>) =>
      simple(
        () => patchStore(cid, { overrides }),
        (s) => {
          applySheet(s)
          setCharacter((c) => {
            if (!c) return c
            const next = { ...c.manual_overrides }
            for (const [k, v] of Object.entries(overrides)) {
              if (v == null) delete next[k]
              else next[k] = v
            }
            return { ...c, revision: s.revision, manual_overrides: next }
          })
        },
      ),
    [cid, simple, applySheet],
  )

  return {
    character,
    sheet,
    loadError,
    saveState,
    saveError,
    busy: busy || !!flow?.busy,
    flow,
    outcome,
    conflict,
    notice,
    dismissNotice: () => {
      setNotice(null)
      setConflict(null)
    },
    clearOutcome: () => setOutcome(null),
    retrySave: flush,
    reload,
    patchDoc,
    action,
    decide,
    answer,
    closeFlow,
    longRest,
    shortRest,
    turn,
    dismiss,
    toggle,
    undo,
    master,
    override,
    vitals,
    spend,
  }
}

export type CharacterEngine = ReturnType<typeof useCharacterEngine>
