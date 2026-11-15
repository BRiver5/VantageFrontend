/** Список туров: поиск, фильтр «кому», запуск, продолжение и сброс */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, GraduationCap, Play, RotateCcw, Search, X } from 'lucide-react'
import { AUDIENCE_LABEL, CONTEXT_HINT, TOURS } from './content'
import { contextReady } from './dom'
import { closeToursPanel, progressStore, startTour, useTourProgress } from './store'
import type { TourAudience } from './types'
import { formatKeys } from './keys'

type Filter = 'any' | Exclude<TourAudience, 'all'>

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'any', label: 'Все' },
  { id: 'gm', label: 'Мастеру' },
  { id: 'player', label: 'Игроку' },
]

export function TourPanel() {
  const progress = useTourProgress()
  const { pathname } = useLocation()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('any')
  const search = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    search.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      closeToursPanel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (before && before.isConnected) before.focus({ preventScroll: true })
    }
  }, [])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return TOURS.filter((t) => filter === 'any' || t.audience === filter || t.audience === 'all').filter(
      (t) => !needle || `${t.title} ${t.summary} ${t.steps.map((s) => s.title).join(' ')}`.toLowerCase().includes(needle),
    )
  }, [q, filter])

  const anyProgress = Object.values(progress).some((p) => p.status !== 'offered')

  return createPortal(
    <div className="tour-panel-layer" onPointerDown={(e) => e.target === e.currentTarget && closeToursPanel()}>
      <section className="tour-panel" role="dialog" aria-modal="true" aria-labelledby="tour-panel-title">
        <header className="tour-panel-head">
          <GraduationCap aria-hidden="true" />
          <h2 id="tour-panel-title">Обучение</h2>
          <button type="button" className="tour-x" onClick={closeToursPanel} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>
        <p className="tour-panel-sub">Короткие туры по интерфейсу. Закроете посреди — продолжите с того же шага.</p>

        <div className="tour-panel-tools">
          <label className="tour-search">
            <Search aria-hidden="true" />
            <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти тур" aria-label="Найти тур" />
          </label>
          <div className="tour-filter" role="radiogroup" aria-label="Кому">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={filter === f.id ? 'is-on' : ''} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="tour-list">
          {list.map((t) => {
            const p = progress[t.id]
            const done = p?.status === 'completed'
            const paused = p?.status === 'in_progress'
            const here = contextReady(t.context, pathname)
            // туры сайта из комнаты запускаются на главной
            const ready = here || t.context === 'site'
            const label = done ? 'Пройти снова' : paused ? 'Продолжить' : 'Начать'
            return (
              <li key={t.id} className={`tour-item${done ? ' is-done' : ''}`}>
                <div className="tour-item-main">
                  <h3>
                    {done && <CheckCircle2 aria-label="Пройден" className="tour-done-ico" />}
                    {t.title}
                    <span className="tour-tag">{AUDIENCE_LABEL[t.audience]}</span>
                  </h3>
                  <p>{formatKeys(t.summary)}</p>
                  <p className="tour-item-state">
                    {done ? 'Пройден' : paused ? `Остановились на шаге ${Math.min(p.step + 1, t.steps.length)} из ${t.steps.length}` : `${t.steps.length} шагов`}
                    {!ready && <> · {CONTEXT_HINT[t.context]}</>}
                  </p>
                </div>
                <div className="tour-item-acts">
                  <button type="button" className="tour-btn" disabled={!ready} onClick={() => startTour(t.id, done)} title={ready ? undefined : CONTEXT_HINT[t.context]}>
                    <Play aria-hidden="true" /> {here || t.context !== 'site' ? label : `${label} на главной`}
                  </button>
                  {p && p.status !== 'offered' && (
                    <button type="button" className="tour-btn is-ghost" onClick={() => progressStore.reset(t.id)} aria-label={`Сбросить прогресс: ${t.title}`} title="Сбросить прогресс">
                      <RotateCcw aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          {list.length === 0 && <li className="tour-empty">Ничего не нашлось</li>}
        </ul>

        <footer className="tour-panel-foot">
          <button
            type="button"
            className="tour-btn is-ghost"
            disabled={!anyProgress}
            onClick={() => confirm('Сбросить прогресс всех туров?') && progressStore.resetAll()}
          >
            <RotateCcw aria-hidden="true" /> Сбросить все
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
