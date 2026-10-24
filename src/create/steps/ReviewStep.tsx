/**
 * Последний шаг — итог. Лист — предпросмотр (buildCharacter): на сервер уходит
 * только выбор игрока, а числа сохранённого героя считает движок. Вид листа — общий
 * с сохранённым персонажем (CharacterSheet); ячейки и расовая магия здесь
 * тратятся «на пробу» и живут только до ухода со страницы.
 */
import { useMemo, useState } from 'react'
import { realImage } from '../../api'
import CharacterSheet from '../../characters/CharacterSheet'
import { useEquipmentIndex } from '../../equipmentIndex'
import type { FeatureEntry } from '../../classArticle'
import { buildCharacter } from '../deriveCharacter'
import type { StepProps } from '../draft'
import type { ClassBundle } from '../useClassBundle'
import { StepHeader } from './ui'
import { gearKey } from '../startingGear'
import type { GrantedSpell } from '../grantedSpells'

export default function ReviewStep({
  draft,
  update,
  bundle,
  subclassFeatures,
  granted,
}: StepProps & { bundle: ClassBundle | null; subclassFeatures: FeatureEntry[]; granted: GrantedSpell[] }) {
  const equipmentIndex = useEquipmentIndex()
  const sheet = useMemo(
    () =>
      buildCharacter({
        draft,
        classFeatures: bundle?.features ?? [],
        subclassFeatures,
        equipmentIndex,
        granted,
      }),
    [draft, bundle, subclassFeatures, equipmentIndex, granted],
  )

  // потраченные ячейки по кругам и расовые заклинания, использованные до отдыха
  const [slotsUsed, setSlotsUsed] = useState<Record<string, number>>({})
  const [racialUsed, setRacialUsed] = useState<Set<string>>(() => new Set())

  return (
    <CharacterSheet
      sheet={sheet}
      heading={
        <StepHeader
          title="Герой готов"
          lead="Это предпросмотр: после создания все числа листа — КД, спасброски, хиты, ячейки и умения — посчитает сервер по вашему выбору."
        />
      }
      portrait={draft.avatarUrl.trim() || null}
      fallbackPortrait={realImage(draft.race?.image_gallery)}
      play={{ slotsUsed, setSlotsUsed, racialUsed, setRacialUsed }}
      onInventory={(next) => update({ inventory: next, inventoryKey: gearKey(draft) })}
    />
  )
}
