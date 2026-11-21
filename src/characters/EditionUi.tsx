/**
 * Редакция правил на листе и в списке героев: значок «2014»/«2024», окно
 * «Пересоздать по правилам 2024» и плашка вопросов, оставшихся после
 * пересоздания (что не сопоставилось само).
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, RefreshCcw, Scale, Search } from 'lucide-react'
import { convertCharacterEdition, resolveEditionIssue, searchEditionCatalog } from '../api'
import { plural } from '../lib/plural'
import type { Character, CharacterEdition, EditionIssue } from '../types/character'
import {
  editionOf,
  groupIssues,
  ISSUES_VISIBLE,
  keptLine,
  KIND_LABEL,
  needsCatalogSearch,
  SEARCH_RESOURCES,
  type ConvertAction,
} from './editionConvert'
import { SheetModal } from './SheetModal'

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка сервера')

/** Маленький значок редакции */
export function EditionBadge({ edition, className = '' }: { edition: CharacterEdition | undefined; className?: string }) {
  const ed = editionOf({ edition })
  return (
    <span className={`ed-badge ed-badge--${ed}${className ? ` ${className}` : ''}`} title={`Правила ${ed} года`}>
      {ed}
    </span>
  )
}

/** Подтверждение пересоздания: копия по другой редакции, оригинал остаётся */
export function ConvertEditionDialog({
  character,
  action,
  onClose,
  onDone,
}: {
  character: Pick<Character, 'id' | 'character_name' | 'edition'>
  action: ConvertAction
  onClose: () => void
  onDone: (created: Character) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const from = editionOf(character)
  const name = character.character_name || 'персонаж'

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await convertCharacterEdition(character.id, action.to)
      if (!created?.id) throw new Error('Сервер не вернул новую копию')
      onDone(created)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <SheetModal
      title={action.label}
      kicker={`«${name}» · ${from} → ${action.to}`}
      visual={<RefreshCcw aria-hidden="true" />}
      onClose={busy ? () => {} : onClose}
      actions={
        <>
          {error && <span className="cw-save cw-save--error">{error}</span>}
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" className="cs-btn" onClick={() => void run()} disabled={busy}>
            {busy ? <Loader2 className="cw-spin" aria-hidden="true" /> : <RefreshCcw aria-hidden="true" />}
            {busy ? 'Пересоздаём…' : 'Создать копию'}
          </button>
        </>
      }
    >
      <div className="ed-convert">
        <p>
          Будет создана <b>копия</b> героя по правилам {action.to} года — «{name} ({action.to})». Оригинал по правилам {from} остаётся
          как есть.
        </p>
        <ul>
          <li>Класс, подкласс, раса, предыстория, черты, заклинания и снаряжение переносятся на версии {action.to}, где они есть.</li>
          <li>Уровень, хиты, характеристики, записи и внешность сохраняются.</li>
          <li>Что не удастся сопоставить само, лист спросит: оставить старое или выбрать новое.</li>
        </ul>
      </div>
    </SheetModal>
  )
}

/** Выбор замены: варианты сервера и, если их нет или много, поиск по каталогу */
function ReplacePicker({
  issue,
  edition,
  busy,
  onPick,
  onCancel,
}: {
  issue: EditionIssue
  edition: CharacterEdition
  busy: boolean
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const search = needsCatalogSearch(issue)
  const resources = SEARCH_RESOURCES[issue.kind] ?? []
  const [q, setQ] = useState(issue.options.length === 0 ? (issue.old?.name ?? '') : '')
  const [found, setFound] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!search) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      Promise.all(resources.map((r) => searchEditionCatalog(r, q, edition, ctl.signal)))
        .then((lists) => {
          const seen = new Set<string>()
          setFound(lists.flat().filter((x) => !seen.has(x.id) && seen.add(x.id)))
        })
        .catch((e) => {
          if (!ctl.signal.aborted) setError(errorText(e))
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
    // resources — константа по виду вопроса
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, q, edition, issue.kind])

  // при поиске свои варианты сервера — сверху, если подходят под строку
  const needle = q.trim().toLocaleLowerCase('ru')
  const listed = search ? issue.options.filter((o) => !needle || o.name.toLocaleLowerCase('ru').includes(needle)).slice(0, 8) : issue.options
  const extra = found.filter((f) => !listed.some((o) => o.id === f.id))

  return (
    <div className="ed-pick" role="group" aria-label={`Замена: ${issue.old?.name ?? KIND_LABEL[issue.kind]}`}>
      {search && (
        <label className="ed-pick-search">
          <Search aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Поиск в каталоге ${edition}`}
            aria-label={`Поиск: ${KIND_LABEL[issue.kind].toLocaleLowerCase('ru')} в каталоге ${edition}`}
            autoFocus
          />
          {loading && <Loader2 className="cw-spin" aria-hidden="true" />}
        </label>
      )}
      <ul className="ed-pick-list">
        {listed.map((o) => (
          <li key={o.id}>
            <button type="button" disabled={busy} onClick={() => onPick(o.id)}>
              {o.name}
              <i>предложено</i>
            </button>
          </li>
        ))}
        {extra.map((o) => (
          <li key={o.id}>
            <button type="button" disabled={busy} onClick={() => onPick(o.id)}>
              {o.name}
            </button>
          </li>
        ))}
        {!loading && listed.length === 0 && extra.length === 0 && (
          <li className="ed-pick-empty">{search ? 'Ничего не нашлось — уточните запрос.' : 'Вариантов нет — можно только оставить старое.'}</li>
        )}
      </ul>
      {error && <span className="cw-save cw-save--error">{error}</span>}
      <button type="button" className="cw-mini-btn" onClick={onCancel} disabled={busy}>
        отмена
      </button>
    </div>
  )
}

/**
 * Плашка «Нужно решить» после пересоздания по другой редакции. Ответ уходит
 * на сервер, новый документ возвращается через onResolved.
 */
export function EditionIssuesBanner({
  character,
  canEdit,
  onResolved,
}: {
  character: Pick<Character, 'id' | 'edition' | 'edition_issues'>
  canEdit: boolean
  onResolved: (c: Character) => void | Promise<void>
}) {
  const groups = useMemo(() => groupIssues(character.edition_issues), [character.edition_issues])
  const [expanded, setExpanded] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const edition = editionOf(character)
  const from: CharacterEdition = edition === '2024' ? '2014' : '2024'

  if (groups.open.length === 0 && groups.kept.length === 0) return null

  const resolve = async (issue: EditionIssue, replacementId?: string) => {
    setBusyKey(issue.key)
    setError(null)
    try {
      const updated = await resolveEditionIssue(character.id, issue.key, replacementId)
      setPicking(null)
      await onResolved(updated)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusyKey(null)
    }
  }

  const open = groups.open
  const shown = expanded ? open : open.slice(0, ISSUES_VISIBLE)
  const hidden = open.length - shown.length
  const keptNode = groups.kept.length > 0 && (
    <details className={`ed-issues-kept${open.length === 0 ? ' is-solo' : ''}`}>
      <summary>
        Оставлено из {from}: {groups.kept.length}
      </summary>
      <ul>
        {groups.kept.map((i) => (
          <li key={i.key}>{keptLine(i, from)}</li>
        ))}
      </ul>
    </details>
  )

  // всё решено — только тихая строка с оставленным
  if (open.length === 0) return keptNode || null

  return (
    <div className="eng-pending ed-issues" role="region" aria-label="Перенос на другую редакцию">
      <span className="eng-pending-title">
        <Scale aria-hidden="true" />
        Нужно решить: {open.length}
      </span>
      <p className="ed-issues-lead">
        Герой пересоздан по правилам {edition}. Не всё нашлось само — {open.length}{' '}
        {plural(open.length, ['пункт ждёт', 'пункта ждут', 'пунктов ждут'])} вашего решения.
      </p>
      {shown.length > 0 && (
        <ul>
          {shown.map((i) => {
            const busy = busyKey !== null
            return (
              <li key={i.key} className="ed-issue">
                <span>
                  <b>{i.message}</b>
                  <i>
                    {KIND_LABEL[i.kind]}
                    {i.old ? ` · было: ${i.old.name}` : ''}
                  </i>
                  {picking === i.key && (
                    <ReplacePicker
                      issue={i}
                      edition={edition}
                      busy={busy}
                      onPick={(id) => void resolve(i, id)}
                      onCancel={() => setPicking(null)}
                    />
                  )}
                </span>
                {canEdit && picking !== i.key && (
                  <>
                    {busyKey === i.key && <Loader2 className="cw-spin" aria-hidden="true" />}
                    <button
                      type="button"
                      className="cw-mini-btn"
                      disabled={busy}
                      onClick={() => void resolve(i)}
                      title={i.old ? `Оставить «${i.old.name}» из ${from}` : 'Оставить как есть'}
                    >
                      Оставить старое
                    </button>
                    {(i.options.length > 0 || needsCatalogSearch(i)) && (
                      <button type="button" className="cs-btn" disabled={busy} onClick={() => setPicking(i.key)}>
                        Выбрать новое…
                      </button>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open.length > ISSUES_VISIBLE && (
        <button type="button" className="cw-mini-btn ed-issues-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {expanded ? 'Свернуть' : `Показать ещё ${hidden}`}
        </button>
      )}
      {error && <p className="cw-save cw-save--error">{error}</p>}
      {keptNode}
    </div>
  )
}
