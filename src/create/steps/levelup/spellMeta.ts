import type { Spell } from '../../../api'

export const spellMeta = (s: Spell) =>
  [s.spell_level === 0 ? 'заговор' : `${s.spell_level} круг`, s.school, s.casting_time, s.range].filter(Boolean).join(' · ')
