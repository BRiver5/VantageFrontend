import { describe, expect, it } from 'vitest'
import { emptySheetView, type AttackEntry, type EngineWeaponAttack, type FeatureEntry, type SheetView } from '../../types/character'
import { mergeWeaponAttacks } from '../sheetView'
import { attackTags } from '../rollBonuses'
import { buildAttacks, buildFeatureRows, featureOwner, withEdition } from './sheetRows'

/** Монах/Следопыт: первый класс — Монах */
function multiclassSheet(): SheetView {
  const v = emptySheetView({ className: 'Монах', raceName: '—' })
  v.basic_info.classes = [
    { ...v.basic_info.classes[0], name: 'Монах', source: 'monk-id', subclass_name: 'Путь тени', subclass_source: 'shadow-id' },
    { ...v.basic_info.classes[0], name: 'Следопыт', source: 'ranger-id', subclass_name: null, subclass_source: null },
  ]
  v.basic_info.race = { name: '—', source: 'thri-kreen-id' }
  return v
}

const feature = (over: Partial<FeatureEntry>): FeatureEntry => ({ name: 'Умение', source: 'class', description: '', ...over })

describe('featureOwner', () => {
  it('название и редакция источника с сервера', () => {
    const v = multiclassSheet()
    expect(featureOwner(v, feature({ source: 'race', feature_source: 'thri-kreen-id', source_name: 'Трикрин', source_editions: ['2014'] }))).toBe(
      'Трикрин (2014)',
    )
    expect(featureOwner(v, feature({ source: 'class', feature_source: 'ranger-id', source_name: 'Следопыт', source_editions: ['2024'] }))).toBe(
      'Следопыт (2024)',
    )
    expect(withEdition('Чародей', ['2014', '2024'])).toBe('Чародей (2014/2024)')
    expect(withEdition('Кунай', [])).toBe('Кунай')
  })

  it('без названия с сервера — класс по id гранта, а не первый класс', () => {
    const v = multiclassSheet()
    expect(featureOwner(v, feature({ source: 'class', feature_source: 'ranger-id' }))).toBe('Следопыт')
    expect(featureOwner(v, feature({ source: 'class', feature_source: 'monk-id' }))).toBe('Монах')
    expect(featureOwner(v, feature({ source: 'subclass', feature_source: 'shadow-id' }))).toBe('Путь тени')
    // неизвестный класс — без подписи, но не чужой класс
    expect(featureOwner(v, feature({ source: 'class', feature_source: 'other-id' }))).toBeNull()
  })

  it('«—» вместо имени расы не показывается', () => {
    const v = multiclassSheet()
    expect(featureOwner(v, feature({ source: 'race', feature_source: 'thri-kreen-id' }))).toBeNull()
  })

  it('подпись карточки: вид источника · владелец', () => {
    const v = multiclassSheet()
    v.features = [feature({ name: 'Избранный враг', grant_id: 'g1', source: 'class', feature_source: 'ranger-id', source_name: 'Следопыт', source_editions: ['2024'] })]
    expect(buildFeatureRows(v, [])[0].sub).toBe('умение класса · Следопыт (2024)')
  })
})

const engineWeapon = (over: Partial<EngineWeaponAttack>): EngineWeaponAttack => ({
  instance_id: 'kunai',
  name: 'Кунай',
  type: 'melee',
  attack_bonus: 6,
  damage: '1d8+3',
  versatile: null,
  damage_type: 'Колющий',
  range: '20/60 фт.',
  properties: ['Лёгкое', 'Метательное'],
  ability: 'dex',
  proficient: true,
  equipped: true,
  rules: ['Боевые искусства'],
  ...over,
})

describe('mergeWeaponAttacks', () => {
  const snapshot: AttackEntry = {
    name: 'Кунай',
    type: 'melee',
    attack_bonus: 2,
    damage: '1d4',
    damage_type: 'Колющий',
    range: '20/60 фт.',
    properties: ['Лёгкое', 'Метательное'],
    inventory_instance_id: 'kunai',
  }
  const manual: AttackEntry = { name: 'Своя атака', type: 'other', attack_bonus: 1, damage: '1d6', damage_type: '', range: '', properties: [] }

  it('снимок при создании получает живые числа движка', () => {
    const [a, b] = mergeWeaponAttacks([snapshot, manual], [engineWeapon({})])
    expect(a).toMatchObject({ name: 'Кунай', attack_bonus: 6, damage: '1d8+3', ability: 'dex', rules: ['Боевые искусства'] })
    expect(b).toBe(manual)
  })

  it('оружие без строки появляется само: надетое первым, из сумки — следом', () => {
    const list = mergeWeaponAttacks([], [engineWeapon({ instance_id: 'sickle', name: 'Серп', equipped: false }), engineWeapon({})])
    expect(list.map((a) => [a.name, a.equipped])).toEqual([
      ['Кунай', true],
      ['Серп', false],
    ])
  })

  it('ручная строка оружия сохраняет свои числа, скрытая — пропадает', () => {
    const own = { ...snapshot, manual: true, attack_bonus: 9, damage: '2d4+5' }
    expect(mergeWeaponAttacks([own], [engineWeapon({})])[0]).toMatchObject({ attack_bonus: 9, damage: '2d4+5' })
    expect(mergeWeaponAttacks([{ ...snapshot, hidden: true }], [engineWeapon({})])).toEqual([])
  })

  it('строка проданного оружия пропадает, своя атака остаётся', () => {
    expect(mergeWeaponAttacks([snapshot, manual], [])).toEqual([manual])
  })

  it('без данных движка — строки документа как есть', () => {
    expect(mergeWeaponAttacks([snapshot], undefined)).toEqual([snapshot])
  })

  it('лист: кость и Ловкость монаха в строке атаки и тегах броска', () => {
    const v = emptySheetView()
    v.attacks = mergeWeaponAttacks([], [engineWeapon({ name: 'Посох', instance_id: 'staff', versatile: '1d8+3', damage: '1d6+3' })])
    const [staff] = buildAttacks(v, () => 0, 2)
    expect(staff.versatile).toBe('1d8+3')
    expect(attackTags(staff, v)).toMatchObject({ ability: 'dexterity' })
    expect(attackTags(staff, v).tags).toContain('melee_dex')
  })
})
