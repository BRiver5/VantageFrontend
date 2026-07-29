/**
 * Иконки школ магии — декоративный водяной знак на карточках/страницах заклинаний.
 * В API школа приходит по-русски (иногда с хвостом «(дюнамантия…)»).
 */
import abjurationUrl from './assets/spell_schools/Abjuration.svg'
import conjurationUrl from './assets/spell_schools/Conjuration.svg'
import divinationUrl from './assets/spell_schools/Divination.svg'
import enchantmentUrl from './assets/spell_schools/Enchantment.svg'
import evocationUrl from './assets/spell_schools/Evocation.svg'
import illusionUrl from './assets/spell_schools/Illusion.svg'
import necromancyUrl from './assets/spell_schools/Necromancy.svg'
import transmutationUrl from './assets/spell_schools/Transmutation.svg'

const SCHOOL_ICONS: Record<string, string> = {
  ограждение: abjurationUrl,
  вызов: conjurationUrl,
  прорицание: divinationUrl,
  очарование: enchantmentUrl,
  воплощение: evocationUrl,
  иллюзия: illusionUrl,
  некромантия: necromancyUrl,
  преобразование: transmutationUrl,
}

/** Базовое имя школы без суффиксов вроде «(дюнамантия: хронургия)». */
export function spellSchoolKey(school: string | null | undefined): string | null {
  if (!school) return null
  const base = school.trim().toLowerCase().split(/[(\s,]/)[0]
  return base && SCHOOL_ICONS[base] ? base : null
}

export function spellSchoolIcon(school: string | null | undefined): string | null {
  const key = spellSchoolKey(school)
  return key ? SCHOOL_ICONS[key] : null
}

/** Водяной знак школы — кладётся внутрь карточки/панели с overflow: hidden. */
export function SpellSchoolMark({
  school,
  className = '',
}: {
  school: string | null | undefined
  className?: string
}) {
  const src = spellSchoolIcon(school)
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`spell-school-mark${className ? ` ${className}` : ''}`}
    />
  )
}
