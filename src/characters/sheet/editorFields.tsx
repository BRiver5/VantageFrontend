import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  ImagePlus,
  Trash2,
} from 'lucide-react'
import { imageFileToDataUrl } from '../../create/flavor'
import { EdField } from '../editorFields'
import { XP_TABLE, fmtXp } from './editorData'

/** Картинка ссылкой или файлом с устройства (файл ужимается и встраивается в лист) */
export function ImageSource({
  label,
  value,
  maxSide,
  onChange,
}: {
  label: string
  value: string | null
  maxSide: number
  onChange: (next: string | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const embedded = !!value?.startsWith('data:')
  const take = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      onChange(await imageFileToDataUrl(file, maxSide))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить картинку')
    }
  }
  return (
    <EdField label={label} wide hint={embedded ? 'загружено с устройства' : undefined}>
      <span className="ed-img-src">
        <input
          className="ed-input"
          value={embedded ? '' : (value ?? '')}
          placeholder={embedded ? 'вставьте ссылку, чтобы заменить' : 'https://…'}
          onChange={(e) => onChange(e.target.value.trim() || null)}
        />
        <button type="button" className="ed-btn" onClick={() => fileRef.current?.click()}>
          <ImagePlus aria-hidden="true" /> файл
        </button>
        {value && (
          <button type="button" className="ed-btn ed-btn--icon is-danger" onClick={() => onChange(null)} title="Убрать" aria-label="Убрать картинку">
            <Trash2 aria-hidden="true" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </span>
      {error && <span className="ed-error">{error}</span>}
    </EdField>
  )
}

/**
 * Опыт — просто число. Рядом — таблица развития: какой уровень даёт этот опыт.
 * Уровень героя она не меняет; клик по строке лишь вписывает порог опыта.
 */
export function XpField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const byXp = XP_TABLE.findLastIndex((x) => value >= x) + 1
  const ref = useRef<HTMLDivElement>(null)
  // клик мимо таблицы закрывает её
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <EdField label="Опыт" hint={`по опыту — ${byXp} ур.`} className="ed-xp-field">
      <span className="ed-img-src">
        <input
          className="ed-input"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0))}
          aria-label="Опыт"
        />
        <button type="button" className={`ed-btn${open ? ' is-on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <BookOpen aria-hidden="true" /> таблица
        </button>
      </span>
      {open && (
        <div className="ed-xp" ref={ref}>
          <div className="ed-xp-row ed-xp-head">
            <span>Опыт</span>
            <span>Уровень</span>
          </div>
          {XP_TABLE.map((xp, i) => (
            <button
              key={xp}
              type="button"
              className={`ed-xp-row${i + 1 === byXp ? ' is-on' : ''}`}
              onClick={() => onChange(xp)}
              title="Вписать этот порог опыта"
            >
              <span>{fmtXp(xp)}</span>
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </EdField>
  )
}
