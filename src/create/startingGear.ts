/**
 * Стартовое снаряжение в визарде: выбор вариантов «а / б / в» и конкретных
 * предметов для «любое воинское оружие», а затем — превращение выбора в
 * инвентарь, кошелёк, надетый доспех (КД) и атаки листа.
 *
 * Гранты приходят с бэка уже размеченными (`starting_equipment` у класса и
 * предыстории). Решения игрока лежат в черновике по ключу гранта, в который
 * входит id класса/предыстории — после смены класса старые решения просто
 * перестают совпадать, сбрасывать их отдельно не нужно.
 */
import type { Currency, Equipment, EquipmentGrant, EquipmentIndex, GrantEntry, Item } from '../api'
import { matchesGrantEntry } from '../equipment'
import type { AbilityName, AttackEntry, InventoryItemInstance } from '../types/character'
import { abilityMod } from './dnd5e'
import type { CharacterDraft } from './draft'

/** Решение по одному гранту: номер варианта и выбранные slug для choice-записей */
export interface GearPick {
  option: number
  /** индекс записи внутри варианта → выбранные slug (по одному на choose_count) */
  choices: Record<number, string[]>
}

export interface GrantRef {
  key: string
  source: 'class' | 'background'
  grant: EquipmentGrant
}

const COIN_CURRENCY: Record<string, Currency> = {
  'copper-coin-phb': 'cp',
  'silver-coin-phb': 'sp',
  'electrum-coin-phb': 'ep',
  'gold-coin-phb': 'gp',
  'platinum-coin-phb': 'pp',
}

/** Монета ли это — вместо предмета она уходит в кошелёк */
export function coinOf(slug: string): Currency | null {
  if (COIN_CURRENCY[slug]) return COIN_CURRENCY[slug]
  const m = /^(copper|silver|electrum|gold|platinum)-coin/.exec(slug)
  if (!m) return null
  return ({ copper: 'cp', silver: 'sp', electrum: 'ep', gold: 'gp', platinum: 'pp' } as const)[
    m[1] as 'copper' | 'silver' | 'electrum' | 'gold' | 'platinum'
  ]
}

/** Слепок того, из чего собран стартовый инвентарь — для проверки ручной правки */
export function gearKey(draft: CharacterDraft): string {
  return JSON.stringify([draft.cls?.id ?? null, draft.background?.id ?? null, draft.gear])
}

/** Ручной инвентарь черновика, если он ещё соответствует выбору снаряжения */
export function customInventory(draft: CharacterDraft): InventoryItemInstance[] | null {
  return draft.inventory && draft.inventoryKey === gearKey(draft) ? draft.inventory : null
}

/** Все гранты класса и предыстории с ключами для черновика */
export function draftGrants(draft: CharacterDraft): GrantRef[] {
  const out: GrantRef[] = []
  draft.cls?.starting_equipment?.forEach((grant, i) =>
    out.push({ key: `class:${draft.cls!.id}:${i}`, source: 'class', grant }),
  )
  draft.background?.starting_equipment?.forEach((grant, i) =>
    out.push({ key: `bg:${draft.background!.id}:${i}`, source: 'background', grant }),
  )
  return out
}

/** Решение по гранту; по умолчанию — первый вариант, предметы не выбраны */
export function pickOf(draft: CharacterDraft, key: string): GearPick {
  return draft.gear[key] ?? { option: 0, choices: {} }
}

/** Варианты предметов для choice-записи — из каталога по фильтрам гранта */
export function choiceCandidates(entry: GrantEntry, index: EquipmentIndex | null): Equipment[] {
  if (!index) return []
  return index.list
    .filter((eq) => matchesGrantEntry(eq, entry))
    .sort((a, b) => a.equipment_name.localeCompare(b.equipment_name, 'ru'))
}

/** Все ли выборы конкретных предметов сделаны */
export function gearReady(draft: CharacterDraft): boolean {
  return draftGrants(draft).every(({ key, grant }) => {
    const pick = pickOf(draft, key)
    const option = grant.options[pick.option] ?? grant.options[0]
    return (option?.entries ?? []).every((entry, i) => {
      if (entry.slug) return true
      const chosen = pick.choices[i] ?? []
      return chosen.length >= entry.choose_count && chosen.every(Boolean)
    })
  })
}

export interface ResolvedGear {
  items: { eq: Equipment; quantity: number }[]
  currency: Partial<Record<Currency, number>>
}

/** Итог выбора: предметы (одинаковые стопкой) и монеты */
export function resolveGear(draft: CharacterDraft, index: EquipmentIndex | null): ResolvedGear {
  const counts = new Map<string, number>()
  const currency: Partial<Record<Currency, number>> = {}

  const add = (slug: string, quantity: number) => {
    const coin = coinOf(slug)
    if (coin) {
      currency[coin] = (currency[coin] ?? 0) + quantity
      return
    }
    counts.set(slug, (counts.get(slug) ?? 0) + quantity)
  }

  for (const { key, grant } of draftGrants(draft)) {
    const pick = pickOf(draft, key)
    const option = grant.options[pick.option] ?? grant.options[0]
    option?.entries.forEach((entry, i) => {
      if (entry.slug) {
        add(entry.slug, entry.quantity)
        for (const c of entry.contents) add(c.slug, c.quantity)
        return
      }
      for (const slug of pick.choices[i] ?? []) if (slug) add(slug, Math.max(1, entry.quantity))
    })
  }

  const items: ResolvedGear['items'] = []
  for (const [slug, quantity] of counts) {
    const eq = index?.bySlug.get(slug)
    if (eq) items.push({ eq, quantity })
  }
  return { items, currency }
}

/* ---------- Доспех и КД ---------- */

const isShield = (eq: Equipment) => eq.defense?.armor_kind === 'Щит'
const isBodyArmor = (eq: Equipment) =>
  eq.category === 'Доспехи' && !!eq.defense?.armor_class && !isShield(eq)

function armorAc(eq: Equipment, dexMod: number): number {
  const d = eq.defense!
  const dex = d.add_dex_modifier ? (d.dex_modifier_cap != null ? Math.min(dexMod, d.dex_modifier_cap) : dexMod) : 0
  return (d.armor_class ?? 10) + dex
}

/**
 * Что надеть и какой выйдет КД. Из доспехов берём дающий больший КД, щит —
 * если он есть. Без доспеха у варвара и монаха — их «Защита без доспехов».
 */
export function wornDefense(
  items: Equipment[],
  className: string,
  scores: Record<AbilityName, number>,
): { armor: Equipment | null; shield: Equipment | null; ac: number } {
  const dexMod = abilityMod(scores.dexterity)
  const armor =
    items.filter(isBodyArmor).sort((a, b) => armorAc(b, dexMod) - armorAc(a, dexMod))[0] ?? null
  const monk = className === 'Монах'
  // монах теряет «Защиту без доспехов» со щитом — щит ему не надеваем
  const shield = monk ? null : (items.find(isShield) ?? null)

  let ac = 10 + dexMod
  if (armor) ac = armorAc(armor, dexMod)
  else if (className === 'Варвар') ac = 10 + dexMod + abilityMod(scores.constitution)
  else if (monk) ac = 10 + dexMod + abilityMod(scores.wisdom)
  if (shield) ac += shield.defense?.armor_class ?? 2
  return { armor, shield, ac }
}

/* ---------- Атаки ---------- */

/** «Длинные мечи» → {«дли», «меч»}; сравниваем короткие основы, а не словоформы */
function stems(text: string): string[] {
  return text
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.slice(0, 3))
}

/** Владеет ли класс оружием: по виду («воинское оружие») или по названию */
export function weaponProficient(eq: Equipment, proficiencies: string[]): boolean {
  const kind = eq.weapon?.weapon_kind?.toLocaleLowerCase('ru') ?? ''
  const name = new Set(stems(eq.equipment_name))
  return proficiencies.some((p) => {
    const low = p.toLocaleLowerCase('ru')
    if (kind && low.startsWith(kind.slice(0, 5)) && low.includes('оружие')) return true
    const need = stems(p)
    return need.length > 0 && need.every((s) => name.has(s))
  })
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/** Строка атаки листа для оружия из инвентаря */
export function weaponAttack(
  eq: Equipment,
  instanceId: string,
  scores: Record<AbilityName, number>,
  pb: number,
  proficiencies: string[],
): AttackEntry | null {
  const w = eq.weapon
  if (!w?.damage_dice) return null
  const ranged = w.attack_kind === 'Дальнобойное'
  const finesse = w.properties.includes('Фехтовальное')
  const str = abilityMod(scores.strength)
  const dex = abilityMod(scores.dexterity)
  const mod = ranged ? dex : finesse ? Math.max(str, dex) : str
  const bonus = mod + (weaponProficient(eq, proficiencies) ? pb : 0)
  const range =
    w.range_normal != null
      ? `${w.range_normal}/${w.range_long ?? w.range_normal} фт.`
      : w.properties.includes('Досягаемость')
        ? '10 фт.'
        : '5 фт.'
  return {
    name: eq.equipment_name,
    type: ranged ? 'ranged' : 'melee',
    attack_bonus: bonus,
    damage: mod === 0 ? w.damage_dice : `${w.damage_dice}${signed(mod)}`,
    damage_type: w.damage_type ?? '',
    range,
    properties: w.properties,
    inventory_instance_id: instanceId,
  }
}

/** Экземпляр предмета для сетки инвентаря шириной 7 */
export function inventoryItem(
  eq: Equipment,
  quantity: number,
  slot: number,
  equip: { equipped: boolean; slot: string | null },
): InventoryItemInstance {
  return {
    instance_id: crypto.randomUUID(),
    kind: 'equipment',
    equipment: eq,
    magic_item: null,
    catalog_ref: eq.id,
    quantity,
    notes: '',
    position: { col: slot % 7, row: Math.floor(slot / 7) },
    equipped: equip.equipped,
    equip_slot: equip.slot,
    is_attuned: false,
  }
}

/** Магический предмет из каталога `/items` — в ту же сетку инвентаря */
export function magicInventoryItem(it: Item): InventoryItemInstance {
  return {
    instance_id: crypto.randomUUID(),
    kind: 'magic_item',
    equipment: null,
    magic_item: it,
    catalog_ref: it.id,
    quantity: 1,
    notes: '',
    position: { col: 0, row: 0 },
    equipped: false,
    equip_slot: null,
    is_attuned: false,
  }
}
