import { DEFAULT_SKILLS } from '../../../types/character'

export const SKILL_BY_KEY = new Map(DEFAULT_SKILLS.map((s) => [s.key, s]))
