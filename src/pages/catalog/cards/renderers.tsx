import {
  realImage,
  sizeRu,
  formatCR,
} from '../../../api'
import type {
  GameClass,
  Race,
  BookMap,
  Feat,
  Background,
  Spell,
  Creature,
  Equipment,
  Termin,
  Item,
} from '../../../api'
import { DIE_NUM_IMAGE_URLS, hitDieType } from '../../../dice/diceAssets'
import { Img } from '../../../media'
import { ClassCardPortrait, ClassCardStat } from './ClassParts'
import {
  ArrowRight,
  Eye,
  Footprints,
  Ruler,
  VenetianMask,
  Hourglass,
  Star,
  Swords,
  Target,
  Crown,
  Heart,
  Shield,
  Backpack,
  Layers,
  Package,
  Scale,
  Tag,
  Sparkles,
} from 'lucide-react'
import { RaceBoosts, boostInfo } from '../../../raceBoosts'
import { RaceRailCell } from './RaceParts'
import { FeatCard } from './FeatParts'
import { BackgroundCard } from './BackgroundParts'
import { RatingMark } from '../../../reviews/Reviews'
import { type ShortRating } from '../../../reviews/api'
import { SpellSchoolMark } from '../../../spellSchools'
import { TermDesc } from '../../../terms/terms'
import { Chip, HexBadge, SourceBadge } from '../shared'
import type { CSSProperties } from 'react'
import { MOVE_MODES, creatureBaseType, dangerTier } from '../creatures'
import { CreaturePortrait } from './CreatureParts'
import { categoryIcon, containerKindRu, formatDice, formatWeight } from '../../../equipment'
import { PriceMark } from '../../../coins'
import { EquipmentCardArt } from './EquipmentParts'
import { rarityAdjective } from '../../../itemRarity'
import { rarityKeyOf } from '../rarity'
import { type RecRole } from '../ItemSplitView'
import { ItemCardArt, ItemSourceLink } from './ItemParts'

/** Основная характеристика класса (в API нет — каноничные данные PHB). */
const CLASS_PRIMARY_ABILITY: Record<string, string> = {
  Бард: 'Харизма',
  Варвар: 'Сила',
  Воин: 'Сила или Ловкость',
  Волшебник: 'Интеллект',
  Друид: 'Мудрость',
  Жрец: 'Мудрость',
  Изобретатель: 'Интеллект',
  Колдун: 'Харизма',
  Монах: 'Ловкость и Мудрость',
  Паладин: 'Сила и Харизма',
  Плут: 'Ловкость',
  Следопыт: 'Ловкость и Мудрость',
  Чародей: 'Харизма',
}

export function classCard(c: GameClass) {
  const dieType = hitDieType(c.hit_dice)
  return (
    <article className="card card--portrait card--class">
      <div className="class-card-visual">
        <Img
          className="class-card-die"
          src={DIE_NUM_IMAGE_URLS[dieType]}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <ClassCardPortrait src={realImage(c.image_gallery)} alt={c.class_name} />
      </div>
      <div className="class-card-lower">
        <div className="class-card-glow" aria-hidden="true" />
        <div className="class-card-panel">
          <dl className="class-card-stats">
            <ClassCardStat label="Кость хитов" value={`к${c.hit_dice}`} />
            {CLASS_PRIMARY_ABILITY[c.class_name] && (
              <ClassCardStat label="Основные характеристики" value={CLASS_PRIMARY_ABILITY[c.class_name]} />
            )}
            <ClassCardStat
              label="Спасброски"
              value={c.saving_throw_proficiencies?.join(', ') || '—'}
            />
          </dl>
        </div>
        <h3 className="class-card-name-plate">{c.class_name}</h3>
      </div>
    </article>
  )
}

export function raceCard(r: Race) {
  return (
    <article className="card card--portrait card--race">
      <div className="class-card-visual">
        <ClassCardPortrait src={realImage(r.image_gallery)} alt={r.race_name} fallback={VenetianMask} />
      </div>
      <div className="class-card-lower">
        <div className="class-card-glow" aria-hidden="true" />
        <div className="class-card-panel race-card-panel">
          <RaceBoosts info={boostInfo(r)} />
          <div className="race-rail">
            <RaceRailCell icon={Ruler} value={sizeRu(r.size)} label="размер" />
            <RaceRailCell icon={Footprints} value={`${r.speed} фт.`} label="скорость" />
            <RaceRailCell icon={Eye} value={r.darkvision > 0 ? `${r.darkvision} фт.` : null} label="тьма" />
          </div>
          <span className="bg-card-go race-card-go">
            перейти <ArrowRight aria-hidden="true" />
          </span>
        </div>
        <h3 className="class-card-name-plate">{r.race_name}</h3>
      </div>
    </article>
  )
}

export function featCard(f: Feat, bookMap: BookMap) {
  return (
    <FeatCard
      f={f}
      book={f.book_source_id ? bookMap[f.book_source_id] : undefined}
    />
  )
}

export function backgroundCard(bg: Background, bookMap: BookMap) {
  return (
    <BackgroundCard
      bg={bg}
      book={bg.book_source_id ? bookMap[bg.book_source_id] : undefined}
    />
  )
}

export function spellCard(s: Spell, bookMap: BookMap) {
  return (
    <article className="card card--compact card--spell">
      <SpellSchoolMark school={s.school} />
      <div className="card-head">
        <HexBadge value={s.spell_level === 0 ? '◈' : String(s.spell_level)} label={s.spell_level === 0 ? 'заговор' : 'круг'} />
        <div>
          <h3 className="card-name">{s.spell_name}</h3>
          {s.school && <span className="card-kicker">{s.school}</span>}
          <RatingMark rating={(s as { rating?: ShortRating }).rating} />
        </div>
      </div>
      <div className="card-chips">
        <SourceBadge book={s.spell_source ? bookMap[s.spell_source] : undefined} />
        {s.casting_time && <Chip icon={Hourglass}>{s.casting_time.length > 26 ? '1 реакция' : s.casting_time}</Chip>}
        {s.range && <Chip icon={Target}>{s.range}</Chip>}
        {s.concentration && <Chip icon={Eye}>концентрация</Chip>}
        {s.ritual && <Chip icon={Star}>ритуал</Chip>}
      </div>
      <TermDesc text={s.description} />
      {s.available_classes && s.available_classes.length > 0 && (
        <span className="card-foot">
          <Swords aria-hidden="true" /> {s.available_classes.join(', ')}
        </span>
      )}
    </article>
  )
}

export function creatureCard(c: Creature, bookMap: BookMap) {
  const tier = dangerTier(c.challenge_rating)
  const kind = [sizeRu(c.size), creatureBaseType(c)].filter(Boolean).join(' · ')
  const moves = MOVE_MODES.filter((m) => m.get(c))
  // у летающих/плавающих пешая скорость бывает 0 — показываем лучшую из имеющихся
  const speed = c.speed || (moves.length ? Math.max(...moves.map((m) => m.get(c) ?? 0)) : c.speed)
  const book = c.book_source_id ? bookMap[c.book_source_id] : undefined
  const legendary = !!c.legendary_actions?.length
  return (
    <article
      className="card card--portrait card--race card--creature"
      style={tier ? ({ '--danger': tier.color } as CSSProperties) : undefined}
    >
      <div className="class-card-visual">
        <span className="creature-aura" aria-hidden="true" />
        <span className="creature-cr" title={`Показатель опасности ${formatCR(c.challenge_rating)}`}>
          <span className="creature-cr-inner">
            <b>{formatCR(c.challenge_rating)}</b>
            <i>ПО</i>
          </span>
        </span>
        {(legendary || c.is_unique) && (
          <span className="creature-flags">
            {legendary && (
              <span className="creature-flag" title="Легендарные действия">
                <Crown aria-hidden="true" />
              </span>
            )}
            {c.is_unique && (
              <span className="creature-flag" title="Уникальное существо">
                <Star aria-hidden="true" />
              </span>
            )}
          </span>
        )}
        <CreaturePortrait src={realImage(c.image_gallery) ?? realImage(c.image_url)} alt={c.name} />
      </div>
      <div className="class-card-lower">
        <div className="class-card-glow" aria-hidden="true" />
        <div className="class-card-panel race-card-panel creature-card-panel">
          <div className="creature-kind" title={book?.title}>
            <span>{kind || 'существо'}</span>
          </div>
          <div className="race-rail">
            <RaceRailCell icon={Shield} value={String(c.ac)} label="КД" />
            <RaceRailCell icon={Heart} value={String(c.hp)} label="хиты" />
            <span className="race-rail-cell">
              <span className="creature-moves" aria-hidden="true">
                <Footprints />
                {moves.map(({ key, icon: Icon, label }) => (
                  <Icon key={key} aria-label={label} />
                ))}
              </span>
              <b>{speed != null ? `${speed} фт.` : '—'}</b>
              <i>скорость</i>
            </span>
          </div>
        </div>
        <h3 className="class-card-name-plate">{c.name}</h3>
      </div>
    </article>
  )
}

export function equipmentCard(eq: Equipment, bookMap: BookMap) {
  const Icon = categoryIcon(eq.category)
  const weight = formatWeight(eq.weight)
  const w = eq.weapon
  const d = eq.defense
  const ac = d?.armor_class != null ? `КД ${d.armor_class}${d.add_dex_modifier ? ' + ЛОВ' : ''}` : d?.armor_class_formula
  return (
    <article className="card card--equipment">
      <PriceMark cost={eq.cost} costCopper={eq.cost_copper} />
      <EquipmentCardArt src={realImage(eq.equipment_image_gallery)} alt={eq.equipment_name} fallback={Icon} />
      <div className="eq-card-info">
        <h3 className="card-name">{eq.equipment_name}</h3>
        <span className="card-kicker">{eq.subcategory ?? eq.category}</span>
        <RatingMark rating={(eq as { rating?: ShortRating }).rating} />
        <div className="card-chips">
          <SourceBadge book={eq.book_source_id ? bookMap[eq.book_source_id] : undefined} />
          {weight && <Chip icon={Scale}>{weight}</Chip>}
          {w?.damage_dice && (
            <Chip icon={Swords}>
              {formatDice(w.damage_dice)}
              {w.damage_type ? ` ${w.damage_type.toLowerCase()}` : ''}
            </Chip>
          )}
          {ac && <Chip icon={Shield}>{ac}</Chip>}
          {eq.container && <Chip icon={Backpack}>{containerKindRu(eq.container.container_kind)}</Chip>}
          {eq.stackable && <Chip icon={Layers}>стак {eq.stack_size}</Chip>}
          {eq.bundle_size != null && eq.bundle_size > 1 && <Chip icon={Package}>пачка {eq.bundle_size}</Chip>}
          {eq.tags.slice(0, 2).map((t) => (
            <Chip key={t} icon={Tag}>
              {t}
            </Chip>
          ))}
        </div>
      </div>
    </article>
  )
}

export function terminCard(t: Termin, bookMap: BookMap) {
  return (
    <article className="card card--compact">
      <h3 className="card-name">{t.name}</h3>
      <div className="card-chips">
        <SourceBadge book={t.book_source_id ? bookMap[t.book_source_id] : undefined} />
      </div>
      <TermDesc text={t.description} />
    </article>
  )
}

export function itemCard(it: Item, bookMap: BookMap, role?: RecRole) {
  const incoming = role === 'incoming'
  const adj = rarityAdjective(it.rarity, it.item_name, it.item_type)
  return (
    <article className="card card--item" data-rarity={rarityKeyOf(it.rarity)}>
      <PriceMark costCopper={it.cost_copper} />
      <ItemSourceLink book={it.item_source ? bookMap[it.item_source] : undefined} />
      <ItemCardArt
        src={realImage(it.item_image_gallery)}
        alt={it.item_name}
        vtName={incoming ? 'incoming-art' : undefined}
      />
      <div
        className="item-card-info"
        style={incoming ? ({ viewTransitionName: 'incoming-info' } as CSSProperties) : undefined}
      >
        <h3 className="card-name">
          {adj && <i className="item-rarity">{adj}</i>}
          {it.item_name}
        </h3>
        {it.item_type && <span className="card-kicker">{it.item_type}</span>}
        <RatingMark rating={(it as { rating?: ShortRating }).rating} />
        {it.attunement_required && (
          <div className="card-chips">
            <Chip icon={Sparkles}>настройка</Chip>
          </div>
        )}
      </div>
    </article>
  )
}
