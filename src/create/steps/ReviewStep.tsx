/**
 * Шаг 9 — итог. Показывает ровно то, что уйдёт на сервер: лист собирается тем
 * же buildCharacter, что и при создании, поэтому сюрпризов в редакторе не будет.
 */
import { useMemo } from 'react'
import {
  Award,
  Footprints,
  Heart,
  Languages,
  Shield,
  Sparkles,
  Swords,
  UserRound,
} from 'lucide-react'
import { ABILITY_LABELS, DEFAULT_SKILLS } from '../../types/character'
import { abilityMod, formatMod } from '../dnd5e'
import { buildCharacter } from '../deriveCharacter'
import type { StepProps } from '../draft'
import type { ClassBundle } from '../useClassBundle'
import type { FeatureEntry } from '../../classArticle'
import { ChoiceArt, FactChip, StepHeader, StepPanel } from './ui'

const SKILL_LABEL = new Map(DEFAULT_SKILLS.map((s) => [s.key, s.label]))

export default function ReviewStep({
  draft,
  bundle,
  subclassFeatures,
}: StepProps & { bundle: ClassBundle | null; subclassFeatures: FeatureEntry[] }) {
  const sheet = useMemo(
    () =>
      buildCharacter({
        draft,
        classFeatures: bundle?.features ?? [],
        subclassFeatures,
      }),
    [draft, bundle, subclassFeatures],
  )

  const skills = Object.entries(sheet.skills)
    .filter(([, v]) => v.proficient)
    .map(([k]) => SKILL_LABEL.get(k) ?? k)

  const slots = Object.entries(sheet.spellcasting.spell_slots)
    .sort((a, b) => Number(a[0]) - Number(b[0]))

  return (
    <div className="cw-step">
      <StepHeader
        kicker="ступень девятая"
        title="Герой готов"
        lead="Проверьте лист — после создания его можно будет править в редакторе."
      />

      <div className="cw-review">
        <StepPanel className="cw-review-hero">
          <ChoiceArt src={draft.avatarUrl.trim() || null} icon={UserRound} />
          <h3 className="cw-dossier-name gold-text">{sheet.basic_info.name}</h3>
          <p className="cw-dossier-line">
            {[
              sheet.basic_info.race.name,
              sheet.basic_info.subrace?.name,
              `${sheet.basic_info.classes[0].name} ${sheet.basic_info.total_level} ур.`,
              sheet.basic_info.classes[0].subclass_name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {sheet.basic_info.background && (
            <p className="cw-dossier-line">Предыстория: {sheet.basic_info.background.name}</p>
          )}
          <div className="cw-card-chips cw-dossier-chips">
            <FactChip icon={Heart}>{sheet.combat.hit_points.max} хитов</FactChip>
            <FactChip icon={Shield}>КД {sheet.combat.armor_class}</FactChip>
            <FactChip icon={Footprints}>{sheet.combat.speed} фт.</FactChip>
            <FactChip icon={Award}>мастерство +{sheet.proficiency_bonus}</FactChip>
            <FactChip>кости хитов {sheet.combat.hit_dice.total}</FactChip>
          </div>
        </StepPanel>

        <StepPanel className="cw-review-abilities">
          <h4 className="cw-block-title">Характеристики</h4>
          <div className="cw-review-ability-grid">
            {Object.entries(sheet.ability_scores).map(([key, block]) => {
              const label = ABILITY_LABELS[key as keyof typeof ABILITY_LABELS]
              return (
                <div key={key} className="cw-review-ability">
                  <span className="cw-review-ability-abbr">{label.abbr}</span>
                  <b>{block.score}</b>
                  <em>{formatMod(abilityMod(block.score))}</em>
                  {block.saving_throw_proficient && (
                    <i className="cw-review-save" title="Владение спасброском">
                      спасбросок
                    </i>
                  )}
                </div>
              )
            })}
          </div>
        </StepPanel>
      </div>

      <div className="cw-review-cols">
        <StepPanel>
          <h4 className="cw-block-title">
            <Award aria-hidden="true" /> Владения
          </h4>
          {skills.length > 0 && <p className="cw-dossier-line">Навыки: {skills.join(', ')}</p>}
          {sheet.proficiencies.armor.length > 0 && (
            <p className="cw-dossier-line">Броня: {sheet.proficiencies.armor.join(', ')}</p>
          )}
          {sheet.proficiencies.weapons.length > 0 && (
            <p className="cw-dossier-line">Оружие: {sheet.proficiencies.weapons.join(', ')}</p>
          )}
          {sheet.proficiencies.tools.length > 0 && (
            <p className="cw-dossier-line">Инструменты: {sheet.proficiencies.tools.join(', ')}</p>
          )}
          {sheet.proficiencies.languages.length > 0 && (
            <p className="cw-dossier-line">
              <Languages aria-hidden="true" /> {sheet.proficiencies.languages.join(', ')}
            </p>
          )}
          {sheet.feats.length > 0 && (
            <p className="cw-dossier-line">Черты: {sheet.feats.join(', ')}</p>
          )}
        </StepPanel>

        {sheet.spellcasting.is_spellcaster && (
          <StepPanel>
            <h4 className="cw-block-title">
              <Sparkles aria-hidden="true" /> Магия
            </h4>
            <p className="cw-dossier-line">
              Сл. спасброска {sheet.spellcasting.spell_save_dc} · атака заклинанием{' '}
              {formatMod(sheet.spellcasting.spell_attack_bonus ?? 0)}
            </p>
            {slots.length > 0 && (
              <div className="cw-card-chips">
                {slots.map(([circle, slot]) => (
                  <FactChip key={circle}>
                    {circle} круг — {slot.max}
                  </FactChip>
                ))}
              </div>
            )}
            {sheet.spellcasting.spells_known.length > 0 && (
              <p className="cw-dossier-line">
                {sheet.spellcasting.spells_known.map((s) => s.name).join(', ')}
              </p>
            )}
            {sheet.spellcasting.prepared_spells_max != null && (
              <p className="cw-dossier-line">
                Готовить заклинаний: до {sheet.spellcasting.prepared_spells_max}
              </p>
            )}
          </StepPanel>
        )}

        <StepPanel>
          <h4 className="cw-block-title">
            <Swords aria-hidden="true" /> Умения ({sheet.features.length})
          </h4>
          <ul className="cw-features cw-features--compact">
            {sheet.features.map((f, i) => (
              <li key={`${f.name}-${i}`} className="cw-feature">
                <b>{f.name}</b>
                <span>{f.level ? `${f.level} ур.` : ''}</span>
              </li>
            ))}
          </ul>
        </StepPanel>
      </div>
    </div>
  )
}
