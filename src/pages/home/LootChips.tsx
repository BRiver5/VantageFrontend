import { useMemo } from 'react'
import { totalsOf } from '../../api'
import type { ContentTotals } from '../../api'
import { Corners } from '../../ornaments'
import { LOOT_CHIP_ROWS } from '../../contentSections'
import type { Realm } from './SettingsCarousel'

/* ---------- Сводка нововведений выбранного сеттинга ---------- */

const LOOT_ROWS = LOOT_CHIP_ROWS

/** Сетка жетонов со счётчиками нововведений (используется и на странице сеттинга) */
export function LootChips({
  totals,
  onSelect,
}: {
  totals: ContentTotals
  onSelect?: (key: keyof ContentTotals) => void
}) {
  return (
    <div className="loot-grid">
      {LOOT_ROWS.filter(({ key }) => totals[key] > 0).map(({ key, label, icon: Icon }) => {
        const count = totals[key]
        const clickable = !!onSelect && count > 0
        const Tag = clickable ? 'button' : 'span'
        return (
          <Tag
            key={key}
            type={clickable ? 'button' : undefined}
            className={`loot-chip${count === 0 ? ' is-zero' : ''}${clickable ? ' loot-chip--clickable' : ''}`}
            onClick={clickable ? () => onSelect(key) : undefined}
            title={clickable ? `Показать: ${label}` : undefined}
          >
            <Icon aria-hidden="true" />
            <span className="loot-num">{count}</span> {label}
          </Tag>
        )
      })}
    </div>
  )
}

export function LootBar({ realm }: { realm: Realm }) {
  const totals = useMemo(() => totalsOf(realm.books), [realm])
  return (
    <div className="loot-bar">
      <Corners size={38} />
      <div className="loot-title">Что в книгах мира</div>
      <LootChips totals={totals} />
    </div>
  )
}
