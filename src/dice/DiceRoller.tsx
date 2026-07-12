import { useEffect, useRef, useState } from 'react'
import type DiceBoxType from '@3d-dice/dice-box'

/**
 * Кубики на @3d-dice/dice-box — рендерятся прямо на странице (полноэкранный
 * прозрачный канвас поверх контента), без модального окна. Кнопка в углу
 * раскрывает панель: тип кости, количество, тема — и бросок идёт тут же.
 */

const SIDES = [4, 6, 8, 10, 12, 20, 100] as const
type Sides = (typeof SIDES)[number]

interface ThemeOption {
  key: string
  label: string
  swatch: string
}

const THEMES: ThemeOption[] = [
  { key: 'default', label: 'Обычная', swatch: 'linear-gradient(145deg, #6b7280, #1f2937)' },
  { key: 'rust', label: 'Ржавчина', swatch: 'linear-gradient(145deg, #c97a5a, #6b2f1f)' },
  { key: 'gemstone', label: 'Самоцвет', swatch: 'linear-gradient(145deg, #7fd8e0, #1f5f6e)' },
  { key: 'wooden', label: 'Дерево', swatch: 'linear-gradient(145deg, #b98650, #5c3a1e)' },
]

const MAX_QTY = 10

export default function DiceRoller() {
  const boxRef = useRef<DiceBoxType | null>(null)
  const initPromise = useRef<Promise<void> | null>(null)

  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [theme, setTheme] = useState('default')
  const [sides, setSides] = useState<Sides>(20)
  const [qty, setQty] = useState(1)
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<{ total: number; rolls: number[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ленивая инициализация — тяжёлую библиотеку грузим только когда впервые открыли панель
  useEffect(() => {
    if (!open || initPromise.current) return
    initPromise.current = (async () => {
      const { default: DiceBox } = await import('@3d-dice/dice-box')
      const box = new DiceBox({
        container: '#dice-box-stage',
        assetPath: '/assets/',
        theme: 'default',
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

  const roll = async () => {
    const box = boxRef.current
    if (!box || rolling) return
    setRolling(true)
    setError(null)
    setResult(null)
    try {
      await box.updateConfig({ theme })
      const dice = await box.roll(`${qty}d${sides}`)
      const rolls = dice.map((d) => d.value)
      const total = rolls.reduce((s, v) => s + v, 0)
      setResult({ total, rolls })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRolling(false)
    }
  }

  const clear = () => {
    boxRef.current?.clear()
    setResult(null)
  }

  return (
    <>
      {/* прозрачная сцена на весь экран — кости катятся прямо по странице */}
      <div id="dice-box-stage" className="dice-stage" aria-hidden={!open} />

      <button
        type="button"
        className="dice-fab"
        onClick={() => setOpen((v) => !v)}
        title="Бросить кубик"
        aria-label="Бросить кубик"
        aria-expanded={open}
      >
        <span className="dice-fab-glyph">⚄</span>
      </button>

      {open && (
        <div className="dice-panel">
          <div className="dice-panel-row">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`dice-theme-swatch${theme === t.key ? ' is-active' : ''}`}
                style={{ background: t.swatch }}
                title={t.label}
                aria-label={t.label}
                onClick={() => setTheme(t.key)}
              />
            ))}
          </div>

          <div className="dice-panel-row dice-panel-sides">
            {SIDES.map((s) => (
              <button
                key={s}
                type="button"
                className={`dice-side-btn${sides === s ? ' is-active' : ''}`}
                onClick={() => setSides(s)}
              >
                к{s}
              </button>
            ))}
          </div>

          <div className="dice-panel-row dice-qty-row">
            <button type="button" className="dice-qty-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span className="dice-qty-value">{qty}</span>
            <button type="button" className="dice-qty-btn" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}>+</button>
            <span className="dice-qty-label">× к{sides}</span>
          </div>

          {error && <p className="dice-formula-error">{error}</p>}

          <div className="dice-panel-row">
            <button type="button" className="dice-roll-btn" onClick={roll} disabled={rolling || !ready}>
              {!ready ? 'Загрузка…' : rolling ? 'Бросаем…' : `Бросить ${qty}к${sides}`}
            </button>
            {result && (
              <button type="button" className="dice-clear-btn" onClick={clear}>Убрать</button>
            )}
          </div>

          {result && (
            <p className="dice-result-line">
              {result.rolls.length > 1 ? `${result.rolls.join(' + ')} = ` : ''}
              <b>{result.total}</b>
            </p>
          )}
        </div>
      )}
    </>
  )
}
