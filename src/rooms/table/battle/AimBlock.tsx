import { Shield, Sparkles, Swords, UserRound } from 'lucide-react'
import type { CombatantView } from '../../../types/rooms'
import { type Cmd, type SlotPick } from './heroKit'

export function AimBlock({ cmd, hasSky, slot, slotText, onSlot, me, targets, allies, foes, same, onTargets, needsTarget, mapArea }: {
  cmd: Cmd
  hasSky: boolean
  slot: SlotPick | null
  slotText: string
  onSlot: (p: SlotPick | null) => void
  me: CombatantView
  targets: string[]
  allies: string[]
  foes: string[]
  same: (a: string[], b: string[]) => boolean
  onTargets: (ids: string[]) => void
  needsTarget: boolean
  /** область наводится фигурой на карте: цели решает сервер */
  mapArea?: boolean
}) {
  if (mapArea) {
    return (
      <>
        {cmd === 'spell' && hasSky && (
          <span className={`bt-slotline${slot ? ' is-set' : ''}`}>
            <Sparkles aria-hidden="true" /> Ячейка: {slotText}
            {slot && (
              <button type="button" className="tb-linkbtn" onClick={() => onSlot(null)}>
                без ячейки
              </button>
            )}
          </span>
        )}
        <span className="bt-targets is-set">Цели — те, кого накроет фигура на карте</span>
      </>
    )
  }
  return (
    <>
        {cmd === 'spell' && hasSky && (
          <span className={`bt-slotline${slot ? ' is-set' : ''}`}>
            <Sparkles aria-hidden="true" /> Ячейка: {slotText}
            {slot && (
              <button type="button" className="tb-linkbtn" onClick={() => onSlot(null)}>
                без ячейки
              </button>
            )}
          </span>
        )}
        <div className="bt-aim" role="group" aria-label="Быстрый выбор цели">
          <button type="button" className={same(targets, [me.id]) ? 'is-on' : ''} onClick={() => onTargets(same(targets, [me.id]) ? [] : [me.id])}>
            <UserRound aria-hidden="true" /> Себя
          </button>
          <button type="button" className={allies.length > 0 && same(targets, allies) ? 'is-on' : ''} disabled={allies.length === 0} onClick={() => onTargets(same(targets, allies) ? [] : allies)}>
            <Shield aria-hidden="true" /> Союзники
          </button>
          <button type="button" className={foes.length > 0 && same(targets, foes) ? 'is-on' : ''} disabled={foes.length === 0} onClick={() => onTargets(same(targets, foes) ? [] : foes)}>
            <Swords aria-hidden="true" /> Враги
          </button>
        </div>
        <span className={`bt-targets${targets.length ? ' is-set' : ''}`}>
          {targets.length ? `Целей: ${targets.length}` : needsTarget ? 'Или нажмите на цель на поле' : 'Можно без цели'}
          {targets.length > 0 && (
            <button type="button" className="tb-linkbtn" onClick={() => onTargets([])}>
              сбросить
            </button>
          )}
        </span>
    </>
  )
}
