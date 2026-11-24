import { useMemo } from 'react'
import { Globe2, Loader2, Search, X } from 'lucide-react'
import type { BookMap } from '../../api'
import { plural } from '../../lib/plural'
import { useOpenSearch } from '../../search/GlobalSearch'
import { type FilterGroup, type SortOption } from './config'
import { FilterMenu } from './FilterMenu'
import { SortMenu } from './SortMenu'

/**
 * Шапка списка: поиск по разделу, фильтры, сортировка и выбранные фильтры чипами.
 * Поиск — тот же нечёткий серверный, что и общий; «Везде» передаёт запрос в общий.
 */
export function CatalogToolbar<T>({
  q,
  onQ,
  busy,
  total,
  filters,
  filterSel,
  onToggleFilter,
  onResetFilters,
  bookMap,
  allItems,
  sorts,
  sortKey,
  onSort,
}: {
  q: string
  onQ: (q: string) => void
  /** идёт запрос или поиск ещё ждёт паузы в наборе */
  busy: boolean
  total: number
  filters?: FilterGroup<T>[]
  filterSel: Record<string, string[]>
  onToggleFilter: (groupKey: string, optKey: string) => void
  onResetFilters: () => void
  bookMap: BookMap
  allItems: T[]
  sorts?: SortOption<T>[]
  sortKey: string
  onSort: (key: string) => void
}) {
  const openSearch = useOpenSearch()

  // выбранные варианты с подписями — для чипов под панелью
  const active = useMemo(() => {
    const out: { group: string; groupLabel: string; key: string; label: string }[] = []
    for (const g of filters ?? []) {
      const sel = filterSel[g.key]
      if (!sel?.length) continue
      const opts = g.options(bookMap, allItems)
      for (const key of sel) {
        const label = opts.find((o) => o.key === key)?.label ?? key
        out.push({ group: g.key, groupLabel: g.label, key, label })
      }
    }
    return out
  }, [filters, filterSel, bookMap, allItems])

  return (
    <div className="ct">
      <div className="ct-row">
        <label className="ct-search">
          {busy ? <Loader2 className="gs-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          <input
            type="search"
            placeholder="Искать в разделе…"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && q) {
                e.preventDefault()
                e.stopPropagation()
                onQ('')
              }
            }}
            aria-label="Поиск в разделе"
          />
          <span className="ct-count" aria-live="polite">
            {busy ? 'ищем…' : `${total.toLocaleString('ru')} ${plural(total, ['запись', 'записи', 'записей'])}`}
          </span>
          {q && (
            <button type="button" className="ct-clear" onClick={() => onQ('')} aria-label="Очистить поиск">
              <X aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="ct-global"
            onClick={() => openSearch(q.trim())}
            title="Искать по всему кодексу (Ctrl K)"
          >
            <Globe2 aria-hidden="true" />
            <span>Везде</span>
          </button>
        </label>

        {filters && filters.length > 0 && (
          <FilterMenu
            groups={filters}
            sel={filterSel}
            onToggle={onToggleFilter}
            onReset={onResetFilters}
            bookMap={bookMap}
            items={allItems}
            buttonClassName="ct-btn"
          />
        )}

        {sorts && sorts.length > 0 && <SortMenu sorts={sorts} value={sortKey} onChange={onSort} />}
      </div>

      {active.length > 0 && (
        <div className="ct-active" aria-label="Выбранные фильтры">
          {active.map((a) => (
            <button
              key={`${a.group}:${a.key}`}
              type="button"
              className="ct-chip"
              title={`${a.groupLabel}: ${a.label} — убрать`}
              onClick={() => onToggleFilter(a.group, a.key)}
            >
              <i>{a.groupLabel}</i>
              {a.label}
              <X aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="ct-reset" onClick={onResetFilters}>
            Сбросить всё
          </button>
        </div>
      )}
    </div>
  )
}
