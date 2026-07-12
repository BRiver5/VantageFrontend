import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import type DiceBoxType from '@3d-dice/dice-box'
import DiceResultOverlay from './DiceResultOverlay'
import { critClass, DIE_TYPES, DiceShapeIcon, type DieResult, type DieType } from './DiceShapeIcons'
import DiceD20Mod from './DiceD20Mod'
import { initDiceAudio, playDiceLand, playDiceThrow } from './diceSounds'
import { DieImage } from './diceAssets'

type DicePool = Record<DieType, number>
type DieColors = Record<DieType, string>
type Phase = 'idle' | 'rolling' | 'reveal'

interface RollHistoryEntry {
  id: number
  formula: string
  dice: DieResult[]
  clash?: { mod: 'adv' | 'dis'; kept: number; dropped: number }
}

const MAX_QTY = 10
const MAX_FAVORITES = 5
const FAV_KEY = 'vantage-dice-favorites'
const DEFAULT_SCALE = 6

// стартовые «избранные» расцветки корпуса (цифры всегда золотые из текстуры)
const DEFAULT_FAVORITES = ['#34302a', '#792c22', '#1e5b4f', '#2a3f74', '#4a2f6b']

// палитра для быстрого добавления в избранное
const PRESET_COLORS = [
  '#34302a', '#111318', '#792c22', '#b0451f', '#5a3a1c',
  '#1e5b4f', '#2f6d34', '#2a3f74', '#123f5c', '#4a2f6b',
  '#7a2f5c', '#8a1f2f', '#3a3d44', '#b0b6bf',
]

const EMPTY_POOL = Object.fromEntries(DIE_TYPES.map((t) => [t, 0])) as DicePool

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) return arr.slice(0, MAX_FAVORITES)
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_FAVORITES
}

function parseSides(s: number | string): number {
  if (typeof s === 'number') return s
  const n = parseInt(String(s).replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? 0 : n
}

function buildRollFormula(pool: DicePool): string {
  return DIE_TYPES.filter((t) => pool[t] > 0)
    .map((t) => `${pool[t]}d${t}`)
    .join(' + ')
}

function buildClashFormula(mod: 'adv' | 'dis'): string {
  return mod === 'adv' ? '2d20 (преим.)' : '2d20 (помеха)'
}

function clashOutcome(dice: DieResult[], mod: 'adv' | 'dis') {
  const a = dice[0].value
  const b = dice[1].value
  const kept = mod === 'adv' ? Math.max(a, b) : Math.min(a, b)
  const dropped = a === kept ? b : a
  return { kept, dropped }
}

function mapRollResults(raw: { sides: number | string; value: number }[]): DieResult[] {
  return raw.map((d) => ({ sides: parseSides(d.sides), value: d.value }))
}

const HISTORY_ANIM_MS = 1200

function easeHistory(t: number): number {
  return 1 - (1 - t) ** 2.4
}

function animateHistoryScroll(el: HTMLElement, to: number, duration: number) {
  const from = el.scrollTop
  const delta = to - from
  if (Math.abs(delta) < 0.5) return
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    el.scrollTop = from + delta * easeHistory(t)
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export default function DiceRoller() {
  const boxRef = useRef<DiceBoxType | null>(null)
  const initPromise = useRef<Promise<void> | null>(null)
  const diceClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const historyId = useRef(0)
  const prevHistoryRects = useRef<Map<number, DOMRect>>(new Map())
  const historyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dockCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trayClusterRef = useRef<HTMLDivElement | null>(null)
  const d20RowRef = useRef<HTMLDivElement | null>(null)

  const [open, setOpen] = useState(false)
  const [dockUi, setDockUi] = useState<'off' | 'on' | 'hiding'>('off')
  const [dockTrayShown, setDockTrayShown] = useState(false)
  const [fabShown, setFabShown] = useState(true)
  const prevDockUi = useRef<'off' | 'on' | 'hiding'>('off')
  const [historyUi, setHistoryUi] = useState<'off' | 'on' | 'hiding'>('off')
  const [historyPanelShown, setHistoryPanelShown] = useState(false)
  const [ready, setReady] = useState(false)
  const [pool, setPool] = useState<DicePool>({ ...EMPTY_POOL })
  const [phase, setPhase] = useState<Phase>('idle')
  const [rollResults, setRollResults] = useState<DieResult[]>([])
  const [history, setHistory] = useState<RollHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const [favorites, setFavorites] = useState<string[]>(loadFavorites)
  const [dieColors, setDieColors] = useState<DieColors>(
    () => Object.fromEntries(DIE_TYPES.map((t) => [t, DEFAULT_FAVORITES[0]])) as DieColors,
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [draftColor, setDraftColor] = useState('#c49a3c')
  const [d20ModOpen, setD20ModOpen] = useState(false)
  const [d20ModTop, setD20ModTop] = useState(0)
  const [revealClash, setRevealClash] = useState<'adv' | 'dis' | null>(null)

  const hasDice = DIE_TYPES.some((t) => pool[t] > 0)
  const hideTrayOnMobile = phase === 'rolling' || phase === 'reveal'

  const showHistoryPanel = history.length > 0 && historyUi !== 'off'
  const showDockTray = dockUi !== 'off'
  const showOpenControls = dockUi === 'on' || dockUi === 'hiding'

  const beginHistoryHide = useCallback(() => {
    if (historyCloseTimer.current) {
      clearTimeout(historyCloseTimer.current)
      historyCloseTimer.current = null
    }
    if (history.length === 0) {
      setHistoryUi('off')
      return
    }
    setHistoryUi('hiding')
    historyCloseTimer.current = setTimeout(() => {
      setHistoryUi('off')
      historyCloseTimer.current = null
    }, HISTORY_ANIM_MS)
  }, [history.length])

  const beginHistoryShow = useCallback(() => {
    if (historyCloseTimer.current) {
      clearTimeout(historyCloseTimer.current)
      historyCloseTimer.current = null
    }
    if (history.length > 0) setHistoryUi('on')
  }, [history.length])

  // открытие дока — плавно показать лоток и историю
  useEffect(() => {
    if (!open) return
    if (dockCloseTimer.current) {
      clearTimeout(dockCloseTimer.current)
      dockCloseTimer.current = null
    }
    setDockUi('on')
    beginHistoryShow()
  }, [open, beginHistoryShow])

  // первый бросок при открытом доке
  useEffect(() => {
    if (open && history.length > 0 && historyUi === 'off') beginHistoryShow()
  }, [open, history.length, historyUi, beginHistoryShow])

  // плавное появление лотка
  useEffect(() => {
    if (dockUi === 'on') {
      setDockTrayShown(false)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setDockTrayShown(true))
      })
      return () => cancelAnimationFrame(id)
    }
    setDockTrayShown(false)
  }, [dockUi])

  // плавное появление FAB после закрытия меню
  useEffect(() => {
    if (dockUi === 'off' && prevDockUi.current === 'hiding') {
      setFabShown(false)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setFabShown(true))
      })
      prevDockUi.current = dockUi
      return () => cancelAnimationFrame(id)
    }
    prevDockUi.current = dockUi
  }, [dockUi])

  // плавное появление истории
  useEffect(() => {
    if (historyUi === 'on') {
      setHistoryPanelShown(false)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setHistoryPanelShown(true))
      })
      return () => cancelAnimationFrame(id)
    }
    setHistoryPanelShown(false)
  }, [historyUi])

  useEffect(() => () => {
    if (historyCloseTimer.current) clearTimeout(historyCloseTimer.current)
    if (dockCloseTimer.current) clearTimeout(dockCloseTimer.current)
  }, [])

  // сохраняем избранное
  useEffect(() => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(favorites))
    } catch {
      /* ignore */
    }
  }, [favorites])

  // если цвет кости выпал из избранного (удалили) — откатываем на первый избранный
  useEffect(() => {
    setDieColors((prev) => {
      let changed = false
      const next = { ...prev }
      for (const t of DIE_TYPES) {
        if (!favorites.includes(next[t])) {
          next[t] = favorites[0]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [favorites])

  const clearDiceTimer = useCallback(() => {
    if (diceClearTimer.current) {
      clearTimeout(diceClearTimer.current)
      diceClearTimer.current = null
    }
  }, [])

  const clear3DDice = useCallback(() => {
    clearDiceTimer()
    boxRef.current?.clear()
  }, [clearDiceTimer])

  useEffect(() => {
    if (!open || initPromise.current) return
    initPromise.current = (async () => {
      const { default: DiceBox } = await import('@3d-dice/dice-box')
      const box = new DiceBox({
        container: '#dice-box-stage',
        assetPath: '/assets/',
        // тема vantage: палитра PNG перекрашена — цифры золотые, корпус = themeColor
        theme: 'vantage',
        // themeColor берётся из КОНФИГА бокса (не из theme.config.json), иначе зелёный
        themeColor: DEFAULT_FAVORITES[0],
        scale: DEFAULT_SCALE,
        gravity: 1,
        throwForce: 6,
        spinForce: 6,
        settleTimeout: 6000,
      })
      await box.init()
      box.onDieComplete = (die) => playDiceLand(parseSides(die.sides))
      boxRef.current = box
      setReady(true)
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [open])

  useLayoutEffect(() => {
    const el = historyRef.current
    if (!el) return

    const prev = prevHistoryRects.current
    el.querySelectorAll<HTMLElement>('.dice-history-card').forEach((card) => {
      const id = Number(card.dataset.entryId)
      const oldRect = prev.get(id)
      if (!oldRect) return
      const newRect = card.getBoundingClientRect()
      const dy = oldRect.top - newRect.top
      if (Math.abs(dy) < 0.5) return

      card.classList.remove('is-shifting')
      card.style.transform = `translateY(${dy}px)`
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          card.classList.add('is-shifting')
          card.style.transform = 'translateY(0)'
          const clear = () => {
            card.classList.remove('is-shifting')
            card.style.transform = ''
            card.removeEventListener('transitionend', clear)
          }
          card.addEventListener('transitionend', clear)
        })
      })
    })
    prevHistoryRects.current = new Map()

    animateHistoryScroll(el, el.scrollHeight - el.clientHeight, HISTORY_ANIM_MS)
  }, [history])

  const syncD20ModPosition = useCallback(() => {
    const cluster = trayClusterRef.current
    const row = d20RowRef.current
    if (!cluster || !row) return
    const clusterRect = cluster.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    setD20ModTop(rowRect.top - clusterRect.top + (rowRect.height - 24) / 2)
  }, [])

  useLayoutEffect(() => {
    if (!showDockTray) return
    syncD20ModPosition()
    const cluster = trayClusterRef.current
    if (!cluster) return
    const ro = new ResizeObserver(syncD20ModPosition)
    ro.observe(cluster)
    return () => ro.disconnect()
  }, [showDockTray, paletteOpen, dockTrayShown, syncD20ModPosition])

  useEffect(() => () => clearDiceTimer(), [clearDiceTimer])

  const adjustQty = (type: DieType, delta: number) => {
    setPool((prev) => ({
      ...prev,
      [type]: Math.max(0, Math.min(MAX_QTY, prev[type] + delta)),
    }))
  }

  // клик по цветному чипу кости — следующий избранный цвет
  const cycleDieColor = (type: DieType) => {
    setDieColors((prev) => {
      if (favorites.length === 0) return prev
      const idx = favorites.indexOf(prev[type])
      const next = favorites[(idx + 1) % favorites.length] ?? favorites[0]
      return { ...prev, [type]: next }
    })
  }

  const addFavorite = (color: string) => {
    setFavorites((f) => (f.length >= MAX_FAVORITES || f.includes(color) ? f : [...f, color]))
  }

  const removeFavorite = (color: string) => {
    setFavorites((f) => (f.length <= 1 ? f : f.filter((c) => c !== color)))
  }

  const close = useCallback(() => {
    clear3DDice()
    setPaletteOpen(false)
    setPhase('idle')
    setRollResults([])
    setRevealClash(null)
    setError(null)
    beginHistoryHide()

    if (dockCloseTimer.current) {
      clearTimeout(dockCloseTimer.current)
      dockCloseTimer.current = null
    }
    setDockUi('hiding')
    dockCloseTimer.current = setTimeout(() => {
      setOpen(false)
      setDockUi('off')
      dockCloseTimer.current = null
    }, HISTORY_ANIM_MS)
  }, [clear3DDice, beginHistoryHide])

  const closeReveal = useCallback(() => {
    if (rollResults.length > 0) {
      const el = historyRef.current
      const prev = new Map<number, DOMRect>()
      el?.querySelectorAll<HTMLElement>('.dice-history-card').forEach((card) => {
        prev.set(Number(card.dataset.entryId), card.getBoundingClientRect())
      })
      prevHistoryRects.current = prev

      if (revealClash && rollResults.length === 2) {
        const { kept, dropped } = clashOutcome(rollResults, revealClash)
        setHistory((h) => [
          ...h,
          {
            id: ++historyId.current,
            formula: buildClashFormula(revealClash),
            dice: [{ sides: 20, value: kept }],
            clash: { mod: revealClash, kept, dropped },
          },
        ])
      } else {
        setHistory((h) => [
          ...h,
          { id: ++historyId.current, formula: buildRollFormula(pool), dice: rollResults },
        ])
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
  }, [rollResults, pool, revealClash, clearDiceTimer])

  const rollD20Mod = async (mod: 'adv' | 'dis') => {
    const box = boxRef.current
    if (!box || phase === 'rolling' || !ready) return

    initDiceAudio()
    playDiceThrow(2)

    clear3DDice()
    setPhase('rolling')
    setError(null)
    setRollResults([])
    setRevealClash(mod)

    const color = dieColors[20] || favorites[0]

    try {
      await box.updateConfig({ scale: DEFAULT_SCALE })
      const dice = await box.roll('2d20', { themeColor: color }).then(mapRollResults)
      setRollResults(dice)
      setPhase('reveal')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
      setRevealClash(null)
    }
  }

  const roll = async () => {
    const box = boxRef.current
    const active = DIE_TYPES.filter((t) => pool[t] > 0)
    if (!box || phase === 'rolling' || active.length === 0) return

    const totalDice = active.reduce((n, t) => n + pool[t], 0)
    initDiceAudio()
    playDiceThrow(totalDice)

    clear3DDice()
    setPhase('rolling')
    setError(null)
    setRollResults([])
    setRevealClash(null)

    // группируем кости по выбранному цвету
    const groups = new Map<string, string[]>()

    for (const t of active) {
      const color = dieColors[t] || favorites[0]
      const arr = groups.get(color) ?? []
      arr.push(`${pool[t]}d${t}`)
      groups.set(color, arr)
    }

    // размер: по умолчанию 6, при >10 костях уменьшаем
    const scale = totalDice <= 10 ? DEFAULT_SCALE : Math.max(3, DEFAULT_SCALE * Math.sqrt(10 / totalDice))

    try {
      await box.updateConfig({ scale })
      const entries = [...groups.entries()]
      let throwIdx = 0
      const throws: Promise<DieResult[]>[] = []

      for (const [color, notation] of entries) {
        const call = throwIdx === 0 ? box.roll.bind(box) : box.add.bind(box)
        throws.push(call(notation, { themeColor: color }).then(mapRollResults))
        throwIdx++
      }

      const dice = (await Promise.all(throws)).flat()
      setRollResults(dice)
      setPhase('reveal')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  return (
    <>
      <div
        id="dice-box-stage"
        className={`dice-stage${phase !== 'idle' ? ' is-active' : ''}`}
        aria-hidden={phase === 'idle'}
      />

      {phase === 'reveal' && rollResults.length > 0 && (
        <DiceResultOverlay dice={rollResults} clash={revealClash} onClose={closeReveal} />
      )}

      <div className={`dice-dock${open ? ' is-open' : ''}${dockUi === 'hiding' ? ' is-hiding' : ''}`}>
        {showHistoryPanel && (
          <div
            className={`dice-history-panel${historyPanelShown ? ' is-visible' : ''}${historyUi === 'hiding' ? ' is-hiding' : ''}`}
          >
            <div className="dice-history-scroll" ref={historyRef} role="log" aria-label="История бросков">
              <div className="dice-history-spacer" aria-hidden="true" />
              {history.map((entry) => {
                const total = entry.dice.reduce((s, d) => s + d.value, 0)
                const isLatest = entry.id === history[history.length - 1].id
                return (
                  <article
                    key={entry.id}
                    data-entry-id={entry.id}
                    className={`dice-history-card${isLatest ? ' is-entering' : ''}`}
                  >
                    <div className="dice-history-card-inner">
                      <p className="dice-history-formula">{entry.formula}</p>
                      <p className="dice-history-result">
                        {entry.clash ? (
                          <>
                            <span className={critClass({ sides: 20, value: entry.clash.kept })}>
                              {entry.clash.kept}
                            </span>
                            <span className="dice-hist-clash-drop">{entry.clash.dropped}</span>
                          </>
                        ) : (
                          <>
                            {entry.dice.map((d, i) => (
                              <span key={i}>
                                {i > 0 && <span className="dice-hist-op"> + </span>}
                                <span className={critClass(d)}>{d.value}</span>
                              </span>
                            ))}
                            {entry.dice.length > 1 && (
                              <>
                                <span className="dice-hist-op"> = </span>
                                <b className="dice-hist-total">{total}</b>
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        )}

        {showDockTray && (
          <div
            className={`dice-tray-cluster${hideTrayOnMobile ? ' dice-tray-cluster--hidden-mobile' : ''}`}
            ref={trayClusterRef}
          >
            <div
              className={`dice-tray-wrap${hideTrayOnMobile ? ' dice-tray-wrap--hidden-mobile' : ''}${dockTrayShown ? ' is-visible' : ''}${dockUi === 'hiding' ? ' is-hiding' : ''}`}
            >
            <div className="dice-tray-head">
                <span className="dice-tray-title">Кубики</span>
                <button
                  type="button"
                  className={`dice-palette-btn${paletteOpen ? ' is-active' : ''}`}
                  onClick={() => setPaletteOpen((v) => !v)}
                  title="Избранные расцветки"
                  aria-label="Избранные расцветки"
                  aria-expanded={paletteOpen}
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
              </div>

              {paletteOpen && (
                <div className="dice-palette-editor">
                  <p className="dice-palette-caption">Избранные расцветки · {favorites.length}/{MAX_FAVORITES}</p>
                  <div className="dice-palette-favs">
                    {favorites.map((c) => (
                      <span key={c} className="dice-fav-slot" style={{ background: c }} title={c}>
                        {favorites.length > 1 && (
                          <button
                            type="button"
                            className="dice-fav-remove"
                            onClick={() => removeFavorite(c)}
                            title="Убрать"
                            aria-label={`Убрать ${c}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {favorites.length < MAX_FAVORITES && (
                    <div className="dice-palette-add">
                      <input
                        type="color"
                        className="dice-color-input"
                        value={draftColor}
                        onChange={(e) => setDraftColor(e.target.value)}
                        aria-label="Выбрать цвет (RGB)"
                      />
                      <button
                        type="button"
                        className="dice-palette-add-btn"
                        onClick={() => addFavorite(draftColor)}
                      >
                        + Добавить
                      </button>
                    </div>
                  )}

                  <div className="dice-palette-presets">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="dice-preset"
                        style={{ background: c }}
                        title={c}
                        aria-label={`Добавить ${c}`}
                        onClick={() => addFavorite(c)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="dice-tray" role="group" aria-label="Выбор кубиков">
                {DIE_TYPES.map((type) => (
                  <div
                    key={type}
                    ref={type === 20 ? d20RowRef : undefined}
                    className={`dice-tray-row${type === 20 ? ' dice-tray-row--d20' : ''}`}
                  >
                    <div className="dice-shape-icon-wrap" title={`к${type}`}>
                      <DiceShapeIcon type={type} />
                    </div>
                    <button
                      type="button"
                      className="dice-row-color"
                      style={{ background: dieColors[type] }}
                      onClick={() => cycleDieColor(type)}
                      title="Расцветка кости — клик для смены"
                      aria-label={`Расцветка к${type}`}
                    />
                    <div className="dice-pool-counter">
                      <button
                        type="button"
                        className="dice-qty-btn"
                        onClick={() => adjustQty(type, -1)}
                        disabled={pool[type] === 0}
                        aria-label={`Уменьшить к${type}`}
                      >
                        −
                      </button>
                      <span className="dice-qty-value">{pool[type]}</span>
                      <button
                        type="button"
                        className="dice-qty-btn"
                        onClick={() => adjustQty(type, 1)}
                        disabled={pool[type] >= MAX_QTY}
                        aria-label={`Увеличить к${type}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            </div>

            <div
              className={`dice-d20-mod-outer${dockTrayShown ? ' is-visible' : ''}${dockUi === 'hiding' ? ' is-hiding' : ''}${hideTrayOnMobile ? ' dice-d20-mod-outer--hidden-mobile' : ''}`}
              style={{ paddingTop: d20ModTop }}
            >
              <DiceD20Mod
                open={d20ModOpen}
                rolling={phase === 'rolling'}
                onToggleOpen={() => setD20ModOpen((v) => !v)}
                onRoll={rollD20Mod}
              />
            </div>
          </div>
        )}

        {error && showDockTray && <p className="dice-formula-error">{error}</p>}

        <div className="dice-action-bar">
          {!showOpenControls ? (
            <button
              type="button"
              className={`dice-fab${fabShown ? ' is-visible' : ''}`}
              onClick={() => {
                initDiceAudio()
                setOpen(true)
              }}
              title="Бросить кубик"
              aria-label="Бросить кубик"
            >
              <DieImage type={20} size={30} className="die-fab-icon" />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="dice-roll-morph"
                onClick={roll}
                disabled={phase === 'rolling' || !ready || !hasDice}
              >
                {!ready ? 'Загрузка…' : phase === 'rolling' ? 'Бросаем…' : 'Бросить'}
              </button>
              <button
                type="button"
                className="dice-close-btn"
                onClick={close}
                aria-label="Закрыть"
                title="Закрыть"
              >
                <span className="dice-close-glyph" aria-hidden="true">✕</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
