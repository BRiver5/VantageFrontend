/**
 * Раздел «Умения»: всё, что выдано герою (раса, класс, черты, предметы, вручную).
 * Любое можно отключить; добавить можно любое умение из базы — например, умение чужого
 * класса или подкласса. Изменения применяются сразу, без «Применить».
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { Eye, EyeOff, Plus, Search, Trash2, Zap } from 'lucide-react'
import { abilitySlugById, searchCatalog } from '../../../api'
import type { SearchHit } from '../../../api'
import type { Character, Sheet, SheetAbility } from '../../../types/character'
import { EdSection } from '../../editorFields'

export type AbilityActions = {
  toggle: (grantId: string, enabled: boolean) => void
  attach: (slug: string) => void
  detach: (grantId: string) => void
}

const KIND_LABEL: Record<string, string> = {
  race: 'Раса',
  subrace: 'Подраса',
  class: 'Класс',
  subclass: 'Подкласс',
  background: 'Предыстория',
  feat: 'Черта',
  item: 'Предмет',
  equipment: 'Снаряжение',
  manual: 'Добавлено вручную',
}

type Props = { character: Character; sheet: Sheet; actions: AbilityActions }

export function GrantsSection({ sheet, actions }: Props) {
  const [filter, setFilter] = useState('')
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const out = new Map<string, SheetAbility[]>()
    for (const a of sheet.abilities) {
      if (q && !a.name.toLowerCase().includes(q) && !(a.source_name ?? '').toLowerCase().includes(q)) continue
      const key = a.source_kind === 'manual' ? 'Добавлено вручную' : `${KIND_LABEL[a.source_kind] ?? a.source_kind}${a.source_name ? ` · ${a.source_name}` : ''}`
      out.set(key, [...(out.get(key) ?? []), a])
    }
    return [...out.entries()].sort(([a], [b]) => Number(a === 'Добавлено вручную') - Number(b === 'Добавлено вручную'))
  }, [sheet.abilities, filter])

  // названия умений героя — найденное в базе помечается «уже есть»
  const have = useMemo(() => new Set(sheet.abilities.map((a) => a.name.trim().toLocaleLowerCase('ru'))), [sheet.abilities])

  return (
    <EdSection
      id="grants"
      icon={Zap}
      title="Умения"
      lead="Всё, что дают раса, класс, черты и предметы. Ненужное отключите — механика перестанет действовать. Добавить можно любое умение из базы, хоть чужого класса или подкласса. Применяется сразу."
    >
      <div className="ed-sub">
        <h5>Добавить из базы</h5>
        <AbilitySearch onPick={actions.attach} have={have} />
      </div>
      <div className="ed-sub">
        <h5>У героя · {sheet.abilities.length}</h5>
        {sheet.abilities.length > 8 && (
          <input
            className="ed-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Найти среди умений героя"
            aria-label="Фильтр умений героя"
          />
        )}
        {groups.map(([title, list]) => (
          <div key={title} className="ed-grant-group">
            <h6>{title}</h6>
            <div className="ed-rules">
              {list.map((a) => {
                const off = a.enabled === false
                return (
                  <div key={a.grant_id} className={`ed-rule${off ? ' is-hidden' : ''}`}>
                    <span>
                      {a.name}
                      {a.implementation_status === 'text_only' && <i className="ed-grant-note"> · только текст</i>}
                    </span>
                    <button
                      type="button"
                      className={`ed-btn ed-btn--icon${off ? '' : ' is-on'}`}
                      onClick={() => actions.toggle(a.grant_id, off)}
                      title={off ? 'Включить' : 'Отключить'}
                      aria-label={off ? `Включить «${a.name}»` : `Отключить «${a.name}»`}
                    >
                      {off ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                    {a.source_kind === 'manual' && (
                      <button
                        type="button"
                        className="ed-btn ed-btn--icon is-danger"
                        onClick={() => actions.detach(a.grant_id)}
                        title="Убрать"
                        aria-label={`Убрать «${a.name}»`}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="ed-empty">Ничего не найдено.</p>}
      </div>
    </EdSection>
  )
}

/** Поиск по всем умениям базы — тот же умный поиск, что на главной */
function AbilitySearch({ onPick, have }: { onPick: (slug: string) => void; have: Set<string> }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const listId = useId()

  useEffect(() => {
    const query = q.trim()
    if (!query) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      searchCatalog(query, { entities: ['abilities'], limit: 15, edition: null, otherEditions: false, signal: ctl.signal })
        .then((r) => setHits(r.items.filter((h) => h.entity === 'abilities')))
        .catch(() => undefined)
    }, 250)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q])

  const pick = async (h: SearchHit) => {
    setBusy(true)
    try {
      onPick(await abilitySlugById(h.id))
      setQ('')
      setHits([])
    } finally {
      setBusy(false)
    }
  }
  const shown = q.trim() ? hits : []

  return (
    <div className="ed-search">
      <span className="ed-search-box">
        <Search aria-hidden="true" />
        <input
          className="ed-input"
          value={q}
          disabled={busy}
          placeholder="Название умения: «Дикий облик», «Боевой стиль», «Ki»…"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </span>
      {open && shown.length > 0 && (
        <ul className="ed-search-list" id={listId} role="listbox">
          {shown.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={have.has(h.title.trim().toLocaleLowerCase('ru')) ? 'is-owned' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(h)}
              >
                <b>
                  <Plus aria-hidden="true" className="ed-grant-plus" /> {h.title}
                  {have.has(h.title.trim().toLocaleLowerCase('ru')) && <span className="owned-tag">уже есть</span>}
                </b>
                <i>
                  {[h.editions?.length ? `редакция ${h.editions.join('/')}` : null, h.snippet && h.snippet.slice(0, 90)]
                    .filter(Boolean)
                    .join(' · ')}
                </i>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
