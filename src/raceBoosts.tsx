/**
 * Бонусы характеристик расы — на карточках каталога, в мастере и на странице.
 *
 * Бывает три вида. Фиксированные: «Ловкость +2, Мудрость +1» — лежат в
 * `increase_ability_scores`. На выбор игрока (расы из «Монстров
 * Мультивселенной», «Ведьмовская кровь», «Кендер»…): «+2 и +1 в любые две или
 * +1 в любые три» — в данных пусто, правило есть только в тексте описания,
 * поэтому вид определяется по нему. И от подрасы (Шифтер): у самой расы бонусов
 * нет, их даёт выбранная подраса.
 */
import { GitFork, Shuffle } from 'lucide-react'
import { ABILITY_RU, htmlToText } from './api'

export type BoostInfo =
  | { kind: 'fixed'; list: [string, number][] }
  /** variants — наборы прибавок: [[2, 1], [1, 1, 1]] */
  | { kind: 'choice'; variants: number[][] }
  | { kind: 'subrace' }
  | { kind: 'none' }

/** Абзац про увеличение характеристик — у dnd.su он идёт после заголовка «Увеличение характеристик» */
function asiSentence(text: string): string {
  const i = text.search(/Увеличение характеристик/i)
  const from = i >= 0 ? i : text.search(/увелич\S* (одн|тр|дв)\S* (из )?характеристик/i)
  return from >= 0 ? text.slice(from, from + 400) : ''
}

export function boostInfo(
  race: { increase_ability_scores?: Record<string, number> | null; description?: string | null; traits?: string | null },
  hasSubraces = false,
): BoostInfo {
  const list = Object.entries(race.increase_ability_scores ?? {}).filter(([, v]) => v) as [string, number][]
  if (list.length > 0) return { kind: 'fixed', list }

  const raw = `${race.traits ?? ''} ${race.description ?? ''}`
  const text = asiSentence(/<[a-z!/]/i.test(raw) ? htmlToText(raw) : raw).replace(/\s+/g, ' ')
  const twoOne = /на 2,?\s*а друг\S*\s*(—\s*)?на 1/i.test(text)
  const threeOnes = /тр(ёх|ех|и)\s+различн\S*\s+характеристик/i.test(text)
  const variants: number[][] = []
  if (twoOne) variants.push([2, 1])
  if (threeOnes) variants.push([1, 1, 1])
  // «значение одной характеристики по вашему выбору увеличивается на 2» (Своё происхождение)
  if (!variants.length && /по вашему выбору[^.]{0,40}на 2|на 2[^.]{0,40}по вашему выбору/i.test(text)) variants.push([2])
  if (variants.length) return { kind: 'choice', variants }
  if (hasSubraces) return { kind: 'subrace' }
  return { kind: 'none' }
}

/** Какие характеристики раса может повысить — для фильтра «Характеристика» */
export function boostsAbility(info: BoostInfo, ability: string): boolean {
  if (info.kind === 'fixed') return info.list.some(([k, v]) => k === ability && v > 0)
  // на выбор — подходит к любой
  return info.kind === 'choice'
}

/**
 * Плашки бонусов. Фиксированные — «ЛОВ +2»; на выбор — значок «на выбор» и
 * одна плашка «на выбор» с вариантами в подсказке; от подрасы — «по подрасе».
 */
export function RaceBoosts({ info, className = '' }: { info: BoostInfo; className?: string }) {
  if (info.kind === 'none') return null
  if (info.kind === 'fixed') {
    return (
      <span className={`race-boosts ${className}`}>
        {info.list.map(([k, v]) => (
          <span className="race-boost" key={k}>
            {ABILITY_RU[k] ?? k}
            <i>+{v}</i>
          </span>
        ))}
      </span>
    )
  }
  if (info.kind === 'subrace') {
    return (
      <span className={`race-boosts ${className}`}>
        <span className="race-boost is-any" title="Бонусы характеристик даёт выбранная подраса">
          <GitFork aria-hidden="true" /> по подрасе
        </span>
      </span>
    )
  }
  const title = info.variants
    .map((v) => (v.length === 1 ? `+${v[0]} к одной` : v.every((x) => x === 1) ? `+1 к ${v.length} разным` : v.map((x) => `+${x}`).join(' и ') + ' к разным'))
    .join(' или ')
  // одна плашка; какие именно прибавки — в подсказке
  return (
    <span className={`race-boosts ${className}`}>
      <span className="race-boost is-any" title={`Характеристики на выбор игрока: ${title}`}>
        <Shuffle aria-hidden="true" /> на выбор
      </span>
    </span>
  )
}
