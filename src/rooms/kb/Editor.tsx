import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import {
  Bold,
  Dices,
  FileText,
  Heading2,
  ImagePlus,
  Italic,
  LayoutDashboard,
  Link2,
  List,
  ListChecks,
  MessageSquareQuote,
  Table2,
} from 'lucide-react'
import { uploadMedia } from '../../api'
import { norm } from './context'
import { matches } from '../../input/keybindings'

/* ---------- редактор ---------- */

export function Editor({ value, onChange, titles }: { value: string; onChange: (v: string) => void; titles: string[] }) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const [suggest, setSuggest] = useState<{ q: string; at: number } | null>(null)
  const [pick, setPick] = useState(0)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const insert = (before: string, after = '', placeholder = '') => {
    const el = ta.current
    if (!el) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const sel = value.slice(s, e) || placeholder
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + before.length, s + before.length + sel.length)
    })
  }
  /** Вставить с новой строки (для блоков) */
  const block = (text: string) => {
    const el = ta.current
    const s = el?.selectionStart ?? value.length
    const lead = s > 0 && value[s - 1] !== '\n' ? '\n\n' : ''
    const next = value.slice(0, s) + lead + text + '\n' + value.slice(s)
    onChange(next)
    requestAnimationFrame(() => el?.focus())
  }
  const upload = async (f: File) => {
    setBusy(true)
    try {
      const { url } = await uploadMedia(f)
      insert(`![${f.name.replace(/\.[^.]+$/, '')}](${url})`)
    } catch {
      /* ошибка видна по отсутствию картинки */
    } finally {
      setBusy(false)
    }
  }
  const checkSuggest = (v: string, caret: number) => {
    const m = /\[\[([^\]\n]*)$/.exec(v.slice(0, caret))
    setSuggest(m ? { q: m[1], at: caret - m[1].length } : null)
    setPick(0)
  }
  const options = suggest ? titles.filter((t) => norm(t).includes(norm(suggest.q))).slice(0, 8) : []
  const choose = (t: string) => {
    if (!suggest) return
    const el = ta.current
    const caret = el?.selectionStart ?? suggest.at
    const next = value.slice(0, suggest.at) + t + ']]' + value.slice(caret).replace(/^\]\]/, '')
    onChange(next)
    setSuggest(null)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = suggest.at + t.length + 2
      el?.setSelectionRange(pos, pos)
    })
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggest && options.length) {
      if (e.key === 'ArrowDown') return e.preventDefault(), setPick((p) => (p + 1) % options.length)
      if (e.key === 'ArrowUp') return e.preventDefault(), setPick((p) => (p - 1 + options.length) % options.length)
      if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), choose(options[pick])
      if (e.key === 'Escape') return setSuggest(null)
    }
    if (matches(e, 'kb.bold')) return e.preventDefault(), insert('**', '**', 'жирный')
    if (matches(e, 'kb.italic')) return e.preventDefault(), insert('*', '*', 'курсив')
    if (matches(e, 'kb.link')) return e.preventDefault(), insert('[[', ']]', 'Страница')
  }
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const img = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (img) {
      e.preventDefault()
      void upload(img)
    }
  }
  const TOOLS: { icon: typeof Bold; label: string; run: () => void }[] = [
    { icon: Heading2, label: 'Заголовок', run: () => block('## Заголовок') },
    { icon: Bold, label: 'Жирный (Ctrl+B)', run: () => insert('**', '**', 'жирный') },
    { icon: Italic, label: 'Курсив (Ctrl+I)', run: () => insert('*', '*', 'курсив') },
    { icon: Link2, label: 'Ссылка на страницу (Ctrl+K)', run: () => insert('[[', ']]', 'Страница') },
    { icon: List, label: 'Список', run: () => block('- пункт') },
    { icon: ListChecks, label: 'Задачи', run: () => block('- [ ] дело') },
    { icon: MessageSquareQuote, label: 'Выноска', run: () => block('> [!note] Заголовок\n> Текст') },
    { icon: Table2, label: 'Таблица', run: () => block('| Имя | Где | Что |\n| --- | --- | --- |\n|  |  |  |') },
    { icon: ImagePlus, label: 'Картинка', run: () => file.current?.click() },
    { icon: LayoutDashboard, label: 'Доска с фото', run: () => block('```board\n{"h":420,"items":[]}\n```') },
    { icon: Dices, label: 'Таблица случайностей', run: () => block('```random\nНазвание таблицы\n- первый исход\n- второй исход\n- третий исход\n```') },
  ]
  return (
    <div className="kb-editor">
      <div className="kb-tools" role="toolbar" aria-label="Разметка">
        {TOOLS.map(({ icon: Icon, label, run }) => (
          <button key={label} type="button" onClick={run} title={label} aria-label={label}>
            <Icon aria-hidden="true" />
          </button>
        ))}
        {busy && <span className="kb-tools-busy">загружаем…</span>}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
      </div>
      <div className="kb-textwrap">
        <textarea
          ref={ta}
          className="kb-text"
          value={value}
          spellCheck
          placeholder={'Пишите как в Obsidian: # заголовок, [[ссылка]], - [ ] задача…\nКартинку можно вставить прямо из буфера.'}
          onChange={(e) => (onChange(e.target.value), checkSuggest(e.target.value, e.target.selectionStart))}
          onKeyDown={onKey}
          onPaste={onPaste}
          onClick={(e) => checkSuggest(value, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setSuggest(null), 150)}
        />
        {suggest && options.length > 0 && (
          <ul className="kb-suggest" role="listbox">
            {options.map((t, i) => (
              <li key={t}>
                <button type="button" className={i === pick ? 'is-on' : ''} onMouseDown={(e) => (e.preventDefault(), choose(t))}>
                  <FileText aria-hidden="true" /> {t}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
