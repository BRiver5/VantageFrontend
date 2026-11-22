/** Раздел «Происхождение»: раса, подраса, предыстория и внешность */
import { Compass } from 'lucide-react'
import type { Background, Race, Subrace } from '../../../api'
import { DEFAULT_SKILLS } from '../../../types/character'
import type { Character, CustomBackground } from '../../../types/character'
import { AreaField, ChipList, EdField, EdSection, TextField } from '../../editorFields'

const CUSTOM = '__custom'
const EMPTY_BG: CustomBackground = { name: '', description: '', skills: [], tools: [], languages: [], feature_name: '', feature_text: '' }

type Props = {
  c: Character
  set: (patch: Partial<Character>) => void
  raceCatalog: Race[]
  bgCatalog: Background[]
  subraces: Subrace[]
  originChanged: boolean
}

export function OriginSection({ c, set, raceCatalog, bgCatalog, subraces, originChanged }: Props) {
  return (
    <EdSection
      id="origin"
      icon={Compass}
      title="Происхождение"
      lead="Раса, подраса и предыстория из каталога. Их бонусы, владения и умения сервер выдаст сам после сохранения."
    >
      <div className="ed-grid">
        <EdField label="Раса" as="label">
          <select
            className="ed-input ed-select"
            value={c.race_id ?? ''}
            onChange={(e) => set({ race_id: e.target.value || null, subrace_id: null })}
          >
            <option value="">—</option>
            {[...raceCatalog]
              .sort((a, b) => a.race_name.localeCompare(b.race_name, 'ru'))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.race_name}
                </option>
              ))}
          </select>
        </EdField>
        <EdField label="Подраса" as="label">
          <select
            className="ed-input ed-select"
            value={c.subrace_id ?? ''}
            disabled={subraces.length === 0}
            onChange={(e) => set({ subrace_id: e.target.value || null })}
          >
            <option value="">{subraces.length ? '—' : 'нет'}</option>
            {subraces.map((sr) => (
              <option key={sr.id} value={sr.id}>
                {sr.subrace_name}
              </option>
            ))}
          </select>
        </EdField>
        <EdField label="Предыстория" as="label">
          <select
            className="ed-input ed-select"
            value={c.background_id ?? (c.custom_background ? CUSTOM : '')}
            onChange={(e) => {
              const v = e.target.value
              if (v === CUSTOM) set({ background_id: null, custom_background: c.custom_background ?? { ...EMPTY_BG } })
              else set({ background_id: v || null, custom_background: null })
            }}
          >
            <option value="">—</option>
            <option value={CUSTOM}>✎ Своя предыстория…</option>
            {[...bgCatalog]
              .sort((a, b) => a.background_name.localeCompare(b.background_name, 'ru'))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.background_name}
                </option>
              ))}
          </select>
        </EdField>
      </div>
      {!c.background_id && c.custom_background && (
        <CustomBackgroundFields bg={c.custom_background} onChange={(patch) => set({ custom_background: { ...c.custom_background!, ...patch } })} />
      )}
      {originChanged && <p className="ed-warn">Смена расы или предыстории заменит выданные ими умения — сервер пересоберёт их при сохранении.</p>}
      <div className="ed-sub">
        <h5>Внешность</h5>
        <div className="ed-grid">
          <TextField label="Пол" value={c.gender} onChange={(v) => set({ gender: v })} />
          <EdField label="Возраст" as="label">
            <input
              className="ed-input"
              inputMode="numeric"
              value={c.age ?? ''}
              placeholder="—"
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                set({ age: Number.isNaN(n) ? null : Math.max(0, n) })
              }}
            />
          </EdField>
          <TextField label="Рост" value={c.height} onChange={(v) => set({ height: v })} />
          <TextField label="Вес" value={c.weight} onChange={(v) => set({ weight: v })} />
          <TextField label="Глаза" value={c.eyes} onChange={(v) => set({ eyes: v })} />
          <TextField label="Волосы" value={c.hair} onChange={(v) => set({ hair: v })} />
          <TextField label="Кожа" value={c.skin} onChange={(v) => set({ skin: v })} />
        </div>
        <div className="ed-grid">
          <AreaField label="Облик" rows={3} value={c.appearance} onChange={(v) => set({ appearance: v })} />
        </div>
      </div>
    </EdSection>
  )
}

/** Своя предыстория: название, навыки, инструменты, языки и умение-напоминание */
function CustomBackgroundFields({ bg, onChange }: { bg: CustomBackground; onChange: (patch: Partial<CustomBackground>) => void }) {
  const skills = new Set(bg.skills)
  return (
    <div className="ed-sub">
      <h5>Своя предыстория</h5>
      <div className="ed-grid">
        <TextField label="Название" value={bg.name} onChange={(v) => onChange({ name: v })} />
        <TextField label="Умение предыстории" value={bg.feature_name} onChange={(v) => onChange({ feature_name: v })} />
      </div>
      <EdField label="Навыки" hint={`${skills.size} выбрано`} wide>
        <div className="ed-chips ed-chips--pick">
          {DEFAULT_SKILLS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`ed-chip ed-chip--pick${skills.has(s.key) ? ' is-on' : ''}`}
              aria-pressed={skills.has(s.key)}
              onClick={() => onChange({ skills: skills.has(s.key) ? bg.skills.filter((k) => k !== s.key) : [...bg.skills, s.key] })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </EdField>
      <div className="ed-grid">
        <EdField label="Инструменты">
          <ChipList items={bg.tools} onChange={(v) => onChange({ tools: v })} placeholder="Воровские инструменты…" />
        </EdField>
        <EdField label="Языки">
          <ChipList items={bg.languages} onChange={(v) => onChange({ languages: v })} placeholder="Эльфийский…" />
        </EdField>
      </div>
      <div className="ed-grid">
        <AreaField label="Умение: описание" rows={3} value={bg.feature_text} onChange={(v) => onChange({ feature_text: v })} />
        <AreaField label="О предыстории" rows={3} value={bg.description} onChange={(v) => onChange({ description: v })} />
      </div>
    </div>
  )
}
