/** Строки листа: оружие с безоружным ударом и умения с чертами */
import { cleanDescription, realImage } from '../../api'
import type { Feat } from '../../api'
import { parseAbilityText } from '../../abilities/AbilityText'
import type { AbilityName, FeatureEntry, SheetView } from '../../types/character'
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
      // двуручный хват: от движка (с костью Боевых искусств), иначе из профиля оружия
      versatile: a.versatile ?? (eq?.weapon?.versatile_dice ? `${eq.weapon.versatile_dice}${modPart}` : null),
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

/** Подпись «название (редакция)»: «Следопыт (2024)», общая запись — «(2014/2024)» */
export function withEdition(name: string, editions: string[] | undefined): string {
  return editions?.length ? `${name} (${editions.join('/')})` : name
}

/**
 * Владелец умения для подписи карточки: по source_kind + source_id гранта. Название и редакцию
 * отдаёт сервер (документ источника по id); без них — поиск по id среди классов, расы и
 * предыстории персонажа (у мультикласса умение подписано своим классом, а не первым).
 */
export function featureOwner(sheet: SheetView, f: FeatureEntry): string | null {
  if (f.source_name) return withEdition(f.source_name, f.source_editions)
  const info = sheet.basic_info
  const id = f.feature_source ?? null
  const known = (name: string | null | undefined) => (name && name !== '—' ? name : null)
  switch (f.source) {
    case 'class':
      return known(id ? info.classes.find((c) => c.source === id)?.name : null)
    case 'subclass':
      return known(id ? info.classes.find((c) => c.subclass_source === id)?.subclass_name : null)
    case 'race':
      return known(!id || info.race.source === id ? info.race.name : null)
    case 'subrace':
      return known(info.subrace && (!id || info.subrace.source === id) ? info.subrace.name : null)
    case 'background':
      return known(info.background && (!id || info.background.source === id) ? info.background.name : null)
    default:
      return null
  }
}

/** Умения листа и черты из каталога — для плиток и попапа */
export function buildFeatureRows(sheet: SheetView, featCatalog: Feat[]): FeatureRow[] {
  return [
    ...sheet.features.map((f, i) => ({
      key: f.grant_id ?? `${f.name}-${i}`,
      source: f.source,
      title: f.name,
      // уровень получения — из служебной строки описания («3-й уровень, умение воина»)
      sub: [
        SOURCE_LABEL[f.source] ?? '',
        featureOwner(sheet, f),
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
