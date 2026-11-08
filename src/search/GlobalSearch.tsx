/**
 * Поиск по всему сайту: окно поверх любой страницы. Открывается сочетанием
 * Ctrl+K (⌘K) или «/», кнопкой в меню и строкой на главной. Ищет сервер: он
 * понимает русский и английский, неверную раскладку и опечатки.
 *
 * Стрелки ходят по результатам, Enter открывает, Esc закрывает. Сверху — разделы
 * со счётчиками: нажатие сужает поиск до раздела.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Award,
  Backpack,
  BookOpen,
  CornerDownLeft,
  Gem,
  Globe2,
  Landmark,
  Loader2,
  ScrollText,
  Search,
  Shield,
  Skull,
  Sparkles,
  Swords,
  VenetianMask,
  X,
  Zap,
  BookMarked,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { searchCatalog, type SearchHit, type SearchResult } from '../api'

/** Раздел → страница и значок. Без страницы (способности классов) результат раскрывается на месте */
const ENTITY: Record<string, { path: string | null; icon: LucideIcon; label: string }> = {
  classes: { path: '/classes', icon: Swords, label: 'Классы' },
  subclasses: { path: '/subclasses', icon: Shield, label: 'Подклассы' },
  races: { path: '/races', icon: VenetianMask, label: 'Расы' },
  subraces: { path: '/subraces', icon: VenetianMask, label: 'Подрасы' },
  backgrounds: { path: '/backgrounds', icon: Landmark, label: 'Предыстории' },
  feats: { path: '/feats', icon: Award, label: 'Черты' },
  spells: { path: '/spells', icon: Sparkles, label: 'Заклинания' },
  equipment: { path: '/equipment', icon: Backpack, label: 'Снаряжение' },
  items: { path: '/items', icon: Gem, label: 'Предметы' },
  creatures: { path: '/bestiary', icon: Skull, label: 'Бестиарий' },
  abilities: { path: null, icon: Zap, label: 'Способности' },
  terms: { path: '/terms', icon: BookMarked, label: 'Термины D&D' },
  termins: { path: '/termins', icon: ScrollText, label: 'Термины' },
  books: { path: '/books', icon: BookOpen, label: 'Книги' },
  settings: { path: '/settings', icon: Globe2, label: 'Миры' },
}
const metaOf = (entity: string, title?: string) => ENTITY[entity] ?? { path: null, icon: Search, label: title ?? entity }

const PAGE = 20
const DEBOUNCE_MS = 220

/* ---------- контекст: открыть поиск откуда угодно ---------- */

const SearchContext = createContext<(initial?: string) => void>(() => {})
export const useOpenSearch = () => useContext(SearchContext)

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ initial: string } | null>(null)
  const openSearch = useCallback((initial = '') => setOpen({ initial }), [])
  const { pathname } = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => (o ? null : { initial: '' }))
      } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setOpen({ initial: '' })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // в комнате сцена занимает весь экран и свои сочетания: там поиск не нужен
  const blocked = pathname.startsWith('/rooms/') && pathname !== '/rooms/'

  return (
    <SearchContext.Provider value={openSearch}>
      {children}
      {open && !blocked && <SearchPalette key={open.initial} initial={open.initial} onClose={() => setOpen(null)} />}
    </SearchContext.Provider>
  )
}

/* ---------- окно ---------- */

/** Подсветить найденное в тексте; регистр не важен */
function Mark({ text, q }: { text: string; q: string }) {
  const words = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p))}
    </>
  )
}

function SearchPalette({ initial, onClose }: { initial: string; onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState(initial)
  const [entity, setEntity] = useState<string | null>(null)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const query = q.trim()

  // запрос с задержкой; прежний обрывается
  useEffect(() => {
    if (!query) {
      setResult(null)
      setCounts({})
      setError(null)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      searchCatalog(query, { entities: entity ? [entity] : undefined, limit: PAGE, signal: ctrl.signal })
        .then((r) => {
          setResult(r)
          setActive(0)
          setExpanded(null)
          // счётчики разделов берём из общего поиска, чтобы фильтр не обнулял соседей
          if (!entity) setCounts(r.counts)
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== 'AbortError') setError('Поиск сейчас недоступен. Попробуйте ещё раз.')
        })
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, entity])

  const items = useMemo(() => result?.items ?? [], [result])
  const hasMore = !!result && result.items.length < result.total

  const loadMore = async () => {
    if (!result) return
    setMore(true)
    try {
      const r = await searchCatalog(query, { entities: entity ? [entity] : undefined, skip: result.items.length, limit: PAGE })
      setResult({ ...r, items: [...result.items, ...r.items] })
    } catch {
      setError('Не удалось догрузить.')
    } finally {
      setMore(false)
    }
  }

  const go = (hit: SearchHit) => {
    const meta = metaOf(hit.entity, hit.entity_title)
    if (!meta.path) {
      setExpanded((x) => (x === hit.id ? null : hit.id))
      return
    }
    onClose()
    navigate(`${meta.path}/${hit.id}`)
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (q) setQ('')
      else onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      go(items[active])
    }
  }

  const sections = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return createPortal(
    <div className="gs-layer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gs" role="dialog" aria-modal="true" aria-label="Поиск по сайту" onKeyDown={onKey}>
        <label className="gs-input">
          {loading ? <Loader2 className="gs-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Заклинание, монстр, класс, предмет…"
            aria-label="Что ищем"
            aria-controls="gs-results"
            aria-activedescendant={items[active] ? `gs-${items[active].entity}-${items[active].id}` : undefined}
          />
          <button type="button" className="gs-close" onClick={onClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </label>

        {sections.length > 1 && (
          <div className="gs-chips" role="radiogroup" aria-label="Раздел">
            <button type="button" role="radio" aria-checked={!entity} className={!entity ? 'is-on' : ''} onClick={() => setEntity(null)}>
              Всё <em>{Object.values(counts).reduce((a, b) => a + b, 0)}</em>
            </button>
            {sections.map(([key, n]) => {
              const meta = metaOf(key)
              const Icon = meta.icon
              return (
                <button key={key} type="button" role="radio" aria-checked={entity === key} className={entity === key ? 'is-on' : ''} onClick={() => setEntity(entity === key ? null : key)}>
                  <Icon aria-hidden="true" /> {meta.label} <em>{n}</em>
                </button>
              )
            })}
          </div>
        )}

        <div className="gs-body">
          {!query ? (
            <div className="gs-empty">
              <p>Ищите по всему кодексу: классы, расы, заклинания, бестиарий, предметы, книги и миры.</p>
              <p className="gs-tip">
                Можно с опечатками и в английской раскладке. <kbd>Ctrl</kbd> <kbd>K</kbd> или <kbd>/</kbd> — открыть с любой страницы.
              </p>
            </div>
          ) : error ? (
            <p className="gs-empty">{error}</p>
          ) : result && items.length === 0 && !loading ? (
            <p className="gs-empty">По запросу «{query}» ничего не нашлось.</p>
          ) : (
            <ol id="gs-results" ref={listRef} className="gs-list" role="listbox" aria-label="Результаты">
              {items.map((hit, i) => {
                const meta = metaOf(hit.entity, hit.entity_title)
                const Icon = meta.icon
                const open = expanded === hit.id
                return (
                  <li key={`${hit.entity}-${hit.id}`} id={`gs-${hit.entity}-${hit.id}`} role="option" aria-selected={i === active} data-i={i}>
                    <button type="button" className={`gs-hit${i === active ? ' is-active' : ''}${open ? ' is-open' : ''}`} onMouseMove={() => setActive(i)} onClick={() => go(hit)}>
                      <span className="gs-hit-icon">
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="gs-hit-body">
                        <b>
                          <Mark text={hit.title} q={query} />
                          {hit.alias && <i> · {hit.alias}</i>}
                        </b>
                        {hit.snippet && (
                          <span className={`gs-hit-snippet${open ? ' is-full' : ''}`}>
                            <Mark text={hit.snippet} q={query} />
                          </span>
                        )}
                      </span>
                      <span className="gs-hit-kind">{hit.entity_title || meta.label}</span>
                      {i === active && <CornerDownLeft className="gs-hit-enter" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
              {hasMore && (
                <li className="gs-more">
                  <button type="button" disabled={more} onClick={() => void loadMore()}>
                    {more ? 'Загружаем…' : `Показать ещё (${result.total - items.length})`}
                  </button>
                </li>
              )}
            </ol>
          )}
        </div>
        <footer className="gs-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> выбрать
          </span>
          <span>
            <kbd>Enter</kbd> открыть
          </span>
          <span>
            <kbd>Esc</kbd> закрыть
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/** Строка поиска на главной: выглядит как поле, открывает окно поиска */
export function SearchBar() {
  const openSearch = useOpenSearch()
  return (
    <button type="button" className="gs-bar" onClick={() => openSearch()}>
      <Search aria-hidden="true" />
      <span>Найти заклинание, монстра, класс, предмет…</span>
      <kbd>Ctrl K</kbd>
    </button>
  )
}
