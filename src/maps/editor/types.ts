import type { BattleMap, EditKind } from '../types'

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'light' | 'token' | 'asset' | 'terrain' | 'zone' | 'item'

export type Brush = 'up' | 'down' | 'difficult' | 'water' | 'climbable'

export const KINDS: EditKind[] = ['walls', 'objects', 'lights', 'layers', 'tokens', 'items', 'zones', 'triggers', 'spawns']

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** Правка карты со стеком отмены */
export type Change = (fn: (m: BattleMap) => BattleMap) => void

/** Свойства карты — PATCH */
export type PatchProps = (body: Partial<BattleMap>) => Promise<void>

/** Что ставит инструмент «Жетон» */
export type Stamp = { creature_id?: string; character_id?: string; label: string }
