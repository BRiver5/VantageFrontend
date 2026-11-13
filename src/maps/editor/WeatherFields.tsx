/** Погода сцены в конструкторе: вид, сила, ветер. Меняется PATCH карты */
import { useState } from 'react'
import type { MapWeather, WeatherKind } from '../types'
import { NO_WEATHER, WEATHER_KINDS, weatherLabel } from '../weather'

const WIND_DIRS: { deg: number; label: string }[] = [
  { deg: 270, label: 'на север ↑' },
  { deg: 315, label: 'на северо-восток ↗' },
  { deg: 0, label: 'на восток →' },
  { deg: 45, label: 'на юго-восток ↘' },
  { deg: 90, label: 'на юг ↓' },
  { deg: 135, label: 'на юго-запад ↙' },
  { deg: 180, label: 'на запад ←' },
  { deg: 225, label: 'на северо-запад ↖' },
]

export function WeatherFields({ weather, onChange }: { weather: MapWeather | undefined; onChange: (w: MapWeather) => void }) {
  const w = { ...NO_WEATHER, intensity: 0.5, wind: 0.3, ...weather }
  // ползунки шлём по отпусканию, пока тянут — только показываем
  const [draft, setDraft] = useState<{ intensity?: number; wind?: number }>({})
  const commit = (patch: Partial<MapWeather>) => {
    setDraft({})
    onChange({ ...w, ...patch })
  }
  const wind = ((Math.round(w.wind_deg / 45) * 45) % 360 + 360) % 360
  return (
    <>
      <label>
        Погода
        <select value={w.kind} onChange={(e) => commit({ kind: e.target.value as WeatherKind })}>
          {WEATHER_KINDS.map((k) => (
            <option key={k} value={k}>
              {weatherLabel(k)}
            </option>
          ))}
        </select>
      </label>
      {w.kind !== 'none' && (
        <>
          <label>
            Сила: {Math.round((draft.intensity ?? w.intensity) * 100)}%
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={draft.intensity ?? w.intensity}
              onChange={(e) => setDraft((d) => ({ ...d, intensity: Number(e.target.value) }))}
              onPointerUp={() => draft.intensity != null && commit({ intensity: draft.intensity })}
              onKeyUp={() => draft.intensity != null && commit({ intensity: draft.intensity })}
            />
          </label>
          <label>
            Ветер дует
            <select value={wind} onChange={(e) => commit({ wind_deg: Number(e.target.value) })}>
              {WIND_DIRS.map((d) => (
                <option key={d.deg} value={d.deg}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Сила ветра: {Math.round((draft.wind ?? w.wind) * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.wind ?? w.wind}
              onChange={(e) => setDraft((d) => ({ ...d, wind: Number(e.target.value) }))}
              onPointerUp={() => draft.wind != null && commit({ wind: draft.wind })}
              onKeyUp={() => draft.wind != null && commit({ wind: draft.wind })}
            />
          </label>
          <p className="tb-hint">Под крышами и в зонах «без погоды» осадков нет.</p>
        </>
      )}
    </>
  )
}
