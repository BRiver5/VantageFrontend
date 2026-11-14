/**
 * «Права доступа» к странице базы знаний, существу или предмету: уровень для всех
 * игроков и личные уровни. Открывает мастер или помощник мастера.
 */
import { useEffect, useState } from 'react'
import { KeyRound, Lock } from 'lucide-react'
import { SheetModal } from '../../characters/SheetModal'
import type { PermissionKind, PermissionsView } from '../../types/rooms'
import { useRoom } from '../RoomProvider'
import { getPermissions, putPermissions } from '../roomsApi'
import { RoomAvatar } from '../ui'
import {
  draftOf,
  effectiveLevel,
  LEVEL_HINT,
  LEVEL_LABEL,
  LEVELS,
  memberName,
  payloadOf,
  permissionRows,
  ROLE_LABEL,
  type PermissionDraft,
  type RowLevel,
} from './permissions'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка сервера')

function LevelSelect({ value, onChange, inheritLabel, label }: { value: RowLevel; onChange: (v: RowLevel) => void; inheritLabel: string; label: string }) {
  return (
    <select className="pm-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value as RowLevel)}>
      <option value="inherit">{inheritLabel}</option>
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          {LEVEL_LABEL[l]}
        </option>
      ))}
    </select>
  )
}

export function PermissionsDialog({ kind, docId, title, onClose }: { kind: PermissionKind; docId: string; title: string; onClose: () => void }) {
  const { roomId, data } = useRoom()
  const [view, setView] = useState<PermissionsView | null>(null)
  const [draft, setDraft] = useState<PermissionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getPermissions(roomId, kind, docId)
      .then((v) => {
        if (!alive) return
        setView(v)
        setDraft(draftOf(v))
      })
      .catch((e) => alive && setError(errText(e)))
    return () => {
      alive = false
    }
  }, [roomId, kind, docId])

  const rows = permissionRows(data?.members ?? [])
  const hints = LEVEL_HINT[kind]
  // как сейчас будет действовать черновик: для подписи «сейчас: …» у каждой строки
  const preview = view && draft ? { ...payloadOf(draft), computed_default: view.computed_default, computed_users: view.computed_users } : null

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      await putPermissions(roomId, kind, docId, payloadOf(draft))
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title="Права доступа"
      kicker={title}
      tone="rest"
      visual={<KeyRound className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" disabled={!draft || busy} onClick={() => void save()}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="pm-dialog">
        {!draft || !view || !preview ? (
          error ? null : <p className="rm-hint">Загружаем права…</p>
        ) : (
          <>
            <p className="rm-hint">Мастер и помощник мастера видят всё. Личный уровень игрока важнее общего.</p>
            <div className="pm-row is-all">
              <span className="pm-who">
                <b>Все игроки</b>
                <i>{hints[preview.default ?? view.computed_default]}</i>
              </span>
              <LevelSelect
                label="Уровень для всех игроков"
                value={draft.default}
                inheritLabel={`Как раньше (${LEVEL_LABEL[view.computed_default].toLowerCase()})`}
                onChange={(v) => setDraft({ ...draft, default: v })}
              />
            </div>
            {rows.length === 0 ? (
              <p className="rm-hint">В партии пока нет игроков.</p>
            ) : (
              <ul className="pm-rows">
                {rows.map((m) => {
                  const now = effectiveLevel(preview, m.user_id)
                  return (
                    <li key={m.user_id} className="pm-row">
                      <RoomAvatar src={m.avatar_url} name={memberName(m)} size={32} />
                      <span className="pm-who">
                        <b>{memberName(m)}</b>
                        <i>
                          {m.role !== 'player' ? `${ROLE_LABEL[m.role]} · ` : ''}
                          {now === 'none' && <Lock aria-hidden="true" />} {LEVEL_LABEL[now].toLowerCase()}: {hints[now]}
                        </i>
                      </span>
                      <LevelSelect
                        label={`Уровень для ${memberName(m)}`}
                        value={draft.users[m.user_id] ?? 'inherit'}
                        inheritLabel="Как у всех"
                        onChange={(v) => setDraft({ ...draft, users: { ...draft.users, [m.user_id]: v } })}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
        {error && <p className="auth-error">{error}</p>}
      </div>
    </SheetModal>
  )
}

/** Кнопка «Права доступа» для мастера и помощника; игроку не показывается */
export function PermissionsButton({ kind, docId, title, className = 'tb-linkbtn' }: { kind: PermissionKind; docId: string; title: string; className?: string }) {
  const { isDm } = useRoom()
  const [open, setOpen] = useState(false)
  if (!isDm) return null
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title="Кто из игроков что видит и может">
        <KeyRound aria-hidden="true" /> права доступа
      </button>
      {open && <PermissionsDialog kind={kind} docId={docId} title={title} onClose={() => setOpen(false)} />}
    </>
  )
}
