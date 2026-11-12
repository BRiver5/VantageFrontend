import { ReviewsPanel } from '../../reviews/Reviews'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Landmark,
} from 'lucide-react'
import {
  formatCR,
  realImage,
  sizeRu,
  creatureTypeRu,
  settingPictureUrl,
  splitTitle,
} from '../../api'
import type {
  Book,
  Creature,
  Setting,
} from '../../api'
import { Divider } from '../../ornaments'
import { SourceBadge } from '../CatalogPage'
import { DieChipIcon } from '../../dice/diceAssets'
import { CreatureBoard, CreatureStage, WorldBackdrop } from '../../creatureSheet'
import { Chip, DetailSection, Rich, Traits } from './shared'
import { useBookRef, useOne } from './hooks'

/** Мир кампании книги — кроме «родного» для 5e Фаэруна, где живёт большинство существ */
function useCreatureWorld(book: Book | undefined) {
  const { data: setting } = useOne<Setting>('settings', book?.settings_id ?? undefined)
  if (!setting || setting.id !== book?.settings_id) return null
  const { ru, en } = splitTitle(setting.settings_title)
  if (en === 'Forgotten Realms') return null
  return { id: setting.id, name: ru, art: settingPictureUrl(setting, 1600, 720) }
}

export function CreatureDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: c, error } = useOne<Creature>('creatures', id)
  const book = useBookRef(c?.book_source_id)
  const world = useCreatureWorld(book)
  if (error) return <p className="status-line is-error">Существо не найдено: {error}</p>
  if (!c) return <p className="status-line">Выслеживаем существо…</p>

  const kind = [sizeRu(c.size) ?? c.size, creatureTypeRu(c.creature_type) ?? c.creature_type, c.alignment]
    .filter(Boolean)
    .join(' · ')
  const image = realImage(c.image_gallery) ?? realImage(c.image_url)

  return (
    <section className={`book-page beast-page${world ? ' has-world' : ''}`}>
      {world && <WorldBackdrop art={world.art} />}
      <Link to="/bestiary" className="back-link">
        <ArrowLeft aria-hidden="true" /> к бестиарию
      </Link>
      <CreatureStage
        c={c}
        image={image}
        kicker={kind || 'существо'}
        cr={formatCR(c.challenge_rating)}
        chips={
          <>
            <SourceBadge book={book} link />
            {world && (
              <Link to={`/settings/${world.id}`} className="chip chip--link">
                <Landmark aria-hidden="true" /> {world.name}
              </Link>
            )}
            {c.proficiency_bonus != null && <Chip icon={<DieChipIcon type={20} />}>бонус мастерства +{c.proficiency_bonus}</Chip>}
          </>
        }
      />
      <Divider />

      <CreatureBoard c={c} image={image} />

      {(c.description || c.creature_description) && (
        <DetailSection title="Описание">
          <Rich text={c.description ?? c.creature_description} />
        </DetailSection>
      )}
      {c.features?.length ? (
        <DetailSection title="Особенности"><Traits list={c.features} /></DetailSection>
      ) : null}
      {(c.actions?.length || c.actions_description) ? (
        <DetailSection title="Действия">
          <Rich text={c.actions_description} />
          <Traits list={c.actions} />
        </DetailSection>
      ) : null}
      {(c.legendary_actions?.length || c.legendary_description) ? (
        <DetailSection title="Легендарные действия">
          <Rich text={c.legendary_description} />
          <Traits list={c.legendary_actions} />
        </DetailSection>
      ) : null}
      {c.mythical_actions?.length ? (
        <DetailSection title="Мифические действия"><Traits list={c.mythical_actions} /></DetailSection>
      ) : null}
      <ReviewsPanel entity="creatures" id={c.id} />
    </section>
  )
}
