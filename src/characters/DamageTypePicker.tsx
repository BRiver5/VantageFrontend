/**
 * Тип урона для кнопки «Нанести урон»: у каждого типа свой знак и цвет.
 * Список открывается порталом — панель хитов обрезана clip-path и спрятала бы
 * всё, что выходит за её край.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  AudioWaveform,
  Axe,
  Ban,
  Biohazard,
  Brain,
  ChevronDown,
  Flame,
  FlaskConical,
  Hammer,
  Skull,
  Snowflake,
  Sparkles,
  Sun,
  Sword,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface DamageStyle {
  icon: LucideIcon
  /** цвет в виде «r, g, b» — из него и текст, и подсветка */
  tone: string
}

/** Ключ — английское значение движка или начало русской подписи */
const STYLES: [string[], DamageStyle][] = [
  [['bludgeoning', 'дроб'], { icon: Hammer, tone: '201, 206, 214' }],
  [['piercing', 'колю'], { icon: Sword, tone: '214, 196, 160' }],
  [['slashing', 'руб'], { icon: Axe, tone: '226, 150, 132' }],
  [['thunder', 'звук', 'гром'], { icon: AudioWaveform, tone: '150, 178, 255' }],
  [['radiant', 'излуч'], { icon: Sun, tone: '255, 222, 128' }],
  [['acid', 'кисл'], { icon: FlaskConical, tone: '196, 232, 90' }],
  [['necrotic', 'некро'], { icon: Skull, tone: '170, 140, 220' }],
  [['fire', 'огон', 'огн'], { icon: Flame, tone: '255, 138, 76' }],
  [['cold', 'холод'], { icon: Snowflake, tone: '140, 216, 255' }],
  [['lightning', 'электр', 'молни'], { icon: Zap, tone: '126, 170, 255' }],
  [['poison', 'яд'], { icon: Biohazard, tone: '120, 214, 120' }],
  [['psychic', 'псих'], { icon: Brain, tone: '240, 138, 216' }],
  [['force', 'силов'], { icon: Sparkles, tone: '199, 155, 255' }],
]
const NEUTRAL: DamageStyle = { icon: Ban, tone: '168, 175, 186' }

export function damageStyle(value: string, label = ''): DamageStyle {
  const keys = [value.toLowerCase(), label.toLocaleLowerCase('ru')]
  for (const [names, style] of STYLES) {
    if (names.some((n) => keys.some((k) => k === n || k.startsWith(n)))) return style
  }
  return NEUTRAL
}

export function DamageTypePicker({
  types,
  value,
  onChange,
}: {
  types: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const current = types.find((t) => t.value === value) ?? null
  const style = current ? damageStyle(current.value, current.label) : null
  const Icon = style?.icon

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // полширины списка (300px) + поле — чтобы он не вылез за край окна
    const half = 158
    const left = Math.min(Math.max(r.left + r.width / 2, half), window.innerWidth - half)
    setPos({ left, top: r.bottom + 6 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    // список привязан к кнопке — при прокрутке проще закрыть, чем догонять
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  useEffect(() => {
    if (open) popRef.current?.querySelector<HTMLButtonElement>('.is-on, button')?.focus()
  }, [open, pos])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    btnRef.current?.focus()
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`cw-dmg-trigger${current ? ' is-set' : ''}`}
        style={style ? ({ '--tone': style.tone } as CSSProperties) : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Тип урона: сопротивления и иммунитеты учтутся"
      >
        {Icon && <Icon aria-hidden="true" />}
        <span>{current?.label ?? 'тип урона'}</span>
        <ChevronDown className="cw-dmg-chev" aria-hidden="true" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className="cw-dmg-pop"
            role="listbox"
            aria-label="Тип урона"
            style={{ left: pos.left, top: pos.top }}
          >
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              className={`cw-dmg-opt cw-dmg-opt--none${value === '' ? ' is-on' : ''}`}
              style={{ '--tone': NEUTRAL.tone } as CSSProperties}
              onClick={() => pick('')}
            >
              <Ban aria-hidden="true" />
              <span>без типа</span>
            </button>
            {types.map((t) => {
              const s = damageStyle(t.value, t.label)
              const OptIcon = s.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  role="option"
                  aria-selected={value === t.value}
                  className={`cw-dmg-opt${value === t.value ? ' is-on' : ''}`}
                  style={{ '--tone': s.tone } as CSSProperties}
                  onClick={() => pick(t.value)}
                >
                  <OptIcon aria-hidden="true" />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
