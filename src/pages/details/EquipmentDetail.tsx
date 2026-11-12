import { ReviewsPanel } from '../../reviews/Reviews'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Layers,
  Package,
  Scale,
  Tag,
} from 'lucide-react'
import {
  realImage,
} from '../../api'
import type {
  ContainerProfile,
  Equipment,
} from '../../api'
import { Divider } from '../../ornaments'
import { SourceBadge } from '../CatalogPage'
import { categoryIcon, containerKindRu, formatDice, formatWeight } from '../../equipment'
import { PriceMark } from '../../coins'
import {
  useEquipmentIndex,
} from '../StartingEquipment'
import { EquipmentContentsGallery } from '../../equipmentDrawer'
import { Chip, DetailSection, Rich, StatRow } from './shared'
import { useBookRef, useContextualBack, useOne } from './hooks'
import { ItemArt } from './ItemDetail'

/** Что контейнер принимает внутрь; все три списка пусты — принимает что угодно */
function containerAccepts(c: ContainerProfile): string {
  const parts = [...c.accepts_categories, ...c.accepts_tags, ...c.accepts_slugs]
  return parts.length === 0 ? 'что угодно' : parts.join(', ')
}

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: eq, error } = useOne<Equipment>('equipment', id)
  const book = useBookRef(eq?.book_source_id)
  const index = useEquipmentIndex()
  const { backTo, backLabel } = useContextualBack('/equipment', 'к снаряжению')
  if (error) return <p className="status-line is-error">Снаряжение не найдено: {error}</p>
  if (!eq) return <p className="status-line">Разбираем походный тюк…</p>

  const weight = formatWeight(eq.weight)
  const w = eq.weapon
  const d = eq.defense
  const c = eq.container
  const range = w?.range_normal != null ? `${w.range_normal}${w.range_long ? `/${w.range_long}` : ''} фт.` : null
  const Icon = categoryIcon(eq.category)

  return (
    <section className="book-page item-page">
      <Link to={backTo} className="back-link">
        <ArrowLeft aria-hidden="true" /> {backLabel}
      </Link>

      <div className="item-hero">
        <PriceMark cost={eq.cost} costCopper={eq.cost_copper} className="price-mark--hero" />
        <ItemArt
          src={realImage(eq.equipment_image_gallery)}
          alt={eq.equipment_name}
          fallback={Icon}
        />
        <span className="setting-kicker item-kicker">{eq.subcategory ?? eq.category}</span>
        <h1 className="book-title gold-text item-title">{eq.equipment_name}</h1>
        {eq.equipment_name_en && <span className="setting-name-en">{eq.equipment_name_en}</span>}
        <div className="card-chips item-chips">
          <SourceBadge book={book} />
          {weight && <Chip icon={Scale}>{weight}</Chip>}
          {eq.bundle_size != null && eq.bundle_size > 1 && <Chip icon={Package}>пачка {eq.bundle_size}</Chip>}
          {eq.stackable && <Chip icon={Layers}>стак до {eq.stack_size}</Chip>}
          {eq.tags.map((t) => (
            <Chip key={t} icon={Tag}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <Divider />

      <div className="item-body">
        {w && (
          <DetailSection title="Оружие">
            <div className="stat-rows">
              <StatRow label="Вид" value={[w.weapon_kind, w.attack_kind].filter(Boolean).join(' · ')} />
              <StatRow
                label="Урон"
                value={[formatDice(w.damage_dice), w.damage_type?.toLowerCase()].filter(Boolean).join(' ')}
              />
              <StatRow label="Универсальное" value={formatDice(w.versatile_dice)} />
              <StatRow label="Дистанция" value={range} />
              <StatRow label="Свойства" value={w.properties.join(', ')} />
              <StatRow label="Приём" value={w.mastery} />
              <StatRow label="Боеприпасы" value={w.ammunition_type} />
            </div>
          </DetailSection>
        )}

        {d && (
          <DetailSection title="Доспех">
            <div className="stat-rows">
              <StatRow label="Вид" value={d.armor_kind} />
              <StatRow
                label="Класс Доспеха"
                value={
                  d.armor_class != null
                    ? `${d.armor_class}${d.add_dex_modifier ? ' + ЛОВ' : ''}${
                        d.dex_modifier_cap != null ? ` (не более +${d.dex_modifier_cap})` : ''
                      }`
                    : d.armor_class_formula
                }
              />
              <StatRow label="Требование Силы" value={d.strength_requirement} />
              <StatRow label="Скрытность" value={d.stealth_disadvantage ? 'помеха' : null} />
              <StatRow label="Хиты" value={d.hit_points} />
              <StatRow label="Порог урона" value={d.damage_threshold} />
            </div>
          </DetailSection>
        )}

        {c && (
          <DetailSection title={`Контейнер: ${containerKindRu(c.container_kind)}`}>
            <div className="stat-rows">
              <StatRow label="Ячейки" value={c.slots} />
              <StatRow label="Вместимость" value={c.capacity_pounds != null ? `${c.capacity_pounds} фнт.` : null} />
              <StatRow
                label="Объём"
                value={c.capacity_cubic_feet != null ? `${c.capacity_cubic_feet} куб. фт.` : null}
              />
              <StatRow label="Принимает" value={containerAccepts(c)} />
            </div>
            {c.sealed && (
              <p className="detail-note">
                Набор: содержимое можно вынуть, но сложить обратно в него нельзя.
              </p>
            )}
            {c.default_contents.length > 0 && (
              <>
                <p className="detail-note">Содержимое:</p>
                <EquipmentContentsGallery contents={c.default_contents} index={index} />
              </>
            )}
          </DetailSection>
        )}

        {eq.description && (
          <DetailSection title="Описание">
            <Rich text={eq.description} />
          </DetailSection>
        )}
      </div>
      <ReviewsPanel entity="equipment" id={eq.id} />
    </section>
  )
}
