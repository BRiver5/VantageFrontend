/**
 * Профиль: кто вы и какими кубиками бросаете.
 *
 * Всё сохраняется само: аватар — сразу, имя, «о себе» и кубики — через мгновение
 * после последней правки. Свою картинку можно кадрировать: кадр едет в ссылке
 * аватара (как у портрета героя). Если у героя своей картинки нет, берётся
 * картинка его расы. Громкость кубиков хранится в браузере.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, Crop, DoorOpen, Link2, Loader2, LogOut, ScrollText, Trash2, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { listMyCharacters, realImage, uploadAvatar, type Character, type Race } from '../api'
import { useAuth } from '../auth/AuthContext'
import { FaceCropper, FaceImage } from '../characters/FacePortrait'
import { formatPortrait, parsePortrait, type FaceCrop } from '../characters/portrait'
import { getDiceVolume, initDiceAudio, playDropsForRoll, setDiceVolume } from '../dice/diceSounds'
import { useCatalogList } from '../create/useCatalog'
import { Img } from '../media'

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

interface Dice {
  body: string
  number: string
}

/** «Обычные» — исходная тема кубиков; совпадает с STANDARD_DICE в dice/diceStyle.ts */
const STANDARD: Dice = { body: '#34302a', number: '#e3c46e' }
/** так сервер записывает нового пользователя: это тоже «обычные» */
const SERVER_DEFAULT = { body: '#1a1a2e', accent: '#e94560', number: '#ffffff' }

const PRESETS: ({ name: string } & Dice)[] = [
  { name: 'Обычные', ...STANDARD },
  { name: 'Полночь', body: '#1a1a2e', number: '#f2f2f2' },
  { name: 'Кость', body: '#e9e0cc', number: '#2c1b0b' },
  { name: 'Изумруд', body: '#0f3b2c', number: '#eafff0' },
  { name: 'Кровь', body: '#4a0e10', number: '#ffe7da' },
  { name: 'Лёд', body: '#173a5c', number: '#ffffff' },
  { name: 'Аметист', body: '#2d1846', number: '#f3e9ff' },
]

const eq = (a: Dice, b: Dice) => a.body.toLowerCase() === b.body.toLowerCase() && a.number.toLowerCase() === b.number.toLowerCase()
const SAVE_DELAY = 700

/** d20 в выбранных цветах: корпус и цифры; рёбра — светлее и темнее корпуса */
function Die({ c, size, spin }: { c: Dice; size?: number; spin?: boolean }) {
  return (
    <svg className={`pf-die${spin ? ' is-spin' : ''}`} viewBox="0 0 120 130" width={size} aria-hidden="true">
      <polygon points="60,4 114,35 114,95 60,126 6,95 6,35" fill={c.body} />
      <polygon points="60,4 114,35 60,40 6,35" fill="rgba(255,255,255,0.14)" />
      <polygon points="6,35 60,40 22,90 6,95" fill="rgba(0,0,0,0.12)" />
      <polygon points="114,35 60,40 98,90 114,95" fill="rgba(0,0,0,0.2)" />
      <polygon points="22,90 98,90 60,126" fill="rgba(0,0,0,0.26)" />
      <polygon points="60,40 98,90 22,90" fill="rgba(255,255,255,0.04)" />
      <g fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points="60,4 114,35 114,95 60,126 6,95 6,35" />
        <polygon points="60,40 98,90 22,90" />
        <path d="M60 4V40M6 35L60 40M114 35L60 40M6 35L22 90M114 35L98 90M6 95L22 90M114 95L98 90M22 90L60 126M98 90L60 126" />
      </g>
      <text x="60" y="80" textAnchor="middle" fill={c.number} fontSize="27" fontWeight="700" fontFamily="Cormorant Unicase, serif">
        20
      </text>
    </svg>
  )
}

/* ---------- аватар и герои ---------- */

function Avatar({ name }: { name: string }) {
  const { user, updateMe, refreshMe } = useAuth()
  const [characters, setCharacters] = useState<Character[]>([])
  const { items: races } = useCatalogList<Race>('races')
  const [linkOpen, setLinkOpen] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    listMyCharacters()
      .then((list) => alive && setCharacters(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => setBroken(false), [user?.avatar_url])

  const raceArt = useMemo(() => new Map(races.map((r) => [r.id, realImage(r.image_gallery)])), [races])
  const heroes = characters.map((c) => {
    const own = parsePortrait(c.avatar_url).src
    return { c, own, art: own ?? (c.race_id ? (raceArt.get(c.race_id) ?? null) : null) }
  })

  if (!user) return null
  const pic = parsePortrait(user.avatar_url)
  // кадрировать можно только свою картинку: портрет героя живёт своей жизнью
  const canCrop = !!pic.src && !user.avatar_character_id

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e, 'Не удалось сменить аватар'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pf-face">
        <button type="button" className={`pf-portrait${busy ? ' is-busy' : ''}`} onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Загрузить картинку">
          {pic.src && !broken ? (
            pic.face ? (
              <span className="pf-portrait-face">
                <FaceImage src={pic.src} crop={pic.face} />
              </span>
            ) : (
              <Img src={pic.src} alt="" sizeHint={180} onError={() => setBroken(true)} />
            )
          ) : (
            <b>{name.charAt(0).toUpperCase()}</b>
          )}
          <span className="pf-portrait-cam">
            <Camera aria-hidden="true" />
          </span>
        </button>
        <span className="pf-face-tools">
          <button type="button" className={`pf-icon${linkOpen ? ' is-on' : ''}`} onClick={() => setLinkOpen((v) => !v)} aria-label="Картинка по ссылке" title="Картинка по ссылке">
            <Link2 aria-hidden="true" />
          </button>
          {canCrop && (
            <button type="button" className="pf-icon" onClick={() => setCropping(true)} aria-label="Кадр" title="Кадр">
              <Crop aria-hidden="true" />
            </button>
          )}
          {user.avatar_url && (
            <button type="button" className="pf-icon is-danger" disabled={busy} onClick={() => void run(() => updateMe({ avatar_url: null }))} aria-label="Убрать аватар" title="Убрать аватар">
              <Trash2 aria-hidden="true" />
            </button>
          )}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void run(async () => (await uploadAvatar(file), await refreshMe()))
          }}
        />
      </div>
      {linkOpen && (
        <form
          className="pf-url"
          onSubmit={(e) => {
            e.preventDefault()
            if (/^https?:\/\//.test(url.trim())) void run(async () => (await updateMe({ avatar_url: url.trim() }), setUrl(''), setLinkOpen(false)))
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Ссылка на картинку" autoFocus />
          <button type="submit" className="pf-icon" disabled={busy || !/^https?:\/\//.test(url.trim())} aria-label="Поставить">
            <Check aria-hidden="true" />
          </button>
          <button type="button" className="pf-icon" onClick={() => setLinkOpen(false)} aria-label="Отмена">
            <X aria-hidden="true" />
          </button>
        </form>
      )}

      {cropping && pic.src && (
        <CropDialog
          src={pic.src}
          crop={pic.face}
          onClose={() => setCropping(false)}
          onSave={(face) =>
            void run(async () => {
              await updateMe({ avatar_url: formatPortrait({ src: pic.src, face: { ...face, shape: 'hex' }, background: null, inspiration: null }) })
              setCropping(false)
            })
          }
        />
      )}

      {heroes.length > 0 && (
        <ul className="pf-heroes" aria-label="Портрет героя">
          {heroes.map(({ c, own, art }) => {
            const on = user.avatar_character_id === c.id || (!own && !!art && user.avatar_url === art)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={on ? 'is-on' : ''}
                  aria-pressed={on}
                  disabled={busy || !art}
                  title={c.character_name || 'Без имени'}
                  onClick={() =>
                    void run(() =>
                      // свой портрет обновляется вместе с героем; картинку расы ставим как ссылку
                      own ? updateMe({ avatar_character_id: on ? null : c.id }) : updateMe({ avatar_url: on ? null : art }),
                    )
                  }
                >
                  <span className="pf-hero-art">{art ? <Img src={art} alt="" loading="lazy" sizeHint={60} /> : <UserRound aria-hidden="true" />}</span>
                  <b>{c.character_name || 'Без имени'}</b>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="auth-error">{error}</p>}
    </>
  )
}

/** Кадр аватара: водите рамкой по картинке, колесом или ползунком — размер */
function CropDialog({ src, crop, onSave, onClose }: { src: string; crop: FaceCrop | null; onSave: (c: FaceCrop) => void; onClose: () => void }) {
  const [face, setFace] = useState<FaceCrop>(crop ?? { cx: 0.5, cy: 0.35, r: 0.6, shape: 'hex' })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="pf-crop-layer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-crop" role="dialog" aria-label="Кадр аватара">
        <FaceCropper src={src} crop={{ ...face, shape: 'hex' }} onChange={(c) => setFace({ ...c, shape: 'hex' })} />
        <footer>
          <span className="pf-crop-preview">
            <span className="pf-portrait-face">
              <FaceImage src={src} crop={{ ...face, shape: 'hex' }} />
            </span>
          </span>
          <button type="button" className="pf-icon" onClick={onClose} aria-label="Отмена">
            <X aria-hidden="true" />
          </button>
          <button type="button" className="cs-btn" onClick={() => onSave(face)}>
            Готово
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Громкость кубиков: хранится в браузере, слышна сразу */
function Volume() {
  const [vol, setVol] = useState(() => Math.round(getDiceVolume() * 100))
  const last = useRef(0)
  return (
    <label className="pf-volume">
      {vol === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      <input
        type="range"
        min={0}
        max={100}
        value={vol}
        aria-label="Громкость кубиков"
        style={{ '--vol': `${vol}%` } as CSSProperties}
        onChange={(e) => {
          const v = Number(e.target.value)
          setVol(v)
          setDiceVolume(v / 100)
          // короткий стук, чтобы услышать громкость, но не чаще раза в 300 мс
          const now = Date.now()
          if (now - last.current > 300) {
            last.current = now
            initDiceAudio()
            playDropsForRoll(1)
          }
        }}
      />
    </label>
  )
}

/* ---------- страница ---------- */

export default function ProfilePage() {
  const { user, updateMe, logout } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [dice, setDice] = useState<Dice>(STANDARD)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fromUser = useMemo<Dice>(() => {
    const d = user?.preferences?.dice
    if (!d) return STANDARD
    const serverDefault = d.body_color === SERVER_DEFAULT.body && d.accent_color === SERVER_DEFAULT.accent && d.number_color === SERVER_DEFAULT.number
    return serverDefault ? STANDARD : { body: d.body_color, number: d.number_color }
  }, [user?.preferences?.dice])

  // форма заполняется из профиля один раз при входе: дальше её ведёт пользователь
  useEffect(() => {
    if (!user || loaded.current) return
    loaded.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayName(user.display_name ?? '')
    setBio(user.bio ?? '')
    setDice(fromUser)
  }, [user, fromUser])

  const dirty = !!user && (displayName.trim() !== (user.display_name ?? '') || bio !== (user.bio ?? '') || !eq(dice, fromUser))

  // автосохранение: через мгновение после последней правки
  useEffect(() => {
    if (!user || !loaded.current || !dirty) return
    if (!displayName.trim()) {
      setError('Имя не может быть пустым')
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setState('saving')
      setError(null)
      try {
        await updateMe({
          display_name: displayName.trim(),
          bio,
          // отблеск граней на 3D-кубике берёт цвет цифр: отдельной настройки граней нет
          preferences: { dice: { body_color: dice.body, accent_color: dice.number, number_color: dice.number } },
        })
        setState('saved')
      } catch (err) {
        setState('error')
        setError(errText(err, 'Ошибка сохранения'))
      }
    }, SAVE_DELAY)
    return () => clearTimeout(timer.current)
  }, [user, dirty, displayName, bio, dice, updateMe])

  if (!user) return null

  const name = displayName.trim() || user.display_name || user.nickname
  const preset = PRESETS.find((p) => eq(p, dice))

  return (
    <section className="pf-page">
      <nav className="pf-top" aria-label="Переходы">
        <span className={`pf-autosave is-${error ? 'error' : state}`} role="status">
          {error ? error : state === 'saving' ? <><Loader2 aria-hidden="true" /> сохраняем</> : state === 'saved' ? <><Check aria-hidden="true" /> сохранено</> : null}
        </span>
        <Link to="/characters" className="pf-text-btn">
          <ScrollText aria-hidden="true" /> Мои персонажи
        </Link>
        <Link to="/rooms" className="pf-text-btn">
          <DoorOpen aria-hidden="true" /> Комнаты
        </Link>
        <button type="button" className="pf-text-btn is-danger" onClick={logout}>
          <LogOut aria-hidden="true" /> Выйти
        </button>
      </nav>

      <div className="pf-grid">
        {/* кто вы */}
        <section className="pf-card pf-id" aria-label="Профиль">
          <Avatar name={name} />
          <input className="pf-name" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} aria-label="Имя" placeholder="Ваше имя" />
          <p className="pf-handle">
            @{user.nickname}
            {user.role === 'admin' && <span className="pf-badge">админ</span>}
            <i>{user.email}</i>
          </p>
          <textarea className="pf-bio" value={bio} rows={4} placeholder="Пара слов о себе…" aria-label="О себе" onChange={(e) => setBio(e.target.value)} />
        </section>

        {/* кубики */}
        <section className="pf-card pf-dice" aria-label="Кубики">
          <div className="pf-dice-stage" style={{ '--glow': dice.number } as CSSProperties}>
            <Die c={dice} spin />
          </div>
          <div className="pf-colors">
            {(
              [
                ['Корпус', 'body'],
                ['Цифры', 'number'],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="pf-color">
                <input type="color" value={dice[key]} onChange={(e) => setDice((d) => ({ ...d, [key]: e.target.value }))} aria-label={label} />
                <span className="pf-color-swatch" style={{ background: dice[key] }} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <ul className="pf-presets" aria-label="Наборы">
            {PRESETS.map((p) => (
              <li key={p.name}>
                <button type="button" className={preset?.name === p.name ? 'is-on' : ''} aria-pressed={preset?.name === p.name} onClick={() => setDice({ body: p.body, number: p.number })}>
                  <Die c={p} size={46} />
                  <i>{p.name}</i>
                </button>
              </li>
            ))}
          </ul>
          <Volume />
        </section>
      </div>

    </section>
  )
}

