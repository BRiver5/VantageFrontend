import { NotebookPen, UserRound } from 'lucide-react'
import type { SheetView } from '../../types/character'
import type { SheetPatch } from '../sheetPlay'
import { PERSONA_FIELDS } from './rules'
import { Card } from './parts'

/** Живой лист: черты, история и заметки правятся прямо в карточке */
export function PersonaEditCard({ sheet, onPatch }: { sheet: SheetView; onPatch: SheetPatch }) {
  return (
    <Card title="Характер и записи" icon={NotebookPen} className="cw-sheet-card--persona">
      <div className="cw-persona-edit">
        {PERSONA_FIELDS.map(([key, label]) => (
          <label key={key} className="cw-field">
            <span>{label}</span>
            <textarea
              rows={3}
              value={sheet.personality[key]}
              placeholder={`${label}…`}
              onChange={(e) => onPatch((c) => ({ ...c, personality: { ...c.personality, [key]: e.target.value } }))}
            />
          </label>
        ))}
        <label className="cw-field cw-field--wide">
          <span>История</span>
          <textarea
            rows={5}
            value={sheet.backstory}
            placeholder="Откуда герой и что привело его в путь…"
            onChange={(e) => onPatch((c) => ({ ...c, backstory: e.target.value }))}
          />
        </label>
        <label className="cw-field cw-field--wide">
          <span>Заметки</span>
          <textarea
            rows={5}
            value={sheet.notes}
            placeholder="Квесты, имена, долги, подсказки мастера…"
            onChange={(e) => onPatch((c) => ({ ...c, notes: e.target.value }))}
          />
        </label>
      </div>
    </Card>
  )
}

/** Витрина: только заполненные поля характера */
export function PersonaCard({ persona }: { persona: (readonly [string, string])[] }) {
  return (
    <Card title="Характер" icon={UserRound} className="cw-sheet-card--persona">
      <dl className="cw-profs">
        {persona.map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
