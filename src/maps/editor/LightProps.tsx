/** Свойства источника света: основное сверху, тонкая настройка — под «Дополнительно» */
import { Trash2 } from 'lucide-react'
import type { LightAnimation, MapLight, MapToken } from '../types'

const ANIMATIONS: { id: LightAnimation; label: string }[] = [
  { id: 'none', label: 'нет' },
  { id: 'torch', label: 'факел' },
  { id: 'pulse', label: 'пульсация' },
  { id: 'chroma', label: 'переливы цвета' },
  { id: 'fog', label: 'клубящийся туман' },
  { id: 'sunburst', label: 'солнечные лучи' },
]

const pct = (v: number | undefined, d: number) => Math.round((v ?? d) * 100)

export function LightProps({ light, setLight, remove, tokens }: { light: MapLight; setLight: (patch: Partial<MapLight>) => void; remove: (id: string) => void; tokens: MapToken[] }) {
  const anim: LightAnimation = light.animation && light.animation !== 'none' ? light.animation : light.flicker ? 'torch' : 'none'
  return (
    <section>
      <h3>{light.negative ? 'Тьма' : 'Свет'}</h3>
      <label className="me-check">
        <input type="checkbox" checked={!!light.negative} onChange={(e) => setLight({ negative: e.target.checked })} /> источник тьмы
      </label>
      {light.negative && <p className="me-light-hint">Гасит свет и закрывает обзор сквозь себя. Видят только слепое и истинное зрение.</p>}
      <label>
        {light.negative ? 'Плотная тьма, фт' : 'Яркий, фт'}
        <input type="number" min={0} step={5} value={light.bright_ft} onChange={(e) => setLight({ bright_ft: Math.max(0, Number(e.target.value) || 0) })} />
      </label>
      <label>
        {light.negative ? 'Край, ещё фт' : 'Тусклый, ещё фт'}
        <input type="number" min={0} step={5} value={light.dim_ft} onChange={(e) => setLight({ dim_ft: Math.max(0, Number(e.target.value) || 0) })} />
      </label>
      {!light.negative && (
        <>
          <label>
            Цвет
            <input type="color" value={light.color || '#ffd27a'} onChange={(e) => setLight({ color: e.target.value })} />
          </label>
          <label>
            Анимация
            <select value={anim} onChange={(e) => setLight({ animation: e.target.value as LightAnimation, flicker: false })}>
              {ANIMATIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Едет за жетоном
        <select value={light.attached_to ?? ''} onChange={(e) => setLight({ attached_to: e.target.value || null })}>
          <option value="">нет</option>
          {tokens.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="me-check">
        <input type="checkbox" checked={light.enabled} onChange={(e) => setLight({ enabled: e.target.checked })} /> {light.negative ? 'действует' : 'горит'}
      </label>
      <details className="me-light-adv">
        <summary>Дополнительно</summary>
        {!light.negative && anim !== 'none' && (
          <>
            <label className="me-light-range">
              Скорость
              <input type="range" min={1} max={10} step={1} value={light.animation_speed ?? 5} onChange={(e) => setLight({ animation_speed: Number(e.target.value) })} />
              <output>{light.animation_speed ?? 5}</output>
            </label>
            <label className="me-light-range">
              Сила
              <input type="range" min={1} max={10} step={1} value={light.animation_intensity ?? 5} onChange={(e) => setLight({ animation_intensity: Number(e.target.value) })} />
              <output>{light.animation_intensity ?? 5}</output>
            </label>
          </>
        )}
        {!light.negative && (
          <label className="me-light-range">
            Окраска
            <input type="range" min={0} max={1} step={0.05} value={light.color_intensity ?? 0.5} onChange={(e) => setLight({ color_intensity: Number(e.target.value) })} />
            <output>{pct(light.color_intensity, 0.5)} %</output>
          </label>
        )}
        <label>
          Угол сектора, °
          <input type="number" min={1} max={360} step={5} value={light.angle} onChange={(e) => setLight({ angle: Math.min(360, Math.max(1, Number(e.target.value) || 360)) })} />
        </label>
        {light.angle < 360 && (
          <label>
            Направление, °
            <input type="number" min={0} max={359} step={15} value={light.rotation} onChange={(e) => setLight({ rotation: ((Number(e.target.value) || 0) % 360 + 360) % 360 })} />
          </label>
        )}
        <label>
          Высота, фт
          <input type="number" step={1} value={light.elevation_ft} onChange={(e) => setLight({ elevation_ft: Number(e.target.value) || 0 })} />
        </label>
        <p className="me-light-hint">Работает, пока темнота сцены в диапазоне: фонарю на улице — от 50 %.</p>
        <label className="me-light-range">
          Темнота от
          <input type="range" min={0} max={1} step={0.05} value={light.darkness_min ?? 0} onChange={(e) => setLight({ darkness_min: Math.min(Number(e.target.value), light.darkness_max ?? 1) })} />
          <output>{pct(light.darkness_min, 0)} %</output>
        </label>
        <label className="me-light-range">
          до
          <input type="range" min={0} max={1} step={0.05} value={light.darkness_max ?? 1} onChange={(e) => setLight({ darkness_max: Math.max(Number(e.target.value), light.darkness_min ?? 0) })} />
          <output>{pct(light.darkness_max, 1)} %</output>
        </label>
      </details>
      <button type="button" className="me-del" onClick={() => remove(light.id)}>
        <Trash2 aria-hidden="true" /> Удалить
      </button>
    </section>
  )
}
