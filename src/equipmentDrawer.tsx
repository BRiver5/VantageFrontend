import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ArrowLeft, ArrowUpRight, Coins, Layers, Package, Scale, Tag, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { getOne, realImage } from './api'
import type { ContainerProfile, ContentEntry, Equipment, EquipmentIndex } from './api'
import { categoryIcon, containerKindRu, formatCost, formatDice, formatWeight } from './equipment'
import { useEquipmentIndex } from './equipmentIndex'
import { Corners } from './ornaments'
import { RichText } from './terms/terms'

/* ============================================================
   Панель предмета: выезжает справа, гасит страницу вуалью
   ============================================================ */

interface DrawerApi {
  /** id или slug предмета; slug разрешается через индекс снаряжения */
  open: (key: string) => void
  close: () => void
}

const NOOP: DrawerApi = { open: () => {}, close: () => {} }
const DrawerContext = createContext<DrawerApi>(NOOP)

/** Открыть предмет в правой панели вместо перехода на его страницу */
export function useEquipmentDrawer(): DrawerApi {
  return useContext(DrawerContext)
}

/** Сколько длится анимация ухода панели — столько же держим её в дереве */
const CLOSE_MS = 280

export function EquipmentDrawerProvider({ children }: { children: ReactNode }) {
  // стек, а не одно значение: из содержимого набора можно уйти вглубь и вернуться
  const [stack, setStack] = useState<string[]>([])
  const [shown, setShown] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const open = useCallback((key: string) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setStack((cur) => (cur[cur.length - 1] === key ? cur : [...cur, key]))
    // класс с открытым состоянием — только следующим кадром, иначе браузеру
    // нечего анимировать: элемент появляется уже на месте
    requestAnimationFrame(() => setShown(true))
  }, [])

  const close = useCallback(() => {
    setShown(false)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setStack([]), CLOSE_MS)
  }, [])

  const back = useCallback(() => setStack((cur) => cur.slice(0, -1)), [])

  const mounted = stack.length > 0

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)

    // Не ставим body { overflow: hidden } — он ломает sticky левого сайдбара
    // (тот «подлетает» вверх, если страница уже прокручена). Вместо этого
    // фиксируем body на текущем scrollY: визуально ничего не дёргается,
    // а колесо/клавиши страницу больше не крутят.
    const scrollY = window.scrollY
    const { style } = document.body
    const prev = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
    }
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.left = '0'
    style.right = '0'
    style.width = '100%'

    return () => {
      document.removeEventListener('keydown', onKey)
      style.position = prev.position
      style.top = prev.top
      style.left = prev.left
      style.right = prev.right
      style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [mounted, close])

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const current = stack[stack.length - 1]

  return (
    <DrawerContext.Provider value={{ open, close }}>
      {children}
      {mounted &&
        createPortal(
          <div className={`eq-drawer-layer${shown ? ' is-open' : ''}`}>
            <div className="eq-drawer-veil" onClick={close} aria-hidden="true" />
            <aside className="eq-drawer" role="dialog" aria-modal="true" aria-label="Предмет снаряжения">
              <Corners size={28} />
              <div className="eq-drawer-bar">
                {stack.length > 1 && (
                  <button type="button" className="eq-drawer-icon-btn" onClick={back} aria-label="Назад">
                    <ArrowLeft aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="eq-drawer-icon-btn eq-drawer-icon-btn--close"
                  onClick={close}
                  aria-label="Закрыть"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <EquipmentDrawerBody key={current} entryKey={current} onClose={close} />
            </aside>
          </div>,
          document.body,
        )}
    </DrawerContext.Provider>
  )
}

/** Предмет по id или slug: почти всегда уже лежит в индексе снаряжения */
function useEquipmentByKey(key: string): Equipment | null {
  const index = useEquipmentIndex()
  const found = index?.byId.get(key) ?? index?.bySlug.get(key) ?? null
  const [fetched, setFetched] = useState<Equipment | null>(null)

  useEffect(() => {
    if (found) return
    let alive = true
    getOne<Equipment>('equipment', key)
      .then((eq) => {
        if (alive) setFetched(eq)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [key, found])

  return found ?? fetched
}

function DrawerChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="chip">
      <Icon aria-hidden="true" />
      {children}
    </span>
  )
}

function DrawerStat({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="stat-row">
      <span className="stat-row-label">{label}</span>
      <span className="stat-row-value">{value}</span>
    </div>
  )
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="eq-drawer-section">
      <h3 className="detail-subtitle gold-text">{title}</h3>
      {children}
    </section>
  )
}

function containerAccepts(c: ContainerProfile): string {
  const parts = [...c.accepts_categories, ...c.accepts_tags, ...c.accepts_slugs]
  return parts.length === 0 ? 'что угодно' : parts.join(', ')
}

/**
 * Превью вложенного содержимого — стопка мини-иконок в левом нижнем углу арта.
 * Общая для панели снаряжения (`sm`) и полной страницы предмета (`md`, по умолчанию).
 */
export function EquipmentContentsCorner({
  contents,
  index,
  size = 'md',
}: {
  contents: ContentEntry[]
  index: EquipmentIndex | null
  size?: 'md' | 'sm'
}) {
  if (contents.length === 0) return null
  const shown = contents.slice(0, 3)
  const extra = contents.length - shown.length
  return (
    <span
      className={`detail-plate-contents${size === 'sm' ? ' detail-plate-contents--sm' : ''}`}
      title={`Внутри: ${contents.length}`}
    >
      {shown.map((entry, i) => {
        const item = index?.bySlug.get(entry.slug)
        const src = realImage(entry.image_gallery) ?? (item ? realImage(item.equipment_image_gallery) : null)
        const Icon = categoryIcon(item?.category)
        return (
          <span className="detail-plate-contents-item" key={entry.slug + i}>
            {src ? <img src={src} alt="" /> : <Icon aria-hidden="true" />}
          </span>
        )
      })}
      {extra > 0 && <span className="detail-plate-contents-more">+{extra}</span>}
    </span>
  )
}

function DrawerArt({ eq, index }: { eq: Equipment; index: EquipmentIndex | null }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(eq.equipment_image_gallery)
  const Icon = categoryIcon(eq.category)
  const contents = eq.container?.default_contents ?? []
  return (
    <span className="eq-drawer-art-wrap">
      <span className="eq-drawer-art-glow" aria-hidden="true" />
      {src && !broken ? (
        <img className="eq-drawer-art" src={src} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="eq-drawer-art eq-drawer-art--empty">
          <Icon aria-hidden="true" />
        </span>
      )}
      {contents.length > 0 && <EquipmentContentsCorner contents={contents} index={index} size="sm" />}
    </span>
  )
}

function EquipmentDrawerBody({ entryKey, onClose }: { entryKey: string; onClose: () => void }) {
  const eq = useEquipmentByKey(entryKey)
  const index = useEquipmentIndex()

  if (!eq) return <p className="status-line">Разбираем походный тюк…</p>

  const cost = formatCost(eq.cost, eq.cost_copper)
  const weight = formatWeight(eq.weight)
  const w = eq.weapon
  const d = eq.defense
  const c = eq.container
  const range =
    w?.range_normal != null ? `${w.range_normal}${w.range_long ? `/${w.range_long}` : ''} фт.` : null

  return (
    <div className="eq-drawer-scroll">
      <header className="eq-drawer-hero">
        <DrawerArt eq={eq} index={index} />
        <div className="eq-drawer-heading">
          <span className="setting-kicker">{eq.subcategory ?? eq.category}</span>
          <h2 className="eq-drawer-title gold-text">{eq.equipment_name}</h2>
          {eq.equipment_name_en && <span className="eq-drawer-en">{eq.equipment_name_en}</span>}
        </div>
      </header>

      <div className="card-chips eq-drawer-chips">
        {cost && <DrawerChip icon={Coins}>{cost}</DrawerChip>}
        {weight && <DrawerChip icon={Scale}>{weight}</DrawerChip>}
        {eq.bundle_size != null && eq.bundle_size > 1 && (
          <DrawerChip icon={Package}>пачка {eq.bundle_size}</DrawerChip>
        )}
        {eq.stackable && <DrawerChip icon={Layers}>стак до {eq.stack_size}</DrawerChip>}
        {eq.tags.map((t) => (
          <DrawerChip key={t} icon={Tag}>
            {t}
          </DrawerChip>
        ))}
      </div>

      {w && (
        <DrawerSection title="Оружие">
          <div className="stat-rows">
            <DrawerStat label="Вид" value={[w.weapon_kind, w.attack_kind].filter(Boolean).join(' · ')} />
            <DrawerStat
              label="Урон"
              value={[formatDice(w.damage_dice), w.damage_type?.toLowerCase()].filter(Boolean).join(' ')}
            />
            <DrawerStat label="Универсальное" value={formatDice(w.versatile_dice)} />
            <DrawerStat label="Дистанция" value={range} />
            <DrawerStat label="Свойства" value={w.properties.join(', ')} />
            <DrawerStat label="Приём" value={w.mastery} />
          </div>
        </DrawerSection>
      )}

      {d && (
        <DrawerSection title="Доспех">
          <div className="stat-rows">
            <DrawerStat label="Вид" value={d.armor_kind} />
            <DrawerStat
              label="Класс Доспеха"
              value={
                d.armor_class != null
                  ? `${d.armor_class}${d.add_dex_modifier ? ' + ЛОВ' : ''}${
                      d.dex_modifier_cap != null ? ` (не более +${d.dex_modifier_cap})` : ''
                    }`
                  : d.armor_class_formula
              }
            />
            <DrawerStat label="Требование Силы" value={d.strength_requirement} />
            <DrawerStat label="Скрытность" value={d.stealth_disadvantage ? 'помеха' : null} />
          </div>
        </DrawerSection>
      )}

      {c && (
        <DrawerSection title={`Контейнер: ${containerKindRu(c.container_kind)}`}>
          <div className="stat-rows">
            <DrawerStat label="Ячейки" value={c.slots} />
            <DrawerStat label="Вместимость" value={c.capacity_pounds != null ? `${c.capacity_pounds} фнт.` : null} />
            <DrawerStat label="Принимает" value={containerAccepts(c)} />
          </div>
          {c.default_contents.length > 0 && (
            <EquipmentContentsGallery contents={c.default_contents} index={index} />
          )}
          {c.sealed && (
            <p className="detail-note">Набор: содержимое можно вынуть, но сложить обратно в него нельзя.</p>
          )}
        </DrawerSection>
      )}

      {eq.description && (
        <DrawerSection title="Описание">
          <RichText text={eq.description} />
        </DrawerSection>
      )}

      <Link to={`/equipment/${eq.id}`} className="eq-drawer-full" onClick={onClose}>
        открыть полную страницу <ArrowUpRight aria-hidden="true" />
      </Link>
    </div>
  )
}

/* ============================================================
   Галерея вложенного содержимого: квадратики картинок
   ============================================================ */

function ContentTile({
  entry,
  index,
}: {
  entry: ContentEntry
  index: EquipmentIndex | null
}) {
  const [broken, setBroken] = useState(false)
  const drawer = useEquipmentDrawer()
  const eq = index?.bySlug.get(entry.slug)
  const src = realImage(entry.image_gallery) ?? (eq ? realImage(eq.equipment_image_gallery) : null)
  const Icon = categoryIcon(eq?.category)
  const name = eq?.equipment_name ?? entry.slug
  const qty = entry.quantity > 1 ? entry.quantity : null
  const href = eq ? `/equipment/${eq.id}` : undefined

  const face = (
    <>
      {src && !broken ? (
        <img className="se-tile-face" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="se-tile-face se-tile-face--empty" aria-hidden="true">
          <Icon />
        </span>
      )}
      {qty != null && <span className="se-tile-qty">{qty}</span>}
    </>
  )

  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    drawer.open(eq?.id ?? entry.slug)
  }

  if (href) {
    return (
      <Link to={href} className="se-tile" title={qty ? `${name} × ${qty}` : name} onClick={onClick}>
        {face}
      </Link>
    )
  }
  return (
    <span className="se-tile se-tile--pending" title={name}>
      {face}
    </span>
  )
}

/**
 * Содержимое набора или комплекта одежды: ряд квадратных картинок с той же
 * вертикальной чертой вложенности, что у карточек. Полные карточки тут не нужны —
 * в наборе бывает по десятку мелочей.
 */
export function EquipmentContentsGallery({
  contents,
  index,
}: {
  contents: ContentEntry[]
  index: EquipmentIndex | null
}) {
  if (contents.length === 0) return null
  return (
    <div className="se-contents se-contents--gallery">
      {contents.map((c) => (
        <ContentTile key={c.slug} entry={c} index={index} />
      ))}
    </div>
  )
}
