/**
 * Комнаты: список своих (мастер и игрок), создание и вход по коду.
 *
 * Пока заявка игрока не принята, сама комната отвечает 404 и сокет не
 * подключится, поэтому о принятии узнаём опросом списка: у комнаты с
 * `my_status: 'pending'` после принятия станет `approved`, а отклонённая заявка
 * просто пропадёт из списка — это и есть «отклонена».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Clock, DoorOpen, ImagePlus, KeyRound, Plus, ScrollText, ShieldCheck, Swords, Users } from 'lucide-react'
import { ApiError, listMyCharacters, uploadMedia, imageVariant, type Character, type GameClass } from '../api'
import { parsePortrait } from '../characters/portrait'
import { useCatalogList } from '../create/useCatalog'
import { SheetModal } from '../characters/SheetModal'
import { createRoom, joinRoom, listRooms } from '../rooms/roomsApi'
import { Field, ROLE_RU, StatusChip, RoomAvatar } from '../rooms/ui'
import type { RoomListItem } from '../types/rooms'

/** Как часто спрашиваем список, пока есть заявки без ответа */
const POLL_MS = 6000

/** 404 на корне /rooms — на сервере ещё нет комнат (бэкенд не обновлён) */
const NO_ROOMS_API = 'Сервер пока не поддерживает комнаты: бэкенд ещё не обновлён. Попробуйте позже.'
const errText = (e: unknown, fallback: string) => (e instanceof ApiError && e.status === 404 ? NO_ROOMS_API : e instanceof Error ? e.message : fallback)

/** «Паладин 7 / Следопыт 1» */
function classLine(c: Character, byId: Map<string, GameClass>): string {
  return (c.classes ?? []).map((cl) => `${byId.get(cl.class_id)?.class_name ?? 'Класс'} ${cl.level}`).join(' / ')
}

/* ---------- карточка комнаты ---------- */

function RoomCard({ room }: { room: RoomListItem }) {
  const waiting = room.my_status === 'pending'
  const inner = (
    <>
      <span className="rm-card-cover">
        {room.cover_url ? <img src={imageVariant(room.cover_url, 'medium')} alt="" loading="lazy" /> : <DoorOpen aria-hidden="true" />}
      </span>
      <span className="rm-card-body">
        <b className="rm-card-name">{room.name}</b>
        {room.description && <span className="rm-card-desc">{room.description}</span>}
        <span className="rm-card-meta">
          <span className={`rm-role is-${room.my_role}`}>{room.my_role === 'dm' ? <Swords aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{ROLE_RU[room.my_role]}</span>
          {waiting ? (
            <span className="rm-status is-wait">
              <Clock aria-hidden="true" /> ждёт решения мастера
            </span>
          ) : (
            <StatusChip status={room.status} />
          )}
        </span>
      </span>
    </>
  )
  // пока заявку не приняли, комната всё равно ответит 404 — не ведём туда
  return waiting ? (
    <div className="rm-card is-waiting" aria-disabled="true">
      {inner}
    </div>
  ) : (
    <Link to={`/rooms/${room.id}`} className="rm-card">
      {inner}
    </Link>
  )
}

/* ---------- создание ---------- */

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      setCover((await uploadMedia(file)).url)
    } catch (e) {
      setError(errText(e, 'Не удалось загрузить картинку'))
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!name.trim()) return setError('Назовите комнату')
    setBusy(true)
    setError(null)
    try {
      const room = await createRoom({
        name: name.trim(),
        description: description.trim(),
        cover_url: cover,
        settings: { max_players: Math.max(1, Math.min(20, maxPlayers)) },
      })
      onCreated(room.id)
    } catch (e) {
      setError(errText(e, 'Не удалось создать комнату'))
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title="Новая комната"
      kicker="вы — мастер"
      tone="action"
      visual={<DoorOpen className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={busy || uploading} onClick={() => void submit()}>
            Создать комнату
          </button>
        </>
      }
    >
      <div className="rm-form">
        <Field label="Название">
          <input value={name} maxLength={80} placeholder="Например, «Проклятие Страда»" onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Описание" hint="Видят все участники">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Игроков не больше">
          <input type="number" min={1} max={20} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value) || 1)} />
        </Field>
        <div className="rm-field">
          <span>Обложка</span>
          <div className="rm-cover-pick">
            <span className="rm-cover-prev">{cover ? <img src={imageVariant(cover, 'medium')} alt="" /> : <ImagePlus aria-hidden="true" />}</span>
            <button type="button" className="cw-mini-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Загружаем…' : cover ? 'Заменить' : 'Выбрать картинку'}
            </button>
            {cover && (
              <button type="button" className="cw-mini-btn" onClick={() => setCover(null)}>
                Убрать
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          </div>
        </div>
        {error && (
          <p className="auth-error" role="alert" ref={(el) => el?.scrollIntoView({ block: 'nearest' })}>
            {error}
          </p>
        )}
      </div>
    </SheetModal>
  )
}

/* ---------- вход по коду ---------- */

function JoinModal({
  initialCode,
  onClose,
  onSent,
}: {
  initialCode: string
  onClose: () => void
  onSent: (roomName: string) => void
}) {
  const [code, setCode] = useState(initialCode)
  const [characters, setCharacters] = useState<Character[] | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { items: classes } = useCatalogList<GameClass>('classes')
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])

  useEffect(() => {
    let alive = true
    listMyCharacters()
      .then((list) => {
        if (!alive) return
        setCharacters(list)
        if (list.length === 1) setPick(list[0].id ?? null)
      })
      .catch((e) => alive && setError(errText(e, 'Не удалось загрузить персонажей')))
    return () => {
      alive = false
    }
  }, [])

  const submit = async () => {
    if (!code.trim()) return setError('Введите код приглашения')
    if (!pick) return setError('Выберите персонажа')
    setBusy(true)
    setError(null)
    try {
      const res = await joinRoom({ code: code.trim(), character_id: pick })
      onSent(res.room_name)
    } catch (e) {
      // 404 — код не тот или сменился; 403 — исключали; 409 — нет мест
      setError(e instanceof ApiError && e.status === 404 ? 'Комната с таким кодом не найдена. Спросите у мастера свежую ссылку.' : errText(e, 'Не удалось войти'))
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title="Войти в комнату"
      kicker="по коду приглашения"
      tone="rest"
      visual={<KeyRound className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={busy || !characters} onClick={() => void submit()}>
            Отправить заявку
          </button>
        </>
      }
    >
      <div className="rm-form">
        <Field label="Код приглашения">
          <input value={code} placeholder="Вставьте код или откройте ссылку мастера" onChange={(e) => setCode(e.target.value)} autoFocus={!initialCode} />
        </Field>
        <div className="rm-field">
          <span>Персонаж</span>
          <p className="rm-hint">В комнату уйдёт копия: правки в партии не затронут вашего героя.</p>
          {!characters && <p className="muted">Загружаем героев…</p>}
          {characters?.length === 0 && (
            <p className="muted">
              У вас пока нет персонажей. <Link to="/characters/new">Создать героя</Link>
            </p>
          )}
          <div className="rm-pick-list" role="radiogroup" aria-label="Персонаж">
            {characters?.map((c) => {
              const src = parsePortrait(c.avatar_url).src
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={pick === c.id}
                  className={`rm-pick${pick === c.id ? ' is-on' : ''}`}
                  onClick={() => setPick(c.id ?? null)}
                >
                  <RoomAvatar src={src} name={c.character_name} size={40} />
                  <span>
                    <b>{c.character_name || 'Без имени'}</b>
                    <i>{classLine(c, classById) || 'без класса'}</i>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

/* ---------- страница ---------- */

export default function RoomsPage() {
  const navigate = useNavigate()
  const { code: codeParam } = useParams<{ code?: string }>()
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(!!codeParam)
  const knownPending = useRef(new Map<string, string>())

  const load = useCallback(async () => {
    try {
      const list = await listRooms('low')
      setRooms(list)
      setError(null)
      // заявка исчезла из списка, не став принятой, — её отклонили
      const now = new Map(list.map((r) => [r.id, r]))
      for (const [id, name] of knownPending.current) {
        const room = now.get(id)
        if (!room) setNotice(`Мастер отклонил заявку в комнату «${name}»`)
        else if (room.my_status === 'approved') setNotice(`Мастер принял вас в комнату «${name}». Можно заходить!`)
      }
      knownPending.current = new Map(list.filter((r) => r.my_status === 'pending').map((r) => [r.id, r.name]))
      return list
    } catch (e) {
      // 404 — комнат нет (или раздел на сервере ещё не включён): показываем пустой список, а не ошибку
      if (e instanceof ApiError && e.status === 404) {
        setRooms([])
        setError(null)
        return []
      }
      setError(errText(e, 'Не удалось загрузить комнаты'))
      return null
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const hasPending = rooms?.some((r) => r.my_status === 'pending') ?? false
  useEffect(() => {
    if (!hasPending) return
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [hasPending, load])

  const approved = useMemo(() => rooms?.filter((r) => r.my_status !== 'pending') ?? [], [rooms])
  const waiting = useMemo(() => rooms?.filter((r) => r.my_status === 'pending') ?? [], [rooms])
  const mine = approved.filter((r) => r.my_role === 'dm')
  const joined = approved.filter((r) => r.my_role !== 'dm')

  return (
    <section className="rm-page">
      <header className="rm-head">
        <div>
          <h1 className="section-title gold-text">Комнаты</h1>
          <p className="rm-sub">Совместная игра: мастер, партия и общий стол</p>
        </div>
        <div className="rm-head-actions">
          <button type="button" className="cs-btn" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Создать комнату
          </button>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={() => setJoining(true)}>
            <KeyRound aria-hidden="true" /> Войти по коду
          </button>
        </div>
      </header>

      {notice && (
        <p className="rm-notice" role="status">
          {notice}
          <button type="button" className="cw-mini-btn" onClick={() => setNotice(null)}>
            Понятно
          </button>
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
      {!rooms && !error && <p className="muted">Загружаем комнаты…</p>}

      {waiting.length > 0 && (
        <div className="rm-group">
          <h2 className="rm-group-title">
            <Clock aria-hidden="true" /> Ждут ответа мастера
          </h2>
          <div className="rm-grid">
            {waiting.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="rm-group">
          <h2 className="rm-group-title">
            <Swords aria-hidden="true" /> Я мастер
          </h2>
          <div className="rm-grid">
            {mine.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </div>
      )}

      {joined.length > 0 && (
        <div className="rm-group">
          <h2 className="rm-group-title">
            <Users aria-hidden="true" /> Я играю
          </h2>
          <div className="rm-grid">
            {joined.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </div>
      )}

      {rooms && rooms.length === 0 && (
        <div className="rm-empty">
          <ScrollText aria-hidden="true" />
          <p>Комнат пока нет. Создайте свою или войдите по коду, который дал мастер.</p>
        </div>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            navigate(`/rooms/${id}`)
          }}
        />
      )}
      {joining && (
        <JoinModal
          initialCode={codeParam ?? ''}
          onClose={() => {
            setJoining(false)
            if (codeParam) navigate('/rooms', { replace: true })
          }}
          onSent={(name) => {
            setJoining(false)
            setNotice(`Заявка в комнату «${name}» отправлена. Мастер должен её принять.`)
            if (codeParam) navigate('/rooms', { replace: true })
            void load()
          }}
        />
      )}
    </section>
  )
}
