/** Строки листа: оружие с безоружным ударом и умения с чертами */
import { cleanDescription, realImage } from '../../api'
import type { Feat } from '../../api'
import { parseAbilityText } from '../../abilities/AbilityText'
import type { AbilityName, SheetView } from '../../types/character'
import { type FeatureRow, SOURCE_LABEL, type SheetAttack } from './rules'

/** Атаки листа по экземплярам инвентаря и безоружный удар последним */
export function buildAttacks(sheet: SheetView, mod: (k: AbilityName) => number, pb: number): SheetAttack[] {
  const extras = sheet.extras
  const strMod = mod('strength')
  const items = sheet.inventory.items
  // оружие — по экземплярам инвентаря: оттуда картинка и универсальный хват
  const itemById = new Map(items.map((it) => [it.instance_id, it]))
  const attacks: SheetAttack[] = sheet.attacks.map((a, i) => {
    const eq = a.inventory_instance_id ? itemById.get(a.inventory_instance_id)?.equipment : null
    const modPart = /[+\-−]\d+$/.exec(a.damage)?.[0] ?? ''
    return {
      ...a,
      key: a.inventory_instance_id ?? `atk-${i}`,
      versatile: eq?.weapon?.versatile_dice ? `${eq.weapon.versatile_dice}${modPart}` : null,
      image: realImage(eq?.equipment_image_gallery),
    }
  })
  // кость безоружного удара от Боевых искусств монаха: с ней можно бить Ловкостью
  const unarmedDie = extras?.unarmedDie ?? 1
  const unarmedMod = unarmedDie > 1 ? Math.max(strMod, mod('dexterity')) : strMod
  const signedMod = unarmedMod ? (unarmedMod > 0 ? `+${unarmedMod}` : `${unarmedMod}`) : ''
  attacks.push({
    key: 'unarmed',
    name: 'Безоружный удар',
    type: 'melee',
    attack_bonus: unarmedMod + pb,
    damage: unarmedDie > 1 ? `1d${unarmedDie}${signedMod}` : String(Math.max(1, 1 + unarmedMod)),
    damage_type: 'дробящий',
    range: '5 фт.',
    properties: [],
    versatile: null,
    image: null,
  })
  return attacks
}

/** Умения листа и черты из каталога — для плиток и попапа */
export function buildFeatureRows(sheet: SheetView, featCatalog: Feat[]): FeatureRow[] {
  const info = sheet.basic_info
  // feature_source в листе — UUID; в подписи показываем название владельца
  const ownerOf = (source: string): string | null =>
    source === 'class'
      ? (info.classes[0]?.name ?? null)
      : source === 'subclass'
        ? (info.classes[0]?.subclass_name ?? null)
        : source === 'subrace'
          ? (info.subrace?.name ?? null)
          : source === 'race'
            ? info.race.name
            : source === 'background'
              ? (info.background?.name ?? null)
              : null

  return [
    ...sheet.features.map((f, i) => ({
      key: f.grant_id ?? `${f.name}-${i}`,
      source: f.source,
      title: f.name,
      // уровень получения — из служебной строки описания («3-й уровень, умение воина»)
      sub: [
        SOURCE_LABEL[f.source] ?? '',
        ownerOf(f.source),
        f.level ? `${f.level} ур.` : (/^\d+ ур\./.exec(parseAbilityText(f.description).meta[0] ?? '')?.[0] ?? ''),
      ]
        .filter(Boolean)
        .join(' · '),
      text: f.description,
      grantId: f.grant_id,
      slug: f.slug,
      disabled: f.disabled,
      status: f.implementation_status,
      active: f.active,
    })),
    ...sheet.feats.map((featId) => {
      const feat = featCatalog.find((x) => x.id === featId)
      return {
        key: featId,
        source: 'feat',
        title: feat?.feat_name ?? 'Черта',
        sub: ['черта', feat?.prerequisite ? `требование: ${feat.prerequisite}` : ''].filter(Boolean).join(' · '),
        text: cleanDescription(feat?.description),
      }
    }),
  ]
}
