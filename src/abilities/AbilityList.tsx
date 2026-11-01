/**
 * Способности источника (раса, подраса, черта, предыстория, класс): что именно
 * персонаж получает. Каждая — строкой с уровнем; клик раскрывает текст.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AbilityText } from './AbilityText'
import { useAbilities, type AbilityDef, type AbilityRef } from './abilityData'

function AbilityRow({ ab, level, defaultOpen }: { ab: AbilityDef; level?: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <li className={`ab-row${open ? ' is-open' : ''} is-${ab.implementation_status}`}>
      <button type="button" className="ab-row-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {level != null && level > 1 && <span className="ab-row-lvl">{level} ур.</span>}
        <b>{ab.name}</b>
        <ChevronDown className="ab-row-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="ab-row-body">
          <AbilityText text={ab.description} />
        </div>
      )}
    </li>
  )
}

/**
 * refs — ссылки источника (`abilities` у расы, черты…); abilities — уже
 * загруженные определения (страница класса тянет их одним запросом по тегу).
 */
export function AbilityList({
  refs,
  abilities,
  emptyText,
}: {
  refs?: AbilityRef[] | null
  abilities?: { ability: AbilityDef; level?: number }[]
  emptyText?: string
}) {
  // по уровню получения: класс читается как таблица развития
  const slugs = [...(refs ?? [])]
    .filter((r) => !r.optional)
    .sort((a, b) => (a.level_required ?? 1) - (b.level_required ?? 1))
    .map((r) => r.slug)
  const { items, loading } = useAbilities(abilities ? [] : slugs)
  const rows =
    abilities ??
    items.map((ability) => ({ ability, level: refs?.find((r) => r.slug === ability.slug)?.level_required }))
  if (loading) return <p className="muted ab-loading">Загрузка способностей…</p>
  if (!rows.length) return emptyText ? <p className="cw-field-note">{emptyText}</p> : null
  // одна способность — сразу раскрыта (черта, предыстория)
  return (
    <ul className="ab-list-rows">
      {rows.map(({ ability, level }) => (
        <AbilityRow key={ability.slug} ab={ability} level={level} defaultOpen={rows.length === 1} />
      ))}
    </ul>
  )
}

const lowerRu = (t: string) => t.toLocaleLowerCase('ru').replace(/ё/g, 'е')

/** Упомянута ли способность в тексте: все значимые слова названия, с учётом падежных окончаний. */
function mentionedIn(name: string, text: string): boolean {
  const clean = lowerRu(name.replace(/\(.*?\)/g, ' ')).trim()
  const words = clean.match(/[a-zа-я]{4,}/g) ?? []
  // короткие названия вроде «Ци» сравниваем целиком
  if (!words.length) return text.includes(clean)
  return words.every((w) => text.includes(w.slice(0, Math.max(4, w.length - 2))))
}

/**
 * Способности, которых нет в статье страницы. Обычно статья описывает их сама и
 * список её только повторял бы, но у части рас и подрас механика лежит лишь здесь
 * (например, «Оружие дыхания»), поэтому показываем ровно то, чего в тексте нет.
 */
export function AbilitiesMissingFrom({
  refs,
  text,
  render,
}: {
  refs?: AbilityRef[] | null
  text: string
  render: (list: ReactNode) => ReactNode
}) {
  const slugs = (refs ?? []).filter((r) => !r.optional).map((r) => r.slug)
  const { items, loading } = useAbilities(slugs)
  const plain = useMemo(() => lowerRu(text.replace(/<[^>]*>/g, ' ')), [text])
  if (loading) return null
  const rows = items
    .filter((ability) => !mentionedIn(ability.name, plain))
    .map((ability) => ({ ability, level: refs?.find((r) => r.slug === ability.slug)?.level_required }))
    .sort((a, b) => (a.level ?? 1) - (b.level ?? 1))
  return rows.length ? render(<AbilityList abilities={rows} />) : null
}
