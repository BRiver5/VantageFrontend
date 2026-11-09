/**
 * Модерация обсуждений (только админ): жалобы, сгруппированные по
 * комментарию. Скрыть или вернуть — жалобы на комментарий закрываются.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, ExternalLink, Flag, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { deleteComment, entityHref, getReports, hideComment, type ReportsPage } from './api'

const SECTION: Record<string, string> = {
  items: 'Магический предмет',
  equipment: 'Снаряжение',
  spells: 'Заклинание',
  creatures: 'Существо',
  feats: 'Черта',
  backgrounds: 'Предыстория',
  races: 'Раса',
  subraces: 'Подраса',
  classes: 'Класс',
  subclasses: 'Подкласс',
}

export default function ModerationPage() {
  const { user } = useAuth()
  const [resolved, setResolved] = useState(false)
  const [page, setPage] = useState<ReportsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    getReports({ resolved, limit: 100 }).then(setPage, (e) => setError(e instanceof Error ? e.message : 'Не загрузилось'))
  }, [resolved])
  useEffect(() => {
    if (user?.role === 'admin') load()
  }, [load, user?.role])

  if (user?.role !== 'admin') return <p className="status-line">Раздел только для администраторов.</p>

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    try {
      await fn()
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="book-page mod-page">
      <Link to="/me" className="back-link">
        <ArrowLeft aria-hidden="true" /> в профиль
      </Link>
      <header className="tm-head">
        <span className="setting-kicker">Модерация</span>
        <h1 className="book-title gold-text">Жалобы на комментарии</h1>
        <span className="rv-sort" role="radiogroup" aria-label="Какие жалобы">
          <button type="button" role="radio" aria-checked={!resolved} className={!resolved ? 'is-on' : ''} onClick={() => setResolved(false)}>
            Открытые
          </button>
          <button type="button" role="radio" aria-checked={resolved} className={resolved ? 'is-on' : ''} onClick={() => setResolved(true)}>
            Закрытые
          </button>
        </span>
      </header>
      {error && <p className="status-line is-error">{error}</p>}
      {!page && !error && <p className="status-line">Загружаем…</p>}
      {page && page.items.length === 0 && <p className="status-line">{resolved ? 'Закрытых жалоб нет.' : 'Жалоб нет — всё спокойно.'}</p>}
      <ul className="mod-list">
        {page?.items.map(({ comment: c, count, reports }) => (
          <li key={c.id} className={`mod-item${c.hidden ? ' is-hidden' : ''}`}>
            <header>
              <b>{c.user.display_name}</b>
              <span className="mod-where">
                {SECTION[c.entity] ?? c.entity}
                <Link to={entityHref(c.entity, c.entity_id)} target="_blank" title="Открыть запись">
                  <ExternalLink aria-hidden="true" />
                </Link>
              </span>
              <span className="mod-count">
                <Flag aria-hidden="true" /> {count}
              </span>
              {c.hidden && <em className="rv-flag">скрыт</em>}
            </header>
            <p className="mod-text">{c.deleted ? <i>комментарий удалён</i> : c.text}</p>
            <ul className="mod-reasons">
              {reports.map((r, i) => (
                <li key={i}>
                  <b>{r.user.display_name}:</b> {r.reason}
                </li>
              ))}
            </ul>
            <div className="mod-acts">
              <button type="button" className="rv-send" disabled={busy === c.id} onClick={() => void act(c.id, () => hideComment(c.id, !c.hidden))}>
                {c.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />} {c.hidden ? 'Вернуть' : 'Скрыть'}
              </button>
              {!c.deleted && (
                <button type="button" className="rv-ghost is-danger" disabled={busy === c.id} onClick={() => confirm('Удалить комментарий насовсем?') && void act(c.id, () => deleteComment(c.id))}>
                  <Trash2 aria-hidden="true" /> Удалить
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
