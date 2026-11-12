/** Шапка конструктора: название, состояние сохранения, отмена, сохранить, закрыть */
import { Redo2, Save, Undo2, X } from 'lucide-react'
import type { PatchProps, SaveState } from './types'

export function EditorHeader({ name, state, patchProps, save, onClose }: { name: string; state: SaveState; patchProps: PatchProps; save: () => Promise<void>; onClose: () => void }) {
  return (
    <header className="me-head">
      <input className="me-name" defaultValue={name} aria-label="Название карты" onBlur={(e) => e.target.value.trim() && e.target.value !== name && void patchProps({ name: e.target.value.trim() })} />
      <span className={`me-state is-${state}`}>{{ saved: 'сохранено', dirty: 'есть правки', saving: 'сохраняем…', error: 'ошибка' }[state]}</span>
      <button type="button" className="tb-round" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))} aria-label="Отменить" title="Отменить (Ctrl+Z)">
        <Undo2 aria-hidden="true" />
      </button>
      <button type="button" className="tb-round" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }))} aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)">
        <Redo2 aria-hidden="true" />
      </button>
      <button type="button" className="tb-round" disabled={state === 'saved' || state === 'saving'} onClick={() => void save()} aria-label="Сохранить" title="Сохранить сейчас">
        <Save aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tb-round"
        onClick={async () => {
          await save()
          onClose()
        }}
        aria-label="Закрыть конструктор"
      >
        <X aria-hidden="true" />
      </button>
    </header>
  )
}
