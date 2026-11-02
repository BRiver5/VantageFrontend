/**
 * Существа комнаты. Мастер добавляет их из бестиария (или со своим снимком),
 * решает, что видят игроки, и меняет хиты. Игрок видит только показанных
 * существ и только открытые поля: имя может быть скрыто за «Существо», хиты —
 * точными, словами («ранен») или совсем скрытыми.
 */
import { useEffect, useState } from 'react'
import { Eye, Heart, ImageOff, Plus, Search, Shield, Skull, Star, Swords, Trash2 } from 'lucide-react'
import { ApiError, fetchPage, imageVariant, realImage, type Creature } from '../api'
import { SheetModal } from '../characters/SheetModal'
import type { AnyCreature, CreaturePlayerView, CreatureVisibility, HpBand, HpVisibility, RoomCreature } from '../types/rooms'
import { isFullCreature } from '../types/rooms'
import { useRoom } from './RoomProvider'
import { addCreatures, creatureVitals, patchRoomCreature, removeRoomCreature, revealCreature } from './roomsApi'
import { Field } from './ui'

const errText = (e: unknown) => (e instanceof ApiError && e.status === 409 ? 'Комната закрыта: команды отключены.' : e instanceof Error ? e.message : 'Ошибка сервера')

export const BAND_RU: Record<HpBand, string> = { healthy: 'здоров', bloodied: 'ранен', critical: 'при смерти', down: 'повержен' }
const HP_OPTIONS: { key: HpVisibility; label: string; hint: string }[] = [
  { key: 'exact', label: 'Точные', hint: '34 из 52' },
  { key: 'band', label: 'Словами', hint: 'здоров, ранен…' },
  { key: 'hidden', label: 'Скрыты', hint: 'ничего не видно' },
]
const FLAGS: { key: keyof Omit<CreatureVisibility, 'hp'>; label: string }[] = [
  { key: 'name', label: 'Имя' },
  { key: 'image', label: 'Картинка' },
  { key: 'ac', label: 'КД' },
  { key: 'stats', label: 'Характеристики' },
  { key: 'actions', label: 'Действия' },
  { key: 'description', label: 'Описание' },
]

/** Картинка существа с запасным значком */
export function CreatureArt({ src, name, size = 56 }: { src: string | null | undefined; name: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="rm-cr-art" style={{ width: size, height: size }} title={name}>
      {src && !broken ? <img src={imageVariant(src, 'medium')} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} /> : <ImageOff aria-hidden="true" />}
    </span>
  )
}

export const creatureArt = (c: AnyCreature): string | null => (isFullCreature(c) ? (c.image_url ?? realImage(c.snapshot.image_gallery) ?? realImage(c.snapshot.image_url)) : c.image_url)
export const creatureName = (c: AnyCreature): string => (isFullCreature(c) ? c.display_name : c.name)

/** Полоска хитов: у игрока может быть точной, словесной или отсутствовать */
export function HpMeter({ c }: { c: AnyCreature }) {
  if (isFullCreature(c)) {
    const ratio = c.hp_max > 0 ? Math.max(0, Math.min(1, c.hp_current / c.hp_max)) : 0
    return (
      <span className="rm-meter" title={`${c.hp_current} из ${c.hp_max}`}>
        <span className={`rm-meter-fill is-${ratio <= 0.25 ? 'low' : ratio <= 0.6 ? 'mid' : 'ok'}`} style={{ width: `${ratio * 100}%` }} />
        <b>
          {c.hp_current}/{c.hp_max}
          {c.hp_temp > 0 && <em> +{c.hp_temp}</em>}
        </b>
      </span>
    )
  }
  if (c.hp) {
    const ratio = c.hp.max > 0 ? Math.max(0, Math.min(1, c.hp.current / c.hp.max)) : 0
    return (
      <span className="rm-meter">
        <span className={`rm-meter-fill is-${ratio <= 0.25 ? 'low' : ratio <= 0.6 ? 'mid' : 'ok'}`} style={{ width: `${ratio * 100}%` }} />
        <b>
          {c.hp.current}/{c.hp.max}
        </b>
      </span>
    )
  }
  if (c.hp_band) return <span className={`rm-band is-${c.hp_band}`}>{BAND_RU[c.hp_band]}</span>
  return <span className="rm-band">хиты неизвестны</span>
}

/* ---------- вид игрока ---------- */

export function PlayerCreatureCard({ c }: { c: CreaturePlayerView }) {
  const stats = c.stats ? Object.entries(c.stats).filter(([, v]) => v != null) : []
  return (
    <li className="rm-cr is-player">
      <CreatureArt src={c.image_url} name={c.name} size={64} />
      <span className="rm-cr-body">
        <b>{c.name}</b>
        <HpMeter c={c} />
        <span className="rm-cr-facts">
          {c.ac != null && (
            <span>
              <Shield aria-hidden="true" /> КД {c.ac}
            </span>
          )}
          {c.speed != null && <span>скорость {c.speed}</span>}
          {c.size && <span>{c.size}</span>}
          {c.creature_type && <span>{c.creature_type}</span>}
        </span>
        {c.effects.length > 0 && <span className="rm-cr-effects">{c.effects.join(' · ')}</span>}
        {stats.length > 0 && (
          <span className="rm-cr-stats">
            {stats.map(([k, v]) => (
              <span key={k}>
                <i>{k.toUpperCase()}</i>
                {v}
              </span>
            ))}
          </span>
        )}
        {c.actions && c.actions.length > 0 && (
          <details className="rm-cr-more">
            <summary>Действия · {c.actions.length}</summary>
            {c.actions.map((a, i) => (
              <p key={i}>
                <b>{a.name ?? a.title}</b> {a.description ?? a.text}
              </p>
            ))}
          </details>
        )}
        {c.description && <p className="rm-cr-desc">{c.description}</p>}
      </span>
    </li>
  )
}

/* ---------- добавление ---------- */

function AddDialog({ onClose }: { onClose: () => void }) {
  const { roomId } = useRoom()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Creature[]>([])
  const [loading, setLoading] = useState(false)
  const [pick, setPick] = useState<Creature | null>(null)
  const [count, setCount] = useState(1)
  const [display, setDisplay] = useState('')
  const [onScreen, setOnScreen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // поиск по бестиарию с задержкой: каталог большой, целиком его не грузим
  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchPage<Creature>('creatures', { q: q.trim() || undefined, limit: 30 })
        .then((r) => alive && setFound(r.items))
        .catch(() => alive && setFound([]))
        .finally(() => alive && setLoading(false))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const submit = async () => {
    if (!pick) return
    setBusy(true)
    setError(null)
    try {
      await addCreatures(roomId, {
        catalog_ref: pick.id,
        count,
        display_name: display.trim() || undefined,
        on_screen_only: onScreen,
      })
      setDone(`${pick.name}${count > 1 ? ` ×${count}` : ''}`)
      setPick(null)
      setCount(1)
      setDisplay('')
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title="Добавить существо"
      kicker="из бестиария"
      tone="action"
      visual={<Skull className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Готово
          </button>
          <button type="button" className="cs-btn cw-next" disabled={!pick || busy} onClick={() => void submit()}>
            Добавить{pick ? `: ${pick.name}` : ''}
          </button>
        </>
      }
    >
      <div className="rm-form">
        <label className="rm-search">
          <Search aria-hidden="true" />
          <input type="search" value={q} placeholder="Найти в бестиарии…" onChange={(e) => setQ(e.target.value)} autoFocus />
        </label>
        {loading && <p className="muted">Ищем…</p>}
        <ul className="rm-pick-items" role="listbox" aria-label="Бестиарий">
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={pick?.id === c.id} className={pick?.id === c.id ? 'is-on' : ''} onClick={() => setPick(c)}>
                <CreatureArt src={realImage(c.image_gallery) ?? realImage(c.image_url)} name={c.name} size={40} />
                <span>
                  <b>{c.name}</b>
                  <i>
                    {[c.creature_type, c.challenge_rating != null ? `ПО ${c.challenge_rating}` : null, `КД ${c.ac}`, `${c.hp} хитов`].filter(Boolean).join(' · ')}
                  </i>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rm-qty">
          <span>Сколько</span>
          <button type="button" className="cw-mini-btn" onClick={() => setCount((n) => Math.max(1, n - 1))} aria-label="Меньше">
            −
          </button>
          <b>{count}</b>
          <button type="button" className="cw-mini-btn" onClick={() => setCount((n) => Math.min(20, n + 1))} aria-label="Больше">
            +
          </button>
          {count > 1 && <em className="rm-hint">получат буквы: «{pick?.name ?? 'Гоблин'} A», «B»…</em>}
        </div>
        <Field label="Имя на ширме" hint="Если пусто — название из бестиария">
          <input value={display} onChange={(e) => setDisplay(e.target.value)} />
        </Field>
        <label className="rm-check">
          <input type="checkbox" checked={onScreen} onChange={(e) => setOnScreen(e.target.checked)} />
          <span>Только на ширме: игроки пока не знают о существе</span>
        </label>
        {done && <p className="auth-ok">Добавлено: {done}</p>}
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

/* ---------- что видят игроки ---------- */

function VisibilityDialog({ c, onClose }: { c: RoomCreature; onClose: () => void }) {
  const { roomId } = useRoom()
  const [v, setV] = useState<CreatureVisibility>(c.visibility)
  const [publicName, setPublicName] = useState(c.public_name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await patchRoomCreature(roomId, c.id, { visibility: v, public_name: publicName.trim() || 'Существо' })
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title={c.display_name}
      kicker="что видят игроки"
      tone="rest"
      visual={<Eye className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="rm-form">
        <p className="rm-hint">Отмеченное игроки увидят в карточке существа. Игрокам оно показывается только после «Показать».</p>
        <div className="rm-flags">
          {FLAGS.map(({ key, label }) => (
            <label key={key} className="rm-check">
              <input type="checkbox" checked={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.checked })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {!v.name && (
          <Field label="Как называть, пока имя скрыто">
            <input value={publicName} onChange={(e) => setPublicName(e.target.value)} />
          </Field>
        )}
        <div className="rm-field">
          <span>Хиты</span>
          <div className="rm-seg" role="radiogroup" aria-label="Хиты существа">
            {HP_OPTIONS.map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={v.hp === o.key} className={v.hp === o.key ? 'is-on' : ''} onClick={() => setV({ ...v, hp: o.key })}>
                {o.label}
                <small>{o.hint}</small>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

/* ---------- карточка мастера ---------- */

function DmCreatureCard({ c, selected, onToggle, inCombat }: { c: RoomCreature; selected: boolean; onToggle: () => void; inCombat: boolean }) {
  const { roomId } = useRoom()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vis, setVis] = useState(false)
  const shown = !c.on_screen_only

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const hp = (op: 'damage' | 'heal' | 'temp') => {
    const n = Math.abs(parseInt(amount, 10))
    if (!n) return
    void run(() => creatureVitals(roomId, c.id, { op, amount: n })).then(() => setAmount(''))
  }

  return (
    <li className={`rm-cr${c.hp_current <= 0 ? ' is-down' : ''}${selected ? ' is-picked' : ''}`}>
      <label className="rm-cr-pick" title="Выбрать для боя">
        <input type="checkbox" checked={selected} onChange={onToggle} disabled={inCombat} aria-label={`Выбрать «${c.display_name}» для боя`} />
      </label>
      <CreatureArt src={creatureArt(c)} name={c.display_name} size={64} />
      <span className="rm-cr-body">
        <b>
          {c.display_name}
          <em className={shown ? 'is-shown' : 'is-hidden'}>{shown ? 'видно игрокам' : 'за ширмой'}</em>
        </b>
        <HpMeter c={c} />
        <span className="rm-cr-facts">
          <span>
            <Shield aria-hidden="true" /> КД {c.snapshot.ac}
          </span>
          {c.snapshot.challenge_rating != null && <span>ПО {c.snapshot.challenge_rating}</span>}
          {c.conditions.length > 0 && <span className="rm-cr-effects">{c.conditions.map((e) => e.label).join(' · ')}</span>}
        </span>
        <span className="rm-cr-hp">
          <input type="number" min={0} inputMode="numeric" value={amount} placeholder="хиты" aria-label="Сколько хитов" onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="cw-mini-btn" disabled={busy || !amount} onClick={() => hp('damage')} title="Урон">
            <Swords aria-hidden="true" />
          </button>
          <button type="button" className="cw-mini-btn" disabled={busy || !amount} onClick={() => hp('heal')} title="Лечение">
            <Heart aria-hidden="true" />
          </button>
          <button type="button" className="cw-mini-btn" disabled={busy || !amount} onClick={() => hp('temp')} title="Временные хиты">
            <Shield aria-hidden="true" />
          </button>
        </span>
        <span className="rm-cr-acts">
          {shown ? (
            <button type="button" className="cw-mini-btn" onClick={() => setVis(true)}>
              <Eye aria-hidden="true" /> что видят игроки
            </button>
          ) : (
            <button type="button" className="cs-btn" disabled={busy} onClick={() => void run(() => revealCreature(roomId, c.id))}>
              <Eye aria-hidden="true" /> Показать игрокам
            </button>
          )}
          <button type="button" className={`cw-mini-btn${c.quick_access ? ' is-on' : ''}`} disabled={busy} aria-pressed={c.quick_access} onClick={() => void run(() => patchRoomCreature(roomId, c.id, { quick_access: !c.quick_access }))} title="Быстрый доступ">
            <Star aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cw-mini-btn cw-mini-btn--danger"
            disabled={busy || inCombat}
            title={inCombat ? 'Нельзя убрать, пока идёт бой' : 'Убрать из комнаты'}
            onClick={() => confirm(`Убрать «${c.display_name}» из комнаты?`) && void run(() => removeRoomCreature(roomId, c.id))}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </span>
        {error && <span className="auth-error">{error}</span>}
      </span>
      {vis && <VisibilityDialog c={c} onClose={() => setVis(false)} />}
    </li>
  )
}

/** Существа комнаты: мастеру с управлением, игроку — только показанные */
export function CreaturesPanel({ selected, onSelect, bare = false }: { selected?: string[]; onSelect?: (ids: string[]) => void; bare?: boolean }) {
  const { data, isDm } = useRoom()
  const [adding, setAdding] = useState(false)
  if (!data) return null
  const list = data.creatures
  const inCombat = !!data.combat && data.combat.status !== 'ended'

  return (
    <div className={bare ? 'rm-creatures' : 'rm-panel rm-creatures'}>
      <h3 className="rm-panel-title">
        <Skull aria-hidden="true" /> Существа · {list.length}
        {isDm && (
          <button type="button" className="cw-mini-btn rm-title-act" disabled={data.room.status === 'closed'} onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" /> добавить
          </button>
        )}
      </h3>
      {list.length === 0 ? (
        <p className="rm-hint">{isDm ? 'Пока никого. Добавьте существ из бестиария — они появятся за ширмой, игроки о них не узнают, пока вы не покажете.' : 'Мастер ещё никого не показал.'}</p>
      ) : (
        <ul className="rm-cr-list">
          {list.map((c) =>
            isFullCreature(c) ? (
              <DmCreatureCard
                key={c.id}
                c={c}
                inCombat={inCombat}
                selected={!!selected?.includes(c.id)}
                onToggle={() => onSelect?.(selected?.includes(c.id) ? selected.filter((x) => x !== c.id) : [...(selected ?? []), c.id])}
              />
            ) : (
              <PlayerCreatureCard key={c.id} c={c} />
            ),
          )}
        </ul>
      )}
      {adding && <AddDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

