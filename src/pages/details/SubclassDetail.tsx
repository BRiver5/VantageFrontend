import { useMemo } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Check,
  Shield,
  Sparkles,
  Star,
} from 'lucide-react'
import {
  realImage,
} from '../../api'
import type {
  GameClass,
  Subclass,
} from '../../api'
import { SourceBadge, whenRouteCommitted } from '../CatalogPage'
import { AbilitiesMissingFrom } from '../../abilities/AbilityList'
import { ClassArticle, resolveSubclassSectionHtml } from '../../classArticle'
import { Chip, DetailSection, DetailShell, Rich } from './shared'
import { useBookRef, useOne } from './hooks'
import { SUB_HERO, type VTDocument } from './SubclassHive'

export function SubclassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: sc, error } = useOne<Subclass>('subclasses', id)
  const book = useBookRef(sc?.book_source_id)
  const { data: parent } = useOne<GameClass>('classes', sc?.parent_class_id)

  // возврат к соте с тем же морфом-перелётом, что и при открытии (обложка «летит»
  // обратно в свою соту на странице класса). Соту помечаем через location.state.
  const backToClass = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!sc || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const to = `/classes/${sc.parent_class_id}`
    const state = { returningSubclass: sc.id }
    const doc = document as VTDocument
    if (!doc.startViewTransition) {
      navigate(to, { state })
      return
    }
    // не даём глобальному ScrollToTop сбросить прокрутку — сами подводим соты в кадр
    document.documentElement.dataset.keepScroll = '1'
    document.documentElement.dataset.nav = '1'
    // ждём коммита: страница класса появится (.class-detail-page) и её
    // useLayoutEffect по returningSub успеет подвести соту в кадр — только тогда
    // берём новый кадр морфа
    const t = doc.startViewTransition(() => {
      navigate(to, { state })
      return whenRouteCommitted(() => !!document.querySelector('.class-detail-page'))
    })
    const fin = () => delete document.documentElement.dataset.nav
    t.finished.then(fin, fin)
  }

  // Богатую разметку берём из description подкласса; старый путь — вырезка из HTML класса.
  const subclassHtml = useMemo(() => {
    if (!sc?.subclass_name) return null
    return resolveSubclassSectionHtml(sc.description, sc.subclass_name, parent?.description)
  }, [sc?.description, sc?.subclass_name, parent?.description])

  if (error) return <p className="status-line is-error">Подкласс не найден: {error}</p>
  if (!sc) return <p className="status-line">Листаем хроники ордена…</p>

  return (
    <DetailShell
      reviews={{ entity: 'subclasses', id: sc.id }}
      backTo={`/classes/${sc.parent_class_id}`}
      backLabel={parent ? `к классу «${parent.class_name}»` : 'к классу'}
      onBackClick={backToClass}
      kicker={sc.subclass_flavor ?? 'подкласс'}
      title={sc.subclass_name}
      image={null}
      heroHex={realImage(sc.image_gallery)}
      heroHexName={SUB_HERO}
      imageIcon={Shield}
      chips={
        <>
          <SourceBadge book={book} />
          {sc.level_available != null && <Chip icon={Star}>с {sc.level_available} уровня</Chip>}
          {sc.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
        </>
      }
    >
      <div className="subclass-actions">
        {/* выбрать подкласс → страница класса с умениями подкласса в таблице/списке */}
        <Link to={`/classes/${sc.parent_class_id}?subclass=${sc.id}`} className="spell-cta">
          <Check aria-hidden="true" />
          Выбрать подкласс
        </Link>
        {/* спеллы родительского класса ∪ спеллы этого подкласса */}
        <Link
          to={{
            pathname: '/spells',
            search:
              (parent ? `class=${encodeURIComponent(parent.class_name.toLowerCase())}&` : '') +
              `class=${encodeURIComponent('sub:' + sc.subclass_name.toLowerCase())}`,
          }}
          className="spell-cta spell-cta--ghost"
        >
          <Sparkles aria-hidden="true" />
          Заклинания подкласса
        </Link>
      </div>
      {subclassHtml ? (
        <section className="detail-section">
          <ClassArticle html={subclassHtml} cutSubclasses={false} isCaster={!!sc.is_caster} backLabel={sc.subclass_name} />
        </section>
      ) : (
        <DetailSection title="Описание">
          <Rich text={sc.description} />
        </DetailSection>
      )}
      <AbilitiesMissingFrom
  refs={sc.abilities}
  text={`${subclassHtml ?? ''} ${sc.description ?? ''}`}
  render={(list) => <DetailSection title="Способности и механика">{list}</DetailSection>}
/>
    </DetailShell>
  )
}
