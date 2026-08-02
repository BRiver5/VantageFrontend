/**
 * Конструктор «Мультикласс»: модальное окно, где для абстрактного персонажа
 * выбирают один или несколько классов, к каждому — подкласс и уровень. Ниже
 * собираются все способности, доступные персонажу на выбранных уровнях
 * (классовые умения + умения подкласса), сгруппированные по классу.
 *
 * Умения парсим из того же HTML dnd.su, что и на страницах класса/подкласса
 * (см. parseFeatureEntries), а рендерим общим компонентом ClassArticle — так
 * работают таблицы, списки и ссылки на заклинания.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Layers, Plus, Trash2, X } from 'lucide-react'
import { getClasses, getOne, getSubList } from './api'
import type { GameClass, Subclass } from './api'
import { Corners } from './ornaments'
import {
  ClassArticle,
  isHtmlDescription,
  parseFeatureEntries,
  resolveSubclassSectionHtml,
  type FeatureEntry,
} from './classArticle'

/** Один «слот» персонажа: класс + подкласс + уровень в этом классе. */
interface ClassSlot {
  key: number
  classId: string
  subId: string
  level: number
}

/** Загруженные данные класса: полный объект, его подклассы и разобранные умения. */
interface ClassBundle {
  cls: GameClass
  subs: Subclass[]
  features: FeatureEntry[]
}

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  ))
}

let slotSeq = 0
const newSlot = (classId = '', subId = '', level = 3): ClassSlot => ({
  key: ++slotSeq,
  classId,
  subId,
  level,
})

/** Собранные для рендера способности одного слота. */
interface ResolvedBuild {
  slot: ClassSlot
  bundle: ClassBundle | undefined
  subName: string | null
  classFeatures: FeatureEntry[]
  subFeatures: FeatureEntry[]
}

function MulticlassModal({ onClose, fromLabel }: { onClose: () => void; fromLabel?: string }) {
  const [classList, setClassList] = useState<Pick<GameClass, 'id' | 'class_name' | 'is_caster'>[]>([])
  const [cache, setCache] = useState<Record<string, ClassBundle>>({})
  const loading = useRef<Set<string>>(new Set())
  // персонаж «абстрактный» — не привязываемся к классу, со страницы которого открыли
  const [slots, setSlots] = useState<ClassSlot[]>(() => [newSlot()])
  // окно открывается ПОД шапкой сайта — измеряем её высоту, чтобы не перекрывать
  const [topOffset, setTopOffset] = useState(0)

  // список классов для выпадающего меню
  useEffect(() => {
    getClasses()
      .then((list) => setClassList(list.map((c) => ({ id: c.id, class_name: c.class_name, is_caster: c.is_caster }))))
      .catch(() => {})
  }, [])

  // подгружаем данные выбранных классов (полный объект + подклассы + умения)
  useEffect(() => {
    for (const slot of slots) {
      const id = slot.classId
      if (!id || cache[id] || loading.current.has(id)) continue
      loading.current.add(id)
      Promise.all([
        getOne<GameClass>('classes', id),
        getSubList<Subclass>('classes', id, 'subclasses'),
      ])
        .then(([cls, subs]) => {
          const features =
            cls.description && isHtmlDescription(cls.description)
              ? parseFeatureEntries(cls.description)
              : []
          setCache((prev) => (prev[id] ? prev : { ...prev, [id]: { cls, subs, features } }))
        })
        .catch(() => {})
        .finally(() => loading.current.delete(id))
    }
  }, [slots, cache])

  // закрытие по Esc + блокировка прокрутки фона
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // высота липкой шапки сайта — окно начинается сразу под ней
  useEffect(() => {
    const measure = () =>
      setTopOffset(document.querySelector('.masthead')?.getBoundingClientRect().height ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const update = (key: number, patch: Partial<ClassSlot>) =>
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  const addSlot = () => setSlots((prev) => [...prev, newSlot()])
  const removeSlot = (key: number) => setSlots((prev) => prev.filter((s) => s.key !== key))

  const builds: ResolvedBuild[] = useMemo(
    () =>
      slots.map((slot) => {
        const bundle = slot.classId ? cache[slot.classId] : undefined
        const sub = bundle?.subs.find((s) => s.id === slot.subId)
        const subSection = sub
          ? resolveSubclassSectionHtml(sub.description, sub.subclass_name, bundle?.cls.description)
          : null
        const subFeatures = subSection ? parseFeatureEntries(subSection) : []
        return {
          slot,
          bundle,
          subName: sub?.subclass_name ?? null,
          classFeatures: (bundle?.features ?? []).filter((f) => f.level <= slot.level),
          subFeatures: subFeatures.filter((f) => f.level <= slot.level),
        }
      }),
    [slots, cache],
  )

  // единый HTML всех способностей — рендерим общим ClassArticle
  const assembledHtml = useMemo(() => {
    const chunks: string[] = []
    for (const b of builds) {
      if (!b.bundle) continue
      chunks.push(
        `<h2 class="bigSectionTitle">${escapeHtml(b.bundle.cls.class_name)} — ${b.slot.level} ур.</h2>`,
      )
      if (b.classFeatures.length) chunks.push(b.classFeatures.map((f) => f.html).join(''))
      else chunks.push('<p class="mc-empty">На этом уровне новых классовых умений нет.</p>')
      if (b.subName && b.subFeatures.length) {
        chunks.push(`<h3 class="smallSectionTitle">${escapeHtml(b.subName)}</h3>`)
        chunks.push(b.subFeatures.map((f) => f.html).join(''))
      }
    }
    return chunks.join('')
  }, [builds])

  const totalLevel = slots.reduce((n, s) => n + (s.classId ? s.level : 0), 0)
  const anyLoaded = builds.some((b) => b.bundle)

  // портал в body: иначе position:fixed ловит трансформированный предок страницы
  // класса и окно растягивается на всю высоту документа, а не на окно браузера.
  return createPortal(
    <div
      className="mc-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Мультикласс"
      onClick={onClose}
      style={{ top: topOffset }}
    >
      <div className="mc-panel" onClick={(e) => e.stopPropagation()}>
        <Corners size={30} gold />
        <header className="mc-head">
          {fromLabel && (
            <button type="button" className="back-link back-link--btn mc-back" onClick={onClose}>
              <ArrowLeft aria-hidden="true" /> к классу «{fromLabel}»
            </button>
          )}
          <h2 className="mc-title gold-text">
            <Layers aria-hidden="true" /> Мультикласс
          </h2>
          <span className="mc-total">Уровень персонажа: {totalLevel}</span>
          <button type="button" className="mc-close" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="mc-slots">
          {slots.map((slot) => {
            const bundle = slot.classId ? cache[slot.classId] : undefined
            return (
              <div key={slot.key} className="mc-slot">
                <label className="mc-field">
                  <span>Класс</span>
                  <select
                    value={slot.classId}
                    onChange={(e) => update(slot.key, { classId: e.target.value, subId: '' })}
                  >
                    <option value="">— выбрать —</option>
                    {classList.map((c) => (
                      <option key={c.id} value={c.id}>{c.class_name}</option>
                    ))}
                  </select>
                </label>
                <label className="mc-field">
                  <span>Подкласс</span>
                  <select
                    value={slot.subId}
                    disabled={!bundle || bundle.subs.length === 0}
                    onChange={(e) => update(slot.key, { subId: e.target.value })}
                  >
                    <option value="">— без подкласса —</option>
                    {bundle?.subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subclass_name}
                        {s.level_available != null && s.level_available > slot.level
                          ? ` (с ${s.level_available} ур.)`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mc-field mc-field--lvl">
                  <span>Уровень</span>
                  <select
                    value={slot.level}
                    onChange={(e) => update(slot.key, { level: Number(e.target.value) })}
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </label>
                {slots.length > 1 && (
                  <button
                    type="button"
                    className="mc-remove"
                    onClick={() => removeSlot(slot.key)}
                    aria-label="Убрать класс"
                    title="Убрать класс"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </div>
            )
          })}
          <button type="button" className="mc-add" onClick={addSlot}>
            <Plus aria-hidden="true" /> Добавить класс
          </button>
        </div>

        <div className="mc-body">
          {assembledHtml ? (
            <ClassArticle html={assembledHtml} cutSubclasses={false} backLabel={fromLabel} />
          ) : (
            <p className="mc-hint">
              {anyLoaded ? 'Способности не найдены.' : 'Выберите класс, подкласс и уровень — ниже появятся доступные способности персонажа.'}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Кнопка в ряду CTA страницы класса, открывающая конструктор мультикласса. */
export function MulticlassButton({ fromLabel }: { fromLabel?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="spell-cta spell-cta--ghost" onClick={() => setOpen(true)}>
        <Layers aria-hidden="true" />
        Мультикласс
      </button>
      {open && <MulticlassModal onClose={() => setOpen(false)} fromLabel={fromLabel} />}
    </>
  )
}
