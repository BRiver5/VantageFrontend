/** Раздел «Заклинания»: поиск в каталоге и список по кругам */
import { Trash2, Wand2 } from 'lucide-react'
import type { Spell } from '../../../api'
import type { Character, SpellKnown } from '../../../types/character'
import { AutoNum, CatalogSearch, EdSection, Toggle } from '../../editorFields'
import type { CombatField } from '../editorData'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

type Props = {
  c: Character
  spellCatalog: Spell[]
  knownSpellNames: Set<string>
  spellsByCircle: { s: SpellKnown; i: number }[][]
  setSpells: (fn: (list: SpellKnown[]) => SpellKnown[]) => void
  /** максимум ячеек по путям slots.* — авто или вручную */
  slots: Record<string, CombatField>
  setSlot: (path: string, field: CombatField) => void
}

export function MagicSection({ c, spellCatalog, knownSpellNames, spellsByCircle, setSpells, slots, setSlot }: Props) {
  const slotField = (path: string, label: string, max: number) => {
    const f = slots[path]
    if (!f) return null
    return (
      <AutoNum
        key={path}
        label={label}
        auto={f.auto}
        computed={f.computed}
        value={f.value}
        min={0}
        max={max}
        onAuto={(auto) => setSlot(path, { ...f, auto, value: auto ? f.computed : f.value })}
        onChange={(v) => setSlot(path, { ...f, auto: false, value: v })}
      />
    )
  }
  return (
    <EdSection
      id="magic"
      icon={Wand2}
      title="Заклинания"
      lead="Известные и подготовленные заклинания и ячейки. Ячейки сервер считает по классам — у мультикласса или по решению мастера их можно вписать вручную."
    >
      <div className="ed-sub">
        <h5>Ячейки заклинаний</h5>
        <div className="ed-grid">{Array.from({ length: 9 }, (_, i) => slotField(`slots.spell.${i + 1}.max`, `${ROMAN[i + 1]} круг`, 9))}</div>
        <div className="ed-grid">
          {slotField('slots.pact.max', 'Ячейки договора', 9)}
          {slotField('slots.pact.level', 'Круг ячеек договора', 5)}
        </div>
      </div>
      <div className="ed-sub">
        <h5>Список заклинаний</h5>
      <CatalogSearch
        items={spellCatalog}
        label={(s) => s.spell_name}
        sub={(s) => [s.spell_level === 0 ? 'заговор' : `${s.spell_level} круг`, s.school].filter(Boolean).join(' · ')}
        exclude={knownSpellNames}
        placeholder="Найти заклинание в каталоге и добавить…"
        onPick={(s) =>
          setSpells((list) => [
            ...list,
            { name: s.spell_name, level: s.spell_level, prepared: true, spell_source: s.spell_source ?? null, snapshot: { spell_id: s.id } },
          ])
        }
      />
      <div className="ed-spells">
        {spellsByCircle.map((list, lvl) =>
          list.length === 0 ? null : (
            <div key={lvl} className="ed-spell-group">
              <span className="ed-spell-circle">{lvl === 0 ? '◈ Заговоры' : `${ROMAN[lvl]} · ${lvl} круг`}</span>
              {list.map(({ s, i }) => {
                const granted = (s.snapshot as { granted?: string } | null)?.granted
                return (
                  <div key={`${s.name}-${i}`} className={`ed-spell${s.prepared ? '' : ' is-off'}`}>
                    <b>{s.name}</b>
                    {granted && <em>{granted === 'race' ? 'раса' : 'подкласс'}</em>}
                    {lvl > 0 && (
                      <Toggle
                        on={s.prepared}
                        onChange={(v) => setSpells((all) => all.map((x, j) => (j === i ? { ...x, prepared: v } : x)))}
                        label="подготовлено"
                      />
                    )}
                    <button
                      type="button"
                      className="ed-btn ed-btn--icon is-danger"
                      onClick={() => setSpells((all) => all.filter((_, j) => j !== i))}
                      title="Убрать заклинание"
                      aria-label="Убрать заклинание"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
            </div>
          ),
        )}
        {c.spells.length === 0 && <p className="ed-empty">Заклинаний нет — найдите их в каталоге выше.</p>}
      </div>
      </div>
    </EdSection>
  )
}
