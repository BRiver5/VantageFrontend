import { useRef, useState } from 'react'
import { ImagePlus, Plus } from 'lucide-react'
import { uploadMedia, type Creature } from '../../../api'
import { useRoom } from '../../RoomProvider'
import { addCreatures } from '../../roomsApi'
import { errText, SIZE_RU } from '../parts'
import { Img } from '../../../media'
import { SIZES, STAT_KEYS, newId, traitsOf } from './common'

/** Своё существо: статблок формой, без бестиария */
export function HomebrewCreature({ count, onDone }: { count: number; onDone: () => void }) {
  const { roomId } = useRoom()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [size, setSize] = useState<(typeof SIZES)[number]>('Medium')
  const [ac, setAc] = useState(12)
  const [hp, setHp] = useState(10)
  const [speed, setSpeed] = useState(30)
  const [cr, setCr] = useState('')
  const [stats, setStats] = useState<Record<string, number>>({ strenght: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 })
  const [features, setFeatures] = useState('')
  const [actions, setActions] = useState('')
  const [legendary, setLegendary] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    if (!name.trim()) return setError('Как зовут существо?')
    setBusy(true)
    setError(null)
    try {
      const snapshot = {
        id: newId(),
        name: name.trim(),
        description: null,
        creature_description: null,
        image_gallery: image ? [image] : null,
        image_url: null,
        size,
        creature_type: type.trim() || null,
        alignment: null,
        ac,
        ac_source: null,
        hp,
        hp_formula: null,
        speed,
        flight_speed: null,
        swim_speed: null,
        burrow_speed: null,
        climb_speed: null,
        ...stats,
        saving_throws: null,
        skills: null,
        damage_imunities: null,
        damage_resistances: null,
        damage_vulnerabilities: null,
        condition_imunities: null,
        night_vision: null,
        blind_vision: null,
        true_vision: null,
        languages: null,
        challenge_rating: cr.trim() === '' ? null : Number(cr.replace(',', '.')) || null,
        proficiency_bonus: null,
        area_of_living: null,
        features: features.trim() ? traitsOf(features) : null,
        actions: actions.trim() ? traitsOf(actions) : null,
        actions_description: null,
        legendary_actions: legendary.trim() ? traitsOf(legendary) : null,
        legendary_description: null,
        mythical_actions: null,
        is_unique: false,
        is_npc: false,
        book_source_id: null,
      } as unknown as Creature
      await addCreatures(roomId, { snapshot, count, image_url: image, on_screen_only: true })
      onDone()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sc-homebrew">
      <div className="sc-hb-top">
        <button type="button" className="sc-hb-pic" onClick={() => fileRef.current?.click()} title="Картинка существа">
          {image ? <Img src={image} alt="" /> : <ImagePlus aria-hidden="true" />}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setBusy(true)
            try {
              setImage((await uploadMedia(f)).url)
            } catch (err) {
              setError(errText(err))
            } finally {
              setBusy(false)
            }
          }}
        />
        <div className="sc-hb-name">
          <input className="bt-in" value={name} maxLength={80} placeholder="Имя: Болотная карга" onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="sc-hb-row">
            <input className="bt-in" value={type} maxLength={40} placeholder="вид: фея, нежить…" onChange={(e) => setType(e.target.value)} />
            <select className="bt-in" value={size} aria-label="Размер" onChange={(e) => setSize(e.target.value as (typeof SIZES)[number])}>
              {SIZES.map((sz) => (
                <option key={sz} value={sz}>
                  {SIZE_RU[sz] ?? sz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="sc-hb-nums">
        <label>
          <span>КД</span>
          <input className="bt-in" type="number" min={1} max={40} value={ac} onChange={(e) => setAc(Number(e.target.value) || 1)} />
        </label>
        <label>
          <span>Хиты</span>
          <input className="bt-in" type="number" min={1} max={9999} value={hp} onChange={(e) => setHp(Number(e.target.value) || 1)} />
        </label>
        <label>
          <span>Скорость</span>
          <input className="bt-in" type="number" min={0} max={200} step={5} value={speed} onChange={(e) => setSpeed(Number(e.target.value) || 0)} />
        </label>
        <label>
          <span>ПО</span>
          <input className="bt-in" value={cr} maxLength={5} placeholder="1/2" onChange={(e) => setCr(e.target.value)} />
        </label>
      </div>
      <div className="sc-hb-stats">
        {STAT_KEYS.map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input className="bt-in" type="number" min={1} max={30} value={stats[key]} onChange={(e) => setStats((s) => ({ ...s, [key]: Math.max(1, Math.min(30, Number(e.target.value) || 1)) }))} />
            <i>{(() => { const m = Math.floor((stats[key] - 10) / 2); return m >= 0 ? `+${m}` : `${m}` })()}</i>
          </label>
        ))}
      </div>
      <label className="sc-hb-text">
        <span>Особенности — по строке: «Название. Описание»</span>
        <textarea className="bt-in" rows={2} value={features} placeholder="Амфибия. Дышит воздухом и водой." onChange={(e) => setFeatures(e.target.value)} />
      </label>
      <label className="sc-hb-text">
        <span>Действия</span>
        <textarea className="bt-in" rows={3} value={actions} placeholder="Когти. Рукопашная атака оружием: +5 к попаданию, досягаемость 5 фт., одна цель. Попадание: 10 (2к6 + 3) рубящего урона." onChange={(e) => setActions(e.target.value)} />
      </label>
      <label className="sc-hb-text">
        <span>Легендарные действия (если есть)</span>
        <textarea className="bt-in" rows={2} value={legendary} placeholder="Удар хвостом. Совершает одну атаку хвостом." onChange={(e) => setLegendary(e.target.value)} />
      </label>
      {error && <p className="tb-err">{error}</p>}
      <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void save()}>
        <Plus aria-hidden="true" /> За ширму{count > 1 ? ` ×${count}` : ''}
      </button>
    </div>
  )
}
