/**
 * Визуальный редактор сценария «как Shortcuts». Блоки и их поля приходят
 * с сервера (GET /scene-blocks): новый блок на сервере появится здесь сам.
 * Вложенные списки (при провале, иначе…) — тот же редактор рекурсивно.
 * Поля-ссылки на карту (дверь, свет, зона, объект, триггер) — выбором.
 */
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { request } from '../api'
import type { SceneAction, SceneBlockDef, SceneBlockField } from './types'

let defs: Promise<SceneBlockDef[]> | null = null
export function useSceneBlocks(): SceneBlockDef[] {
  const [list, setList] = useState<SceneBlockDef[]>([])
  useEffect(() => {
    defs ??= request<{ items: SceneBlockDef[] }>('/scene-blocks').then(
      (r) => r?.items ?? [],
      () => ((defs = null), []),
    )
    let on = true
    void defs.then((x) => on && setList(x))
    return () => {
      on = false
    }
  }, [])
  return list
}

const CATEGORY: Record<string, string> = { checks: 'Проверки', control: 'Логика', combat: 'Бой', map: 'Карта', media: 'Звук и эффекты', output: 'Текст', data: 'Данные' }
const OPTION: Record<string, string> = {
  subject: 'кто вызвал',
  all_in_zone: 'все в зоне',
  group: 'группа',
  token: 'жетон',
  caster: 'заклинатель',
  party: 'отряд',
  enemies: 'враги',
  str: 'Сила',
  dex: 'Ловкость',
  con: 'Телосложение',
  int: 'Интеллект',
  wis: 'Мудрость',
  cha: 'Харизма',
  open: 'открыть',
  close: 'закрыть',
  lock: 'запереть',
  unlock: 'отпереть',
  on: 'включить',
  off: 'выключить',
  toggle: 'переключить',
  enable: 'включить',
  disable: 'выключить',
  remove: 'убрать',
  all: 'всем',
  dm: 'мастеру',
  zone_center: 'от центра зоны',
  point: 'от точки',
  bright: 'день',
  dim: 'сумерки',
  dark: 'тьма',
  acid: 'кислота',
  bludgeoning: 'дробящий',
  cold: 'холод',
  fire: 'огонь',
  force: 'силовое поле',
  lightning: 'молния',
  necrotic: 'некротика',
  piercing: 'колющий',
  poison: 'яд',
  psychic: 'психическая',
  radiant: 'излучение',
  slashing: 'рубящий',
  thunder: 'звук',
  party_side: 'отряд',
  enemies_side: 'враги',
  neutral: 'нейтралы',
}
const optLabel = (o: string) => OPTION[o] ?? o

/** Ссылки на объекты карты для полей вида wall_id, zone_id */
export interface BlockRefs {
  wall_id?: { id: string; label: string }[]
  light_id?: { id: string; label: string }[]
  zone_id?: { id: string; label: string }[]
  object_id?: { id: string; label: string }[]
  trigger_id?: { id: string; label: string }[]
  preset?: { id: string; label: string }[]
}

/** Короткая фраза блока: «Спасбросок Ловкость Сл 15» */
export function sentenceOf(def: SceneBlockDef | undefined, a: SceneAction): string {
  if (!def) return a.op
  return def.sentence.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = a[k]
    if (v == null || v === '') return '…'
    return typeof v === 'string' ? optLabel(v) : typeof v === 'object' ? '…' : String(v)
  })
}

export function BlockList({ value, onChange, refs, depth = 0 }: { value: SceneAction[]; onChange: (next: SceneAction[]) => void; refs?: BlockRefs; depth?: number }) {
  const all = useSceneBlocks()
  const [adding, setAdding] = useState(false)
  const byOp = new Map(all.map((d) => [d.op, d]))
  const set = (i: number, a: SceneAction) => onChange(value.map((x, j) => (j === i ? a : x)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = (def: SceneBlockDef) => {
    const a: SceneAction = { op: def.op }
    for (const f of def.fields) {
      if (f.default !== undefined) a[f.name] = f.default
      else if (f.kind === 'blocks') a[f.name] = []
      else if (f.kind === 'enum' && f.required && f.options?.length) a[f.name] = f.options[0]
    }
    onChange([...value, a])
    setAdding(false)
  }
  const cats = [...new Set(all.map((d) => d.category))]
  return (
    <div className={`bk-list${depth ? ' is-nested' : ''}`}>
      {value.map((a, i) => (
        <BlockCard key={i} def={byOp.get(a.op)} value={a} onChange={(x) => set(i, x)} onRemove={() => onChange(value.filter((_, j) => j !== i))} onUp={() => move(i, -1)} onDown={() => move(i, 1)} refs={refs} depth={depth} />
      ))}
      {adding ? (
        <div className="bk-palette" role="menu">
          {cats.map((c) => (
            <div key={c}>
              <b>{CATEGORY[c] ?? c}</b>
              <span>
                {all
                  .filter((d) => d.category === c)
                  .map((d) => (
                    <button key={d.op} type="button" role="menuitem" onClick={() => add(d)} title={d.doc || d.sentence}>
                      {d.label}
                    </button>
                  ))}
              </span>
            </div>
          ))}
          <button type="button" className="bk-cancel" onClick={() => setAdding(false)}>
            отмена
          </button>
        </div>
      ) : (
        <button type="button" className="bk-add" onClick={() => setAdding(true)} disabled={all.length === 0}>
          <Plus aria-hidden="true" /> {value.length ? 'ещё действие' : 'добавить действие'}
        </button>
      )}
    </div>
  )
}

function BlockCard({ def, value, onChange, onRemove, onUp, onDown, refs, depth }: { def?: SceneBlockDef; value: SceneAction; onChange: (a: SceneAction) => void; onRemove: () => void; onUp: () => void; onDown: () => void; refs?: BlockRefs; depth: number }) {
  // новый блок раскрыт, пока не заполнены обязательные поля
  const [open, setOpen] = useState(() => !!def?.fields.some((f) => f.required && f.kind !== 'blocks' && (value[f.name] == null || value[f.name] === '')))
  const fields = def?.fields ?? []
  const plain = fields.filter((f) => f.kind !== 'blocks')
  const lists = fields.filter((f) => f.kind === 'blocks')
  return (
    <div className={`bk-card is-${def?.category ?? 'other'}`}>
      <header>
        <button type="button" className="bk-title" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <b>{def?.label ?? value.op}</b>
          {!open && <i>{sentenceOf(def, value)}</i>}
        </button>
        <span className="bk-tools">
          <button type="button" onClick={onUp} aria-label="Выше">
            <ArrowUp aria-hidden="true" />
          </button>
          <button type="button" onClick={onDown} aria-label="Ниже">
            <ArrowDown aria-hidden="true" />
          </button>
          <button type="button" onClick={onRemove} aria-label="Удалить действие" className="is-danger">
            <Trash2 aria-hidden="true" />
          </button>
        </span>
      </header>
      {open && (
        <div className="bk-fields">
          {plain.map((f) => (
            <Field key={f.name} f={f} value={value[f.name]} refs={refs} onChange={(v) => onChange({ ...value, [f.name]: v })} />
          ))}
        </div>
      )}
      {lists.map((f) => (
        <div key={f.name} className="bk-branch">
          <span>{f.label}</span>
          <BlockList value={(value[f.name] as SceneAction[]) ?? []} onChange={(v) => onChange({ ...value, [f.name]: v })} refs={refs} depth={depth + 1} />
        </div>
      ))}
    </div>
  )
}

function Field({ f, value, onChange, refs }: { f: SceneBlockField; value: unknown; onChange: (v: unknown) => void; refs?: BlockRefs }) {
  const ref = refs?.[f.name as keyof BlockRefs]
  const label = (
    <span title={f.help}>
      {f.label}
      {f.required ? '' : ' (необяз.)'}
    </span>
  )
  if (ref && ref.length) {
    return (
      <label>
        {label}
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {ref.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (f.kind === 'enum') {
    return (
      <label>
        {label}
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          {!f.required && <option value="">—</option>}
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {optLabel(o)}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (f.kind === 'bool') {
    return (
      <label className="bk-check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}
      </label>
    )
  }
  if (f.kind === 'text') {
    return (
      <label className="bk-wide">
        {label}
        <textarea rows={2} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  if (f.kind === 'json' || f.kind === 'modifiers') return <JsonField label={label} value={value} onChange={onChange} />
  // str и expr: выражение — моноширинным
  return (
    <label>
      {label}
      <input className={f.kind === 'expr' ? 'is-expr' : ''} value={value == null ? '' : String(value)} placeholder={f.kind === 'expr' ? '15, 2d6, round >= 3' : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} />
    </label>
  )
}

function JsonField({ label, value, onChange }: { label: React.ReactNode; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value == null ? '' : JSON.stringify(value))
  const [bad, setBad] = useState(false)
  return (
    <label className="bk-wide">
      {label}
      <input
        className={`is-expr${bad ? ' is-bad' : ''}`}
        value={text}
        placeholder='{"x": 350, "y": 210}'
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            setBad(false)
            return onChange(undefined)
          }
          try {
            onChange(JSON.parse(text))
            setBad(false)
          } catch {
            setBad(true)
          }
        }}
      />
    </label>
  )
}
