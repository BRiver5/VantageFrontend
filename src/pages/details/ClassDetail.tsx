import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ReviewsPanel } from '../../reviews/Reviews'
import type { CSSProperties } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
} from 'lucide-react'
import {
  cacheEntity,
  getSubList,
  realImage,
} from '../../api'
import type {
  GameClass,
  Subclass,
} from '../../api'
import { Divider } from '../../ornaments'
import {
  StartingEquipment,
  hasStartingEquipment,
} from '../StartingEquipment'
import { DIE_NUM_IMAGE_URLS, DieChipIcon, hitDieType } from '../../dice/diceAssets'
import { AbilitiesMissingFrom } from '../../abilities/AbilityList'
import { parseClassTable, stripClassTable } from '../../classTable'
import type { ClassTable } from '../../classTable'
import { ClassArticle, OpenLinksInNewTab } from '../../classArticle'
import { isHtmlDescription, resolveSubclassSectionHtml, parseSubclassFeatures } from '../../classArticleHtml'
import { MulticlassButton } from '../../multiclass'
import { hasClassProficiencies, parseClassProficiencies } from '../../classProficiencies'
import { Img } from '../../media'
import { Chip, DetailSection, MobileFold, Rich, StatRow } from './shared'
import { useOne } from './hooks'
import { SubclassHive } from './SubclassHive'

/** Список подклассов класса кэшируем — чтобы при возврате соты были на месте
 *  СРАЗУ (иначе перелёт-морф не находит цель, пока идёт запрос). */
const subclassListCache = new Map<string, Subclass[]>()

/* ---------- Таблица развития класса ---------- */

/** Умения, дающие выбор подкласса — кликом уводим к сотам подклассов ниже. */
const SUBCLASS_FEATURES = new Set([
  'Коллегия бардов',
  'Воинский архетип',
  'Магические традиции',
  'Круг друидов',
  'Божественный домен',
  'Специальность изобретателя',
  'Вариант договора',
  'Священная клятва',
  'Архетип плута',
  'Архетип следопыта',
  'Происхождение чародея',
  'Монастырская традиция',
  'Путь дикости',
])

function ClassProgressionTable({ table, onOpenSubclasses }: { table: ClassTable; onOpenSubclasses?: () => void }) {
  const nonSlot = table.columns.filter((c) => !c.slot)
  const slots = table.columns.filter((c) => c.slot)
  const span = slots.length ? 2 : 1
  return (
    <div className="ctable-wrap">
      <table className="ctable">
        <thead>
          <tr>
            {nonSlot.map((c) => (
              <th
                key={c.key}
                rowSpan={span}
                className={c.feat ? 'ctable-feat-h' : c.key === 'level' ? 'ctable-lvl-h' : 'ctable-num-h'}
              >
                {c.label}
              </th>
            ))}
            {slots.length > 0 && (
              <th colSpan={slots.length} className="ctable-group-h">Ячейки заклинаний</th>
            )}
          </tr>
          {slots.length > 0 && (
            <tr>
              {slots.map((c) => (
                <th key={c.key} className="ctable-num-h">{c.label}</th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri}>
              {table.columns.map((c, ci) => {
                const v = r.cells[ci]
                if (c.feat) {
                  const feats = Array.isArray(v) ? v : []
                  return (
                    <td key={c.key} className="ctable-feat">
                      {feats.length ? (
                        feats.map((f, fi) =>
                          onOpenSubclasses && SUBCLASS_FEATURES.has(f) ? (
                            <button key={fi} type="button" className="ctable-feat-item ctable-feat-link" onClick={onOpenSubclasses}>
                              {f}
                            </button>
                          ) : (
                            <span key={fi} className="ctable-feat-item">{f}</span>
                          ),
                        )
                      ) : (
                        <span className="ctable-dash">—</span>
                      )}
                    </td>
                  )
                }
                const cls = c.key === 'level' ? 'ctable-lvl' : c.key === 'prof' ? 'ctable-prof' : 'ctable-num'
                return <td key={c.key} className={cls}>{String(v ?? '—')}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClassDetailPortrait({ src, alt, vt = true }: { src: string | null; alt: string; vt?: boolean }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="class-detail-portrait">
      {src && !broken ? (
        <Img
          src={src}
          alt={alt}
          style={vt ? ({ viewTransitionName: 'class-hero-img' } as CSSProperties) : undefined}
          onError={() => setBroken(true)}
        />
      ) : (
        <Swords className="class-detail-fallback" aria-hidden="true" />
      )}
    </div>
  )
}

/** Как называется группа подклассов у конкретного класса (термин dnd.su). */
const SUBCLASS_GROUP_LABEL: Record<string, string> = {
  Бард: 'Коллегии барда',
  Варвар: 'Пути дикости',
  Воин: 'Воинские архетипы',
  Волшебник: 'Магические традиции',
  Друид: 'Круги друидов',
  Жрец: 'Божественные домены',
  Изобретатель: 'Специализации изобретателя',
  Колдун: 'Потусторонние покровители',
  Монах: 'Монастырские традиции',
  Паладин: 'Священные клятвы',
  Плут: 'Архетипы плута',
  Следопыт: 'Архетипы следопыта',
  Чародей: 'Происхождения чародея',
}

/**
 * Деталь класса: id из оболочки/роута, onBack — reverse-VT в каталог (если задан).
 * `embedded` — показ внутри конструктора персонажа: без «назад» и мультикласса,
 * подкласс выбирается локально (не в адресе), переходы — в новой вкладке.
 */
export function ClassDetailView({
  id,
  onBack,
  embedded = false,
}: {
  id: string
  onBack?: () => void
  embedded?: boolean
}) {
  const location = useLocation()
  const { data: c, error } = useOne<GameClass>('classes', id)
  // из кэша — чтобы при возврате с подкласса соты были на месте сразу (для морфа)
  const [subclasses, setSubclasses] = useState<Subclass[]>(() => subclassListCache.get(id) || [])

  useEffect(() => {
    setSubclasses(subclassListCache.get(id) ?? [])
    getSubList<Subclass>('classes', id, 'subclasses')
      .then((list) => {
        subclassListCache.set(id, list)
        // деталь подкласса откроется мгновенно (с обложкой) — нужно для морфа
        list.forEach((s) => cacheEntity('subclasses', s.id, s))
        setSubclasses(list)
      })
      .catch(() => {})
  }, [id])

  // подкласс, с которого вернулись (морф-перелёт в его соту); гасим имя через ~1.5 c
  const [returningSub, setReturningSub] = useState<string | undefined>(
    () => (location.state as { returningSubclass?: string } | null)?.returningSubclass,
  )
  useEffect(() => {
    const fromState = (location.state as { returningSubclass?: string } | null)?.returningSubclass
    if (fromState) setReturningSub(fromState)
  }, [location.state])
  useEffect(() => {
    if (!returningSub) return
    const t = setTimeout(() => setReturningSub(undefined), 1500)
    return () => clearTimeout(t)
  }, [returningSub])

  const isHtml = useMemo(() => isHtmlDescription(c?.description), [c?.description])
  const proficiencies = useMemo(
    () => (isHtml && c?.description ? parseClassProficiencies(c.description) : {}),
    [isHtml, c?.description],
  )
  const table = useMemo(() => (isHtml ? null : parseClassTable(c?.description)), [c?.description, isHtml])
  const descText = useMemo(() => (isHtml ? '' : stripClassTable(c?.description)), [c?.description, isHtml])
  const subsRef = useRef<HTMLDivElement>(null)
  const scrollToSubclasses = () =>
    subsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // возврат с подкласса: подводим соты в кадр ДО отрисовки, чтобы обложка
  // «прилетела» на видимую соту (снимок view-transition берётся уже с прокруткой).
  // Прыжок мгновенный — иначе плавный скролл сайта уводит цель из кадра снимка.
  useLayoutEffect(() => {
    if (returningSub && subclasses.length && subsRef.current) {
      const root = document.documentElement
      const prev = root.style.scrollBehavior
      root.style.scrollBehavior = 'auto'
      subsRef.current.scrollIntoView({ block: 'center' })
      root.style.scrollBehavior = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningSub, subclasses.length])

  // Выбранный подкласс (?subclass=): его умения вписываются в таблицу/список класса
  const [searchParams, setSearchParams] = useSearchParams()
  const [localSubclass, setLocalSubclass] = useState<string | null>(null)
  const subclassId = embedded ? localSubclass : searchParams.get('subclass')
  const heroRef = useRef<HTMLElement>(null)
  const { data: selectedSubDirect } = useOne<Subclass>('subclasses', subclassId ?? undefined)
  const selectedSub = useMemo(() => {
    if (!subclassId) return null
    const fromList = subclasses.find((s) => s.id === subclassId)
    if (fromList) return fromList
    // подкласс из URL мог не совпасть со списком ещё не загруженного класса
    return selectedSubDirect?.id === subclassId && selectedSubDirect.parent_class_id === id
      ? selectedSubDirect
      : null
  }, [subclasses, subclassId, selectedSubDirect, id])
  const subclassSection = useMemo(
    () =>
      selectedSub
        ? resolveSubclassSectionHtml(selectedSub.description, selectedSub.subclass_name, c?.description)
        : null,
    [selectedSub, c?.description],
  )
  const subclassFeatures = useMemo(
    () => (subclassSection ? parseSubclassFeatures(subclassSection) : undefined),
    [subclassSection],
  )
  const toggleSubclass = (nextId: string | null) => {
    const picked = !!nextId && nextId !== subclassId
    if (embedded) {
      setLocalSubclass(picked ? nextId : null)
      if (picked) heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const p = new URLSearchParams(searchParams)
    if (picked) p.set('subclass', nextId!)
    else p.delete('subclass')
    setSearchParams(p, { replace: true })
    // выбор из сот внизу страницы — поднимаем к шапке, где виден бейдж подкласса
    if (picked) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (error) return <p className="status-line is-error">Класс не найден: {error}</p>
  if (!c) return <p className="status-line">Листаем хроники орденов…</p>

  const dieType = hitDieType(c.hit_dice)

  const vt = (name: string) =>
    embedded ? undefined : ({ viewTransitionName: name } as CSSProperties)

  return (
    <OpenLinksInNewTab.Provider value={embedded}>
      <section className="book-page class-detail-page">
        {embedded ? null : onBack ? (
          <button type="button" className="back-link back-link--btn" onClick={onBack}>
            <ArrowLeft aria-hidden="true" /> к классам
          </button>
        ) : (
          <Link to="/classes" className="back-link">
            <ArrowLeft aria-hidden="true" /> к классам
          </Link>
        )}

        <header ref={heroRef} className={`class-detail-hero${c.is_caster ? ' is-caster' : ' is-martial'}`}>
          <div className="class-detail-stage">
            <div className="class-detail-aura" aria-hidden="true" />
            <Img
              className="class-detail-die"
              src={DIE_NUM_IMAGE_URLS[dieType]}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={vt('class-hero-die')}
            />
            <ClassDetailPortrait src={realImage(c.image_gallery)} alt={c.class_name} vt={!embedded} />

            <div className="class-detail-meta">
              <h1 className="class-detail-name-plate" style={vt('class-hero-title')}>
                {c.class_name}
              </h1>
              <div className="card-chips class-detail-chips">
                <Chip icon={<DieChipIcon type={dieType} />}>к{c.hit_dice} хитов</Chip>
                {c.is_caster && <Chip icon={Sparkles}>заклинатель</Chip>}
              </div>
            </div>

            {selectedSub && (
              <div className="class-detail-subhex">
                <div className="class-detail-subhex-art">
                  <Link
                    to={`/subclasses/${selectedSub.id}`}
                    className="detail-hex detail-hex--sm"
                    title={selectedSub.subclass_name}
                    target={embedded ? '_blank' : undefined}
                    rel={embedded ? 'noopener' : undefined}
                  >
                    {realImage(selectedSub.image_gallery) ? (
                      <Img
                        className="detail-hex-cover"
                        src={realImage(selectedSub.image_gallery)!}
                        alt={selectedSub.subclass_name}
                      />
                    ) : (
                      <span className="detail-hex-fallback"><Shield aria-hidden="true" /></span>
                    )}
                  </Link>
                  <button
                    type="button"
                    className="hex-pick hex-pick--bottom"
                    onClick={() => toggleSubclass(null)}
                    title="Убрать подкласс"
                    aria-label="Убрать подкласс"
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
                <span className="class-detail-subhex-name">{selectedSub.subclass_name}</span>
              </div>
            )}
          </div>
        </header>

        <Divider />

        <div className="class-cta-row">
          {c.is_caster && (
            <Link
              to={`/spells?class=${encodeURIComponent(c.class_name.toLowerCase())}`}
              className="spell-cta"
              target={embedded ? '_blank' : undefined}
              rel={embedded ? 'noopener' : undefined}
            >
              <Sparkles aria-hidden="true" />
              Заклинания класса
            </Link>
          )}
          {subclasses.length > 0 && (
            <button
              type="button"
              className="spell-cta spell-cta--ghost subclass-jump"
              onClick={scrollToSubclasses}
            >
              <Users aria-hidden="true" />
              {selectedSub
                ? 'Сменить архетип'
                : `${SUBCLASS_GROUP_LABEL[c.class_name] ?? 'Подклассы'} — ${subclasses.length}`}
              <ArrowDown aria-hidden="true" />
            </button>
          )}
          {!embedded && <MulticlassButton fromLabel={c.class_name} />}
        </div>

        {hasClassProficiencies(proficiencies) && (
          <div className="stat-rows">
            <StatRow label="Доспехи" value={proficiencies.armor} />
            <StatRow label="Оружие" value={proficiencies.weapons} />
            <StatRow label="Инструменты" value={proficiencies.tools} />
            <StatRow label="Спасброски" value={proficiencies.savingThrows} />
            <StatRow label="Навыки" value={proficiencies.skills} />
          </div>
        )}
        {hasStartingEquipment(c.starting_equipment, c.starting_equipment_text) && (
          <MobileFold title="Стартовое снаряжение">
            <StartingEquipment grants={c.starting_equipment} sourceText={c.starting_equipment_text} backLabel={c.class_name} />
          </MobileFold>
        )}
        {isHtml ? (
          <section className="detail-section">
            <ClassArticle
              html={c.description!}
              subclassSectionHtml={subclassSection}
              subclassFeatures={subclassFeatures}
              isCaster={!!c.is_caster}
              backLabel={c.class_name}
            />
          </section>
        ) : (
          <>
            <DetailSection title="Описание">
              <Rich text={descText} />
            </DetailSection>
            {table && (
              <DetailSection title="Таблица развития">
                <ClassProgressionTable
                  table={table}
                  onOpenSubclasses={subclasses.length > 0 ? scrollToSubclasses : undefined}
                />
              </DetailSection>
            )}
          </>
        )}
        <AbilitiesMissingFrom
  refs={c.abilities}
  text={c.description ?? ''}
  render={(list) => <DetailSection title="Способности и механика">{list}</DetailSection>}
/>
        {subclasses.length > 0 && (
          <div ref={subsRef}>
            <DetailSection title={`${SUBCLASS_GROUP_LABEL[c.class_name] ?? 'Подклассы'} — ${subclasses.length}`}>
              <SubclassHive
                subclasses={subclasses}
                selectedId={subclassId}
                returningId={returningSub}
                onToggle={toggleSubclass}
              />
            </DetailSection>
          </div>
        )}
        {!embedded && <ReviewsPanel entity="classes" id={c.id} />}
      </section>
    </OpenLinksInNewTab.Provider>
  )
}
