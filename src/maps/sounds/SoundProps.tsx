/** Свойства звука местности в конструкторе: источник, радиус, громкость, стены, темнота */
import { useEffect, useState } from 'react'
import { Search, Trash2, Upload } from 'lucide-react'
import { assetTitle, searchAssets, uploadAsset, type Asset } from '../assets'
import type { SoundInput } from '../layers/api'
import type { MapSound } from '../layers/types'

/** выбор звука: библиотека (фоновые звуки) или свой файл */
function SourcePicker({ onPick }: { onPick: (a: Asset) => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<Asset[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      searchAssets({ kind: 'ambience', q: q.trim(), limit: 10 }).then(
        (r) => alive && setList(r.items),
        () => alive && setList([]),
      )
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="ly-source">
      <label className="ly-search">
        <Search aria-hidden="true" />
        <input value={q} placeholder="Река, костёр, ветер…" onChange={(e) => setQ(e.target.value)} aria-label="Поиск звука" />
      </label>
      <ul>
        {list.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onPick(a)}>
              {assetTitle(a)}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="ly-hint">В библиотеке ничего не нашлось — загрузите свой файл</li>}
      </ul>
      <label className={`ly-btn ly-upload${busy ? ' is-busy' : ''}`}>
        <Upload aria-hidden="true" /> {busy ? 'загружаем…' : 'Свой файл'}
        <input
          type="file"
          accept="audio/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setBusy(true)
            setErr(null)
            try {
              onPick(await uploadAsset(f, 'ambience'))
            } catch (x) {
              setErr(x instanceof Error ? x.message : 'Не загрузилось')
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
      {err && <p className="ly-hint is-err">{err}</p>}
    </div>
  )
}

export function NewSoundProps({ onPick, onCancel }: { onPick: (body: SoundInput) => void; onCancel: () => void }) {
  return (
    <section className="ly-props">
      <h3>Новый звук</h3>
      <p className="ly-hint">Выберите, что будет звучать в этой точке.</p>
      <SourcePicker onPick={(a) => onPick({ asset_id: a.id, name: assetTitle(a) })} />
      <button type="button" className="me-del" onClick={onCancel}>
        Отмена
      </button>
    </section>
  )
}

const DARK_PRESETS: { id: string; label: string; v: MapSound['darkness'] }[] = [
  { id: 'always', label: 'всегда', v: null },
  { id: 'day', label: 'только днём', v: { min: 0, max: 0.25 } },
  { id: 'dusk', label: 'в сумерки и ночью', v: { min: 0.5, max: 1 } },
  { id: 'night', label: 'только ночью', v: { min: 0.75, max: 1 } },
]

export function SoundProps({ sound, onChange, onRemove }: { sound: MapSound; onChange: (patch: SoundInput) => void; onRemove: () => void }) {
  const [swap, setSwap] = useState(false)
  const [name, setName] = useState(sound.name)
  const preset = DARK_PRESETS.find((p) => JSON.stringify(p.v) === JSON.stringify(sound.darkness))?.id ?? 'custom'
  return (
    <section className="ly-props">
      <h3>Звук местности</h3>
      <label>
        Название
        <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onBlur={() => name !== sound.name && onChange({ name })} />
      </label>
      <p className="ly-hint">
        Звучит: {sound.name || sound.url.split('/').pop()}{' '}
        <button type="button" className="ly-link" onClick={() => setSwap((v) => !v)}>
          {swap ? 'оставить' : 'заменить'}
        </button>
      </p>
      {swap && (
        <SourcePicker
          onPick={(a) => {
            setSwap(false)
            setName(assetTitle(a))
            onChange({ asset_id: a.id, name: assetTitle(a) })
          }}
        />
      )}
      <label>
        Радиус, фт
        <input type="number" min={5} max={1000} step={5} value={sound.radius_ft} onChange={(e) => Number(e.target.value) > 0 && onChange({ radius_ft: Number(e.target.value) })} />
      </label>
      <label>
        Громкость
        <input type="range" min={0} max={1} step={0.05} value={sound.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
      </label>
      <label className="me-check">
        <input type="checkbox" checked={sound.easing} onChange={(e) => onChange({ easing: e.target.checked })} /> тише к краю
      </label>
      <label className="me-check">
        <input type="checkbox" checked={sound.walls} onChange={(e) => onChange({ walls: e.target.checked })} /> глушится стенами
      </label>
      <label>
        Звучит
        <select value={preset} onChange={(e) => onChange({ darkness: DARK_PRESETS.find((p) => p.id === e.target.value)?.v ?? null })}>
          {DARK_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          {preset === 'custom' && <option value="custom">своя темнота</option>}
        </select>
      </label>
      <label className="me-check">
        <input type="checkbox" checked={sound.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> включён (выключенный игроки не получают)
      </label>
      <button type="button" className="me-del" onClick={onRemove}>
        <Trash2 aria-hidden="true" /> Убрать звук
      </button>
    </section>
  )
}
