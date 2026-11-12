import { useParams } from 'react-router-dom'
import {
  Eye,
  Hourglass,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  VenetianMask,
} from 'lucide-react'
import type {
  Spell,
} from '../../api'
import { SourceBadge } from '../CatalogPage'
import { SpellSchoolMark, spellSchoolIcon } from '../../spellSchools'
import { useAppShell } from '../../shell'
import { Chip, DetailSection, DetailShell, HexBadge, Rich } from './shared'
import { useBookRef, useContextualBack, useOne } from './hooks'

export function SpellDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: s, error } = useOne<Spell>('spells', id)
  const book = useBookRef(s?.spell_source)
  const { backTo, backLabel } = useContextualBack('/spells', 'к гримуару')
  const { app } = useAppShell()
  if (error) return <p className="status-line is-error">Заклинание не найдено: {error}</p>
  if (!s) return <p className="status-line">Разворачиваем свиток…</p>

  const comps = [
    s.components?.verbal && 'В',
    s.components?.somatic && 'С',
    s.components?.material && 'М',
  ].filter(Boolean).join(', ')

  const schoolSrc = spellSchoolIcon(s.school)

  return (
    <DetailShell
      reviews={{ entity: 'spells', id: s.id }}
      backTo={backTo}
      backLabel={backLabel}
      kicker={s.school ? `школа: ${s.school}` : 'заклинание'}
      title={s.spell_name}
      image={schoolSrc}
      imageIcon={Sparkles}
      bareCover={!!schoolSrc}
      badge={<HexBadge value={s.spell_level === 0 ? '◈' : String(s.spell_level)} label={s.spell_level === 0 ? 'заговор' : 'круг'} />}
      heroDeco={schoolSrc ? <SpellSchoolMark school={s.school} /> : undefined}
      chips={
        <>
          <SourceBadge book={book} />
          {/* на телефоне параметры идут подписанной сеткой под шапкой */}
          {!app && s.casting_time && <Chip icon={Hourglass}>{s.casting_time}</Chip>}
          {!app && s.range && <Chip icon={Target}>{s.range}</Chip>}
          {!app && s.duration && <Chip icon={Hourglass}>{s.duration}</Chip>}
          {!app && comps && <Chip icon={Sparkles}>{comps}</Chip>}
          {s.concentration && <Chip icon={Eye}>концентрация</Chip>}
          {s.ritual && <Chip icon={Star}>ритуал</Chip>}
        </>
      }
    >
      {app && (
        <dl className="spell-facts">
          {s.casting_time && <div><dt>Время</dt><dd>{s.casting_time}</dd></div>}
          {s.range && <div><dt>Дистанция</dt><dd>{s.range}</dd></div>}
          {s.duration && <div><dt>Длительность</dt><dd>{s.duration}</dd></div>}
          {comps && <div><dt>Компоненты</dt><dd>{comps}</dd></div>}
        </dl>
      )}
      {s.material_components && (
        <p className="detail-note">Материальные компоненты: {s.material_components}</p>
      )}
      <DetailSection title="Описание">
        <Rich text={s.description} />
        {s.higher_levels && <Rich text={s.higher_levels} />}
      </DetailSection>
      {(s.available_classes?.length || s.available_subclasses?.length || s.available_races?.length) ? (
        <DetailSection title="Кому доступно">
          <div className="card-chips spell-access">
            {s.available_classes?.map((c) => <Chip key={c} icon={Swords}>{c}</Chip>)}
            {s.available_subclasses?.map((c) => <Chip key={c} icon={Shield}>{c}</Chip>)}
            {s.available_races?.map((c) => <Chip key={c} icon={VenetianMask}>{c}</Chip>)}
          </div>
        </DetailSection>
      ) : null}
    </DetailShell>
  )
}
