/**
 * Готовые бонусы известных магических предметов (по названию, обе редакции).
 * Подставляются в предмет инвентаря при добавлении и настройке; игрок может их править.
 * Движок применяет бонусы, пока предмет надет и (если требует) настроен.
 */
import type { CustomModifier } from '../types/character'

const b = (label: string, target: string, value: unknown, op: CustomModifier['op'] = 'add'): CustomModifier =>
  ({ label, target, value, op, enabled: true }) as CustomModifier

const ac = (n: number) => b(`+${n} КД`, 'char.ac', n)
const saves = (n: number) => b(`+${n} к спасброскам`, 'char.save_bonus', n)
const score = (key: string, label: string, n: number) => b(`${label} ${n}`, `char.abilities.${key}.score`, n, 'max')
const plusScore = (key: string, label: string, n: number) => b(`+${n} ${label}`, `char.abilities.${key}.score`, n)
const spellAtk = (n: number) => b(`+${n} к атакам заклинаниями`, 'char.spell_attack_bonus', n)
const spellDc = (n: number) => b(`+${n} к Сл заклинаний`, 'char.spell_dc_bonus', n)

const PRESETS: Record<string, CustomModifier[]> = {
  'кольцо защиты': [ac(1), saves(1)],
  'плащ защиты': [ac(1), saves(1)],
  'наручи защиты': [ac(2)],
  'повязка интеллекта': [score('int', 'Интеллект', 19)],
  'амулет здоровья': [score('con', 'Телосложение', 19)],
  'перчатки огровой силы': [score('str', 'Сила', 19)],
  'рукавицы огровой силы': [score('str', 'Сила', 19)],
  'пояс силы холмового великана': [score('str', 'Сила', 21)],
  'пояс силы великана': [score('str', 'Сила', 21)],
  'пояс силы каменного великана': [score('str', 'Сила', 23)],
  'пояс силы ледяного великана': [score('str', 'Сила', 23)],
  'пояс силы огненного великана': [score('str', 'Сила', 25)],
  'пояс силы облачного великана': [score('str', 'Сила', 27)],
  'пояс силы штормового великана': [score('str', 'Сила', 29)],
  'пояс дварфов': [plusScore('con', 'Телосложение', 2)],
  'камень удачи': [b('+1 к проверкам', 'char.check_bonus', 1), saves(1)],
  'камень айун (защита)': [ac(1)],
  'камень айун (сила)': [plusScore('str', 'Сила', 2)],
  'камень айун (проворство)': [plusScore('dex', 'Ловкость', 2)],
  'камень айун (стойкость)': [plusScore('con', 'Телосложение', 2)],
  'камень айун (рассудок)': [plusScore('int', 'Интеллект', 2)],
  'камень айун (проницательность)': [plusScore('wis', 'Мудрость', 2)],
  'камень айун (лидерство)': [plusScore('cha', 'Харизма', 2)],
  'посох силы': [ac(2), saves(2), spellAtk(2)],
  'брошь защиты': [b('Сопротивление силовому полю', 'char.defense.resist', ['force'], 'union')],
  'медальон защиты от яда': [
    b('Иммунитет к яду', 'char.defense.immune', ['poison'], 'union'),
    b('Иммунитет к отравлению', 'char.defense.cond_immune', ['poisoned'], 'union'),
  ],
  'скарабей защиты': [b('Преимущество на спасброски от магии', 'char.adv.save', ['magic'], 'union')],
  'мантия сопротивления заклинаниям': [b('Преимущество на спасброски от заклинаний', 'char.adv.save', ['magic'], 'union')],
}

const norm = (s: string) => s.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е')
const BY_NAME = new Map(Object.entries(PRESETS).map(([k, v]) => [norm(k), v]))

/** «+N» в названии: палочка боевого мага, жезл хранителя договора */
const PLUS: [RegExp, (n: number) => CustomModifier[]][] = [
  [/^волшебная палочка боевого мага \+(\d)/, (n) => [spellAtk(n)]],
  [/^жезл хранителя договора \+(\d)/, (n) => [spellAtk(n), spellDc(n)]],
  [/^амулет посвященного \+(\d)/, (n) => [spellAtk(n), spellDc(n)]],
]

/** Готовые бонусы предмета по названию; [] — неизвестен */
export function itemPreset(name: string | null | undefined): CustomModifier[] {
  const key = norm(name ?? '')
  const direct = BY_NAME.get(key)
  if (direct) return direct.map((m) => ({ ...m }))
  for (const [re, make] of PLUS) {
    const m = re.exec(key)
    if (m) return make(Number(m[1]))
  }
  return []
}
