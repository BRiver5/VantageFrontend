/**
 * Материал 3D-кубиков — тема `@3d-dice/dice-box` (папка в /assets/themes).
 * Бывают два вида:
 *  - `tint` — текстура красится цветом броска (наши обычные, камень, ржавчина):
 *    обычные берут цвет корпуса из профиля, камень и ржавчина — свой естественный;
 *  - готовые (дерево, металл) — цвет у них в самой текстуре.
 * Самоцвет и мрамор убраны: у них вытянутая «кристальная» модель d20, а их
 * текстуры нарисованы под её развёртку — на обычный кубик не перенести.
 * Бонусные кости (Благословение, Порча) красятся всегда: у них свой цвет.
 *
 * Сервер пока хранит в профиле только цвета, поэтому материал живёт в
 * браузере. Когда в preferences.dice появится `material`, он возьмётся оттуда.
 */
import { useSyncExternalStore } from 'react'

export type DiceMaterial = 'vantage' | 'wooden' | 'rock' | 'blueGreenMetal' | 'rust'

export interface MaterialInfo {
  id: DiceMaterial
  label: string
  hint: string
  /** красится ли цветом броска */
  tint: boolean
  /** свой цвет вместо цвета корпуса из профиля */
  color?: string
  /** образец: чистый кусок текстуры без цифр (swatch.png в папке темы); пусто — рисует CSS */
  swatch: string
  /** что можно перекрасить в профиле: корпус и цифры, только корпус или ничего */
  paint: 'all' | 'body' | 'none'
  /** цвет цифр на образце, если их не перекрасить */
  numbers?: string
}

const T = '/assets/themes'
export const DICE_MATERIALS: MaterialInfo[] = [
  { id: 'vantage', label: 'Обычные', hint: 'матовые: красятся корпус и цифры', tint: true, swatch: '', paint: 'all' },
  { id: 'wooden', label: 'Дерево', hint: 'резной орех', tint: false, swatch: `${T}/wooden/swatch.png`, paint: 'none', numbers: '#f3ead8' },
  { id: 'rock', label: 'Камень', hint: 'тёсаный гранит', tint: true, color: '#9c948b', swatch: `${T}/rock/swatch.png`, paint: 'none', numbers: '#ffffff' },
  { id: 'blueGreenMetal', label: 'Металл', hint: 'кованая сталь с патиной', tint: false, swatch: `${T}/blueGreenMetal/swatch.png`, paint: 'none', numbers: '#ffffff' },
  { id: 'rust', label: 'Ржавчина', hint: 'старое железо', tint: true, color: '#aa4f4a', swatch: `${T}/rust/swatch.png`, paint: 'none', numbers: '#ffffff' },
]
const IDS = new Set(DICE_MATERIALS.map((m) => m.id))

const KEY = 'vantage-dice-material'
const EVENT = 'vantage-dice-material'

export const isMaterial = (v: unknown): v is DiceMaterial => typeof v === 'string' && IDS.has(v as DiceMaterial)

export function getDiceMaterial(): DiceMaterial {
  try {
    const v = localStorage.getItem(KEY)
    return isMaterial(v) ? v : 'vantage'
  } catch {
    return 'vantage'
  }
}

export function setDiceMaterial(m: DiceMaterial) {
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* приватный режим */
  }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', fn)
  }
}
export const useDiceMaterial = () => useSyncExternalStore(subscribe, getDiceMaterial, () => 'vantage' as DiceMaterial)

/** Цвет броска для материала: свой у камня и ржавчины, из профиля — у остальных */
export function materialColor(m: DiceMaterial, profileBody: string): string {
  const info = DICE_MATERIALS.find((x) => x.id === m)
  return info?.color ?? profileBody
}

/** У материала свой цвет (камень, ржавчина): чужой цвет броска в комнате его не перебивает */
export const ownColor = (m: DiceMaterial) => !!DICE_MATERIALS.find((x) => x.id === m)?.color

export const materialInfo = (m: DiceMaterial) => DICE_MATERIALS.find((x) => x.id === m) ?? DICE_MATERIALS[0]
