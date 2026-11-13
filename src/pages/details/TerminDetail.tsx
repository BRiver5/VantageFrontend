import { useParams } from 'react-router-dom'
import {
  BookOpen,
} from 'lucide-react'
import {
  realImage,
} from '../../api'
import type {
  Termin,
} from '../../api'
import { SourceBadge } from '../catalog/shared'
import { DetailSection, DetailShell, Rich } from './shared'
import { useBookRef, useOne } from './hooks'

export function TerminDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: t, error } = useOne<Termin>('termins', id)
  const book = useBookRef(t?.book_source_id)
  if (error) return <p className="status-line is-error">Термин не найден: {error}</p>
  if (!t) return <p className="status-line">Ищем в глоссарии…</p>

  return (
    <DetailShell
      backTo="/termins"
      backLabel="к терминам"
      kicker="термин"
      title={t.name}
      image={realImage(t.image_gallery)}
      imageIcon={BookOpen}
      chips={<SourceBadge book={book} />}
    >
      <DetailSection title="Определение">
        <Rich text={t.description} />
      </DetailSection>
    </DetailShell>
  )
}
