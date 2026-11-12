import { useCallback, useState } from 'react'
import {
  CircleSlash,
  Eye,
  Flame,
  Languages,
  Moon,
  Radar,
  ShieldCheck,
  ShieldHalf,
  HeartCrack,
  Sparkles,
  TreePine,
} from 'lucide-react'
import type { Creature } from '../api'
import { abilitiesFromSkills } from '../skills'
import { ABILITY_LABELS } from '../types/character'
import { abilityMod, signed, useCreatureDice } from './dice'
import { ABILITIES } from './boardData'
import { CONDITION_ICONS, cleanCondition, iconFor } from './boardData'
import { BoardCard, type BoardRoll, DamageBand, RollToast, SensesSonar } from './BoardParts'
import { SizeCard } from './HeightChart'

export function CreatureBoard({ c, image }: { c: Creature; image: string | null }) {
  const [roll, setRoll] = useState<BoardRoll | null>(null)
  const clearRoll = useCallback(() => setRoll(null), [])
  const dice = useCreatureDice()
  const rollD20 = async (label: string, bonus: number) => {
    const values = await dice.roll(1, 20)
    if (values) setRoll((prev) => ({ id: (prev?.id ?? 0) + 1, label, bonus, die: values[0] }))
  }

  const saves = c.saving_throws ?? {}
  const skills = Object.entries(c.skills ?? {})
  const hasDamage = !!(c.damage_imunities?.length || c.damage_resistances?.length || c.damage_vulnerabilities?.length)
  const conditions = (c.condition_imunities ?? []).map(cleanCondition).filter(Boolean)
  const senses = [
    c.night_vision ? { label: 'тёмное зрение', ft: c.night_vision, Icon: Moon } : null,
    c.blind_vision ? { label: 'слепое зрение', ft: c.blind_vision, Icon: Radar } : null,
    c.true_vision ? { label: 'истинное зрение', ft: c.true_vision, Icon: Eye } : null,
  ].filter((s): s is NonNullable<typeof s> => !!s)
  const languages = c.languages?.filter(Boolean) ?? []
  const habitat = c.area_of_living?.filter(Boolean) ?? []

  return (
    <div className="beast-board">
      <BoardCard title="Спасброски" icon={ShieldCheck} className="beast-card--saves">
        <div className="beast-saves">
          {ABILITIES.map((a) => {
            const score = (c[a.key] as number | null) ?? 10
            const prof = saves[a.save] != null
            const bonus = saves[a.save] ?? abilityMod(score)
            return (
              <button
                key={a.key}
                type="button"
                className={`beast-save${prof ? ' is-prof' : ''}`}
                onClick={() => void rollD20(`${a.name}, спасбросок`, bonus)}
                disabled={dice.rolling}
                title={prof ? `${a.name} — владение` : a.name}
              >
                <span className="beast-save-inner">
                  <b>{signed(bonus)}</b>
                  <i>{a.short}</i>
                </span>
              </button>
            )
          })}
        </div>
      </BoardCard>

      {skills.length > 0 && (
        <BoardCard title="Навыки" icon={Sparkles} className="beast-card--skills">
          <div className="beast-skills">
            {skills.map(([name, bonus]) => {
              const ability = abilitiesFromSkills([name])[0]
              return (
                <button
                  key={name}
                  type="button"
                  className="beast-skill"
                  onClick={() => void rollD20(name, bonus)}
                  disabled={dice.rolling}
                >
                  <span className="beast-skill-bonus">{signed(bonus)}</span>
                  <span className="beast-skill-name">{name}</span>
                  {ability && <span className="beast-skill-ab">{ABILITY_LABELS[ability].abbr}</span>}
                </button>
              )
            })}
          </div>
        </BoardCard>
      )}

      <SizeCard size={c.size} creatureType={c.creature_type} image={image} name={c.name} />

      {hasDamage && (
        <BoardCard title="Урон" icon={Flame} wide className="beast-card--damage">
          <div className="beast-dmg">
            <DamageBand kind="immune" title="Иммунитет" icon={ShieldCheck} list={c.damage_imunities} />
            <DamageBand kind="resist" title="Сопротивление" icon={ShieldHalf} list={c.damage_resistances} />
            <DamageBand kind="vuln" title="Уязвимость" icon={HeartCrack} list={c.damage_vulnerabilities} />
          </div>
        </BoardCard>
      )}

      {conditions.length > 0 && (
        <BoardCard title="Иммунитет к состояниям" icon={CircleSlash}>
          <div className="beast-conds">
            {conditions.map((name) => {
              const Icon = iconFor(CONDITION_ICONS, name) ?? CircleSlash
              return (
                <span key={name} className="beast-cond" title={`не подвержено: ${name}`}>
                  <span className="beast-cond-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  {name}
                </span>
              )
            })}
          </div>
        </BoardCard>
      )}

      {senses.length > 0 && (
        <BoardCard title="Чувства" icon={Eye}>
          <SensesSonar senses={senses} />
        </BoardCard>
      )}

      {(languages.length > 0 || habitat.length > 0) && (
        <BoardCard title={languages.length ? 'Языки' : 'Среда обитания'} icon={languages.length ? Languages : TreePine}>
          {languages.length > 0 && (
            <div className="beast-langs">
              {languages.map((l) => (
                <span key={l} className="beast-lang">{l}</span>
              ))}
            </div>
          )}
          {languages.length > 0 && habitat.length > 0 && (
            <h3 className="beast-card-title beast-card-title--sub">
              <TreePine aria-hidden="true" /> Среда обитания
            </h3>
          )}
          {habitat.length > 0 && (
            <div className="beast-langs">
              {habitat.map((h) => (
                <span key={h} className="beast-lang">{h}</span>
              ))}
            </div>
          )}
        </BoardCard>
      )}

      <RollToast roll={roll} onDone={clearRoll} />
    </div>
  )
}
