/**
 * Способности источника (раса, подраса, черта, предыстория, класс): что именно
 * персонаж получает. Каждая — строкой с уровнем и пометкой, работает ли она на
 * листе сама; клик раскрывает текст.
 */
import { useState } from 'react'
import { ChevronDown, Cog } from 'lucide-react'
import { AbilityText } from './AbilityText'
import { useAbilities, type AbilityDef, type AbilityRef } from './abilityData'

const STATUS: Record<string, string> = {
  full: 'автоматизировано',
  partial: 'частично',
  text_only: 'только текст',
}

function AbilityRow({ ab, level, defaultOpen }: { ab: AbilityDef; level?: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <li className={`ab-row${open ? ' is-open' : ''} is-${ab.implementation_status}`}>
      <button type="button" className="ab-row-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {level != null && level > 1 && <span className="ab-row-lvl">{level} ур.</span>}
        <b>{ab.name}</b>
        <span className={`ab-status is-${ab.implementation_status}`} title={STATUS[ab.implementation_status]}>
          {ab.implementation_status !== 'text_only' && <Cog aria-hidden="true" />}
          {STATUS[ab.implementation_status] ?? ab.implementation_status}
        </span>
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
