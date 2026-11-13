import { cssVar } from '../../styles/palette'

/** цвет обводки жетона по стороне (tokens.css: --side-*) */
export const sideColors = (): Record<string, string> => ({
  party: cssVar('--side-party', '#d9a441'),
  enemies: cssVar('--side-enemy', '#c8493c'),
  neutral: cssVar('--side-neutral', '#9aa3ad'),
})

/** цвет отношения к наводящему (tokens.css: --rel-*) */
export const relColors = (): Record<string, string> => ({
  enemy: cssVar('--rel-enemy', '#e5484d'),
  ally: cssVar('--rel-ally', '#3fb950'),
  self: cssVar('--rel-self', '#f5a524'),
  neutral: cssVar('--rel-neutral', '#a1a1aa'),
})

export const ELEMENT: Record<string, string[]> = {
  fire: ['#fff3c4', '#ffb347', '#ff5a1f', '#8a1c06'],
  cold: ['#ffffff', '#bfe6ff', '#5fb4ff', '#1d4f9a'],
  lightning: ['#ffffff', '#d9f2ff', '#7cc8ff', '#3a5fd6'],
  acid: ['#f4ffd0', '#b9f26b', '#5fae2a', '#2b5a12'],
  poison: ['#e9ffd6', '#9be37a', '#4e9c3a', '#1f4a17'],
  necrotic: ['#e6d9ff', '#9b7fd6', '#4d2d7a', '#1a0d2e'],
  radiant: ['#ffffff', '#fff6c9', '#ffd76a', '#c9902a'],
  force: ['#ffffff', '#d6d1ff', '#8f82ff', '#3d2fb0'],
  psychic: ['#ffe0f4', '#ff8fd6', '#c03aa0', '#5a1050'],
  thunder: ['#ffffff', '#cfe1ff', '#8aa8e6', '#3a4f80'],
  heal: ['#ffffff', '#d8ffe4', '#6fe39a', '#1f8a4c'],
  arcane: ['#ffffff', '#e6d6ff', '#a78bfa', '#5b3fb5'],
}
