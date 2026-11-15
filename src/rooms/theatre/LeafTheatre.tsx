/**
 * Створка ширмы «Сцена»: мастер показывает всем портрет с репликой (существо
 * комнаты, страница кодекса или кто угодно), крупный текст рассказчика или
 * картинку. Новый показ заменяет прежний; «убрать у всех» — здесь же.
 */
import { useState } from 'react'
import { EyeOff, Image as ImageIcon, MessageSquareQuote, Send, Type, Upload } from 'lucide-react'
import { uploadMedia } from '../../api'
import { isFullCreature } from '../../types/rooms'
import { useKnowledge } from '../kb/context'
import { parsePage } from '../kb/mdparse'
import { useRoom } from '../RoomProvider'
import { errText } from '../table/parts'
import { clearTheatre, showTheatre, type TheatreBody, type TheatreKind } from './model'

const KINDS: { id: TheatreKind; label: string; icon: typeof Type }[] = [
  { id: 'speech', label: 'Реплика', icon: MessageSquareQuote },
  { id: 'narration', label: 'Рассказ', icon: Type },
  { id: 'image', label: 'Картинка', icon: ImageIcon },
]

export function LeafTheatre() {
  const { roomId, data } = useRoom()
  const kb = useKnowledge()
  const [kind, setKind] = useState<TheatreKind>('speech')
  const [source, setSource] = useState('custom')
  const [name, setName] = useState('')
  const [portrait, setPortrait] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const creatures = (data?.creatures ?? []).filter(isFullCreature)
  const npcPages = (kb?.notes ?? []).filter((n) => parsePage(n.body).meta.cover || /нпс|npc|персонаж/i.test(`${n.folder ?? ''} ${parsePage(n.body).meta.tags.join(' ')}`))

  const pick = (value: string) => {
    setSource(value)
    const [type, id] = value.split(':')
    if (type === 'creature') {
      const c = creatures.find((x) => x.id === id)
      if (c) {
        setName(c.display_name)
        setPortrait(c.image_url ?? '')
      }
    } else if (type === 'note') {
      const n = kb?.notes?.find((x) => x.id === id)
      if (n) {
        setName(n.title)
        setPortrait(parsePage(n.body).meta.cover ?? '')
      }
    }
  }

  const upload = async (file: File | undefined, set: (url: string) => void) => {
    if (!file) return
    setBusy(true)
    setMsg(null)
    try {
      set((await uploadMedia(file)).url)
    } catch (e) {
      setMsg(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const body = (): TheatreBody => {
    const [type, id] = source.split(':')
    if (kind === 'speech') {
      return { kind, name: name.trim() || null, portrait: portrait.trim() || null, text: text.trim() || null, source_kind: type === 'creature' || type === 'note' ? type : 'custom', source_id: id ?? null }
    }
    if (kind === 'narration') return { kind, title: title.trim() || null, text: text.trim() }
    return { kind, title: title.trim() || null, image: image.trim() }
  }
  const ready = kind === 'speech' ? !!(name.trim() || text.trim()) : kind === 'narration' ? !!text.trim() : !!image.trim()

  const send = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await showTheatre(roomId, body())
      setMsg('Показано всем')
    } catch (e) {
      setMsg(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const clear = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await clearTheatre(roomId)
      setMsg('Показ убран')
    } catch (e) {
      setMsg(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="th-leaf"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !busy) void send()
      }}
    >
      <div className="tb-tri" role="radiogroup" aria-label="Что показать">
        {KINDS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={kind === id} className={kind === id ? 'is-on' : ''} onClick={() => setKind(id)}>
            <Icon aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {kind === 'speech' && (
        <>
          <label className="th-field">
            <span>Кто говорит</span>
            <select className="bt-in" value={source} onChange={(e) => pick(e.target.value)}>
              <option value="custom">кто угодно — впишу сам</option>
              {creatures.length > 0 && (
                <optgroup label="Существа комнаты">
                  {creatures.map((c) => (
                    <option key={c.id} value={`creature:${c.id}`}>
                      {c.display_name}
                    </option>
                  ))}
                </optgroup>
              )}
              {npcPages.length > 0 && (
                <optgroup label="Страницы кодекса">
                  {npcPages.map((n) => (
                    <option key={n.id} value={`note:${n.id}`}>
                      {n.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <div className="th-row">
            <label className="th-field">
              <span>Имя</span>
              <input className="bt-in" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Трактирщик Боб" />
            </label>
            <label className="th-field">
              <span>Портрет</span>
              <span className="th-url">
                <input className="bt-in" value={portrait} maxLength={2000} onChange={(e) => setPortrait(e.target.value)} placeholder="ссылка на картинку" />
                <label className="th-upload" title="Загрузить картинку">
                  <Upload aria-hidden="true" />
                  <input type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0], setPortrait)} />
                </label>
              </span>
            </label>
          </div>
          <label className="th-field">
            <span>Реплика</span>
            <textarea className="bt-in" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Чего изволите, путники?" />
          </label>
        </>
      )}

      {kind === 'narration' && (
        <>
          <label className="th-field">
            <span>Заголовок (необязательно)</span>
            <input className="bt-in" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Глава вторая" />
          </label>
          <label className="th-field">
            <span>Текст</span>
            <textarea className="bt-in" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Наступила ночь, и туман пополз с болот…" />
          </label>
        </>
      )}

      {kind === 'image' && (
        <>
          <label className="th-field">
            <span>Картинка</span>
            <span className="th-url">
              <input className="bt-in" value={image} maxLength={2000} onChange={(e) => setImage(e.target.value)} placeholder="ссылка на картинку или раздаточный материал" />
              <label className="th-upload" title="Загрузить картинку">
                <Upload aria-hidden="true" />
                <input type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0], setImage)} />
              </label>
            </span>
          </label>
          <label className="th-field">
            <span>Подпись (необязательно)</span>
            <input className="bt-in" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Карта сокровищ" />
          </label>
        </>
      )}

      <footer className="th-foot">
        {msg && <em role="status">{msg}</em>}
        <button type="button" className="th-btn" disabled={busy} onClick={() => void clear()}>
          <EyeOff aria-hidden="true" /> <span>убрать у всех</span>
        </button>
        <button type="submit" className="tb-goldbtn" disabled={busy || !ready}>
          <Send aria-hidden="true" /> Показать всем
        </button>
      </footer>
    </form>
  )
}
