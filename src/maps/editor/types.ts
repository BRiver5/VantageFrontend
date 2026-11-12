import type { EditKind } from '../types'

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'light' | 'token' | 'asset' | 'terrain' | 'zone' | 'item'

export type Brush = 'up' | 'down' | 'difficult' | 'water' | 'climbable'

export const KINDS: EditKind[] = ['walls', 'objects', 'lights', 'layers', 'tokens', 'items', 'zones', 'triggers', 'spawns']
