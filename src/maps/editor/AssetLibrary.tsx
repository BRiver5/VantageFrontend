/** Библиотека ассетов: поиск, категории, перетаскивание на холст */
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { assetCategories, assetThumb, assetTitle, searchAssets, type Asset, type AssetCategory } from '../assets'

const LIB_KINDS: { id: string; label: string }[] = [
  { id: 'terrain', label: 'Пол' },
  { id: 'decor', label: 'Декор' },
  { id: 'token', label: 'Жетоны' },
  { id: 'icon', label: 'Иконки' },
  { id: 'map_background', label: 'Фоны' },
]

/** Перетаскивание из библиотеки: id ассета в dataTransfer */
export const ASSET_MIME = 'application/x-vantage-asset'

export function AssetLibrary({ picked, onPick }: { picked: Asset | null; onPick: (a: Asset | null) => void }) {
  const [kind, setKind] = useState('decor')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [cats, setCats] = useState<AssetCategory[]>([])
  const [items, setItems] = useState<Asset[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void assetCategories(kind).then(setCats)
    setCat('')
  }, [kind])
  useEffect(() => {
    let on = true
    setBusy(true)
    const t = setTimeout(() => {
      searchAssets({ kind, q: q.trim(), category: cat, limit: 60 }).then(
        (r) => {
          if (!on) return
          setItems(r.items)
          setTotal(r.total)
          setBusy(false)
        },
        () => on && setBusy(false),
      )
    }, 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [kind, q, cat])
  // категории верхнего уровня: «Подземелье / Пол / Floor» → «Подземелье / Пол»
  const tops = [...new Set(cats.map((c) => c.category.split(' / ').slice(0, 2).join(' / ')))].sort()
  return (
    <div className="me-lib">
      <nav className="me-lib-kinds">
        {LIB_KINDS.map((k) => (
          <button key={k.id} type="button" className={kind === k.id ? 'is-on' : ''} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
        <label className="me-lib-q">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: бочка, дверь, огонь" aria-label="Поиск ассетов" />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категория">
          <option value="">все категории</option>
          {tops.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="me-lib-count">{busy ? '…' : total}</span>
      </nav>
      <ul className="me-lib-grid">
        {items.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className={picked?.id === a.id ? 'is-on' : ''}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_MIME, JSON.stringify(a))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onPick(picked?.id === a.id ? null : a)}
              title={`${assetTitle(a)} · ${a.category}${a.license.id.startsWith('CC-BY') ? ` · ${a.author ?? ''}` : ''}`}
            >
              <img src={assetThumb(a)} alt="" loading="lazy" draggable={false} />
            </button>
          </li>
        ))}
        {!busy && items.length === 0 && <li className="me-lib-empty">Ничего не нашлось</li>}
      </ul>
    </div>
  )
}
