/**
 * Звуки местности у слушателя. Раз в четверть секунды: где слушатель (свой
 * жетон; мастер — центр камеры или точка «слушать отсюда»), громкость каждого
 * источника по расстоянию, стенам и темноте карты, умноженная на личную
 * громкость. Кнопка с регулятором «Фон карты» — когда что-то слышно.
 */
import { useEffect, useRef, useState } from 'react'
import { AudioLines, Ear, Volume2 } from 'lucide-react'
import { pxPerFt } from '../geometry'
import type { BattleMap, Pt } from '../types'
import type { MapSound } from '../layers/types'
import { AmbientMixer } from './mixer'
import { ambienceVolume, onVolumeChange, roomVolume, setAmbienceVolume } from './prefs'
import { emitterVolume, mapDarkness } from './volume'

export function MapSoundsPlayer({ map, sounds, listener, isDm, listening, onListening }: { map: BattleMap; sounds: readonly MapSound[]; listener: () => Pt | null; isDm: boolean; listening?: boolean; onListening?: (v: boolean) => void }) {
  const mixer = useRef<AmbientMixer | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [audible, setAudible] = useState(false)
  const [open, setOpen] = useState(false)
  const [amb, setAmb] = useState(ambienceVolume)
  const live = useRef({ map, sounds, listener })
  live.current = { map, sounds, listener }

  useEffect(() => {
    const m = new AmbientMixer()
    m.onBlocked = setBlocked
    mixer.current = m
    return () => {
      m.dispose()
      mixer.current = null
    }
  }, [])

  useEffect(() => onVolumeChange(() => setAmb(ambienceVolume())), [])

  useEffect(() => {
    const tick = () => {
      const { map: m, sounds: list, listener: where } = live.current
      const at = where()
      const personal = roomVolume() * ambienceVolume()
      const dark = mapDarkness(m.ambient?.level)
      const ppf = pxPerFt(m.grid)
      const levels = new Map<string, { url: string; volume: number }>()
      let any = false
      for (const s of list) {
        if (!s.url) continue
        const v = emitterVolume(s, at, m.walls, ppf, dark)
        if (v > 0) any = true
        levels.set(s.id, { url: s.url, volume: v * personal })
      }
      mixer.current?.sync(levels)
      setAudible(any)
    }
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [])

  // браузер не дал звук: первый жест на странице включит
  useEffect(() => {
    if (!blocked) return
    const on = () => mixer.current?.resume()
    window.addEventListener('pointerdown', on, { once: true })
    return () => window.removeEventListener('pointerdown', on)
  }, [blocked])

  if (!audible && !isDm && !blocked) return null
  if (!sounds.length) return null
  return (
    <div className={`ly-sound${open ? ' is-open' : ''}`}>
      {blocked ? (
        <button type="button" className="ly-sound-btn is-blocked" onClick={() => mixer.current?.resume()}>
          <Volume2 aria-hidden="true" /> Включить звуки карты
        </button>
      ) : (
        <button type="button" className={`ly-sound-btn${audible ? ' is-on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Звуки местности: громкость" title="Звуки местности">
          <AudioLines aria-hidden="true" />
        </button>
      )}
      {open && (
        <span className="ly-sound-pop">
          <label className="ly-range">
            Фон карты
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={amb}
              aria-label="Громкость звуков местности у меня"
              onChange={(e) => {
                setAmb(Number(e.target.value))
                setAmbienceVolume(Number(e.target.value))
              }}
            />
          </label>
          {isDm && onListening && (
            <button type="button" className={`ly-btn${listening ? ' is-on' : ''}`} aria-pressed={!!listening} onClick={() => onListening(!listening)} title="Нажмите на карту — звук будет слышен из этой точки; иначе — из центра экрана">
              <Ear aria-hidden="true" /> {listening ? 'слушаю отсюда' : 'слушать отсюда'}
            </button>
          )}
        </span>
      )}
    </div>
  )
}
