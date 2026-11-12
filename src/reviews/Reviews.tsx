/**
 * Оценки и обсуждение под записью каталога. Сверху — средняя оценка,
 * раскладка по звёздам и своя оценка (наведение подсвечивает, клик ставит);
 * ниже — поле комментария и ветки: первые три ответа, остальные по кнопке.
 * Гость читает всё, а вместо действий видит «Войдите».
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Flag, Heart, MessageSquare, Pencil, Reply, Send, Star, Trash2, UserRound, X } from 'lucide-react'
import { ApiError } from '../api'
import { useAuth } from '../auth/AuthContext'
import { RichText, useLinkedText } from '../terms/terms'
import { deleteComment, editComment, getReviews, likeComment, postComment, rate, reportComment, unrate, type RatingSummary, type ReviewComment, type ReviewEntity, type Reviews } from './api'
import { matches } from '../input/keybindings'

const MAX = 2000
const PAGE = 20

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Войдите, чтобы участвовать в обсуждении'
    if (e.status === 429) return 'Слишком часто: подождите минуту'
    if (e.status === 409) return 'Комментарий уже удалён'
    if (e.status === 404) return 'Не найдено: возможно, комментарий скрыт или удалён'
  }
  return e instanceof Error ? e.message : 'Не получилось'
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'только что'
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} дн назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Звёзды: только показ или выбор (наведение подсвечивает) */
export function Stars({ value, onPick, size = 'md', label }: { value: number | null; onPick?: (v: number) => void; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <span className={`rv-stars is-${size}${onPick ? ' is-pick' : ''}`} role={onPick ? 'radiogroup' : 'img'} aria-label={label ?? (value ? `${value} из 5` : 'без оценки')} onPointerLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)))
        const star = (
          <span className="rv-star" style={{ '--fill': `${fill * 100}%` } as React.CSSProperties}>
            <Star aria-hidden="true" className="rv-star-bg" />
            <Star aria-hidden="true" className="rv-star-fg" />
          </span>
        )
        return onPick ? (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} из 5`} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onPick(i)}>
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        )
      })}
    </span>
  )
}

/** Компактная отметка для карточек каталога: ★ 4.3 · 12 */
export function RatingMark({ rating }: { rating?: { average: number | null; count: number } | null }) {
  if (!rating?.count || rating.average == null) return null
  return (
    <span className="rv-mark" title={`Средняя оценка ${rating.average.toFixed(1)} из 5 · ${rating.count} ${plural(rating.count, 'оценка', 'оценки', 'оценок')}`}>
      <Star aria-hidden="true" />
      {rating.average.toFixed(1)}
      <i>{rating.count}</i>
    </span>
  )
}

function Avatar({ user }: { user: ReviewComment['user'] }) {
  const [broken, setBroken] = useState(false)
  const initials = user.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className="rv-avatar" aria-hidden="true">
      {user.avatar_url && !broken ? <img src={user.avatar_url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials || <UserRound />}
    </span>
  )
}

/** Поле ввода: растёт по тексту, Ctrl+Enter отправляет */
function Composer({ initial = '', placeholder, busy, onSubmit, onCancel, autoFocus, submitLabel = 'Отправить' }: { initial?: string; placeholder: string; busy?: boolean; onSubmit: (text: string) => Promise<boolean>; onCancel?: () => void; autoFocus?: boolean; submitLabel?: string }) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(320, el.scrollHeight)}px`
  }, [text])
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus()
      ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length)
    }
  }, [autoFocus])
  const trimmed = text.trim()
  const send = async () => {
    if (!trimmed || trimmed.length > MAX || busy) return
    if (await onSubmit(trimmed)) setText('')
  }
  return (
    <div className="rv-compose">
      <textarea
        ref={ref}
        value={text}
        rows={2}
        maxLength={MAX + 200}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (matches(e, 'review.send')) {
            e.preventDefault()
            void send()
          }
          if (matches(e, 'dialog.close') && onCancel) onCancel()
        }}
        aria-label={placeholder}
      />
      <div className="rv-compose-bar">
        <span className={`rv-count${text.length > MAX ? ' is-over' : ''}`}>{text.length > MAX - 300 ? `${text.length} / ${MAX}` : ''}</span>
        {onCancel && (
          <button type="button" className="rv-ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button type="button" className="rv-send" disabled={!trimmed || trimmed.length > MAX || busy} onClick={() => void send()} title="Ctrl+Enter">
          <Send aria-hidden="true" /> {submitLabel}
        </button>
      </div>
    </div>
  )
}

/** Текст комментария со ссылками на термины D&D */
function CommentText({ text }: { text: string }) {
  const links = useLinkedText(text)
  return (
    <div className="rv-text">
      <RichText text={text} links={links} />
    </div>
  )
}

export function ReviewsPanel({ entity, id, title = 'Оценки и обсуждение' }: { entity: ReviewEntity; id: string; title?: string }) {
  const { user } = useAuth()
  const location = useLocation()
  const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`
  const isAdmin = user?.role === 'admin'
  const [data, setData] = useState<Reviews | null>(null)
  const [sort, setSort] = useState<'new' | 'top'>('new')
  const [shown, setShown] = useState(PAGE)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [off, setOff] = useState(false)
  // все ответы раскрытых веток
  const [threads, setThreads] = useState<Record<string, ReviewComment[]>>({})

  const load = useCallback(
    async (limit = shown) => {
      try {
        const r = await getReviews(entity, id, { sort, limit: Math.min(100, limit) })
        setData(r)
        setOff(false)
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setOff(true)
        else setError(errText(e))
      }
    },
    [entity, id, sort, shown],
  )
  useEffect(() => {
    setThreads({})
    void load()
    // только при смене записи или сортировки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, id, sort])

  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(errText(e))
      return null
    } finally {
      setBusy(false)
    }
  }
  const setSummary = (summary: RatingSummary) => setData((d) => (d ? { ...d, summary } : d))
  const reloadThread = async (cid: string) => {
    if (!threads[cid]) return
    const r = await getReviews(entity, id, { reply_to: cid, limit: 100 }).catch(() => null)
    if (r) setThreads((t) => ({ ...t, [cid]: r.items }))
  }
  const after = async (threadId?: string | null) => {
    await load()
    if (threadId) await reloadThread(threadId)
  }

  if (off) return null
  const s = data?.summary
  const maxBar = Math.max(1, ...Object.values(s?.histogram ?? { 1: 0 }))

  return (
    <section className="rv" aria-label={title}>
      <h2 className="detail-subtitle gold-text rv-title">
        <MessageSquare aria-hidden="true" /> {title}
      </h2>

      <div className="rv-summary">
        <div className="rv-avg">
          <b>{s?.average != null ? s.average.toFixed(1) : '—'}</b>
          <Stars value={s?.average ?? 0} size="md" />
          <i>{s?.count ? `${s.count} ${plural(s.count, 'оценка', 'оценки', 'оценок')}` : 'оценок пока нет'}</i>
        </div>
        <ul className="rv-hist" aria-label="Распределение оценок">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = s?.histogram?.[String(n) as '1'] ?? 0
            return (
              <li key={n}>
                <span>{n}</span>
                <Star aria-hidden="true" />
                <span className="rv-bar">
                  <span style={{ width: `${(c / maxBar) * 100}%` }} />
                </span>
                <i>{c}</i>
              </li>
            )
          })}
        </ul>
        <div className="rv-mine">
          {user ? (
            <>
              <span className="rv-mine-label">{s?.mine ? 'Ваша оценка' : 'Оцените'}</span>
              <Stars value={s?.mine ?? null} size="lg" label="Ваша оценка" onPick={(v) => void run(() => rate(entity, id, v)).then((r) => r && setSummary(r))} />
              {s?.mine != null && (
                <button type="button" className="rv-link" disabled={busy} onClick={() => void run(() => unrate(entity, id)).then((r) => r && setSummary(r))}>
                  убрать оценку
                </button>
              )}
            </>
          ) : (
            <Link to={loginHref} className="rv-link">
              Войдите, чтобы оценить
            </Link>
          )}
        </div>
      </div>

      {user ? (
        <div className="rv-new">
          <Avatar user={{ id: user.id, nickname: user.nickname ?? null, display_name: user.display_name || user.nickname || 'Вы', avatar_url: (user as { avatar_url?: string | null }).avatar_url ?? null }} />
          <Composer placeholder="Поделитесь впечатлением или вопросом…" busy={busy} onSubmit={async (t) => !!(await run(() => postComment(entity, id, t)).then(async (c) => (c ? (await after(), c) : null)))} />
        </div>
      ) : (
        <p className="rv-guest">
          <Link to={loginHref}>Войдите</Link>, чтобы написать комментарий.
        </p>
      )}
      {error && (
        <p className="rv-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Скрыть">
            <X aria-hidden="true" />
          </button>
        </p>
      )}

      {data && data.total > 0 && (
        <div className="rv-bar-top">
          <span>
            {data.total} {plural(data.total, 'обсуждение', 'обсуждения', 'обсуждений')}
          </span>
          <span className="rv-sort" role="radiogroup" aria-label="Порядок">
            <button type="button" role="radio" aria-checked={sort === 'new'} className={sort === 'new' ? 'is-on' : ''} onClick={() => setSort('new')}>
              Новые
            </button>
            <button type="button" role="radio" aria-checked={sort === 'top'} className={sort === 'top' ? 'is-on' : ''} onClick={() => setSort('top')}>
              Лучшие
            </button>
          </span>
        </div>
      )}

      <ul className="rv-list">
        {(data?.items ?? []).map((c) => (
          <CommentItem
            key={c.id}
            c={c}
            entity={entity}
            entityId={id}
            canAct={!!user}
            isAdmin={isAdmin}
            loginHref={loginHref}
            run={run}
            onChanged={(threadId) => void after(threadId)}
            thread={threads[c.id]}
            onOpenThread={async () => {
              const r = await getReviews(entity, id, { reply_to: c.id, limit: 100 }).catch((e) => (setError(errText(e)), null))
              if (r) setThreads((t) => ({ ...t, [c.id]: r.items }))
            }}
          />
        ))}
      </ul>
      {data && data.items.length < data.total && (
        <button
          type="button"
          className="rv-more"
          onClick={() => {
            const next = shown + PAGE
            setShown(next)
            void load(next)
          }}
        >
          Ещё комментарии ({data.total - data.items.length})
        </button>
      )}
      {data && data.total === 0 && <p className="rv-empty">Обсуждения пока нет — будьте первым.</p>}
    </section>
  )
}

function CommentItem({
  c,
  entity,
  entityId,
  canAct,
  isAdmin,
  loginHref,
  run,
  onChanged,
  thread,
  onOpenThread,
  isReply = false,
  parentId,
}: {
  c: ReviewComment
  entity: ReviewEntity
  entityId: string
  canAct: boolean
  isAdmin: boolean
  loginHref: string
  run: <T>(fn: () => Promise<T>) => Promise<T | null>
  onChanged: (threadId?: string | null) => void
  thread?: ReviewComment[]
  onOpenThread?: () => void
  isReply?: boolean
  parentId?: string
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reply' | 'report'>('view')
  const [likes, setLikes] = useState({ n: c.likes, mine: c.liked_by_me })
  const [reason, setReason] = useState('')
  useEffect(() => setLikes({ n: c.likes, mine: c.liked_by_me }), [c.likes, c.liked_by_me])
  const rootId = parentId ?? c.id
  const replies = thread ?? c.replies ?? []
  const hiddenReplies = !thread ? (c.replies_total ?? 0) - (c.replies?.length ?? 0) : 0

  return (
    <li className={`rv-item${isReply ? ' is-reply' : ''}${c.deleted ? ' is-deleted' : ''}${c.hidden ? ' is-hidden' : ''}${c.is_mine ? ' is-mine' : ''}`}>
      <Avatar user={c.user} />
      <div className="rv-body">
        <header>
          <b className="rv-name">{c.user.display_name}</b>
          {c.rating != null && !c.deleted && <Stars value={c.rating} size="sm" label={`Оценил на ${c.rating} из 5`} />}
          <time dateTime={c.created_at} title={new Date(c.created_at).toLocaleString('ru-RU')}>
            {ago(c.created_at)}
          </time>
          {c.edited_at && !c.deleted && (
            <i className="rv-edited" title={`Изменено ${new Date(c.edited_at).toLocaleString('ru-RU')}`}>
              изменено
            </i>
          )}
          {c.hidden && <em className="rv-flag">скрыт модерацией</em>}
        </header>

        {c.deleted ? (
          <p className="rv-gone">Комментарий удалён</p>
        ) : mode === 'edit' ? (
          <Composer
            initial={c.text}
            placeholder="Текст комментария"
            submitLabel="Сохранить"
            autoFocus
            onCancel={() => setMode('view')}
            onSubmit={async (t) => {
              const r = await run(() => editComment(c.id, t))
              if (r) {
                setMode('view')
                onChanged(isReply ? rootId : null)
              }
              return !!r
            }}
          />
        ) : (
          <CommentText text={c.text} />
        )}

        {!c.deleted && mode !== 'edit' && (
          <div className="rv-actions">
            <button
              type="button"
              className={`rv-like${likes.mine ? ' is-on' : ''}`}
              disabled={c.is_mine || !!c.hidden}
              title={c.is_mine ? 'Свой комментарий оценить нельзя' : likes.mine ? 'Убрать «нравится»' : 'Нравится'}
              aria-pressed={likes.mine}
              onClick={() => {
                if (!canAct) return void (window.location.href = loginHref)
                void run(() => likeComment(c.id)).then((r) => r && setLikes({ n: r.likes, mine: r.liked_by_me }))
              }}
            >
              <Heart aria-hidden="true" /> {likes.n > 0 ? likes.n : ''}
            </button>
            {canAct && (
              <button type="button" onClick={() => setMode(mode === 'reply' ? 'view' : 'reply')}>
                <Reply aria-hidden="true" /> Ответить
              </button>
            )}
            {c.is_mine && (
              <button type="button" onClick={() => setMode('edit')}>
                <Pencil aria-hidden="true" /> Изменить
              </button>
            )}
            {(c.is_mine || isAdmin) && (
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  if (!confirm('Удалить комментарий?')) return
                  void run(() => deleteComment(c.id)).then((r) => r !== null && onChanged(isReply ? rootId : null))
                }}
              >
                <Trash2 aria-hidden="true" /> Удалить
              </button>
            )}
            {canAct && !c.is_mine && !c.hidden && (
              <button type="button" className="rv-report-btn" onClick={() => setMode(mode === 'report' ? 'view' : 'report')} title="Пожаловаться">
                <Flag aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {mode === 'report' && (
          <form
            className="rv-report"
            onSubmit={(e) => {
              e.preventDefault()
              const r = reason.trim()
              if (!r) return
              void run(() => reportComment(c.id, r)).then((ok) => {
                if (ok !== null) {
                  setMode('view')
                  setReason('')
                  alert('Спасибо, жалоба отправлена модератору.')
                }
              })
            }}
          >
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Что не так: спам, оскорбление, спойлер…" maxLength={500} autoFocus aria-label="Причина жалобы" />
            <button type="submit" className="rv-send" disabled={!reason.trim()}>
              Отправить
            </button>
            <button type="button" className="rv-ghost" onClick={() => setMode('view')}>
              Отмена
            </button>
          </form>
        )}

        {mode === 'reply' && (
          <Composer
            initial={isReply ? `@${c.user.display_name}, ` : ''}
            placeholder={`Ответ для ${c.user.display_name}`}
            autoFocus
            onCancel={() => setMode('view')}
            onSubmit={async (t) => {
              const r = await run(() => postComment(entity, entityId, t, rootId))
              if (r) {
                setMode('view')
                onChanged(rootId)
              }
              return !!r
            }}
          />
        )}

        {!isReply && replies.length > 0 && (
          <ul className="rv-replies">
            {replies.map((r) => (
              <CommentItem key={r.id} c={r} entity={entity} entityId={entityId} canAct={canAct} isAdmin={isAdmin} loginHref={loginHref} run={run} onChanged={onChanged} isReply parentId={c.id} />
            ))}
          </ul>
        )}
        {!isReply && hiddenReplies > 0 && onOpenThread && (
          <button type="button" className="rv-thread" onClick={onOpenThread}>
            Показать ещё {hiddenReplies} {plural(hiddenReplies, 'ответ', 'ответа', 'ответов')}
          </button>
        )}
      </div>
    </li>
  )
}
