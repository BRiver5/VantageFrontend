import { useState, type CSSProperties } from 'react'
import { ChevronsUp } from 'lucide-react'
import { parsePortrait } from '../../../characters/portrait'
import type { CombatantView } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { cardRatio, creatureHp, HpArc, originFromEvent, seed, Silhouette, useHeroArt, type Origin } from '../parts'
import { auraClass, describeEffect, EffectSigils, SURPRISED } from '../effects'
import { Img } from '../../../media'
import { type Floater, artOf, effectsOf, legendaryOf, nameOf, sizeK } from './combatMath'
import { Pips } from './Pips'

export function Figure({
  c,
  current,
  mine,
  targeting,
  picked,
  floaters,
  anim,
  setup,
  isDm,
  onClick,
  onInit,
  onSurprise,
  onLegendary,
  chance,
}: {
  c: CombatantView
  current: boolean
  mine: boolean
  targeting: boolean
  picked: boolean
  floaters: Floater[]
  anim: string | null
  setup: boolean
  isDm: boolean
  onClick: (o: Origin) => void
  onInit: (v: number) => void
  /** мастер: отметить «застигнут врасплох» */
  onSurprise?: () => void
  /** мастер: потратить (1) или вернуть (−1) легендарное */
  onLegendary?: (kind: 'action' | 'resistance', amount: number) => void
  /** предпросмотр заклинания: шанс попасть или провалить спасбросок */
  chance?: { chance: number; kind: 'attack' | 'save' | 'auto' }
}) {
  const { roomId, data } = useRoom()
  // внезапность действует только в первом раунде
  const surprised = !!c.surprised && (data?.combat?.round ?? 0) <= 1
  // герой без своей картинки — с картинкой расы, как в листе
  const heroArt = useHeroArt(roomId, c.card?.id, c.card?.avatar_url, isDm || mine)
  const art = c.card ? parsePortrait(heroArt).src : artOf(c)
  const [broken, setBroken] = useState(false)
  const [initVal, setInitVal] = useState<string | null>(null)
  const hp = c.card ? { ratio: cardRatio(c.card), current: c.card.hp.current, max: c.card.hp.max, temp: c.card.hp.temp } : c.creature ? creatureHp(c.creature) : { ratio: null }
  const k = sizeK(c)
  const effects = effectsOf(c)
  const shown = [...(surprised ? [SURPRISED] : []), ...effects.map((l) => describeEffect(l))]
  const legend = legendaryOf(c)
  const cls = [
    'bt-fig',
    `is-${c.side}`,
    current && 'is-current',
    mine && 'is-mine',
    c.defeated && 'is-defeated',
    c.hidden && 'is-hidden',
    targeting && 'is-targetable',
    picked && 'is-picked',
    surprised && 'is-surprised',
    auraClass(shown),
    anim && `do-${anim}`,
  ]
    .filter(Boolean)
    .join(' ')
  const sway = (seed(c.id, 8) * 2).toFixed(2)
  return (
    <div className={cls} style={{ '--k': k, '--sway': `${sway}s` } as CSSProperties}>
      <button type="button" className="bt-fig-hit" onClick={(e) => onClick(originFromEvent(e))} aria-pressed={targeting ? picked : undefined} aria-label={`${nameOf(c)}${targeting ? (picked ? ': цель выбрана' : ': выбрать целью') : ': открыть карточку'}`}>
        <span className="bt-fig-ground" aria-hidden="true" />
        <EffectSigils effects={shown} size="lg" />
        <span className="bt-fig-body">
          {art && !broken ? <Img src={art} alt="" draggable={false} onError={() => setBroken(true)} /> : <Silhouette enemy={c.side === 'enemies'} />}
        </span>
        {targeting && picked && chance && chance.kind !== 'auto' && (
          <span className={`bt-chance${chance.chance >= 0.65 ? ' is-good' : chance.chance <= 0.35 ? ' is-bad' : ''}`} style={{ '--p': chance.chance } as CSSProperties} title={chance.kind === 'save' ? 'шанс провала спасброска' : 'шанс попасть'}>
            <b>{Math.round(chance.chance * 100)}%</b>
            <i>{chance.kind === 'save' ? 'провал' : 'попадание'}</i>
          </span>
        )}
        {targeting && (
          <svg className="bt-reticle" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="44" />
            <path d="M50 0V16M50 84V100M0 50H16M84 50H100" />
          </svg>
        )}
      </button>
      {current && <ChevronsUp className="bt-fig-turn" aria-hidden="true" />}
      <HpArc ratio={hp.ratio} current={hp.current} max={hp.max} temp={hp.temp} band={'band' in hp ? hp.band : undefined} />
      <b className="bt-fig-name">{nameOf(c)}</b>
      {legend && (
        <span className="bt-legend">
          <Pips n={legend.actions} left={legend.actionsLeft} kind="action" onSpend={onLegendary ? (a) => onLegendary('action', a) : undefined} />
          <Pips n={legend.resist} left={legend.resistLeft} kind="resistance" onSpend={onLegendary ? (a) => onLegendary('resistance', a) : undefined} />
        </span>
      )}
      {setup && isDm && onSurprise && (
        <button type="button" className={`bt-fig-surprise${c.surprised ? ' is-on' : ''}`} onClick={onSurprise} title={c.surprised ? 'Застигнут врасплох — снять' : 'Застигнуть врасплох'} aria-pressed={!!c.surprised}>
          !
        </button>
      )}
      {setup && (
        isDm ? (
          <input
            className="bt-fig-init"
            type="number"
            inputMode="numeric"
            aria-label={`Инициатива: ${nameOf(c)}`}
            placeholder="—"
            value={initVal ?? c.initiative ?? ''}
            onChange={(e) => setInitVal(e.target.value)}
            onBlur={() => {
              if (initVal != null && initVal !== '' && Number(initVal) !== c.initiative) onInit(Number(initVal))
              setInitVal(null)
            }}
          />
        ) : (
          <i className="bt-fig-init">{c.initiative ?? '?'}</i>
        )
      )}
      {floaters.map((f) => (
        <span key={f.id} className={`bt-float is-${f.tone}`} style={{ animationDelay: `${f.delay}ms` }}>
          {f.text}
        </span>
      ))}
    </div>
  )
}
