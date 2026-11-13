/** Мастер на столе: темнота сцены (сразу или плавно «К рассвету» / «К ночи») и сброс исследованного тумана */
import { Moon, Sun, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { resetFog, setDarkness } from './api'
import { ambientLevel, darknessAt, darknessMoving, serverNow } from './render/lighting'
import type { BattleMap } from './types'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')
const DURATIONS = [5, 10, 30, 60]
const LEVEL_NAME = { bright: 'день', dim: 'сумерки', dark: 'ночь' } as const

export function SceneLight({ map, roomId, onError, onDone }: { map: BattleMap; roomId: string; onError: (t: string) => void; onDone: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(10)
  const [draft, setDraft] = useState<number | null>(null)
  const [, tick] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moving = darknessMoving(map.ambient, serverNow())
  // пока идёт переход, ползунок едет вместе со сценой
  useEffect(() => {
    if (!open || !moving) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [open, moving])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const now = darknessAt(map.ambient, serverNow())
  const value = draft ?? now
  const go = (to: number, seconds: number, ok?: string) =>
    setDarkness(roomId, map.id, to, seconds).then(
      () => {
        setDraft(null)
        if (ok) onDone(ok)
      },
      (e) => {
        setDraft(null)
        onError(errText(e))
      },
    )
  const slide = (v: number) => {
    setDraft(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void go(v, 0), 300)
  }
  return (
    <div className={`mp-scenelight${open ? ' is-open' : ''}`}>
      <button type="button" className="mp-scenelight-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {value >= 0.5 ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />} Свет
      </button>
      {open && (
        <div className="mp-scenelight-pop">
          <label className="mp-scenelight-range">
            <span>
              Темнота сцены <output>{Math.round(value * 100)} % · {LEVEL_NAME[ambientLevel(map.ambient, value)]}</output>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => slide(Number(e.target.value))} aria-valuetext={`${Math.round(value * 100)} %`} />
          </label>
          <div className="mp-scenelight-row">
            <button type="button" onClick={() => void go(0, duration, 'Светает')} disabled={!moving && now <= 0}>
              <Sun aria-hidden="true" /> К рассвету
            </button>
            <button type="button" onClick={() => void go(1, duration, 'Наступает ночь')} disabled={!moving && now >= 1}>
              <Moon aria-hidden="true" /> К ночи
            </button>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Длительность перехода">
              {DURATIONS.map((s) => (
                <option key={s} value={s}>
                  {s} с
                </option>
              ))}
            </select>
          </div>
          {map.fog?.mode === 'dynamic' && (
            <button
              type="button"
              className="mp-scenelight-reset"
              onClick={() => {
                if (!confirm('Сбросить туман? Все игроки забудут, что уже видели на этой карте.')) return
                void resetFog(roomId, map.id).then(() => onDone('Туман сброшен'), (e) => onError(errText(e)))
              }}
            >
              <Undo2 aria-hidden="true" /> Сбросить туман
            </button>
          )}
        </div>
      )}
    </div>
  )
}
