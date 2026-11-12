import { useEffect, useState } from 'react'
import { ReviewsPanel } from '../../reviews/Reviews'
import type { CSSProperties } from 'react'
import {
  ArrowLeft,
  Gem,
  Scale,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  realImage,
} from '../../api'
import type {
  BookMap,
  Item,
} from '../../api'
import { PriceMark } from '../../coins'
import { ParchmentScroll } from '../../ornaments'
import { RichText } from '../../terms/terms'
import { Img } from '../../media'
import { type SwitchRoles, toggleIn } from './config'
import { rarityKeyOf } from './rarity'
import { itemFilters } from './filters'
import { Chip, SourceBadge } from './shared'
import { FilterMenu } from './FilterMenu'

/** Роль карточки на время перелёта. */
export type RecRole = 'incoming' | 'returning' | undefined

/**
 * Одна карточка в правой ленте рекомендаций (с картинкой предмета).
 *
 * Имена view-transition зависят от роли, и это главное в анимации переключения:
 * - `incoming` — предмет, который выбрали: картинка и блок с названием получают
 *   ОБЩИЕ с «плеером» имена, поэтому летят к нему отдельными объектами, а рамка
 *   карточки остаётся безымянной и просто тает;
 * - `returning` — предмет, который был открыт: имя есть ТОЛЬКО в новом кадре,
 *   поэтому браузер не тянет его из «плеера», а даёт въехать справа из-за края;
 * - без роли — обычный морф на новое место (лента раздвигается).
 */
function RecCard({ item, onSelect, role }: { item: Item; onSelect: (item: Item) => void; role?: RecRole }) {
  const [broken, setBroken] = useState(false)
  const image = realImage(item.item_image_gallery)
  const cardName =
    role === 'incoming' ? undefined : role === 'returning' ? 'returning-card' : `card-${item.id}`
  const vt = (name: string | undefined) =>
    name ? ({ viewTransitionName: name } as CSSProperties) : undefined
  return (
    <button
      type="button"
      className="rec-card"
      data-rarity={rarityKeyOf(item.rarity)}
      style={vt(cardName)}
      onClick={() => onSelect(item)}
    >
      <span className="rec-thumb" style={vt(role === 'incoming' ? 'incoming-art' : undefined)}>
        <span className="rec-thumb-glow" aria-hidden="true" />
        {image && !broken ? (
          <Img src={image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <Gem aria-hidden="true" />
        )}
      </span>
      <span className="rec-info" style={vt(role === 'incoming' ? 'incoming-info' : undefined)}>
        <span className="rec-name">{item.item_name}</span>
        <span className="rec-type">{item.item_type ?? 'магический предмет'}</span>
        {item.rarity && <span className="rec-rarity">{item.rarity}</span>}
      </span>
    </button>
  )
}

/**
 * Раскрытый предмет в стиле YouTube: слева — крупный «просматриваемый» предмет,
 * его характеристики, сворачиваемое описание и заглушки оценок/комментариев;
 * справа — длинная лента рекомендаций (остальные предметы карточками с картинками).
 */
export function ItemSplitView({
  selected,
  items,
  onSelect,
  onClose,
  bookMap,
  switching,
}: {
  selected: Item
  items: Item[]
  onSelect: (item: Item) => void
  onClose: () => void
  bookMap: BookMap
  switching: SwitchRoles
}) {
  const [broken, setBroken] = useState(false)
  const [recQ, setRecQ] = useState('')
  // те же фильтры, что и в каталоге: ключ группы → выбранные варианты
  const [recSel, setRecSel] = useState<Record<string, string[]>>({})
  // при смене предмета сбрасываем статус картинки
  useEffect(() => {
    setBroken(false)
  }, [selected.id])

  // выбранный предмет ушёл в «плеер» слева — в ленте справа его нет,
  // остальные поднимаются, занимая место (FLIP через view-transition)
  const rest = items.filter((it) => it.id !== selected.id)
  const query = recQ.trim().toLowerCase()
  const shown = rest
    .filter((it) => {
      if (query && !it.item_name.toLowerCase().includes(query)) return false
      // группы по И, варианты внутри группы по ИЛИ — как в каталоге
      return itemFilters.every((g) => {
        const s = recSel[g.key]
        return !s || s.length === 0 || g.match(it, s, bookMap)
      })
    })
    // лента показывает не больше 10 предметов
    .slice(0, 10)
  const rarity = rarityKeyOf(selected.rarity)
  const image = realImage(selected.item_image_gallery)
  const book = selected.item_source ? bookMap[selected.item_source] : undefined

  // На время перелёта «плеер» разбирается на части: картинка и заголовок живут
  // своей жизнью (летят / улетают), поэтому общее имя героя снимается.
  const incoming = switching?.incomingId === selected.id
  const heroName = switching ? undefined : `card-${selected.id}`
  const artName = switching ? (incoming ? 'incoming-art' : 'outgoing-art') : undefined
  const infoName = switching ? (incoming ? 'incoming-info' : 'outgoing-info') : undefined
  const vt = (name: string | undefined) =>
    name ? ({ viewTransitionName: name } as CSSProperties) : undefined
  const roleOf = (id: string): RecRole => {
    if (!switching) return undefined
    if (switching.incomingId === id) return 'incoming'
    if (switching.outgoingId === id) return 'returning'
    return undefined
  }

  return (
    <div className="item-tube">
      <div className="item-tube-main">
        <button type="button" className="back-link back-link--btn item-tube-back" onClick={onClose}>
          <ArrowLeft aria-hidden="true" /> к сокровищнице
        </button>

        {/* «плеер» — крупный предмет по центру */}
        <div className="item-hero item-tube-player" data-rarity={rarity} style={vt(heroName)}>
          <div className="item-art" style={vt(artName)}>
            <span className="item-glow" aria-hidden="true" />
            {image && !broken ? (
              <Img src={image} alt={selected.item_name} onError={() => setBroken(true)} />
            ) : (
              <Gem className="item-art-fallback" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* заголовок и характеристики — под «плеером», слева */}
        <div className="item-tube-head" style={vt(infoName)}>
          <PriceMark costCopper={selected.cost_copper} />
          <h1 className="book-title gold-text item-title">{selected.item_name}</h1>
          <span className="setting-kicker item-kicker">{selected.item_type ?? 'магический предмет'}</span>
          <div className="card-chips item-chips">
            <SourceBadge book={book} />
            {selected.rarity && <Chip icon={Gem}>{selected.rarity}</Chip>}
            {selected.attunement_required && <Chip icon={Sparkles}>требует настройки</Chip>}
            {selected.weight != null && selected.weight > 0 && <Chip icon={Scale}>{selected.weight} фнт.</Chip>}
          </div>
        </div>

        {selected.description?.trim() ? (
          <ParchmentScroll key={selected.id} className="item-tube-scroll" title="Манускрипт · описание">
            <RichText text={selected.description} />
          </ParchmentScroll>
        ) : null}

        {/* оценки и обсуждение предмета */}
        <ReviewsPanel key={selected.id} entity="items" id={selected.id} />
      </div>

      {/* длинная лента рекомендаций справа + поиск и фильтры */}
      <aside className="item-tube-recs" aria-label="Другие предметы">
        <div className="rec-head">
          <div className="rec-tools">
            <label className="rec-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                placeholder="Искать предмет…"
                value={recQ}
                onChange={(e) => setRecQ(e.target.value)}
              />
              {recQ && (
                <button
                  type="button"
                  className="rec-search-clear"
                  onClick={() => setRecQ('')}
                  aria-label="Очистить поиск"
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
            <FilterMenu
              groups={itemFilters}
              sel={recSel}
              onToggle={(gk, ok) => setRecSel((cur) => toggleIn(cur, gk, ok))}
              onReset={() => setRecSel({})}
              bookMap={bookMap}
              items={items}
            />
          </div>
        </div>
        <div className="rec-list">
          {shown.length > 0 ? (
            shown.map((it) => <RecCard key={it.id} item={it} onSelect={onSelect} role={roleOf(it.id)} />)
          ) : (
            <p className="rec-empty">Ничего не найдено на этой странице.</p>
          )}
        </div>
      </aside>
    </div>
  )
}
