/** Панель рисования на карте стола: инструменты, стиль, порядок, очистка, разрешение игрокам */
import { useState } from 'react'
import { ArrowDownToLine, ArrowUpToLine, Circle, Eraser, Eye, EyeOff, Hand, Hexagon, PenLine, Pencil, Square, Trash2, Type, X } from 'lucide-react'
import type { DrawToolApi, DrawTool } from './useDrawTool'

const TOOLS: { id: DrawTool; label: string; icon: typeof Hand }[] = [
  { id: 'select', label: 'Выбор', icon: Hand },
  { id: 'freehand', label: 'От руки', icon: PenLine },
  { id: 'rect', label: 'Прямоугольник', icon: Square },
  { id: 'ellipse', label: 'Эллипс', icon: Circle },
  { id: 'polygon', label: 'Многоугольник', icon: Hexagon },
  { id: 'text', label: 'Текст', icon: Type },
]

const HINT: Record<DrawTool, string> = {
  select: 'Нажмите на рисунок, чтобы выбрать и сдвинуть',
  freehand: 'Ведите по карте — линия сгладится',
  rect: 'Тяните; Shift — квадрат',
  ellipse: 'Тяните; Shift — круг',
  polygon: 'Клики — точки, двойной клик или Enter — готово, правый клик — убрать точку',
  text: 'Нажмите, где будет текст',
}

export function DrawBar({ draw, playersCanDraw, onPlayersCanDraw }: { draw: DrawToolApi; playersCanDraw: boolean; onPlayersCanDraw?: (v: boolean) => void }) {
  const [text, setText] = useState('')
  const { style, setStyle, selected } = draw
  if (!draw.canDraw && draw.mineCount === 0) return null
  return (
    <>
      <button type="button" className={`ly-toggle${draw.active ? ' is-on' : ''}`} onClick={() => draw.setActive(!draw.active)} aria-pressed={draw.active} title="Рисовать на карте" aria-label="Рисовать на карте">
        <Pencil aria-hidden="true" />
      </button>
      {draw.active && (
        <div className="ly-bar" role="toolbar" aria-label="Рисование">
          <div className="ly-row">
            {TOOLS.filter((t) => draw.canDraw || t.id === 'select').map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" className={`ly-tool${draw.tool === id ? ' is-on' : ''}`} aria-pressed={draw.tool === id} title={label} aria-label={label} onClick={() => draw.setTool(id)}>
                <Icon aria-hidden="true" />
              </button>
            ))}
            <button type="button" className="ly-tool" onClick={() => draw.setActive(false)} title="Закончить рисовать" aria-label="Закончить рисовать">
              <X aria-hidden="true" />
            </button>
          </div>
          {draw.canDraw && (
            <div className="ly-row ly-style">
              {draw.tool === 'text' || selected?.kind === 'text' ? (
                <>
                  <label title="Цвет текста">
                    <input type="color" value={style.text_color} onChange={(e) => setStyle({ text_color: e.target.value })} aria-label="Цвет текста" />
                  </label>
                  <label className="ly-range">
                    кегль
                    <input type="range" min={10} max={120} step={2} value={style.font_size} onChange={(e) => setStyle({ font_size: Number(e.target.value) })} aria-label="Размер текста" />
                  </label>
                </>
              ) : (
                <>
                  <label title="Цвет линии">
                    <input type="color" value={style.stroke_color} onChange={(e) => setStyle({ stroke_color: e.target.value })} aria-label="Цвет линии" />
                  </label>
                  <label className="ly-range">
                    толщина
                    <input type="range" min={0} max={24} step={1} value={style.stroke_width} onChange={(e) => setStyle({ stroke_width: Number(e.target.value) })} aria-label="Толщина линии" />
                  </label>
                  <label className="ly-range">
                    прозрачность
                    <input type="range" min={0.1} max={1} step={0.05} value={style.stroke_opacity} onChange={(e) => setStyle({ stroke_opacity: Number(e.target.value) })} aria-label="Непрозрачность линии" />
                  </label>
                  {draw.tool !== 'freehand' && selected?.kind !== 'freehand' && (
                    <>
                      <label className="ly-check">
                        <input type="checkbox" checked={style.fill === 'solid'} onChange={(e) => setStyle({ fill: e.target.checked ? 'solid' : 'none' })} />
                        заливка
                      </label>
                      {style.fill === 'solid' && (
                        <>
                          <label title="Цвет заливки">
                            <input type="color" value={style.fill_color} onChange={(e) => setStyle({ fill_color: e.target.value })} aria-label="Цвет заливки" />
                          </label>
                          <label className="ly-range">
                            <input type="range" min={0.05} max={1} step={0.05} value={style.fill_opacity} onChange={(e) => setStyle({ fill_opacity: Number(e.target.value) })} aria-label="Непрозрачность заливки" />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {draw.textAt && (
            <form
              className="ly-row"
              onSubmit={(e) => {
                e.preventDefault()
                draw.placeText(text)
                setText('')
              }}
            >
              <input className="ly-text" autoFocus value={text} maxLength={500} placeholder="Текст на карте" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && draw.cancelText()} aria-label="Текст на карте" />
              <button type="submit" className="ly-btn">
                Поставить
              </button>
            </form>
          )}
          {selected && (
            <div className="ly-row">
              {draw.isDm && (
                <>
                  <button type="button" className="ly-tool" onClick={() => draw.toggleHidden(selected)} title={selected.hidden ? 'Показать игрокам' : 'Скрыть от игроков'} aria-label={selected.hidden ? 'Показать игрокам' : 'Скрыть от игроков'}>
                    {selected.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                  <button type="button" className="ly-tool" onClick={() => draw.reorder(selected, 'front')} title="Вперёд" aria-label="На передний план">
                    <ArrowUpToLine aria-hidden="true" />
                  </button>
                  <button type="button" className="ly-tool" onClick={() => draw.reorder(selected, 'back')} title="Назад" aria-label="На задний план">
                    <ArrowDownToLine aria-hidden="true" />
                  </button>
                </>
              )}
              <button type="button" className="ly-tool is-danger" onClick={() => draw.remove(selected.id)} title="Стереть рисунок" aria-label="Стереть рисунок">
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          )}
          <p className="ly-hint">{draw.canDraw ? HINT[draw.tool] : 'Мастер не разрешил рисовать: свои рисунки можно только стереть'}</p>
          <div className="ly-row">
            <button type="button" className="ly-btn" disabled={draw.mineCount === 0} onClick={() => confirm(`Стереть ваши рисунки на этой карте (${draw.mineCount})?`) && draw.clear('mine')}>
              <Eraser aria-hidden="true" /> Очистить мои
            </button>
            {draw.isDm && (
              <button type="button" className="ly-btn is-danger" onClick={() => confirm('Стереть все рисунки на этой карте, включая рисунки игроков?') && draw.clear('all')}>
                Очистить все
              </button>
            )}
          </div>
          {draw.isDm && onPlayersCanDraw && (
            <label className="ly-check">
              <input type="checkbox" checked={playersCanDraw} onChange={(e) => onPlayersCanDraw(e.target.checked)} />
              Игроки могут рисовать
            </label>
          )}
        </div>
      )}
    </>
  )
}
