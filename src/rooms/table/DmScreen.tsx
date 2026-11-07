/**
 * Ширма мастера (только компьютер). Лежит у нижнего края стола: сложенная —
 * полоска с жетонами разделов, раскрытая — поднимается на петлях и даёт нужный
 * инструмент, при этом сам стол остаётся на виду сверху.
 *
 * Разделы: существа (жетон перетаскивают прямо на стол), добыча, заметки, карты
 * и картинки для всех, дашборд. Кнопка боя всегда под рукой.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react'
import { Backpack, BookOpen, Check, ChevronDown, Crown, FilePlus2, Eye, EyeOff, Gem, Heart, ImagePlus, LayoutGrid, Map as MapIcon, Package, Plus, Presentation, Search, Shield, Skull, Star, Swords, Trash2, Upload, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { fetchPage, realImage, uploadMedia, type Creature, type Equipment, type Item } from '../../api'
import { useCatalogList } from '../../create/useCatalog'
import type { AnyCreature, BattleMap, ItemKind, RoomCreature, RoomItem, ScreenItemTemplate } from '../../types/rooms'
import { isFullCreature } from '../../types/rooms'
import { ContentPanel, showToAll } from '../Content'
import { DashboardGrid } from '../Dashboard'
import { KnowledgeProvider, useKnowledge } from '../kb/KnowledgeBase'
import { useRoom } from '../RoomProvider'
import { addCombatants, addCreatures, claimItem, createMap, createTemplate, deleteMap, deleteTemplate, issueItem, issueTemplate, listMaps, listTemplates, patchMap, revealCreature, startCombat } from '../roomsApi'
import { CardEffects, CreatureBack, HpControls, STAT_RU, statsOf } from './Cards'
import { creatureArt, creatureHp, creatureName, errText, Hex, HpVessel, itemArt, itemName, SIZE_RU } from './parts'
import { Img } from '../../media'
import { MapsShelf } from '../../maps/MapsShelf'

/* ---------- общее ---------- */

function useList<T>(load: (roomId: string) => Promise<T[]>) {
  const { roomId } = useRoom()
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setItems(await load(roomId))
      setError(null)
    } catch (e) {
      setError(errText(e))
    }
  }, [load, roomId])
  useEffect(() => {
    // загрузка при открытии створки: setState идёт после await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])
  return { items, setItems, error, setError, reload }
}

/* ---------- существа ---------- */

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const
const STAT_KEYS = [
  ['strenght', 'Сил'],
  ['dexterity', 'Лов'],
  ['constitution', 'Тел'],
  ['intelligence', 'Инт'],
  ['wisdom', 'Мдр'],
  ['charisma', 'Хар'],
] as const

/** «Укус. +4 к попаданию…» → { name: «Укус», description: «+4 к попаданию…» }; по строке на приём */
const traitsOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([^.:]{1,60})[.:]\s*(.*)$/.exec(l)
      return m ? { name: m[1].trim(), description: m[2].trim() } : { name: l, description: '' }
    })

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `hb-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Своё существо: статблок формой, без бестиария */
function HomebrewCreature({ count, onDone }: { count: number; onDone: () => void }) {
  const { roomId } = useRoom()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [size, setSize] = useState<(typeof SIZES)[number]>('Medium')
  const [ac, setAc] = useState(12)
  const [hp, setHp] = useState(10)
  const [speed, setSpeed] = useState(30)
  const [cr, setCr] = useState('')
  const [stats, setStats] = useState<Record<string, number>>({ strenght: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 })
  const [features, setFeatures] = useState('')
  const [actions, setActions] = useState('')
  const [legendary, setLegendary] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    if (!name.trim()) return setError('Как зовут существо?')
    setBusy(true)
    setError(null)
    try {
      const snapshot = {
        id: newId(),
        name: name.trim(),
        description: null,
        creature_description: null,
        image_gallery: image ? [image] : null,
        image_url: null,
        size,
        creature_type: type.trim() || null,
        alignment: null,
        ac,
        ac_source: null,
        hp,
        hp_formula: null,
        speed,
        flight_speed: null,
        swim_speed: null,
        burrow_speed: null,
        climb_speed: null,
        ...stats,
        saving_throws: null,
        skills: null,
        damage_imunities: null,
        damage_resistances: null,
        damage_vulnerabilities: null,
        condition_imunities: null,
        night_vision: null,
        blind_vision: null,
        true_vision: null,
        languages: null,
        challenge_rating: cr.trim() === '' ? null : Number(cr.replace(',', '.')) || null,
        proficiency_bonus: null,
        area_of_living: null,
        features: features.trim() ? traitsOf(features) : null,
        actions: actions.trim() ? traitsOf(actions) : null,
        actions_description: null,
        legendary_actions: legendary.trim() ? traitsOf(legendary) : null,
        legendary_description: null,
        mythical_actions: null,
        is_unique: false,
        is_npc: false,
        book_source_id: null,
      } as unknown as Creature
      await addCreatures(roomId, { snapshot, count, image_url: image, on_screen_only: true })
      onDone()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sc-homebrew">
      <div className="sc-hb-top">
        <button type="button" className="sc-hb-pic" onClick={() => fileRef.current?.click()} title="Картинка существа">
          {image ? <Img src={image} alt="" /> : <ImagePlus aria-hidden="true" />}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setBusy(true)
            try {
              setImage((await uploadMedia(f)).url)
            } catch (err) {
              setError(errText(err))
            } finally {
              setBusy(false)
            }
          }}
        />
        <div className="sc-hb-name">
          <input className="bt-in" value={name} maxLength={80} placeholder="Имя: Болотная карга" onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="sc-hb-row">
            <input className="bt-in" value={type} maxLength={40} placeholder="вид: фея, нежить…" onChange={(e) => setType(e.target.value)} />
            <select className="bt-in" value={size} aria-label="Размер" onChange={(e) => setSize(e.target.value as (typeof SIZES)[number])}>
              {SIZES.map((sz) => (
                <option key={sz} value={sz}>
                  {SIZE_RU[sz] ?? sz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="sc-hb-nums">
        <label>
          <span>КД</span>
          <input className="bt-in" type="number" min={1} max={40} value={ac} onChange={(e) => setAc(Number(e.target.value) || 1)} />
        </label>
        <label>
          <span>Хиты</span>
          <input className="bt-in" type="number" min={1} max={9999} value={hp} onChange={(e) => setHp(Number(e.target.value) || 1)} />
        </label>
        <label>
          <span>Скорость</span>
          <input className="bt-in" type="number" min={0} max={200} step={5} value={speed} onChange={(e) => setSpeed(Number(e.target.value) || 0)} />
        </label>
        <label>
          <span>ПО</span>
          <input className="bt-in" value={cr} maxLength={5} placeholder="1/2" onChange={(e) => setCr(e.target.value)} />
        </label>
      </div>
      <div className="sc-hb-stats">
        {STAT_KEYS.map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input className="bt-in" type="number" min={1} max={30} value={stats[key]} onChange={(e) => setStats((s) => ({ ...s, [key]: Math.max(1, Math.min(30, Number(e.target.value) || 1)) }))} />
            <i>{(() => { const m = Math.floor((stats[key] - 10) / 2); return m >= 0 ? `+${m}` : `${m}` })()}</i>
          </label>
        ))}
      </div>
      <label className="sc-hb-text">
        <span>Особенности — по строке: «Название. Описание»</span>
        <textarea className="bt-in" rows={2} value={features} placeholder="Амфибия. Дышит воздухом и водой." onChange={(e) => setFeatures(e.target.value)} />
      </label>
      <label className="sc-hb-text">
        <span>Действия</span>
        <textarea className="bt-in" rows={3} value={actions} placeholder="Когти. Рукопашная атака оружием: +5 к попаданию, досягаемость 5 фт., одна цель. Попадание: 10 (2к6 + 3) рубящего урона." onChange={(e) => setActions(e.target.value)} />
      </label>
      <label className="sc-hb-text">
        <span>Легендарные действия (если есть)</span>
        <textarea className="bt-in" rows={2} value={legendary} placeholder="Удар хвостом. Совершает одну атаку хвостом." onChange={(e) => setLegendary(e.target.value)} />
      </label>
      {error && <p className="tb-err">{error}</p>}
      <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void save()}>
        <Plus aria-hidden="true" /> За ширму{count > 1 ? ` ×${count}` : ''}
      </button>
    </div>
  )
}

function AddCreature({ onClose }: { onClose: () => void }) {
  const { roomId } = useRoom()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Creature[]>([])
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [own, setOwn] = useState(false)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      fetchPage<Creature>('creatures', { q: q.trim() || undefined, limit: 40 })
        .then((r) => alive && setFound(r.items))
        .catch(() => alive && setFound([]))
        .finally(() => alive && setLoading(false))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="sc-add">
      <header className="sc-add-head">
        <h3 className="sc-subtitle">{own ? 'Своё существо' : 'Бестиарий'}</h3>
        {!own && (
          <label className="sc-search">
            <Search aria-hidden="true" />
            <input type="search" value={q} placeholder="Имя существа…" onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
        )}
        <button type="button" className={`tb-linkbtn sc-own${own ? ' is-on' : ''}`} onClick={() => setOwn((v) => !v)} aria-pressed={own}>
          <FilePlus2 aria-hidden="true" /> {own ? 'из бестиария' : 'своё'}
        </button>
        <span className="sc-count" aria-label="Сколько добавить">
          <button type="button" onClick={() => setCount((n) => Math.max(1, n - 1))} aria-label="Меньше">
            −
          </button>
          <b>×{count}</b>
          <button type="button" onClick={() => setCount((n) => Math.min(20, n + 1))} aria-label="Больше">
            +
          </button>
        </span>
        <button type="button" className="tb-linkbtn" onClick={onClose}>
          готово
        </button>
      </header>
      {error && <p className="tb-err">{error}</p>}
      {own && <HomebrewCreature count={count} onDone={() => setOwn(false)} />}
      {!own && loading && found.length === 0 && <p className="tb-hint">Листаем бестиарий…</p>}
      {!own && !loading && found.length === 0 && <p className="tb-hint">Никого не нашли.</p>}
      <ul className="sc-beasts" hidden={own}>
        {found.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={added === c.id ? 'is-added' : ''}
              disabled={busy === c.id}
              title="Добавить за ширму"
              onClick={async () => {
                setBusy(c.id)
                setError(null)
                try {
                  await addCreatures(roomId, { catalog_ref: c.id, count, on_screen_only: true })
                  setAdded(c.id)
                  setTimeout(() => setAdded((a) => (a === c.id ? null : a)), 900)
                } catch (e) {
                  setError(errText(e))
                } finally {
                  setBusy(null)
                }
              }}
            >
              <Hex plain={realImage(c.image_gallery) ?? realImage(c.image_url)} name={c.name} tone="enemy" />
              <span className="sc-beast-text">
                <b>{c.name}</b>
                <i>{[c.creature_type, c.challenge_rating != null ? `ПО ${c.challenge_rating}` : null].filter(Boolean).join(' · ')}</i>
                <i className="sc-beast-nums">
                  <Shield aria-hidden="true" /> {c.ac}
                  <Heart aria-hidden="true" /> {c.hp}
                </i>
              </span>
              <span className="sc-beast-add" aria-hidden="true">
                {added === c.id ? <Check /> : <Plus />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Жетон ширмы: можно нажать, а можно перетащить на стол */
function ShelfToken({ c, selected, onSelect, onDropToTable }: { c: AnyCreature; selected: boolean; onSelect: () => void; onDropToTable: () => void }) {
  const hp = creatureHp(c)
  const hidden = isFullCreature(c) && c.on_screen_only
  const start = useRef<{ x: number; y: number } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const s = start.current
    if (!s || !hidden) return
    if (ghost || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) setGhost({ x: e.clientX, y: e.clientY })
  }
  const up = (e: RPointerEvent) => {
    const wasDrag = !!ghost
    start.current = null
    setGhost(null)
    if (!wasDrag) return
    const sheet = document.querySelector('.sc-sheet')?.getBoundingClientRect()
    if (sheet && e.clientY < sheet.top) onDropToTable()
  }
  return (
    <>
      <button
        type="button"
        className={`sc-token${selected ? ' is-on' : ''}${hidden ? ' is-hidden' : ' is-out'}${hp.ratio === 0 ? ' is-down' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          start.current = null
          setGhost(null)
        }}
        onClick={onSelect}
        aria-pressed={selected}
        title={hidden ? 'За ширмой. Перетащите на стол, чтобы показать игрокам' : 'На столе'}
      >
        <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
        <b>{creatureName(c)}</b>
      </button>
      {ghost && (
        <span className="sc-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
        </span>
      )}
    </>
  )
}

/** Страница бестиария: всё про выбранное существо на одном развороте */
function BeastPage({ c, onFlip }: { c: RoomCreature; onFlip: () => void }) {
  const { roomId } = useRoom()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hp = creatureHp(c)
  const art = creatureArt(c)
  const s = c.snapshot
  const meta = [s.creature_type, s.size ? (SIZE_RU[s.size] ?? s.size) : null, s.challenge_rating != null ? `ПО ${s.challenge_rating}` : null].filter(Boolean).join(' · ')
  const stats = statsOf(c).filter(([, v]) => v != null)
  const actionText = (name: string, text: string) => (text.startsWith(name) ? text.slice(name.length).replace(/^[.\s:]+/, '') : text)
  return (
    <article className="sc-page">
      <div className="sc-page-art">{art ? <Img src={art} alt="" draggable={false} /> : <Skull aria-hidden="true" />}</div>
      <div className="sc-page-main">
        <header>
          <div>
            <h3>{c.display_name}</h3>
            {meta && <p>{meta}</p>}
          </div>
          {c.on_screen_only ? (
            <button
              type="button"
              className="tb-goldbtn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await revealCreature(roomId, c.id)
                } catch (e) {
                  setError(errText(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Eye aria-hidden="true" /> На стол
            </button>
          ) : (
            <span className="sc-page-state">
              <Eye aria-hidden="true" /> на столе
            </span>
          )}
        </header>

        <div className="sc-page-vitals">
          <span className="tb-ac" title="Класс доспеха">
            <Shield aria-hidden="true" />
            <b>{s.ac}</b>
          </span>
          <HpVessel ratio={hp.ratio} current={hp.current} max={hp.max} temp={hp.temp} />
          <HpControls c={c} />
        </div>
        <CardEffects target={{ creature: c }} title={c.display_name} />
        <dl className="sc-page-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{STAT_RU[k] ?? k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="tb-linkbtn" onClick={onFlip}>
          <EyeOff aria-hidden="true" /> что видят игроки
        </button>
        {error && <p className="tb-err">{error}</p>}
      </div>
      {(s.actions?.length ?? 0) > 0 && (
        <ul className="sc-page-acts">
          {s.actions?.map((a, i) => {
            const name = String(a.name ?? a.title ?? '')
            return (
              <li key={i}>
                <b>{name}</b> {actionText(name, String(a.description ?? a.text ?? ''))}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

function LeafCreatures() {
  const { data, roomId } = useRoom()
  const [sel, setSel] = useState<string | null>(null)
  // пустая полка сразу открывает бестиарий; после первого добавления поиск не закрывается сам
  const [adding, setAdding] = useState(() => (data?.creatures.length ?? 0) === 0)
  const [back, setBack] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = (data?.creatures ?? []) as AnyCreature[]
  const behind = list.filter((c) => isFullCreature(c) && c.on_screen_only)
  const onTable = list.filter((c) => !(isFullCreature(c) && c.on_screen_only))
  const current = list.find((c) => c.id === sel) ?? list[0] ?? null
  const showAdd = adding || list.length === 0

  const token = (c: AnyCreature) => (
    <ShelfToken
      key={c.id}
      c={c}
      selected={current?.id === c.id && !showAdd}
      onSelect={() => {
        setSel(c.id)
        setAdding(false)
        setBack(false)
      }}
      onDropToTable={() => {
        setError(null)
        revealCreature(roomId, c.id).catch((e) => setError(errText(e)))
      }}
    />
  )

  return (
    <div className="sc-two is-beasts">
      <div className="sc-pane sc-shelf">
        <h4>
          За ширмой
          {behind.length > 0 && <i>перетащите на стол</i>}
        </h4>
        <div className="sc-tokens">
          {behind.map(token)}
          <button type="button" className={`sc-token is-add${showAdd ? ' is-on' : ''}`} onClick={() => setAdding((v) => !v)} aria-pressed={showAdd}>
            <span className="sc-plus">
              <Plus aria-hidden="true" />
            </span>
            <b>Добавить</b>
          </button>
        </div>
        {onTable.length > 0 && (
          <>
            <h4>На столе</h4>
            <div className="sc-tokens">{onTable.map(token)}</div>
          </>
        )}
        {error && <p className="tb-err">{error}</p>}
      </div>
      <div className="sc-pane sc-detail">
        {showAdd ? (
          <AddCreature onClose={() => setAdding(false)} />
        ) : current && isFullCreature(current) ? (
          back ? (
            <CreatureBack c={current} onFlip={() => setBack(false)} />
          ) : (
            <BeastPage c={current} onFlip={() => setBack(true)} />
          )
        ) : null}
      </div>
    </div>
  )
}

/* ---------- добыча ---------- */

interface Pick {
  source: 'catalog' | 'template'
  kind: ItemKind
  id: string
  name: string
  sub: string
  art: string | null
}

/** Куда отдать: стол, ширма или любой герой — одно нажатие */
function GiveBar({ pick, onDone }: { pick: Pick; onDone: (msg: string) => void }) {
  const { data, roomId } = useRoom()
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const give = async (target: string, where: string) => {
    setBusy(true)
    setError(null)
    try {
      if (pick.source === 'template') await issueTemplate(roomId, pick.id, { quantity: qty, target })
      else await issueItem(roomId, { kind: pick.kind, catalog_ref: pick.id, quantity: qty, target })
      onDone(`${pick.name}${qty > 1 ? ` ×${qty}` : ''}: ${where}`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sc-give">
      <b className="sc-give-name">{pick.name}</b>
      <span className="sc-count" aria-label="Количество">
        <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Меньше">
          −
        </button>
        <b>×{qty}</b>
        <button type="button" onClick={() => setQty((n) => Math.min(99, n + 1))} aria-label="Больше">
          +
        </button>
      </span>
      <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void give('table', 'на столе')}>
        <Package aria-hidden="true" /> На стол
      </button>
      <button type="button" className="tb-goldbtn is-quiet" disabled={busy} onClick={() => void give('screen', 'за ширмой')}>
        За ширму
      </button>
      <span className="sc-give-heroes">
        {data?.characters.map((c) => (
          <button key={c.id} type="button" disabled={busy} className="sc-mini" onClick={() => void give(c.id, c.name)} title={`Отдать: ${c.name}`} aria-label={`Отдать: ${c.name}`}>
            <Hex raw={c.avatar_url} name={c.name} />
          </button>
        ))}
      </span>
      {error && <span className="tb-err">{error}</span>}
    </div>
  )
}

/** Новый предмет: лист бумаги рядом с каталогом, чтобы подсматривать в готовые */
function NewTemplate({ onSaved, onClose }: { onSaved: (t: ScreenItemTemplate) => void; onClose: () => void }) {
  const { roomId } = useRoom()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [magic, setMagic] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="sc-newtpl"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return setError('Назовите предмет')
        setBusy(true)
        setError(null)
        try {
          onSaved(await createTemplate(roomId, { name: name.trim(), description, base_kind: magic ? 'magic_item' : 'equipment', image_url: image, tags: [] }))
          onClose()
        } catch (err) {
          setError(errText(err))
          setBusy(false)
        }
      }}
    >
      <div className="sc-newtpl-top">
        <label className={`sc-newtpl-art${magic ? ' is-magic' : ''}${uploading ? ' is-busy' : ''}`} title="Картинка предмета">
          {image ? <Img src={image} alt="" /> : <ImagePlus aria-hidden="true" />}
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label="Картинка предмета"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setUploading(true)
              try {
                setImage((await uploadMedia(f)).url)
              } catch (err) {
                setError(errText(err))
              } finally {
                setUploading(false)
              }
            }}
          />
        </label>
        <div className="sc-newtpl-head">
          <input className="sc-note-title" value={name} maxLength={120} placeholder="Название предмета" aria-label="Название" onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="button" className={`sc-newtpl-magic${magic ? ' is-on' : ''}`} aria-pressed={magic} onClick={() => setMagic((v) => !v)}>
            <Gem aria-hidden="true" /> {magic ? 'Магический предмет' : 'Обычный предмет'}
          </button>
        </div>
      </div>
      <textarea value={description} placeholder="Что это, откуда взялось, что умеет…" aria-label="Описание" onChange={(e) => setDescription(e.target.value)} />
      {error && <p className="sc-newtpl-err">{error}</p>}
      <footer>
        <button type="button" className="sc-newtpl-cancel" onClick={onClose}>
          отмена
        </button>
        <button type="submit" className="tb-goldbtn" disabled={busy || uploading}>
          Создать
        </button>
      </footer>
    </form>
  )
}

function LeafLoot() {
  const { data, roomId } = useRoom()
  const [tab, setTab] = useState<'equipment' | 'magic' | 'own'>('equipment')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [screenPick, setScreenPick] = useState<RoomItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { items: equipment } = useCatalogList<Equipment>('equipment')
  const { items: magic } = useCatalogList<Item>('items')
  const tpl = useList<ScreenItemTemplate>(listTemplates)

  const list = useMemo<Pick[]>(() => {
    const needle = q.trim().toLocaleLowerCase('ru')
    const src: Pick[] =
      tab === 'equipment'
        ? equipment.map((e) => ({ source: 'catalog' as const, kind: 'equipment' as const, id: e.id, name: e.equipment_name, sub: e.subcategory ?? e.category ?? '', art: realImage(e.equipment_image_gallery) }))
        : tab === 'magic'
          ? magic.map((m) => ({ source: 'catalog' as const, kind: 'magic_item' as const, id: m.id, name: m.item_name, sub: m.rarity ?? m.item_type ?? '', art: realImage(m.item_image_gallery) }))
          : (tpl.items ?? []).map((t) => ({ source: 'template' as const, kind: t.base_kind, id: t.id, name: t.name, sub: t.description.slice(0, 40), art: t.image_url }))
    return src.filter((p) => !needle || p.name.toLocaleLowerCase('ru').includes(needle)).sort((a, b) => a.name.localeCompare(b.name, 'ru')).slice(0, 60)
  }, [tab, q, equipment, magic, tpl.items])

  const screen = data?.items.filter((i) => i.holder === 'screen') ?? []

  return (
    <div className="sc-loot">
      <div className="sc-loot-bar">
        <div className="tb-tri" role="tablist" aria-label="Откуда">
          {(
            [
              ['equipment', 'Снаряжение', Backpack],
              ['magic', 'Магия', Gem],
              ['own', 'Свои', Crown],
            ] as const
          ).map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <label className="sc-search">
          <Search aria-hidden="true" />
          <input type="search" value={q} placeholder="Найти предмет…" onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className={`tb-goldbtn${creating ? '' : ' is-quiet'}`} aria-pressed={creating} onClick={() => setCreating((v) => !v)}>
          <Plus aria-hidden="true" /> Свой предмет
        </button>
      </div>

      <div className={`sc-loot-main${creating ? ' is-split' : ''}`}>
      {creating && (
        <NewTemplate
          onSaved={(t) => {
            void tpl.reload()
            setTab('own')
            setPick({ source: 'template', kind: t.base_kind, id: t.id, name: t.name, sub: t.description.slice(0, 40), art: t.image_url })
            setDone(null)
          }}
          onClose={() => setCreating(false)}
        />
      )}

      <ul className="sc-tiles">
        {list.map((p) => (
          <li key={`${p.source}-${p.id}`}>
            <button
              type="button"
              className={pick?.id === p.id ? 'is-on' : ''}
              onClick={() => {
                setPick(p)
                setDone(null)
                setScreenPick(null)
              }}
              aria-pressed={pick?.id === p.id}
              title={p.sub}
            >
              <span className={`sc-tile-art${p.kind === 'magic_item' ? ' is-magic' : ''}`}>{p.art ? <Img src={p.art} alt="" loading="lazy" draggable={false} /> : p.kind === 'magic_item' ? <Gem aria-hidden="true" /> : <Backpack aria-hidden="true" />}</span>
              <b>{p.name}</b>
            </button>
            {p.source === 'template' && (
              <button
                type="button"
                className="sc-tile-del"
                aria-label={`Удалить «${p.name}»`}
                onClick={() => confirm(`Удалить «${p.name}»?`) && void deleteTemplate(roomId, p.id).then(tpl.reload, (e) => setError(errText(e)))}
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
        {tab === 'own' && list.length === 0 && <li className="tb-hint">Придумайте предмет один раз и выдавайте сколько угодно.</li>}
      </ul>
      </div>

      {screen.length > 0 && (
        <div className="sc-behind">
          <span>За ширмой:</span>
          {screen.map((it) => (
            <button key={it.id} type="button" className={`sc-mini-item${screenPick?.id === it.id ? ' is-on' : ''}`} onClick={() => setScreenPick(screenPick?.id === it.id ? null : it)} title={itemName(it)}>
              {itemArt(it) ? <Img src={itemArt(it) as string} alt="" /> : <Package aria-hidden="true" />}
              {itemName(it)}
              {it.quantity > 1 && <em>×{it.quantity}</em>}
            </button>
          ))}
          {screenPick && (
            <span className="sc-give-heroes">
              отдать:
              {data?.characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="sc-mini"
                  title={c.name}
                  aria-label={`Отдать: ${c.name}`}
                  onClick={() => {
                    setError(null)
                    claimItem(roomId, screenPick.id, c.id).then(
                      () => setScreenPick(null),
                      (e) => setError(errText(e)),
                    )
                  }}
                >
                  <Hex raw={c.avatar_url} name={c.name} />
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      <footer className="sc-loot-foot">
        {pick ? <GiveBar key={pick.id} pick={pick} onDone={setDone} /> : <p className="tb-hint">Выберите предмет, затем решите, кому он достанется.</p>}
        {done && (
          <p className="sc-done" role="status">
            {done}
          </p>
        )}
        {(error || tpl.error) && <p className="tb-err">{error || tpl.error}</p>}
      </footer>
    </div>
  )
}

/* ---------- карты и показ ---------- */

export function LeafMaps({ onlyQuick = false }: { onlyQuick?: boolean }) {
  const { roomId } = useRoom()
  const { items, error, setError, reload } = useList<BattleMap>(listMaps)
  const [sent, setSent] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const list = (items ?? []).filter((m) => !onlyQuick || m.quick_access)
  const act = (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null)
    fn().then(after, (e) => setError(errText(e)))
  }
  return (
    <div className={onlyQuick ? '' : 'sc-two is-maps'}>
      <div className="sc-pane">
        {!onlyQuick && <MapsShelf />}
        {!onlyQuick && <h3 className="ms-sub">Картинки для показа</h3>}
        <ul className="sc-maps">
          {!onlyQuick && (
            <li>
              <label className={`sc-map is-add${uploading ? ' is-busy' : ''}`}>
                <Upload aria-hidden="true" />
                <b>{uploading ? 'Загружаем…' : 'Новая карта'}</b>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    setUploading(true)
                    setError(null)
                    try {
                      const { url } = await uploadMedia(f)
                      await createMap(roomId, { name: f.name.replace(/\.[^.]+$/, '') || 'Карта', image_url: url, grid: { cols: 30, rows: 20, cell_px: 50, offset_x: 0, offset_y: 0 } })
                      await reload()
                    } catch (err) {
                      setError(errText(err))
                    } finally {
                      setUploading(false)
                      e.target.value = ''
                    }
                  }}
                />
              </label>
            </li>
          )}
          {list.map((m) => (
            <li key={m.id}>
              <div className="sc-map">
                {m.image_url ? <Img src={m.image_url} alt="" loading="lazy" draggable={false} /> : <MapIcon aria-hidden="true" />}
                <b>{m.name}</b>
                <span className="sc-map-acts">
                  <button type="button" className="tb-goldbtn" disabled={!m.image_url} onClick={() => act(() => showToAll(roomId, m.image_url ?? '', m.name), () => setSent(m.id))}>
                    <Presentation aria-hidden="true" /> {sent === m.id ? 'Показано' : 'Показать'}
                  </button>
                  {!onlyQuick && (
                    <>
                      <button type="button" className={`sc-iconbtn${m.quick_access ? ' is-on' : ''}`} aria-pressed={m.quick_access} aria-label="Быстрый доступ" title="Быстрый доступ" onClick={() => act(() => patchMap(roomId, m.id, { quick_access: !m.quick_access }), () => void reload())}>
                        <Star aria-hidden="true" />
                      </button>
                      <button type="button" className="sc-iconbtn is-danger" aria-label="Удалить" title="Удалить" onClick={() => confirm(`Удалить «${m.name}»?`) && act(() => deleteMap(roomId, m.id), () => void reload())}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
          {onlyQuick && items && list.length === 0 && <li className="tb-hint">Отметьте карту звездой в разделе «Карты».</li>}
        </ul>
        {error && <p className="tb-err">{error}</p>}
      </div>
      {!onlyQuick && (
        <div className="sc-pane">
          <ContentPanel bare />
        </div>
      )}
    </div>
  )
}

/* ---------- начало боя ---------- */

function BattleSetup({ onClose }: { onClose: () => void }) {
  const { data, roomId } = useRoom()
  const creatures = (data?.creatures ?? []) as AnyCreature[]
  const [picked, setPicked] = useState<string[]>(() => creatures.filter((c) => !isFullCreature(c) || !c.on_screen_only).map((c) => c.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!data) return null
  return (
    <div className="sc-battleset" role="dialog" aria-label="Начать бой">
      <header>
        <Swords aria-hidden="true" />
        <b>Кто вступает в бой?</b>
        <button type="button" className="tb-card-x" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
      </header>
      <p className="tb-hint">Герои идут все. Отметьте существ — скрытые останутся невидимыми для игроков до показа.</p>
      <div className="sc-tokens">
        {creatures.map((c) => (
          <button key={c.id} type="button" className={`sc-token${picked.includes(c.id) ? ' is-on' : ' is-off'}`} aria-pressed={picked.includes(c.id)} onClick={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}>
            <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
            <b>{creatureName(c)}</b>
          </button>
        ))}
        {creatures.length === 0 && <p className="tb-hint">Существ пока нет: добавьте их в разделе «Существа».</p>}
      </div>
      <footer>
        {error && <span className="tb-err">{error}</span>}
        <button
          type="button"
          className="tb-goldbtn"
          disabled={busy || data.room.status === 'closed'}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              // скрытость на сервере — один флаг на запрос: видимых ставим сразу, тех, что за ширмой, — вторым запросом
              const behind = (c: AnyCreature) => isFullCreature(c) && c.on_screen_only
              const chosen = creatures.filter((c) => picked.includes(c.id))
              const hidden = chosen.filter(behind).map((c) => c.id)
              const visible = chosen.filter((c) => !behind(c)).map((c) => c.id)
              const heroes = data.characters.map((c) => c.id)
              if (visible.length === 0 && hidden.length > 0) {
                await startCombat(roomId, { character_ids: heroes, creature_ids: hidden, hidden_creatures: true })
              } else {
                const view = await startCombat(roomId, { character_ids: heroes, creature_ids: visible })
                if (hidden.length > 0) await addCombatants(roomId, view.id, { creature_ids: hidden, hidden: true })
              }
              onClose()
            } catch (e) {
              setError(errText(e))
              setBusy(false)
            }
          }}
        >
          <Swords aria-hidden="true" /> К бою!
        </button>
      </footer>
    </div>
  )
}

/* ---------- сама ширма ---------- */

type Leaf = 'creatures' | 'loot' | 'notes' | 'maps' | 'dash'

const LEAVES: { id: Leaf; label: string; icon: LucideIcon }[] = [
  { id: 'creatures', label: 'Существа', icon: Skull },
  { id: 'loot', label: 'Добыча', icon: Package },
  { id: 'notes', label: 'Кодекс', icon: BookOpen },
  { id: 'maps', label: 'Карты', icon: MapIcon },
  { id: 'dash', label: 'Дашборд', icon: LayoutGrid },
]

export function DmScreen() {
  return (
    <KnowledgeProvider>
      <DmScreenIn />
    </KnowledgeProvider>
  )
}

function DmScreenIn() {
  const { data } = useRoom()
  const kb = useKnowledge()
  const [leaf, setLeaf] = useState<Leaf | null>(null)
  const [battle, setBattle] = useState(false)
  const inCombat = !!data?.combat && data.combat.status !== 'ended'
  const body: Record<Leaf, ReactNode> = {
    creatures: <LeafCreatures />,
    loot: <LeafLoot />,
    notes: null,
    maps: <LeafMaps />,
    dash: <DashboardGrid />,
  }
  return (
    <div className={`sc-root${leaf ? ' is-open' : ''}${leaf === 'dash' ? ' is-tall' : ''}`}>
      {leaf && (
        <section key={leaf} className="sc-sheet" aria-label={LEAVES.find((l) => l.id === leaf)?.label}>
          <div className="sc-sheet-in">{body[leaf]}</div>
        </section>
      )}
      <nav className="sc-bar" aria-label="Ширма мастера">
        <span className="sc-bar-sign" aria-hidden="true">
          <Crown />
        </span>
        <div className="sc-tabs" role="tablist">
          {LEAVES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={leaf === id} className={leaf === id ? 'is-on' : ''} onClick={() => (id === 'notes' ? kb?.open() : setLeaf((l) => (l === id ? null : id)))}>
              <span className="sc-tab-hex">
                <Icon aria-hidden="true" />
              </span>
              <i>{label}</i>
            </button>
          ))}
        </div>
        {leaf ? (
          <button type="button" className="tb-round" onClick={() => setLeaf(null)} aria-label="Сложить ширму" title="Сложить ширму">
            <ChevronDown aria-hidden="true" />
          </button>
        ) : (
          !inCombat && (
            <button type="button" className="sc-fight" onClick={() => setBattle((v) => !v)} aria-expanded={battle} title="Начать бой">
              <Swords aria-hidden="true" />
              <span>В бой</span>
            </button>
          )
        )}
      </nav>
      {battle && !inCombat && <BattleSetup onClose={() => setBattle(false)} />}
    </div>
  )
}

