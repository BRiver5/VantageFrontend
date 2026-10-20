/**
 * Сцены награды: полноэкранные вспышки на каждое приобретение персонажа —
 * новый уровень, хиты, ячейка заклинаний, заклинание, навык, усиление
 * характеристики, умение класса или подкласса.
 *
 * Визуально это продолжение оверлея результата броска (dice-reveal): та же
 * золотая рамка, искры и звук появления числа. Сцены играются очередью, их
 * можно пропустить кнопкой или Esc.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Award,
  BookOpen,
  Heart,
  Shield,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
} from 'lucide-react'
import { Corners } from '../ornaments'
import { playAddResult } from '../dice/diceSounds'
import { ABILITY_LABELS } from '../types/character'
import type { AbilityName } from '../types/character'

export type CelebrationScene =
  | { kind: 'level'; level: number; className: string }
  | { kind: 'hp'; amount: number; total: number }
  | { kind: 'slot'; circle: number; count: number }
  | { kind: 'spell'; name: string; circle: number }
  | { kind: 'cantrip'; name: string }
  | { kind: 'skill'; name: string }
  | { kind: 'ability'; ability: AbilityName; from: number; to: number }
  | { kind: 'feature'; name: string; origin: 'class' | 'subclass' }
  | { kind: 'feat'; name: string }
  | { kind: 'subclass'; name: string }

const SPARK_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

/** Сколько держится одна сцена */
const SCENE_MS = 2400
const SCENE_MS_SHORT = 900

interface SceneView {
  kicker: string
  hero: ReactNode
  note: string | null
  icon: ReactNode
  /** крупная сцена с числом — для неё искры ярче */
  numeric: boolean
}

function ordinal(circle: number): string {
  return circle === 0 ? 'заговор' : `${circle} круг`
}

function sceneView(scene: CelebrationScene): SceneView {
  switch (scene.kind) {
    case 'level':
      return {
        kicker: `${scene.className} — новый уровень`,
        hero: <span className="celebrate-value">{scene.level}</span>,
        note: 'Ступень мастерства пройдена',
        icon: <Star aria-hidden="true" />,
        numeric: true,
      }
    case 'hp':
      return {
        kicker: 'Запас жизни растёт',
        hero: <span className="celebrate-value">+{scene.amount}</span>,
        note: `Максимум хитов — ${scene.total}`,
        icon: <Heart aria-hidden="true" />,
        numeric: true,
      }
    case 'slot':
      return {
        kicker: `Ячейки заклинаний · ${ordinal(scene.circle)}`,
        hero: (
          <span className="celebrate-slots">
            {Array.from({ length: Math.min(scene.count, 6) }, (_, i) => (
              <span key={i} className="celebrate-slot-gem" />
            ))}
          </span>
        ),
        note: `Доступно ячеек: ${scene.count}`,
        icon: <Sparkles aria-hidden="true" />,
        numeric: false,
      }
    case 'spell':
      return {
        kicker: `Новое заклинание · ${ordinal(scene.circle)}`,
        hero: <span className="celebrate-name">{scene.name}</span>,
        note: 'Вписано в книгу заклинаний',
        icon: <Sparkles aria-hidden="true" />,
        numeric: false,
      }
    case 'cantrip':
      return {
        kicker: 'Новый заговор',
        hero: <span className="celebrate-name">{scene.name}</span>,
        note: 'Творится без затрат ячеек',
        icon: <Sparkles aria-hidden="true" />,
        numeric: false,
      }
    case 'skill':
      return {
        kicker: 'Новое владение навыком',
        hero: <span className="celebrate-name">{scene.name}</span>,
        note: 'Бонус мастерства теперь применяется',
        icon: <Award aria-hidden="true" />,
        numeric: false,
      }
    case 'ability': {
      const label = ABILITY_LABELS[scene.ability]
      return {
        kicker: `Усиление: ${label.label}`,
        hero: (
          <span className="celebrate-ability">
            <span className="celebrate-ability-from">{scene.from}</span>
            <span className="celebrate-ability-arrow" aria-hidden="true">⟶</span>
            <span className="celebrate-value">{scene.to}</span>
          </span>
        ),
        note: label.abbr,
        icon: <TrendingUp aria-hidden="true" />,
        numeric: true,
      }
    }
    case 'feature':
      return {
        kicker: scene.origin === 'subclass' ? 'Умение подкласса' : 'Классовое умение',
        hero: <span className="celebrate-name">{scene.name}</span>,
        note: null,
        icon: scene.origin === 'subclass' ? <Shield aria-hidden="true" /> : <Swords aria-hidden="true" />,
        numeric: false,
      }
    case 'feat':
      return {
        kicker: 'Получена черта',
        hero: <span className="celebrate-name">{scene.name}</span>,
        note: null,
        icon: <Award aria-hidden="true" />,
        numeric: false,
      }
    case 'subclass':
      return {
        kicker: 'Путь избран',
        hero: <span className="celebrate-name">{scene.name}</span>,
        note: 'Подкласс определён',
        icon: <BookOpen aria-hidden="true" />,
        numeric: false,
      }
  }
}

export default function CelebrationOverlay({
  scenes,
  onClose,
}: {
  scenes: CelebrationScene[]
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const next = useCallback(() => {
    clearTimer()
    setIndex((i) => {
      if (i + 1 >= scenes.length) {
        onClose()
        return i
      }
      return i + 1
    })
  }, [clearTimer, onClose, scenes.length])

  const skipAll = useCallback(() => {
    clearTimer()
    onClose()
  }, [clearTimer, onClose])

  // автопрокрутка очереди
  useEffect(() => {
    if (scenes.length === 0) {
      onClose()
      return
    }
    playAddResult()
    timer.current = setTimeout(next, reducedMotion ? SCENE_MS_SHORT : SCENE_MS)
    return clearTimer
  }, [index, scenes.length, next, clearTimer, onClose, reducedMotion])

  // Esc пропускает всю очередь, фон не прокручивается
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipAll()
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        next()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [skipAll, next])

  const scene = scenes[index]
  if (!scene) return null

  const view = sceneView(scene)
  const portalTarget = document.getElementById('root') ?? document.body

  return createPortal(
    <div
      className="celebrate-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={view.kicker}
      onClick={next}
    >
      <div className="celebrate-frame" aria-hidden="true">
        <Corners size={52} gold />
        <span className="dice-reveal-edge dice-reveal-edge--top" />
        <span className="dice-reveal-edge dice-reveal-edge--bottom" />
        <span className="dice-reveal-edge dice-reveal-edge--left" />
        <span className="dice-reveal-edge dice-reveal-edge--right" />
      </div>

      <div className="celebrate-content" key={`${index}-${scene.kind}`}>
        <span className="celebrate-icon" aria-hidden="true">{view.icon}</span>
        <p className="celebrate-kicker gold-text" role="status" aria-live="polite">
          {view.kicker}
        </p>

        <div className={`celebrate-hero${view.numeric ? ' celebrate-hero--numeric' : ''}`}>
          {!reducedMotion && (
            <span className="celebrate-burst" aria-hidden="true">
              {SPARK_ANGLES.map((deg) => (
                <span
                  key={deg}
                  className="dice-spark"
                  style={{ '--spark-angle': `${deg}deg` } as CSSProperties}
                />
              ))}
              <span className="dice-reveal-flash" />
            </span>
          )}
          {view.hero}
        </div>

        {view.note && <p className="celebrate-note">{view.note}</p>}

        {scenes.length > 1 && (
          <p className="celebrate-progress" aria-hidden="true">
            {index + 1} / {scenes.length}
          </p>
        )}
      </div>

      <button
        type="button"
        className="dice-reveal-skip celebrate-skip"
        onClick={(e) => {
          e.stopPropagation()
          skipAll()
        }}
      >
        Пропустить
      </button>
    </div>,
    portalTarget,
  )
}
