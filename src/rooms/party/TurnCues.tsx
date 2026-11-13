/**
 * «Ваш ход следующий» и «Ваш ход»: по одному разу на каждую смену хода.
 * При «уменьшить движение» надпись просто появляется и исчезает (CSS).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRoom } from '../RoomProvider'
import { myCombatants, turnCue, turnKey, type TurnCue } from './partyData'

const TEXT: Record<Exclude<TurnCue, null>, string> = { now: 'Ваш ход', next: 'Ваш ход следующий' }
const HOLD: Record<Exclude<TurnCue, null>, number> = { now: 2200, next: 3200 }

export function TurnCues() {
  const { data } = useRoom()
  const combat = data?.combat ?? null
  const me = data?.me
  const mine = useMemo(() => (me ? myCombatants(combat, me) : new Set<string>()), [combat, me])
  const key = turnKey(combat)
  const cue = turnCue(combat, mine)
  const [shown, setShown] = useState<{ cue: Exclude<TurnCue, null>; key: string } | null>(null)
  // undefined — ещё не видели ни одного хода: при входе в комнату посреди боя не кричим
  const seen = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (seen.current === undefined || key === seen.current) {
      seen.current = key
      return
    }
    seen.current = key
    if (key && cue) setShown({ cue, key })
  }, [key, cue])

  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown((s) => (s === shown ? null : s)), HOLD[shown.cue])
    return () => clearTimeout(t)
  }, [shown])

  return (
    <div className="pt-cues" role="status" aria-live="polite">
      {shown && (
        <p key={shown.key} className={`pt-cue is-${shown.cue}`}>
          {TEXT[shown.cue]}
        </p>
      )}
    </div>
  )
}
