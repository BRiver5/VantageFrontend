import { describe, expect, it } from 'vitest'
import type { Equipment } from './api'
import { equipmentFact, equipmentKicker, equipmentNotes, equipmentTone, showsDescription } from './equipmentFacts'

const eq = (o: Record<string, unknown>) =>
  ({ category: 'Снаряжение', subcategory: null, tags: [], weapon: null, defense: null, container: null, bundle_size: null, description: 'Текст', ...o }) as unknown as Equipment
const weapon = (o: Record<string, unknown> = {}) => ({
  weapon_kind: 'Воинское', attack_kind: 'Рукопашное', damage_dice: '1d8', damage_type: 'Рубящий', versatile_dice: null,
  properties: [], mastery: [], range_normal: null, range_long: null, ...o,
})
const armor = (o: Record<string, unknown> = {}) => ({
  armor_class: 14, armor_class_formula: null, armor_kind: 'Средний доспех', add_dex_modifier: false, dex_modifier_cap: null,
  strength_requirement: null, stealth_disadvantage: false, hit_points: null, ...o,
})
const box = (o: Record<string, unknown> = {}) => ({ container_kind: 'bag', slots: null, capacity_pounds: null, default_contents: [], ...o })

describe('карточка снаряжения', () => {
  it('оружие: урон, вид, свойства, дальность и приём', () => {
    const sword = eq({
      category: 'Оружие', subcategory: 'Воинское оружие, Рукопашное оружие',
      weapon: weapon({ versatile_dice: '1d10', properties: ['Универсальное', 'Метательное'], range_normal: 20, range_long: 60, mastery: ['Изнурение'] }),
    })
    expect(equipmentFact(sword)).toEqual({ value: '1к8', label: 'рубящий' })
    expect(equipmentKicker(sword)).toBe('Воинское · рукопашное')
    expect(equipmentNotes(sword)).toEqual(['универсальное 1к10', 'метательное', '20/60 фт.', 'приём: изнурение'])
    expect(showsDescription(sword)).toBe(false)
  })

  it('приём строкой или пустой не ломает строку свойств', () => {
    expect(equipmentNotes(eq({ weapon: weapon({ mastery: 'Задевание' }) }))).toEqual(['приём: задевание'])
    expect(equipmentNotes(eq({ weapon: weapon({ mastery: null }) }))).toEqual([])
  })

  it('доспех и щит', () => {
    expect(equipmentFact(eq({ defense: armor({ add_dex_modifier: true, dex_modifier_cap: 2 }) }))).toEqual({ value: 'КД 14', label: '+ ЛОВ (макс. 2)' })
    expect(equipmentFact(eq({ defense: armor({ add_dex_modifier: true }) }))?.label).toBe('+ ЛОВ')
    expect(equipmentFact(eq({ defense: armor({ armor_class: 2, armor_kind: 'Щит' }) }))?.value).toBe('КД +2')
    expect(equipmentNotes(eq({ defense: armor({ strength_requirement: 15, stealth_disadvantage: true }) }))).toEqual(['Сила 15', 'помеха скрытности'])
  })

  it('пачки, наборы и вместимость', () => {
    const arrows = eq({ category: 'Боеприпасы', bundle_size: 20 })
    expect(equipmentFact(arrows)).toEqual({ value: '20 шт.', label: 'в пачке' })
    expect(showsDescription(arrows)).toBe(false)
    expect(equipmentFact(eq({ container: box({ default_contents: Array(11).fill({}) }) }))).toEqual({ value: '11', label: 'предметов внутри' })
    expect(equipmentFact(eq({ container: box({ capacity_pounds: 30 }) }))).toEqual({ value: '30 фнт.', label: 'вмещает' })
    expect(equipmentFact(eq({ container: box() }))).toBeNull()
  })

  it('без показателей остаётся описание', () => {
    const beast = eq({ category: 'Животные' })
    expect(equipmentFact(beast)).toBeNull()
    expect(showsDescription(beast)).toBe(true)
    expect(showsDescription(eq({ description: null }))).toBe(false)
  })

  it('подпись и оттенок', () => {
    expect(equipmentKicker(eq({ tags: ['одежда'] }))).toBe('Снаряжение · одежда')
    expect(equipmentKicker(eq({ category: 'Инструменты', tags: ['инструмент'] }))).toBe('Инструменты')
    expect(equipmentKicker(eq({ category: 'Музыкальные инструменты', tags: ['музыкальный инструмент'] }))).toBe('Музыкальные инструменты')
    expect(equipmentTone('Доспехи')).toBe('steel')
    expect(equipmentTone(null)).toBe('plain')
  })
})
