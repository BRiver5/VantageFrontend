/**
 * Кубики сайта: 3D-сцена, быстрое меню бросков и связь с остальным кодом
 * (броски листа, комнаты, мастера создания).
 *
 * Меню: наведение на кнопку (на компьютере) или нажатие (на телефоне) плавно
 * раскрывает столбик кубиков. Нажатие на кубик сразу бросает его, меню прячется
 * до конца броска. Справа от кубика выезжает количество, у d20 — преимущество и
 * помеха. На телефоне эта полоска открывается язычком сбоку от кубика.
 *
 * Цвета и громкость настраиваются в профиле.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Ghost, Minus, Plus, ScrollText } from 'lucide-react'
import type DiceBoxType from '@3d-dice/dice-box'
import DiceResultOverlay from './DiceResultOverlay'
import { critClass, DIE_TYPES, type DieResult, type DieType } from './DiceShapeIcons'
import { initDiceAudio, playDropsForRoll } from './diceSounds'
import { getRoomRollHandler, registerDiceRoller, registerForcedRoller, useRoomRollVisibilities, type RoomRollVisibility } from './diceControl'
import { FORCEABLE_SIDES, forcedRollId } from './forcedIds'
import { DieImage } from './diceAssets'
import { useAuth } from '../auth/AuthContext'
import { useAppShell } from '../shell'

type DicePool = Partial<Record<DieType, number>>
type Phase = 'idle' | 'rolling' | 'reveal'
type Mode = 'adv' | 'dis' | null

interface RollHistoryEntry {
  id: number
  formula: string
  dice: DieResult[]
  clash?: { mod: 'adv' | 'dis'; kept: number; dropped: number }
}

const MAX_QTY = 10
const DEFAULT_SCALE = 6
/** цвет корпуса темы: «обычные» кубики */
const THEME_BODY = '#34302a'
/** закрыть меню после ухода курсора не сразу: можно промахнуться на пару пикселей */
const HOVER_CLOSE_MS = 260
/** сверху вниз: d20 ближе всех к кнопке, под рукой */
const MENU_ORDER: DieType[] = [...DIE_TYPES].sort((a, b) => (a === 100 ? -1 : b === 100 ? 1 : a - b))
/** Подписи видимости броска в комнате */
const VIS_LABEL: Record<RoomRollVisibility, string> = {
  public: 'Бросок видят все',
  dm: 'Скрытый бросок: вы и мастер',
  self: 'Скрытый бросок: вы и мастер',
  blind: 'Вслепую: увидит только мастер',
}
const VIS_SHORT: Record<RoomRollVisibility, string> = { public: '', dm: 'скрыто', self: 'скрыто', blind: 'вслепую' }

/** сколько бросков хранит журнал */
const HISTORY_KEEP = 30

function parseSides(s: number | string): number {
  if (typeof s === 'number') return s
  const n = parseInt(String(s).replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? 0 : n
}

const buildRollFormula = (pool: DicePool) =>
  DIE_TYPES.filter((t) => (pool[t] ?? 0) > 0)
    .map((t) => `${pool[t]}d${t}`)
    .join(' + ')

const buildClashFormula = (mod: 'adv' | 'dis') => (mod === 'adv' ? '2d20 (преим.)' : '2d20 (помеха)')

function clashOutcome(dice: DieResult[], mod: 'adv' | 'dis') {
  const a = dice[0].value
  const b = dice[1].value
  const kept = mod === 'adv' ? Math.max(a, b) : Math.min(a, b)
  const dropped = a === kept ? b : a
  return { kept, dropped }
}

const mapRollResults = (raw: { sides: number | string; value: number }[]): DieResult[] => raw.map((d) => ({ sides: parseSides(d.sides), value: d.value }))

/** «Обычные» кубики профиля (или ничего не настроено): корпус темы */
function bodyColorOf(prefs: { body_color: string; accent_color: string; number_color: string } | undefined): string {
  if (!prefs) return THEME_BODY
  const serverDefault = prefs.body_color === '#1a1a2e' && prefs.number_color === '#ffffff' && prefs.accent_color === '#e94560'
  return serverDefault ? THEME_BODY : prefs.body_color
}

/* ---------- кнопка, которую на телефоне можно смахнуть ---------- */

const STASH_KEY = 'vantage-dice-stashed'
/** Сколько пикселей вправо нужно протянуть кнопку, чтобы она спряталась */
const STASH_DISTANCE = 44

function readStashed(): boolean {
  try {
    return localStorage.getItem(STASH_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Кнопка кубика. На телефоне её можно смахнуть за правый край — остаётся
 * маленькая стрелка, которая возвращает кнопку. Выбор переживает перезагрузку.
 */
function StashableFab({ open, busy, onToggle, children }: { open: boolean; busy: boolean; onToggle: () => void; children: ReactNode }) {
  const { app } = useAppShell()
  const [stashed, setStashedState] = useState(readStashed)
  const [dragX, setDragX] = useState<number | null>(null)
  const start = useRef<number | null>(null)
  const swiped = useRef(false)

  const setStashed = (value: boolean) => {
    setStashedState(value)
    try {
      localStorage.setItem(STASH_KEY, value ? '1' : '0')
    } catch {
      /* без хранилища выбор живёт до перезагрузки */
    }
  }

  if (app && stashed) {
    return (
      <button type="button" className="dice-stash-tab" aria-label="Показать кнопку кубика" onClick={() => setStashed(false)}>
        <ChevronLeft aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`dice-fab is-visible${open ? ' is-open' : ''}${busy ? ' is-busy' : ''}${dragX !== null ? ' is-dragging' : ''}`}
      style={dragX ? { transform: `translateX(${dragX}px)`, opacity: Math.max(0.3, 1 - dragX / 90) } : undefined}
      title="Кубики"
      aria-label="Кубики"
      aria-expanded={open}
      onPointerDown={(e) => {
        if (!app) return
        start.current = e.clientX
        swiped.current = false
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (start.current === null) return
        const dx = e.clientX - start.current
        if (Math.abs(dx) > 6) swiped.current = true
        if (swiped.current) setDragX(Math.max(0, dx))
      }}
      onPointerUp={(e) => {
        if (start.current === null) return
        const dx = e.clientX - start.current
        start.current = null
        setDragX(null)
        if (dx >= STASH_DISTANCE) setStashed(true)
      }}
      onPointerCancel={() => {
        start.current = null
        swiped.current = false
        setDragX(null)
      }}
      onClick={() => {
        // жест смахивания не должен открывать меню
        if (swiped.current) {
          swiped.current = false
          return
        }
        onToggle()
      }}
    >
      {children}
    </button>
  )
}

/* ---------- один кубик в меню ---------- */

function DieRow({
  type,
  index,
  count,
  mode,
  active,
  touch,
  disabled,
  onActive,
  onRoll,
  onCount,
  onMode,
}: {
  type: DieType
  index: number
  count: number
  mode: Mode
  active: boolean
  touch: boolean
  disabled: boolean
  onActive: (on: boolean) => void
  onRoll: () => void
  onCount: (n: number) => void
  onMode: (m: Mode) => void
}) {
  const label = mode && type === 20 ? `d20 с ${mode === 'adv' ? 'преимуществом' : 'помехой'}` : `${count}d${type}`
  return (
    <li className={`dq-row${active ? ' is-active' : ''}`} style={{ '--i': index } as CSSProperties} onPointerEnter={touch ? undefined : () => onActive(true)}>
      <button type="button" className="dq-die" disabled={disabled} onClick={onRoll} title={`Бросить ${label}`} aria-label={`Бросить ${label}`}>
        <DieImage type={type} size={30} />
        <i className="dq-die-name">d{type}</i>
      </button>
      {(count > 1 || (type === 20 && mode)) && <em className={`dq-badge${mode && type === 20 ? ` is-${mode}` : ''}`}>{mode && type === 20 ? (mode === 'adv' ? 'П' : 'Пм') : `×${count}`}</em>}
      {touch && (
        <button type="button" className="dq-tab" onClick={() => onActive(!active)} aria-label={`Настроить d${type}`} aria-expanded={active}>
          <ChevronRight aria-hidden="true" />
        </button>
      )}
      <div className="dq-side" aria-hidden={!active}>
        <div className="dq-qty" role="group" aria-label={`Сколько d${type}`}>
          <button type="button" onClick={() => onCount(Math.max(1, count - 1))} disabled={count <= 1 || (type === 20 && !!mode)} tabIndex={active ? 0 : -1} aria-label="Меньше">
            <Minus aria-hidden="true" />
          </button>
          <b>{type === 20 && mode ? 2 : count}</b>
          <button type="button" onClick={() => onCount(Math.min(MAX_QTY, count + 1))} disabled={count >= MAX_QTY || (type === 20 && !!mode)} tabIndex={active ? 0 : -1} aria-label="Больше">
            <Plus aria-hidden="true" />
          </button>
        </div>
        {type === 20 && (
          <div className="dq-mode" role="radiogroup" aria-label="Преимущество или помеха">
            <button type="button" role="radio" aria-checked={mode === 'adv'} className={`is-adv${mode === 'adv' ? ' is-on' : ''}`} tabIndex={active ? 0 : -1} onClick={() => onMode(mode === 'adv' ? null : 'adv')}>
              Преимущество
            </button>
            <button type="button" role="radio" aria-checked={mode === 'dis'} className={`is-dis${mode === 'dis' ? ' is-on' : ''}`} tabIndex={active ? 0 : -1} onClick={() => onMode(mode === 'dis' ? null : 'dis')}>
              Помеха
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/* ---------- всё вместе ---------- */

export default function DiceRoller() {
  const { user } = useAuth()
  const { app, coarse } = useAppShell()
  const touch = app || coarse
  const boxRef = useRef<DiceBoxType | null>(null)
  const initPromise = useRef<Promise<void> | null>(null)
  const diceClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyId = useRef(0)
  const lastPool = useRef<DicePool>({})
  const dockRef = useRef<HTMLDivElement | null>(null)

  const [menu, setMenu] = useState(false)
  const [journal, setJournal] = useState(false)
  const [activeDie, setActiveDie] = useState<DieType | null>(null)
  const [counts, setCounts] = useState<Record<DieType, number>>(() => Object.fromEntries(DIE_TYPES.map((t) => [t, 1])) as Record<DieType, number>)
  const [mode, setMode] = useState<Mode>(null)
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [rollResults, setRollResults] = useState<DieResult[]>([])
  const [history, setHistory] = useState<RollHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  // в комнате бросок можно сделать скрытым: «всем» → доступные скрытые режимы по кругу
  const hiddenModes = useRoomRollVisibilities()
  const [vis, setVis] = useState<RoomRollVisibility>('public')
  const visNow: RoomRollVisibility = vis !== 'public' && !hiddenModes.includes(vis) ? 'public' : vis
  const visCycle: RoomRollVisibility[] = ['public', ...hiddenModes]
  const nextVis = () => setVis(visCycle[(visCycle.indexOf(visNow) + 1) % visCycle.length])
  const [revealClash, setRevealClash] = useState<'adv' | 'dis' | null>(null)
  // бросок из кода (лист, комната): сцена видна, но оверлей результата не нужен
  const [externalActive, setExternalActive] = useState(false)

  const prefDice = user?.preferences?.dice
  const bodyColor = bodyColorOf(prefDice)
  const colorRef = useRef(bodyColor)
  colorRef.current = bodyColor

  // цвета профиля: цифры и отблеск — у материалов, корпус — цвет каждого броска
  useEffect(() => {
    if (!prefDice) return
    void import('./diceStyle').then(({ applyDiceStyle }) => applyDiceStyle(prefDice))
  }, [prefDice])

  const clearDiceTimer = useCallback(() => {
    if (diceClearTimer.current) {
      clearTimeout(diceClearTimer.current)
      diceClearTimer.current = null
    }
  }, [])

  const clear3DDice = useCallback(() => {
    clearDiceTimer()
    boxRef.current?.clear()
    setExternalActive(false)
  }, [clearDiceTimer])

  // бокс поднимается по первому открытию меню или по первому броску из кода
  const ensureBox = useCallback(() => {
    if (initPromise.current) return initPromise.current
    initPromise.current = (async () => {
      const { default: DiceBox } = await import('@3d-dice/dice-box')
      // перехват чтения граней: кубики комнат падают на значения сервера
      const { installForcedFaces } = await import('./forcedFaces')
      installForcedFaces()
      // сцена нужна, чтобы перекрасить цифры и отблеск под профиль
      const { hookDiceScene } = await import('./diceStyle')
      hookDiceScene()
      const box = new DiceBox({
        // перехват работает, только пока сцена в основном потоке (в воркере код вшит строкой)
        offscreen: false,
        container: '#dice-box-stage',
        assetPath: '/assets/',
        theme: 'vantage',
        // themeColor берётся из КОНФИГА бокса (не из theme.config.json), иначе зелёный
        themeColor: THEME_BODY,
        scale: DEFAULT_SCALE,
        gravity: 1,
        throwForce: 6,
        spinForce: 6,
        settleTimeout: 6000,
      })
      await box.init()
      boxRef.current = box
      setReady(true)
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return initPromise.current
  }, [])

  useEffect(() => {
    if (menu) void ensureBox()
  }, [menu, ensureBox])

  // бросок из кода: лист героя, мастер создания
  useEffect(
    () =>
      registerDiceRoller(async (notation) => {
        await ensureBox()
        const box = boxRef.current
        if (!box) throw new Error('Кости недоступны')
        const count = parseInt(notation, 10) || 1
        initDiceAudio()
        playDropsForRoll(count)
        clear3DDice()
        setExternalActive(true)
        try {
          await box.updateConfig({ scale: DEFAULT_SCALE })
          const results = await box.roll(notation, { themeColor: colorRef.current })
          return results.map((r) => r.value)
        } finally {
          // кости задерживаются на сцене, чтобы игрок увидел грани
          diceClearTimer.current = setTimeout(() => {
            boxRef.current?.clear()
            setExternalActive(false)
            diceClearTimer.current = null
          }, 4000)
        }
      }),
    [ensureBox, clear3DDice],
  )

  // бросок с заранее известными значениями (комнаты): кубики падают на значения сервера
  const forcedSeed = useRef(0)
  useEffect(
    () =>
      registerForcedRoller(async ({ dice, themeColor }) => {
        await ensureBox()
        const box = boxRef.current
        if (!box) throw new Error('Кости недоступны')
        const seed = ++forcedSeed.current
        initDiceAudio()
        playDropsForRoll(dice.length)
        clear3DDice()
        setExternalActive(true)
        try {
          const scale = dice.length <= 10 ? DEFAULT_SCALE : Math.max(3, DEFAULT_SCALE * Math.sqrt(10 / dice.length))
          await box.updateConfig({ scale })
          const notation = dice.map((d, i) => ({
            qty: 1,
            sides: d.sides,
            ...(FORCEABLE_SIDES.has(d.sides) ? { rollId: forcedRollId(d.value, `${seed}x${i}`) } : {}),
            ...(d.color ? { themeColor: d.color } : {}),
          }))
          // сколько тел создаст библиотека: d100 — это две кости
          const { armForcedReplay } = await import('./forcedFaces')
          armForcedReplay(dice.reduce((n, d) => n + (d.sides === 100 ? 2 : 1), 0))
          const results = await box.roll(notation, { themeColor: themeColor || colorRef.current })
          return results.map((r) => r.value)
        } finally {
          diceClearTimer.current = setTimeout(() => {
            boxRef.current?.clear()
            setExternalActive(false)
            diceClearTimer.current = null
          }, 4000)
        }
      }),
    [ensureBox, clear3DDice],
  )

  useEffect(() => () => clearDiceTimer(), [clearDiceTimer])

  /* ---------- меню ---------- */

  const openMenu = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    initDiceAudio()
    setMenu(true)
  }, [])
  const closeMenu = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setMenu(false)
    setActiveDie(null)
  }, [])

  // на телефоне меню закрывается нажатием мимо
  useEffect(() => {
    if (!menu || !touch) return
    const onDown = (e: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menu, touch, closeMenu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu, closeMenu])

  /* ---------- броски из меню ---------- */

  // в комнате кости бросает сервер: меню только отправляет бросок
  const roomBusy = useRef(false)
  const rollInRoom = async (expression: string, label: string, m: Mode) => {
    const handler = getRoomRollHandler()
    if (!handler || roomBusy.current) return
    roomBusy.current = true
    setError(null)
    initDiceAudio()
    try {
      await handler({ expression, label, mode: m, visibility: visNow })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      roomBusy.current = false
    }
  }

  const rollD20Mod = async (m: 'adv' | 'dis') => {
    if (getRoomRollHandler()) return void rollInRoom('1d20', m === 'adv' ? 'к20 с преимуществом' : 'к20 с помехой', m)
    await ensureBox()
    const box = boxRef.current
    if (!box || phase === 'rolling') return
    initDiceAudio()
    playDropsForRoll(2)
    clear3DDice()
    setPhase('rolling')
    setError(null)
    setRollResults([])
    setRevealClash(m)
    try {
      await box.updateConfig({ scale: DEFAULT_SCALE })
      const dice = await box.roll('2d20', { themeColor: colorRef.current }).then(mapRollResults)
      setRollResults(dice)
      setPhase('reveal')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
      setRevealClash(null)
    }
  }

  const rollPool = async (pool: DicePool) => {
    const active = DIE_TYPES.filter((t) => (pool[t] ?? 0) > 0)
    if (active.length === 0) return
    if (getRoomRollHandler()) return void rollInRoom(active.map((t) => `${pool[t]}d${t}`).join('+'), 'Бросок', null)
    await ensureBox()
    const box = boxRef.current
    if (!box || phase === 'rolling') return
    const totalDice = active.reduce((n, t) => n + (pool[t] ?? 0), 0)
    initDiceAudio()
    playDropsForRoll(totalDice)
    clear3DDice()
    lastPool.current = pool
    setPhase('rolling')
    setError(null)
    setRollResults([])
    setRevealClash(null)
    // при большом числе костей уменьшаем, чтобы влезли в кадр
    const scale = totalDice <= 10 ? DEFAULT_SCALE : Math.max(3, DEFAULT_SCALE * Math.sqrt(10 / totalDice))
    try {
      await box.updateConfig({ scale })
      const dice = await box.roll(active.map((t) => `${pool[t]}d${t}`), { themeColor: colorRef.current }).then(mapRollResults)
      setRollResults(dice)
      setPhase('reveal')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  /** Нажали на кубик: бросаем, а меню прячется на время броска */
  const rollDie = (type: DieType) => {
    closeMenu()
    if (type === 20 && mode) {
      const m = mode
      setMode(null)
      void rollD20Mod(m)
      return
    }
    void rollPool({ [type]: counts[type] })
  }

  const closeReveal = useCallback(() => {
    if (rollResults.length > 0) {
      if (revealClash && rollResults.length === 2) {
        const { kept, dropped } = clashOutcome(rollResults, revealClash)
        setHistory((h) => [...h, { id: ++historyId.current, formula: buildClashFormula(revealClash), dice: [{ sides: 20, value: kept }], clash: { mod: revealClash, kept, dropped } }])
      } else {
        setHistory((h) => [...h, { id: ++historyId.current, formula: buildRollFormula(lastPool.current), dice: rollResults }])
      }
    }
    setPhase('idle')
    setRollResults([])
    setRevealClash(null)
    clearDiceTimer()
    diceClearTimer.current = setTimeout(() => {
      boxRef.current?.clear()
      diceClearTimer.current = null
    }, 5000)
  }, [rollResults, revealClash, clearDiceTimer])

  const busy = phase !== 'idle'
  const recent = history.slice(-HISTORY_KEEP).reverse()

  return (
    <>
      <div id="dice-box-stage" className={`dice-stage${phase !== 'idle' || externalActive ? ' is-active' : ''}`} aria-hidden={phase === 'idle' && !externalActive} />

      {phase === 'reveal' && rollResults.length > 0 && <DiceResultOverlay dice={rollResults} clash={revealClash} onClose={closeReveal} />}

      <div
        ref={dockRef}
        className={`dice-dock dq${menu && !busy ? ' is-open' : ''}${menu && !ready ? ' is-loading' : ''}`}
        onPointerOver={touch ? undefined : (e) => !busy && !menu && !(e.target as Element).closest('.dq-journal') && openMenu()}
        onPointerLeave={
          touch
            ? undefined
            : () => {
                if (hoverTimer.current) clearTimeout(hoverTimer.current)
                hoverTimer.current = setTimeout(closeMenu, HOVER_CLOSE_MS)
              }
        }
      >
        <div className="dq-menu" aria-hidden={!menu || busy} onPointerLeave={touch ? undefined : () => setActiveDie(null)}>
          <ul className="dq-list" role="menu" aria-label="Бросить кубик">
            {MENU_ORDER.map((type, i) => (
              <DieRow
                key={type}
                type={type}
                index={i}
                count={counts[type]}
                mode={type === 20 ? mode : null}
                active={activeDie === type}
                touch={touch}
                disabled={busy}
                onActive={(on) => setActiveDie(on ? type : null)}
                onRoll={() => rollDie(type)}
                onCount={(n) => setCounts((c) => ({ ...c, [type]: n }))}
                onMode={setMode}
              />
            ))}
          </ul>
          {error && <p className="dq-error">{error}</p>}
        </div>

        <div className={`dice-action-bar${visNow !== 'public' ? ' is-secret' : ''}`}>
          <StashableFab open={menu && !busy} busy={busy} onToggle={() => (menu ? closeMenu() : openMenu())}>
            <DieImage type={20} size={30} className="die-fab-icon" />
          </StashableFab>
          {hiddenModes.length > 0 && (
            <button
              type="button"
              className={`dq-vis${visNow !== 'public' ? ' is-on' : ''}`}
              onClick={nextVis}
              onPointerEnter={(e) => e.stopPropagation()}
              aria-label={`Кто увидит бросок: ${VIS_LABEL[visNow]}. Нажмите, чтобы сменить`}
              title={VIS_LABEL[visNow]}
            >
              {visNow === 'public' ? <Eye aria-hidden="true" /> : visNow === 'blind' ? <Ghost aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              {visNow !== 'public' && <span>{VIS_SHORT[visNow]}</span>}
            </button>
          )}
          {history.length > 0 && (
            <div className="dq-journal">
              <button type="button" className={`dq-journal-btn${journal ? ' is-on' : ''}`} onClick={() => setJournal((v) => !v)} aria-expanded={journal} aria-label="Журнал бросков" title="Журнал бросков">
                <ScrollText aria-hidden="true" />
                <em>{history.length}</em>
              </button>
              {journal && (
                <ol className="dq-history" aria-label="Журнал бросков">
                  {recent.map((entry) => {
                    const total = entry.dice.reduce((sum, d) => sum + d.value, 0)
                    const many = !entry.clash && entry.dice.length > 1
                    const calc = many || !!entry.clash
                    return (
                      <li key={entry.id} tabIndex={calc ? 0 : undefined} className={calc ? 'has-calc' : ''}>
                        <i>{entry.formula}</i>
                        <b className={entry.dice.length === 1 ? critClass(entry.dice[0]) : ''}>{entry.clash ? entry.clash.kept : total}</b>
                        {calc && (
                          <span className="dq-calc" role="tooltip">
                            {entry.clash
                              ? `${entry.clash.kept} и ${entry.clash.dropped}: берём ${entry.clash.mod === 'adv' ? 'больший' : 'меньший'}`
                              : `${entry.dice.map((d) => d.value).join(' + ')} = ${total}`}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
