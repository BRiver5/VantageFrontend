/**
 * «Управление»: все действия реестра горячих клавиш по разделам, с поиском.
 * Сочетание меняется нажатием: «изменить» → нажать клавиши (Esc — отмена).
 * Можно добавить второе сочетание, удалить, вернуть умолчание. Конфликты —
 * жёлтое предупреждение с подсказкой, назначать они не мешают.
 * Изменения действуют сразу: реестр читается в момент нажатия.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Lock, Plus, RotateCcw, Search, X } from 'lucide-react'
import { comboFromEvent, combosOf, getAction, isLocked, isOverridden, reset, type ActionId } from '../input/keybindings'
import { conflictIndex, conflictText, groupActions, hasCustomBinds, putCombo, removeCombo } from './controls'

type Capture = { id: ActionId; index: number } | null

const labelOf = (id: ActionId) => getAction(id).label

/** кнопка, на которой был фокус, исчезла — вернуть фокус в строку действия */
const focusRow = (id: ActionId) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-action="${id}"] button`)?.focus())

export function ControlsPanel() {
  const [query, setQuery] = useState('')
  const [capture, setCapture] = useState<Capture>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)

  // ждём сочетание: ловим нажатие раньше всех остальных обработчиков
  useEffect(() => {
    if (!capture) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setCapture(null)
        focusRow(capture.id)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return // пока зажат только модификатор
      putCombo(capture.id, capture.index, combo)
      setCapture(null)
      bump()
      focusRow(capture.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capture])

  const groups = groupActions(query)
  const clashes = conflictIndex()
  const custom = hasCustomBinds()

  const resetAll = () => {
    reset()
    setConfirmAll(false)
    setCapture(null)
    bump()
  }

  return (
    <div className="st-controls">
      <div className="st-toolbar">
        <label className="st-search">
          <Search aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Действие, раздел или клавиша" aria-label="Поиск по действиям" data-autofocus />
        </label>
        {confirmAll ? (
          <span className="st-confirm" role="group" aria-label="Сбросить все назначения?">
            <span>Вернуть все клавиши по умолчанию?</span>
            <button type="button" className="st-btn is-danger" onClick={resetAll}>
              Сбросить
            </button>
            <button type="button" className="st-btn" onClick={() => setConfirmAll(false)}>
              Отмена
            </button>
          </span>
        ) : (
          <button type="button" className="st-btn" onClick={() => (custom ? setConfirmAll(true) : resetAll())} disabled={!custom} title={custom ? undefined : 'Все клавиши и так по умолчанию'}>
            <RotateCcw aria-hidden="true" /> Сбросить все
          </button>
        )}
      </div>

      {groups.length === 0 && <p className="st-empty">Ничего не нашлось.</p>}

      {groups.map((g) => (
        <section key={g.category} className="st-group" aria-labelledby={`st-cat-${g.category}`}>
          <h3 id={`st-cat-${g.category}`}>{g.label}</h3>
          <ul className="st-actions">
            {g.actions.map((a) => {
              const id = a.id as ActionId
              const combos = combosOf(id)
              const locked = isLocked(id)
              const clash = clashes.get(id)
              const clashText = clash ? conflictText(clash, labelOf) : ''
              const capturing = capture?.id === id
              return (
                <li key={id} data-action={id} className={`st-action${clash ? ' has-conflict' : ''}${locked ? ' is-locked' : ''}`}>
                  <span className="st-action-label">
                    {a.label}
                    {clash && (
                      <span className="st-conflict" role="img" aria-label={`Конфликт: ${clashText}`} title={clashText}>
                        <AlertTriangle aria-hidden="true" />
                      </span>
                    )}
                    {locked && (
                      <span className="st-locked" role="img" aria-label="Закреплено: не меняется" title="Закреплено: не меняется">
                        <Lock aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="st-combos">
                    {combos.length === 0 && !capturing && <span className="st-none">нет клавиш</span>}
                    {combos.map((c, i) =>
                      capturing && capture.index === i ? (
                        <CaptureChip key={i} onCancel={() => (setCapture(null), focusRow(id))} />
                      ) : (
                        <span key={i} className={`st-combo${clash?.some((x) => x.combo === c) ? ' is-conflict' : ''}`}>
                          <kbd>{c}</kbd>
                          {!locked && (
                            <>
                              <button type="button" className="st-link" onClick={() => setCapture({ id, index: i })} aria-label={`Изменить ${c} для «${a.label}»`}>
                                изменить
                              </button>
                              <button type="button" className="st-icon" onClick={() => (removeCombo(id, i), bump(), focusRow(id))} aria-label={`Удалить ${c} у «${a.label}»`} title="Удалить">
                                <X aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </span>
                      ),
                    )}
                    {capturing && capture.index >= combos.length && <CaptureChip onCancel={() => (setCapture(null), focusRow(id))} />}
                    {!locked && !(capturing && capture.index >= combos.length) && (
                      <button type="button" className="st-icon" onClick={() => setCapture({ id, index: combos.length })} aria-label={`Добавить сочетание для «${a.label}»`} title="Добавить сочетание">
                        <Plus aria-hidden="true" />
                      </button>
                    )}
                    {!locked && isOverridden(id) && (
                      <button type="button" className="st-icon" onClick={() => (reset(id), bump(), focusRow(id))} aria-label={`Вернуть по умолчанию «${a.label}»: ${a.defaults.join(', ')}`} title={`По умолчанию: ${a.defaults.join(', ') || 'нет'}`}>
                        <RotateCcw aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function CaptureChip({ onCancel }: { onCancel: () => void }) {
  const btn = useRef<HTMLButtonElement>(null)
  // фокус — на чип ожидания, чтобы исчезнувшая кнопка «изменить» не уронила его на body
  useEffect(() => btn.current?.focus(), [])
  return (
    <span className="st-combo is-capturing" role="status" aria-live="polite">
      <kbd>Нажмите сочетание…</kbd>
      <button ref={btn} type="button" className="st-link" onClick={onCancel}>
        отмена (Esc)
      </button>
    </span>
  )
}
