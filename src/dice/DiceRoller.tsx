import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import type DiceBoxType from '@3d-dice/dice-box'
import DiceResultOverlay from './DiceResultOverlay'
import { critClass, DIE_TYPES, DiceShapeIcon, type DieResult, type DieType } from './DiceShapeIcons'

type DicePool = Record<DieType, number>
type DieColors = Record<DieType, string>
type Phase = 'idle' | 'rolling' | 'reveal'

interface RollHistoryEntry {
  id: number
  dice: DieResult[]
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

export default function DiceRoller() {
  const boxRef = useRef<DiceBoxType | null>(null)
  const initPromise = useRef<Promise<void> | null>(null)
  const diceClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const historyId = useRef(0)

  const [open, setOpen] = useState(false)
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

  const hasDice = DIE_TYPES.some((t) => pool[t] > 0)

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
      boxRef.current = box
      setReady(true)
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [open])

  useEffect(() => {
    const el = historyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history])

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
    setOpen(false)
    setPaletteOpen(false)
    setPhase('idle')
    setRollResults([])
    setError(null)
  }, [clear3DDice])

  const closeReveal = useCallback(() => {
    if (rollResults.length > 0) {
      const dice = rollResults
      setHistory((h) => [...h, { id: ++historyId.current, dice }])
    }
    setPhase('idle')
    setRollResults([])

    clearDiceTimer()
    diceClearTimer.current = setTimeout(() => {
      boxRef.current?.clear()
      diceClearTimer.current = null
    }, 5000)
  }, [rollResults, clearDiceTimer])

  const roll = async () => {
    const box = boxRef.current
    const active = DIE_TYPES.filter((t) => pool[t] > 0)
    if (!box || phase === 'rolling' || active.length === 0) return

    clear3DDice()
    setPhase('rolling')
    setError(null)
    setRollResults([])

    // группируем кости по выбранному цвету — каждая группа своим themeColor
    const groups = new Map<string, string[]>()
    for (const t of active) {
      const color = dieColors[t] || favorites[0]
      const arr = groups.get(color) ?? []
      arr.push(`${pool[t]}d${t}`)
      groups.set(color, arr)
    }

    // размер: по умолчанию 6, при >10 костях уменьшаем
    const total = active.reduce((n, t) => n + pool[t], 0)
    const scale = total <= 10 ? DEFAULT_SCALE : Math.max(3, DEFAULT_SCALE * Math.sqrt(10 / total))

    try {
      await box.updateConfig({ scale })
      // первая группа через roll() (очищает сцену), остальные — add() поверх
      const entries = [...groups.entries()]
      const throws = entries.map(([color, notation], i) =>
        i === 0
          ? box.roll(notation, { themeColor: color })
          : box.add(notation, { themeColor: color }),
      )
      const dice = (await Promise.all(throws))
        .flat()
        .map((d) => ({ sides: parseSides(d.sides), value: d.value }))
      setRollResults(dice)
      setPhase('reveal')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  return (
    <>
      <div id="dice-box-stage" className="dice-stage" aria-hidden={phase === 'idle' && !open} />

      {phase === 'reveal' && rollResults.length > 0 && (
        <DiceResultOverlay dice={rollResults} onClose={closeReveal} />
      )}

      <div className={`dice-dock${open ? ' is-open' : ''}`}>
        {open && (
          <div className="dice-panel-stack">
            {history.length > 0 && (
              <div className="dice-history-cloud">
                <div className="dice-history-fade" aria-hidden="true" />
                <div className="dice-history" ref={historyRef} role="log" aria-label="История бросков">
                  {history.map((entry) => {
                    const total = entry.dice.reduce((s, d) => s + d.value, 0)
                    return (
                      <p key={entry.id} className="dice-history-item">
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
                      </p>
                    )
                  })}
                </div>
                <span className="dice-history-tail" aria-hidden="true" />
              </div>
            )}

            <div className="dice-tray-wrap">
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
                  <div key={type} className="dice-tray-row">
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
          </div>
        )}

        {error && open && <p className="dice-formula-error">{error}</p>}

        <div className="dice-action-bar">
          {!open ? (
            <button
              type="button"
              className="dice-fab"
              onClick={() => setOpen(true)}
              title="Бросить кубик"
              aria-label="Бросить кубик"
            >
              <span className="dice-fab-glyph">⚄</span>
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
