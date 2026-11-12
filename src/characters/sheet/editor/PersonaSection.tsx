/** Раздел «Личность»: черты характера, идеалы, история, заметки */
import { NotebookPen } from 'lucide-react'
import type { Character } from '../../../types/character'
import { AreaField, EdSection } from '../../editorFields'

export function PersonaSection({ c, set }: { c: Character; set: (patch: Partial<Character>) => void }) {
  return (
    <EdSection id="persona" icon={NotebookPen} title="Личность" lead="То же, что на странице «Характер».">
      <div className="ed-grid ed-grid--two">
        {(
          [
            ['traits', 'Черты характера'],
            ['ideals', 'Идеалы'],
            ['bonds', 'Привязанности'],
            ['flaws', 'Слабости'],
          ] as const
        ).map(([key, label]) => (
          <AreaField
            key={key}
            label={label}
            rows={3}
            value={c.personality[key]}
            onChange={(v) => set({ personality: { ...c.personality, [key]: v } })}
          />
        ))}
      </div>
      <div className="ed-grid">
        <AreaField label="История" rows={6} value={c.backstory} onChange={(v) => set({ backstory: v })} />
        <AreaField label="Заметки" rows={5} value={c.notes} onChange={(v) => set({ notes: v })} />
      </div>
    </EdSection>
  )
}
