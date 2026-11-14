/**
 * Поля страниц-квестов, НИП и лавок: вид для чтения (игрокам — то, что прислал
 * сервер) и правка у мастера. Сам текст страницы остаётся в markdown.
 */
import { useRef } from 'react'
import { Check, Eye, EyeOff, ImagePlus, Plus, ScrollText, Trash2, X } from 'lucide-react'
import { uploadMedia } from '../../api'
import { Img } from '../../media'
import type { NpcAttitude, NpcFields, QuestFields, QuestStatus, ScreenNote, SharedNote, ShopFields } from '../../types/rooms'
import { CatalogPicker } from './CatalogPicker'
import { EmbedCard } from './EmbedCard'
import { ShopPanel } from './ShopPanel'
import { ATTITUDE, NPC_DEFAULT, QUEST_DEFAULT, QUEST_STATUS, SHOP_DEFAULT, newObjectiveId, pageTypeOf } from './pageKinds'
import { iconOf } from './tree'

type AnyNote = ScreenNote | SharedNote
export interface PageRef {
  id: string
  title: string
}

interface Props {
  note: AnyNote
  /** мастер правит поля; нет — только чтение */
  onPatch?: (patch: Partial<ScreenNote>) => void
  /** страницы, на которые можно сослаться (зрителю — только видимые) */
  pages: (PageRef & { page_type?: string })[]
  onOpenPage: (id: string) => void
}

function PageLink({ id, pages, onOpenPage, empty }: { id: string | null; pages: PageRef[]; onOpenPage: (id: string) => void; empty?: string }) {
  const p = id ? pages.find((x) => x.id === id) : null
  if (!p) return empty ? <i className="kb-hint">{empty}</i> : null
  return (
    <button type="button" className="kb-wiki" onClick={() => onOpenPage(p.id)}>
      {p.title}
    </button>
  )
}

function PageSelect({ value, pages, onChange, empty }: { value: string | null; pages: PageRef[]; onChange: (id: string | null) => void; empty: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {pages.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
        </option>
      ))}
    </select>
  )
}

/* ---------- квест ---------- */

function QuestPanel({ q, onPatch, pages, onOpenPage }: { q: QuestFields; onPatch?: (q: QuestFields) => void; pages: Props['pages']; onOpenPage: (id: string) => void }) {
  const set = (patch: Partial<QuestFields>) => onPatch?.({ ...q, ...patch })
  const setObj = (id: string, patch: Partial<QuestFields['objectives'][number]>) => set({ objectives: q.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
  const npcs = pages.filter((p) => p.page_type === 'npc')
  const done = q.objectives.filter((o) => o.done).length
  return (
    <section className={`kb-typed kb-quest is-${q.status}`} aria-label="Квест">
      <header className="kb-typed-head">
        <ScrollText aria-hidden="true" />
        {onPatch ? (
          <select value={q.status} onChange={(e) => set({ status: e.target.value as QuestStatus })} aria-label="Состояние квеста">
            {(Object.keys(QUEST_STATUS) as QuestStatus[]).map((s) => (
              <option key={s} value={s}>
                {QUEST_STATUS[s]}
              </option>
            ))}
          </select>
        ) : (
          <b className="kb-quest-status">{QUEST_STATUS[q.status]}</b>
        )}
        {q.objectives.length > 0 && (
          <span className="kb-hint">
            {done} из {q.objectives.length}
          </span>
        )}
        <span className="kb-typed-giver">
          дал:{' '}
          {onPatch ? (
            <PageSelect value={q.giver_page_id} pages={npcs} onChange={(id) => set({ giver_page_id: id })} empty="никто" />
          ) : (
            <PageLink id={q.giver_page_id} pages={pages} onOpenPage={onOpenPage} empty="неизвестно" />
          )}
        </span>
      </header>
      {q.status === 'hidden' && onPatch && <p className="kb-hint">Скрытый квест игроки не видят, даже если страница им открыта.</p>}
      <ul className="kb-objectives">
        {q.objectives.map((o) => (
          <li key={o.id} className={`${o.done ? 'is-done' : ''}${o.visible === false ? ' is-hidden' : ''}`}>
            {onPatch ? (
              <>
                <input type="checkbox" checked={o.done} onChange={() => setObj(o.id, { done: !o.done })} aria-label={o.done ? 'Снять отметку' : 'Отметить выполненной'} />
                <input className="kb-objective-text" value={o.text} placeholder="Цель" onChange={(e) => setObj(o.id, { text: e.target.value })} />
                <button type="button" className="kb-chip is-quiet" onClick={() => setObj(o.id, { visible: o.visible === false })} title={o.visible === false ? 'Цель видит только мастер' : 'Цель видят игроки'}>
                  {o.visible === false ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
                <button type="button" className="kb-chip is-quiet is-danger" onClick={() => set({ objectives: q.objectives.filter((x) => x.id !== o.id) })} aria-label="Удалить цель">
                  <Trash2 aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <span className="kb-objective-mark" aria-hidden="true">
                  {o.done ? <Check /> : null}
                </span>
                <span>{o.text}</span>
              </>
            )}
          </li>
        ))}
        {onPatch && (
          <li>
            <button type="button" className="kb-chip" onClick={() => set({ objectives: [...q.objectives, { id: newObjectiveId(), text: '', done: false, visible: true }] })}>
              <Plus aria-hidden="true" /> цель
            </button>
          </li>
        )}
      </ul>
      {onPatch ? (
        <label className="kb-typed-field">
          <span>Награда</span>
          <textarea rows={2} value={q.rewards} maxLength={2000} placeholder="100 зм и благосклонность гильдии" onChange={(e) => set({ rewards: e.target.value })} />
        </label>
      ) : (
        q.rewards && (
          <p className="kb-typed-field">
            <span>Награда</span> {q.rewards}
          </p>
        )
      )}
    </section>
  )
}

/* ---------- НИП ---------- */

function NpcPanel({ n, onPatch, pages, onOpenPage }: { n: NpcFields; onPatch?: (n: NpcFields) => void; pages: Props['pages']; onOpenPage: (id: string) => void }) {
  const set = (patch: Partial<NpcFields>) => onPatch?.({ ...n, ...patch })
  const file = useRef<HTMLInputElement>(null)
  return (
    <section className={`kb-typed kb-npc is-${n.attitude}`} aria-label="НИП">
      <div className="kb-npc-portrait">
        {n.portrait ? <Img src={n.portrait} alt="" /> : <span aria-hidden="true">🧙</span>}
        {onPatch && (
          <span className="kb-npc-portrait-tools">
            <button type="button" onClick={() => file.current?.click()} aria-label="Загрузить портрет">
              <ImagePlus aria-hidden="true" />
            </button>
            {n.portrait && (
              <button type="button" onClick={() => set({ portrait: null })} aria-label="Убрать портрет">
                <X aria-hidden="true" />
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) set({ portrait: (await uploadMedia(f).catch(() => null))?.url ?? n.portrait })
              }}
            />
          </span>
        )}
      </div>
      <dl className="kb-npc-facts">
        <dt>Отношение</dt>
        <dd>
          {onPatch ? (
            <select value={n.attitude} onChange={(e) => set({ attitude: e.target.value as NpcAttitude })}>
              {(Object.keys(ATTITUDE) as NpcAttitude[]).map((a) => (
                <option key={a} value={a}>
                  {ATTITUDE[a]}
                </option>
              ))}
            </select>
          ) : (
            <b className="kb-npc-attitude">{ATTITUDE[n.attitude]}</b>
          )}
        </dd>
        <dt>Роль</dt>
        <dd>{onPatch ? <input value={n.role} maxLength={200} placeholder="трактирщик, глава гильдии…" onChange={(e) => set({ role: e.target.value })} /> : n.role || '—'}</dd>
        <dt>Где найти</dt>
        <dd>
          {onPatch ? (
            <>
              <PageSelect value={n.location_page_id} pages={pages.filter((p) => p.page_type !== 'npc')} onChange={(id) => set({ location_page_id: id })} empty="страница места…" />
              <input value={n.location} maxLength={200} placeholder="или словами" onChange={(e) => set({ location: e.target.value })} />
            </>
          ) : (
            <>
              <PageLink id={n.location_page_id} pages={pages} onOpenPage={onOpenPage} /> {n.location}
              {!n.location && !n.location_page_id && '—'}
            </>
          )}
        </dd>
      </dl>
      {onPatch && (
        <div className="kb-npc-creature">
          <span className="kb-hint">Статблок (видит только мастер):</span>
          {n.creature_id ? (
            <span className="kb-npc-creature-card">
              <EmbedCard key={n.creature_id} kind="creature" id={n.creature_id} />
              <button type="button" className="kb-chip is-quiet" onClick={() => set({ creature_id: null })} aria-label="Отвязать существо">
                <X aria-hidden="true" />
              </button>
            </span>
          ) : (
            <CatalogPicker entities={['creatures']} placeholder="Существо из бестиария…" onPick={(h) => set({ creature_id: h.id })} />
          )}
        </div>
      )}
    </section>
  )
}

/* ---------- лавка ---------- */

function ShopFieldsPanel({ s, pageId, onPatch, pages, onOpenPage }: { s: ShopFields; pageId: string; onPatch?: (s: ShopFields) => void; pages: Props['pages']; onOpenPage: (id: string) => void }) {
  const set = (patch: Partial<ShopFields>) => onPatch?.({ ...s, ...patch })
  const mult = (v: string) => Math.min(100, Math.max(0, Number(v.replace(',', '.')) || 0))
  return (
    <section className="kb-typed kb-shopfields" aria-label="Лавка">
      <header className="kb-typed-head">
        {onPatch ? (
          <>
            <label className="kb-typed-toggle">
              <input type="checkbox" checked={s.open} onChange={() => set({ open: !s.open })} /> открыта
            </label>
            <label>
              цены ×
              <input type="number" step={0.1} min={0} max={100} defaultValue={s.buy_multiplier} onBlur={(e) => set({ buy_multiplier: mult(e.target.value) })} aria-label="Множитель цены покупки" />
            </label>
            <label>
              скупает ×
              <input type="number" step={0.1} min={0} max={100} defaultValue={s.sell_multiplier} onBlur={(e) => set({ sell_multiplier: mult(e.target.value) })} aria-label="Множитель цены продажи" />
            </label>
            <span className="kb-typed-giver">
              торгует: <PageSelect value={s.merchant_page_id} pages={pages.filter((p) => p.page_type === 'npc')} onChange={(id) => set({ merchant_page_id: id })} empty="никто" />
            </span>
          </>
        ) : (
          s.merchant_page_id && (
            <span className="kb-typed-giver">
              торгует: <PageLink id={s.merchant_page_id} pages={pages} onOpenPage={onOpenPage} empty="хозяин" />
            </span>
          )
        )}
      </header>
      <ShopPanel pageId={pageId} />
    </section>
  )
}

/** Поля страницы по её типу; обычная страница — ничего */
export function TypedPanel({ note, onPatch, pages, onOpenPage }: Props) {
  const kind = pageTypeOf(note)
  if (kind === 'quest') return <QuestPanel q={note.quest ?? QUEST_DEFAULT} onPatch={onPatch && ((quest) => onPatch({ quest }))} pages={pages} onOpenPage={onOpenPage} />
  if (kind === 'npc') return <NpcPanel n={note.npc ?? NPC_DEFAULT} onPatch={onPatch && ((npc) => onPatch({ npc }))} pages={pages} onOpenPage={onOpenPage} />
  if (kind === 'shop') return <ShopFieldsPanel s={note.shop ?? SHOP_DEFAULT} pageId={note.id} onPatch={onPatch && ((shop) => onPatch({ shop }))} pages={pages} onOpenPage={onOpenPage} />
  return null
}

/* ---------- журнал квестов ---------- */

const STATUS_ORDER: QuestStatus[] = ['active', 'completed', 'failed', 'hidden']

/** Все квесты списком: игроку — видимые ему, мастеру — все со статусами */
export function QuestLog({ notes, onOpen, empty }: { notes: AnyNote[]; onOpen?: (id: string) => void; empty: string }) {
  const quests = notes.filter((n) => pageTypeOf(n) === 'quest')
  if (quests.length === 0) return <p className="kb-hint">{empty}</p>
  return (
    <div className="kb-questlog">
      {STATUS_ORDER.map((status) => {
        const group = quests.filter((n) => (n.quest?.status ?? 'active') === status)
        if (group.length === 0) return null
        return (
          <section key={status}>
            <h4>
              {QUEST_STATUS[status]} <em>{group.length}</em>
            </h4>
            <ul>
              {group.map((n) => {
                const q = n.quest ?? QUEST_DEFAULT
                const done = q.objectives.filter((o) => o.done).length
                return (
                  <li key={n.id} className={`kb-questlog-item is-${status}`}>
                    <button type="button" className="kb-questlog-title" onClick={() => onOpen?.(n.id)} disabled={!onOpen}>
                      {iconOf(n) ? `${iconOf(n)} ` : ''}
                      {n.title || 'Без названия'}
                      {q.objectives.length > 0 && (
                        <i>
                          {done}/{q.objectives.length}
                        </i>
                      )}
                    </button>
                    {q.objectives.length > 0 && (
                      <ul className="kb-objectives is-compact">
                        {q.objectives.map((o) => (
                          <li key={o.id} className={`${o.done ? 'is-done' : ''}${o.visible === false ? ' is-hidden' : ''}`}>
                            <span className="kb-objective-mark" aria-hidden="true">
                              {o.done ? <Check /> : null}
                            </span>
                            <span>{o.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.rewards && <p className="kb-hint">Награда: {q.rewards}</p>}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
