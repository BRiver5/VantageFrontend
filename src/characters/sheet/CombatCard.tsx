import type { ReactNode } from 'react'
import { Crosshair, Hand, Sparkles, Swords } from 'lucide-react'
import type { SheetView } from '../../types/character'
import { formatDice } from '../../equipment'
import type { SheetRoller } from '../sheetPlay'
import { attackTags, d20Cards, tagBonus, tagCards, type RollContext } from '../rollBonuses'
import { type SheetAttack, parseDamage, signed } from './rules'
import { Card, DieButton, WeaponArt } from './parts'

/** Строка оружия: бросок атаки, урона и двуручного хвата */
export function AttackRow({
  a,
  sheet,
  critFor,
  rollD20,
  rollDamage,
  rolling,
}: {
  a: SheetAttack
  sheet: SheetView
  critFor: string | null
  rollD20: SheetRoller['rollD20']
  rollDamage: SheetRoller['rollDamage']
  rolling: boolean
}) {
  const crit = critFor === a.key
  // бонусы способностей по тегам атаки: к попаданию и к урону (Ярость +2)
  const { tags, ability } = attackTags(a, sheet)
  const ctx: RollContext = { kind: 'attack', ability, tags }
  const hit = a.attack_bonus + tagBonus(sheet, 'attackBonus', tags)
  const dmgExtra = tagBonus(sheet, 'dmgBonus', tags)
  const dmg = parseDamage(a.damage)
  const dmgText = (formula: string) => {
    const p = parseDamage(formula)
    if (!p || !dmgExtra) return formatDice(formula) ?? formula
    const b = p.bonus + dmgExtra
    return p.n ? `${p.n}к${p.sides}${b ? signed(b) : ''}` : String(Math.max(1, b))
  }
  const props = [a.range, ...a.properties].filter(Boolean).join(' · ')
  return (
    <div className={`cw-wpn${crit ? ' is-crit' : ''}`}>
      <WeaponArt src={a.image} icon={a.type === 'ranged' ? Crosshair : a.key === 'unarmed' ? Hand : Swords} />
      <span className="cw-wpn-body">
        <b>{a.name}</b>
        <i title={props}>{props}</i>
      </span>
      <span className="cw-wpn-dice">
        <DieButton
          sides={20}
          value={signed(hit)}
          label="атака"
          onClick={() =>
            void rollD20(`${a.name}, попадание`, hit, a.key, {
              ...ctx,
              bonuses: [...d20Cards(sheet, ctx, a.attack_bonus), ...tagCards(sheet, 'attackBonus', tags)],
            })
          }
          disabled={rolling}
          title="Бросок атаки: к20 + бонус"
        />
        {a.damage && (
          <DieButton
            sides={dmg?.sides ?? 0}
            value={dmgText(a.damage)}
            label={crit ? 'крит ×2' : (a.damage_type || 'урон').toLocaleLowerCase('ru')}
            hot={crit}
            onClick={() => void rollDamage(`${a.name}, урон`, a.damage, a.key, { kind: 'damage', ability, tags })}
            disabled={rolling}
            title={crit ? 'Критическое попадание: кости урона удваиваются' : 'Бросок урона'}
          />
        )}
        {a.versatile && (
          <DieButton
            sides={parseDamage(a.versatile)?.sides ?? 0}
            value={dmgText(a.versatile)}
            label="двуручно"
            hot={crit}
            onClick={() => void rollDamage(`${a.name}, двуручно`, a.versatile!, a.key, { kind: 'damage', ability, tags })}
            disabled={rolling}
            title="Универсальное оружие двумя руками"
          />
        )}
      </span>
    </div>
  )
}

/** Строка «Атака заклинанием» — только у заклинателя с бонусом атаки */
export function SpellAttackRow({
  spell,
  rollD20,
  rolling,
}: {
  spell: SheetView['spellcasting']
  rollD20: SheetRoller['rollD20']
  rolling: boolean
}) {
  return (
    <div className="cw-wpn cw-wpn--spell">
      <WeaponArt src={null} icon={Sparkles} />
      <span className="cw-wpn-body">
        <b>Атака заклинанием</b>
        <i>Сл спасброска {spell.spell_save_dc}</i>
      </span>
      <span className="cw-wpn-dice">
        <DieButton
          sides={20}
          value={signed(spell.spell_attack_bonus!)}
          label="атака"
          onClick={() =>
            void rollD20('Атака заклинанием', spell.spell_attack_bonus!, 'spell', {
              kind: 'spell',
              ability: spell.spellcasting_ability ?? undefined,
              tags: ['spell'],
            })
          }
          disabled={rolling}
        />
      </span>
    </div>
  )
}

/** Карточка «Бой»: оружие и атака заклинанием */
export function CombatCard({ perAction, critMin, children }: { perAction: number; critMin: number; children: ReactNode }) {
  return (
    <Card
      title="Бой"
      icon={Swords}
      className="cw-sheet-card--combat"
      aside={[perAction > 1 ? `атак за действие: ×${perAction}` : '', critMin < 20 ? `крит от ${critMin}` : ''].filter(Boolean).join(' · ') || null}
    >
      <div className="cw-wpns">{children}</div>
    </Card>
  )
}
