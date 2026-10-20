/** Шаг 3 — класс: карточки с артом, костью хитов и спасбросками. */
import { useMemo, useState } from 'react'
import { Search, Shield, Sparkles, Swords } from 'lucide-react'
import { descriptionPreview, realImage } from '../../api'
import type { GameClass } from '../../api'
import { DieChipIcon, DieImage, hitDieType } from '../../dice/diceAssets'
import { CLASS_PRIMARY_ABILITY, casterKind, classSkillChoice } from '../dnd5e'
import { emptyLevelChoice, type StepProps } from '../draft'
import { ChoiceCard, FactChip, StepHeader, StepPanel, StepStatus } from './ui'
import { useCatalogList } from '../useCatalog'
import { DEFAULT_SKILLS } from '../../types/character'

const SKILL_LABEL = new Map(DEFAULT_SKILLS.map((s) => [s.key, s.label]))

function ClassDossier({ cls }: { cls: GameClass }) {
  const kind = casterKind(cls.class_name, cls.is_caster)
  const skills = classSkillChoice(cls.class_name)

  return (
    <StepPanel className="cw-dossier">
      <div className="cw-dossier-die">
        <DieImage type={hitDieType(cls.hit_dice)} size={74} />
        <span className="cw-dossier-die-label">к{cls.hit_dice}</span>
      </div>
      <h3 className="cw-dossier-name gold-text">{cls.class_name}</h3>
      <div className="cw-card-chips cw-dossier-chips">
        {CLASS_PRIMARY_ABILITY[cls.class_name] && (
          <FactChip icon={Swords}>{CLASS_PRIMARY_ABILITY[cls.class_name]}</FactChip>
        )}
        {kind !== 'none' && <FactChip icon={Sparkles}>заклинатель</FactChip>}
      </div>
      {cls.saving_throw_proficiencies && cls.saving_throw_proficiencies.length > 0 && (
        <p className="cw-dossier-line">
          <Shield aria-hidden="true" /> Спасброски: {cls.saving_throw_proficiencies.join(', ')}
        </p>
      )}
      <p className="cw-dossier-line">
        Навыков на выбор: {skills.count} из{' '}
        {skills.options.map((k) => SKILL_LABEL.get(k) ?? k).join(', ')}
      </p>
      {cls.armor_proficiencies && cls.armor_proficiencies.length > 0 && (
        <p className="cw-dossier-line">Броня: {cls.armor_proficiencies.join(', ')}</p>
      )}
      {cls.weapon_proficiencies && cls.weapon_proficiencies.length > 0 && (
        <p className="cw-dossier-line">Оружие: {cls.weapon_proficiencies.join(', ')}</p>
      )}
      <p className="cw-dossier-desc">{descriptionPreview(cls.description, 600)}</p>
    </StepPanel>
  )
}

export default function ClassStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<GameClass>('classes')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    const list = q
      ? items.filter((c) => c.class_name.toLocaleLowerCase('ru').includes(q))
      : items
    return [...list].sort((a, b) => a.class_name.localeCompare(b.class_name, 'ru'))
  }, [items, query])

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader
        kicker="ступень третья"
        title="Чьё ремесло ты избрал?"
        lead="Класс определяет кость хитов, спасброски, владения и — если он заклинатель — магию."
      />

      <label className="cw-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Искать класс…"
          aria-label="Поиск класса"
        />
      </label>

      <StepStatus loading={loading} error={error} />

      <div className="cw-layout">
        <div className="cw-grid">
          {visible.map((cls) => (
            <ChoiceCard
              key={cls.id}
              art={realImage(cls.image_gallery)}
              icon={Swords}
              name={cls.class_name}
              meta={CLASS_PRIMARY_ABILITY[cls.class_name] ?? null}
              chips={
                <>
                  <FactChip>
                    <DieChipIcon type={hitDieType(cls.hit_dice)} /> к{cls.hit_dice}
                  </FactChip>
                  {cls.is_caster && <FactChip icon={Sparkles}>магия</FactChip>}
                </>
              }
              description={descriptionPreview(cls.description, 140)}
              selected={draft.cls?.id === cls.id}
              onSelect={() =>
                // новый класс обнуляет подкласс и все решения по уровням:
                // навыки, заклинания и усиления у него свои
                update({
                  cls,
                  subclass: null,
                  levels: Array.from({ length: draft.targetLevel }, (_, i) =>
                    emptyLevelChoice(i + 1),
                  ),
                })
              }
            />
          ))}
        </div>

        {draft.cls && <ClassDossier cls={draft.cls} />}
      </div>
    </div>
  )
}
