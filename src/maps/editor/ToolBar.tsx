/** Панель инструментов конструктора */
import type { ReactNode } from 'react'
import { Boxes, DoorOpen, Gem, Hand, Hexagon, Lightbulb, Mountain, PenLine, RectangleHorizontal, UserRound } from 'lucide-react'
import type { Pt } from '../types'
import type { Tool } from './types'

export function ToolBar({ tool, setTool, setDraft }: { tool: Tool; setTool: (t: Tool) => void; setDraft: (d: Pt[]) => void }) {
  const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
    { id: 'select', label: 'Выбор', key: 'V', icon: <Hand aria-hidden="true" /> },
    { id: 'wall', label: 'Стена', key: 'W', icon: <PenLine aria-hidden="true" /> },
    { id: 'door', label: 'Дверь', key: 'D', icon: <DoorOpen aria-hidden="true" /> },
    { id: 'window', label: 'Окно', key: 'N', icon: <RectangleHorizontal aria-hidden="true" /> },
    { id: 'asset', label: 'Ассеты', key: 'O', icon: <Boxes aria-hidden="true" /> },
    { id: 'terrain', label: 'Рельеф', key: 'H', icon: <Mountain aria-hidden="true" /> },
    { id: 'light', label: 'Свет', key: 'L', icon: <Lightbulb aria-hidden="true" /> },
    { id: 'zone', label: 'Зона', key: 'Z', icon: <Hexagon aria-hidden="true" /> },
    { id: 'token', label: 'Жетон', key: 'T', icon: <UserRound aria-hidden="true" /> },
    { id: 'item', label: 'Находка', key: 'I', icon: <Gem aria-hidden="true" /> },
  ]
  return (
    <nav className="me-tools" aria-label="Инструменты">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'is-on' : ''}
          aria-pressed={tool === t.id}
          onClick={() => {
            setTool(t.id)
            setDraft([])
          }}
          title={`${t.label} (${t.key})`}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
