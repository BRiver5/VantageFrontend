import {
  sizeRu,
} from '../../api'
import type {
  BookMap,
  Creature,
  Equipment,
  Feat,
  Background,
  Item,
  MetaEnums,
  Spell,
} from '../../api'
import { ABILITY_KEYS, ABILITY_LABELS } from '../../types/character'
import type { AbilityName } from '../../types/character'
import { abilitiesFromSkills } from '../../skills'
import { containerKindRu } from '../../equipment'
import { type FilterGroup, type FilterOption, cap } from './config'
import { PRICE_BANDS, RARITY_COLOR, RARITY_FILTERS, rarityKeyOf } from './rarity'
import { CREATURE_TYPES, DANGER_TIERS, MOVE_MODES, SIZE_KEYS, creatureBaseType, dangerTier } from './creatures'

export const itemFilters: FilterGroup<Item>[] = [
  {
    key: 'rarity',
    label: 'Редкость',
    options: () => RARITY_FILTERS.map((f) => ({ ...f, color: RARITY_COLOR[f.key] })),
    match: (it, sel) => sel.includes(rarityKeyOf(it.rarity)),
  },
  {
    key: 'attunement',
    label: 'Настройка',
    options: () => [
      { key: 'yes', label: 'Требует настройки' },
      { key: 'no', label: 'Без настройки' },
    ],
    match: (it, sel) => sel.includes(it.attunement_required ? 'yes' : 'no'),
  },
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap) =>
      Object.values(bookMap)
        .map((b) => ({ key: b.id, label: b.book_code || b.title, hint: b.title }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    match: (it, sel) => !!it.item_source && sel.includes(it.item_source),
  },
  {
    key: 'price',
    label: 'Цена',
    options: () => PRICE_BANDS.map(({ key, label }) => ({ key, label })),
    match: (it, sel) => {
      const gp = it.cost_copper ? it.cost_copper / 100 : 0
      return sel.some((k) => {
        const band = PRICE_BANDS.find((x) => x.key === k)
        return !!band && gp >= band.min && gp < band.max
      })
    },
  },
]

/* ---------- Фильтры заклинаний ---------- */

const CLASS_NAMES = [
  'бард', 'варвар', 'воин', 'волшебник', 'друид', 'жрец', 'изобретатель',
  'колдун', 'монах', 'паладин', 'плут', 'следопыт', 'чародей',
]

export const spellFilters: FilterGroup<Spell>[] = [
  {
    // Значения группы складываются по ИЛИ. Обычное значение — класс (точное
    // совпадение с available_classes). Значение вида `sub:<имя>` — подкласс
    // (вхождение в available_subclasses). Поэтому кнопка со страницы подкласса
    // передаёт И класс, И `sub:подкласс` — получается «спеллы класса ∪ подкласса».
    key: 'class',
    label: 'Класс',
    options: () => CLASS_NAMES.map((n) => ({ key: n, label: cap(n) })),
    match: (sp, sel) =>
      sel.some((s) =>
        s.startsWith('sub:')
          ? !!sp.available_subclasses?.some((x) => x.toLowerCase().includes(s.slice(4).toLowerCase()))
          : !!sp.available_classes?.some((c) => c.toLowerCase().trim() === s.toLowerCase()),
      ),
  },
  {
    key: 'level',
    label: 'Круг',
    options: () =>
      Array.from({ length: 10 }, (_, i) => ({ key: String(i), label: i === 0 ? 'Заговор' : `${i} круг` })),
    match: (sp, sel) => sel.includes(String(sp.spell_level)),
  },
]

/** Книги, из которых реально есть записи — иначе меню забито пустыми кодами. */
function usedBookOptions(bookMap: BookMap, bookIds: (string | null | undefined)[]): FilterOption[] {
  const seen = new Set(bookIds.filter((id): id is string => !!id && !!bookMap[id]))
  return [...seen]
    .map((id) => ({
      key: id,
      label: bookMap[id].book_code || bookMap[id].title,
      hint: bookMap[id].title,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}

/* ---------- Фильтры черт ---------- */

export const featFilters: FilterGroup<Feat>[] = [
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap, items) => usedBookOptions(bookMap, items.map((f) => f.book_source_id)),
    match: (f, sel) => !!f.book_source_id && sel.includes(f.book_source_id),
  },
  {
    key: 'ability',
    label: 'Характеристики',
    options: () =>
      ABILITY_KEYS.map((a) => ({ key: a, label: ABILITY_LABELS[a].label, hint: ABILITY_LABELS[a].abbr })),
    match: (f, sel) => sel.some((a) => a in (f.increase_ability_scores ?? {})),
  },
  {
    key: 'prereq',
    label: 'Требования',
    options: () => [
      { key: 'yes', label: 'Есть требование' },
      { key: 'no', label: 'Без требований' },
    ],
    match: (f, sel) => sel.includes(f.prerequisite ? 'yes' : 'no'),
  },
]

export const backgroundFilters: FilterGroup<Background>[] = [
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap, items) => usedBookOptions(bookMap, items.map((bg) => bg.book_source_id)),
    match: (bg, sel) => !!bg.book_source_id && sel.includes(bg.book_source_id),
  },
  {
    key: 'ability',
    label: 'Характеристики',
    options: () =>
      ABILITY_KEYS.map((a) => ({ key: a, label: ABILITY_LABELS[a].label, hint: ABILITY_LABELS[a].abbr })),
    match: (bg, sel) => {
      const abilities = abilitiesFromSkills(bg.skill_proficiencies)
      return sel.some((a) => abilities.includes(a as AbilityName))
    },
  },
]

export const creatureFilters: FilterGroup<Creature>[] = [
  {
    key: 'cr',
    label: 'Опасность',
    options: () => DANGER_TIERS.map(({ key, label, color }) => ({ key, label, color })),
    match: (c, sel) => {
      const t = dangerTier(c.challenge_rating)
      return !!t && sel.includes(t.key)
    },
  },
  {
    key: 'type',
    label: 'Тип',
    options: () => CREATURE_TYPES.map((t) => ({ key: t, label: t })),
    match: (c, sel) => {
      const t = creatureBaseType(c)
      return !!t && sel.includes(t)
    },
  },
  {
    key: 'size',
    label: 'Размер',
    options: () => SIZE_KEYS.map((s) => ({ key: s, label: sizeRu(s) ?? s })),
    match: (c, sel) => !!c.size && sel.includes(c.size.trim().toLowerCase()),
  },
  {
    key: 'move',
    label: 'Передвижение',
    options: () => MOVE_MODES.map(({ key, label }) => ({ key, label })),
    match: (c, sel) => sel.some((k) => !!MOVE_MODES.find((m) => m.key === k)?.get(c)),
  },
  {
    key: 'trait',
    label: 'Особое',
    options: () => [{ key: 'legendary', label: 'Легендарные действия' }],
    match: (c, sel) => sel.includes('legendary') && !!c.legendary_actions?.length,
  },
  {
    // именные НПС помечены в API как уникальные (is_unique совпадает с is_npc)
    key: 'npc',
    label: 'Именные НПС',
    options: () => [
      { key: 'hide', label: 'Скрыть' },
      { key: 'only', label: 'Только они' },
    ],
    match: (c, sel) => sel.includes(c.is_unique ? 'only' : 'hide'),
  },
  {
    key: 'book',
    label: 'Книга',
    options: (bookMap) =>
      Object.values(bookMap)
        .map((b) => ({ key: b.id, label: b.book_code || b.title, hint: b.title }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    match: (c, sel) => !!c.book_source_id && sel.includes(c.book_source_id),
  },
]

/**
 * Варианты фильтров снаряжения берём из `/api/meta/enums`, а не из хардкода;
 * пока справочники не загрузились (или бэкенд без роутера meta) — остаётся
 * только фильтр по книгам. Ключи групп совпадают с `entryCatalogQuery`, чтобы
 * ссылка «выбрать» со страницы класса открывала каталог уже отфильтрованным.
 */
export function equipmentFilters(enums: MetaEnums | null): FilterGroup<Equipment>[] {
  const plain = (values: string[]) => () => values.map((v) => ({ key: v, label: v }))
  const groups: FilterGroup<Equipment>[] = []

  if (enums) {
    groups.push(
      {
        key: 'category',
        label: 'Категория',
        options: plain(enums.equipment_categories),
        match: (eq, sel) => sel.includes(eq.category),
      },
      {
        key: 'weapon_kind',
        label: 'Вид оружия',
        options: plain(enums.weapon_kinds),
        match: (eq, sel) => !!eq.weapon?.weapon_kind && sel.includes(eq.weapon.weapon_kind),
      },
      {
        key: 'attack_kind',
        label: 'Тип атаки',
        options: plain(enums.weapon_attack_kinds),
        match: (eq, sel) => !!eq.weapon?.attack_kind && sel.includes(eq.weapon.attack_kind),
      },
      {
        key: 'armor_kind',
        label: 'Вид доспеха',
        options: plain(enums.armor_kinds),
        match: (eq, sel) => !!eq.defense?.armor_kind && sel.includes(eq.defense.armor_kind),
      },
      {
        key: 'container_kind',
        label: 'Контейнер',
        options: () => enums.container_kinds.map((k) => ({ key: k, label: cap(containerKindRu(k)) })),
        match: (eq, sel) => !!eq.container && sel.includes(eq.container.container_kind),
      },
      {
        key: 'tag',
        label: 'Метки',
        options: plain(enums.equipment_tags),
        match: (eq, sel) => eq.tags.some((t) => sel.includes(t)),
      },
    )
  }

  groups.push({
    key: 'book',
    label: 'Книга',
    options: (bookMap) =>
      Object.values(bookMap)
        .map((b) => ({ key: b.id, label: b.book_code || b.title, hint: b.title }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    match: (eq, sel) => !!eq.book_source_id && sel.includes(eq.book_source_id),
  })

  return groups
}
