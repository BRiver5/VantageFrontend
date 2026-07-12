import { useCallback, useEffect, useRef, useState } from 'react'
import type DiceBoxType from '@3d-dice/dice-box'
import DiceResultOverlay from './DiceResultOverlay'
import { DIE_TYPES, DiceShapeIcon, type DieType } from './DiceShapeIcons'

type DicePool = Record<DieType, number>
type Phase = 'idle' | 'rolling' | 'reveal'

interface RollHistoryEntry {
  id: number
  label: string
}

const MAX_QTY = 10

const EMPTY_POOL = Object.fromEntries(DIE_TYPES.map((t) => [t, 0])) as DicePool

function buildNotation(pool: DicePool) {
  return DIE_TYPES
    .filter((sides) => pool[sides] > 0)
    .map((sides) => ({ qty: pool[sides], sides }))
}

function formatRollLabel(values: number[]): string {
  if (values.length === 0) return ''
  const total = values.reduce((s, v) => s + v, 0)
  if (values.length === 1) return String(total)
  return `${values.join(' + ')} = ${total}`
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
  const [rollResults, setRollResults] = useState<number[]>([])
  const [history, setHistory] = useState<RollHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const hasDice = DIE_TYPES.some((t) => pool[t] > 0)

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
        theme: 'fire',
        preloadThemes: ['fire'],
        scale: 8,
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

  const close = useCallback(() => {
    clear3DDice()
    setOpen(false)
    setPhase('idle')
    setRollResults([])
    setError(null)
  }, [clear3DDice])

  const closeReveal = useCallback(() => {
    if (rollResults.length > 0) {
      const label = formatRollLabel(rollResults)
      setHistory((h) => [...h, { id: ++historyId.current, label }])
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
    const notation = buildNotation(pool)
    if (!box || phase === 'rolling' || !notation.length) return

    clear3DDice()
    setPhase('rolling')
    setError(null)
    setRollResults([])

    try {
      await box.updateConfig({ theme: 'fire' })
      const dice = await box.roll(notation)
      setRollResults(dice.map((d) => d.value))
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
        <DiceResultOverlay values={rollResults} onClose={closeReveal} />
      )}

      <div className={`dice-dock${open ? ' is-open' : ''}`}>
        {open && (
          <div className="dice-panel-stack">
            {history.length > 0 && (
              <div className="dice-history-wrap">
                <div className="dice-history-fade" aria-hidden="true" />
                <div className="dice-history" ref={historyRef} role="log" aria-label="История бросков">
                  {history.map((entry) => (
                    <p key={entry.id} className="dice-history-item">{entry.label}</p>
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
