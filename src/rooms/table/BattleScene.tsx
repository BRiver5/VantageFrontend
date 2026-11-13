/**
 * Бой — отдельная сцена. Герои и существа стоят в полный рост (размер из
 * бестиария: огр выше гоблина), под ногами — перевёрнутый сплюснутый спидометр
 * хитов. Цели выбирают нажатием прямо по фигурам, результат виден на самих
 * фигурах: вылетающие числа, тряска, павшие падают.
 *
 * Кости бросает сервер; экран меняют только события.
 */
import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Dices, Flag, Hourglass, Plus, Swords, Undo2, UserRound, Wand2, X, Zap } from 'lucide-react'
import { playForcedRoll, type ForcedDie } from '../../dice/diceControl'
import type { CombatActionResult, CombatantView, ConcentrationCheck, ConcentrationSave, SaveEndsResult } from '../../types/rooms'
import { useRoom, useRoomEvents } from '../RoomProvider'
import { beginCombat, concentrationSave, delayTurn, endCombat, nextTurn, patchCombatant, prevTurn as stepBack, revertCombatAction, rollInitiative, setInitiative, spendLegendary } from '../roomsApi'
import { type ChanceMap, type MapAimSpec } from './SpellCast'
import { MapField } from '../../maps/MapField'
import type { AimInfo, AimRequest } from '../../maps/types'
import { CreatureCard, HeroCard } from './Cards'
import { originOf, type Origin } from './parts'
import { TopBar } from './TopBar'
import { type Floater, type Held, dealtBy, diceOf, errText, impactOf, landed, nameOf, verdictOf, wait } from './battle/combatMath'
import { type Cmd, type SlotPick, useHeroKit } from './battle/heroKit'
import { Figure } from './battle/Figure'
import { TurnStrip } from './battle/TurnStrip'
import { SlotSky } from './battle/SlotSky'
import { ActionTray } from './battle/ActionTray'
import { AddUnits } from './battle/AddUnits'

/* ---------- сцена ---------- */

export function BattleScene({ onSheet }: { onSheet?: () => void }) {
  const { data, roomId, isDm } = useRoom()
  const combat = data?.combat
  const mine = data?.me.room_character_id ?? null
  const [cmd, setCmd] = useState<Cmd | null>(null)
  const [targets, setTargets] = useState<string[]>([])
  const [slot, setSlot] = useState<SlotPick | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [floaters, setFloaters] = useState<Record<string, Floater[]>>({})
  const [anims, setAnims] = useState<Record<string, string>>({})
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState<{ c: CombatantView; origin: Origin } | null>(null)
  const [adding, setAdding] = useState(false)
  const [held, setHeld] = useState<Held>({})
  const actionQueue = useRef<Promise<void>>(Promise.resolve())

  const showFloat = (id: string, list: Floater[], anim: string) => {
    if (list.length > 0) {
      setFloaters((f) => ({ ...f, [id]: [...(f[id] ?? []), ...list] }))
      setTimeout(() => setFloaters((f) => ({ ...f, [id]: (f[id] ?? []).filter((x) => !list.includes(x)) })), 2300)
    }
    if (anim) {
      setAnims((a) => ({ ...a, [id]: anim }))
      setTimeout(() => setAnims((a) => ({ ...a, [id]: a[id] === anim ? '' : a[id] })), 680)
    }
  }

  /**
   * Сервер считает всё разом, а показываем как за столом: сначала d20, вердикт,
   * и только при попадании кости урона. Хиты целей держим до этого момента, иначе
   * дуга выдала бы исход раньше кубика.
   */
  const playAction = async (res: CombatActionResult) => {
    const targets = res.targets ?? []
    const animate = document.visibilityState === 'visible' && !res.secret
    const roll = async (dice: ForcedDie[]) => {
      if (animate && dice.length > 0) await playForcedRoll({ dice: dice.slice(0, 12) }).catch(() => undefined)
    }
    try {
      showFloat(res.actor_combatant_id, [], 'lunge')
      await roll(targets.flatMap((t) => diceOf(t.attack ?? t.save)))
      for (const t of targets) {
        showFloat(t.combatant_id, verdictOf(t, `${res.action_id}-${t.combatant_id}`), t.attack && !t.hit ? 'dodge' : '')
      }
      const hits = targets.filter((t) => landed(t) && t.damage.length > 0)
      if (hits.length > 0 && animate) {
        await wait(targets.some((t) => t.attack || t.save) ? 700 : 0)
        await roll(hits.flatMap((t) => t.damage.flatMap((d) => diceOf(d.roll))))
      }
      for (const t of targets) {
        const hurt = dealtBy(t) > 0 && landed(t)
        setHeld((h) => Object.fromEntries(Object.entries(h).filter(([k]) => k !== t.combatant_id)))
        showFloat(t.combatant_id, impactOf(t, `${res.action_id}-${t.combatant_id}`), t.crit && hurt ? 'crit' : hurt ? 'hit' : t.healed ? 'heal' : '')
      }
    } finally {
      const ids = new Set(targets.map((t) => t.combatant_id))
      setHeld((h) => Object.fromEntries(Object.entries(h).filter(([k]) => !ids.has(k))))
    }
  }

  const [concChecks, setConcChecks] = useState<ConcentrationCheck[]>([])
  const [chances, setChances] = useState<ChanceMap>({})
  const [groupInit, setGroupInit] = useState(true)
  // наведение на карте: что наводим, куда, и что ответил сервер
  const [aimSpec, setAimSpec] = useState<MapAimSpec | null>(null)
  const [aimInfo, setAimInfo] = useState<AimInfo | null>(null)
  const [mapAim, setMapAim] = useState<AimRequest | null>(null)
  const onMapAim = useCallback((spec: MapAimSpec | null, info: AimInfo | null) => {
    setAimSpec((cur) => (cur?.spell === spec?.spell && cur?.targeting === spec?.targeting ? cur : spec))
    setAimInfo(info)
    if (!spec) setMapAim(null)
  }, [])

  // концентрация и «до успешного спасброска»: просьба бросить и итог над фигурой
  useRoomEvents((msg) => {
    const fresh = !msg.ts || Date.now() - Date.parse(msg.ts) < 20000
    if (msg.type === 'combat.concentration_check') {
      const p = msg.payload as ConcentrationCheck
      if (fresh) setConcChecks((list) => [...list.filter((x) => x.combatant_id !== p.combatant_id), p])
      return
    }
    if (msg.type === 'combat.concentration_save') {
      const p = msg.payload as ConcentrationSave
      setConcChecks((list) => list.filter((x) => x.combatant_id !== p.combatant_id))
      if (!fresh) return
      const show = () =>
        showFloat(p.combatant_id, [{ id: `conc-${msg.seq}`, text: p.success ? 'Концентрация удержана' : 'Концентрация потеряна', tone: p.success ? 'save' : 'miss', delay: 0 }], p.success ? '' : 'hit')
      const dice = diceOf(p.roll)
      actionQueue.current = actionQueue.current
        .then(() => (document.visibilityState === 'visible' && dice.length ? playForcedRoll({ dice }).then(show, show) : show()))
        .catch(() => undefined)
      return
    }
    if (msg.type === 'combat.save_ends') {
      const p = msg.payload as SaveEndsResult
      if (fresh) showFloat(p.combatant_id, [{ id: `se-${msg.seq}`, text: p.success ? `Стряхивает: ${p.effect}` : `Всё ещё: ${p.effect}`, tone: p.success ? 'save' : 'fx', delay: 0 }], '')
      return
    }
    if (msg.type !== 'combat.action') return
    const res = msg.payload as CombatActionResult
    setLastAction(res.action_id)
    // здесь экран ещё прежний: запоминаем, как цели выглядели до удара
    const before = new Map((data?.combat?.combatants ?? []).map((c) => [c.id, c]))
    const keep: Held = {}
    for (const t of res.targets ?? []) {
      const c = before.get(t.combatant_id)
      if (c) keep[c.id] = { card: c.card, creature: c.creature, defeated: c.defeated }
    }
    setHeld((h) => ({ ...keep, ...h }))
    // действия идут строго по очереди, кости не должны наезжать друг на друга
    actionQueue.current = actionQueue.current.then(() => playAction(res)).catch(() => undefined)
  })

  // «Ваш ход» и «Ваш ход следующий» показывает rooms/party/TurnCues
  const current = combat?.current_combatant_id ?? null
  const myUnitId = combat?.combatants.find((c) => c.kind === 'character' && c.ref_id === mine)?.id
  // призванные игроком существа: ими он действует в их ход
  const meUser = data?.me.user_id
  const ruled = (c: CombatantView) => !!meUser && (c.controller_id === meUser || (!!c.creature && 'controller_id' in c.creature && c.creature.controller_id === meUser))

  // чей лист нужен панели: у игрока — свой герой, у мастера — тот, чей ход
  const kitUnit = combat ? (isDm ? (combat.combatants.find((c) => c.id === current) ?? combat.combatants.find((c) => !c.defeated)) : combat.combatants.find((c) => c.id === myUnitId)) : undefined
  const kit = useHeroKit(roomId, kitUnit?.card?.id, kitUnit?.card?.level ?? 1)

  if (!data || !combat || combat.status === 'ended') return null

  const units = combat.combatants.map((c) => (held[c.id] ? { ...c, ...held[c.id] } : c))
  const byId = new Map(units.map((c) => [c.id, c]))
  const party = units.filter((c) => c.side === 'party').sort((a, b) => a.slot - b.slot)
  const enemies = units.filter((c) => c.side === 'enemies').sort((a, b) => a.slot - b.slot)
  const currentUnit = current ? byId.get(current) : undefined
  const myUnit = myUnitId ? byId.get(myUnitId) : undefined
  const ruledNow = currentUnit && ruled(currentUnit) ? currentUnit : undefined
  const myTurn = (!!myUnit && myUnit.id === current) || !!ruledNow
  const setup = combat.status === 'setup'
  const closed = data.room.status === 'closed'
  const actor = isDm ? (currentUnit ?? combat.combatants.find((c) => !c.defeated)) : myUnit
  const targeting = !!cmd
  const trayActor = !isDm ? (ruledNow ?? myUnit) : actor

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const closeTray = () => {
    setChances({})
    setCmd(null)
    setTargets([])
    setSlot(null)
  }
  const openCmd = (next: Cmd) => {
    setSlot(null)
    setCmd(next)
  }
  const onFigure = (c: CombatantView, origin: Origin) => {
    if (targeting) {
      if (c.defeated) return
      setTargets((t) => (t.includes(c.id) ? t.filter((x) => x !== c.id) : [...t, c.id].slice(0, 30)))
      return
    }
    setCardOpen({ c, origin })
  }
  const figure = (c: CombatantView) => (
    <Figure
      key={c.id}
      c={c}
      current={c.id === current}
      mine={c.id === myUnit?.id}
      targeting={targeting && !c.defeated}
      picked={targets.includes(c.id)}
      floaters={floaters[c.id] ?? []}
      anim={anims[c.id] || null}
      setup={setup}
      isDm={isDm}
      onClick={(o) => onFigure(c, o)}
      onInit={(v) => void run(() => setInitiative(roomId, combat.id, { [c.id]: v }))}
      onSurprise={isDm ? () => void run(() => patchCombatant(roomId, combat.id, c.id, { surprised: !c.surprised })) : undefined}
      onLegendary={isDm && c.creature ? (kind, amount) => void run(() => spendLegendary(roomId, c.creature!.id, kind, amount)) : undefined}
      chance={chances[c.id]}
    />
  )
  const myChecks = concChecks.filter((x) => isDm || x.character_id === mine)

  const center = (
    <>
      <h1>{setup ? 'Бросайте инициативу' : `Раунд ${combat.round}`}</h1>
    </>
  )

  return (
    <div className={`bt-scene${cmd ? ' has-tray' : ''}${isDm ? ' is-dm' : ''}`}>
      <span className="bt-back" aria-hidden="true" />
      <span className="bt-fog" aria-hidden="true" />
      <span className="bt-embers" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${6 + (i % 5)}s`, '--w': `${(i * 0.7) % 5}s` } as CSSProperties} />
        ))}
      </span>

      <TopBar center={center} onSheet={onSheet} />

      <TurnStrip list={units} current={current} />

      {data.activeMap ? (
        <div className="bt-map">
          <MapField
            targeting={targeting && !aimSpec}
            picked={targets}
            chances={Object.fromEntries(Object.entries(chances).map(([k, v]) => [k, v.chance]))}
            onTarget={(cid) => {
              const c = byId.get(cid)
              if (c) onFigure(c, originOf(null))
            }}
            onOpen={(t) => {
              const c = t.combatant_id ? byId.get(t.combatant_id) : undefined
              if (c) setCardOpen({ c, origin: originOf(null) })
            }}
            aim={aimSpec && trayActor ? { ...aimSpec, casterCombatantId: trayActor.id } : null}
            aimInfo={aimInfo}
            onAim={setMapAim}
          />
        </div>
      ) : (
        <div className="bt-field">
          <div className="bt-row is-enemies" style={{ '--n': enemies.length } as CSSProperties}>
            {enemies.map(figure)}
          </div>
          <div className="bt-row is-party" style={{ '--n': party.length } as CSSProperties}>
            {party.map(figure)}
          </div>
        </div>
      )}

      {/* команды хода */}
      <nav className="bt-cmds" aria-label="Команды">
        {setup ? (
          <>
            {myUnit && myUnit.initiative == null && (
              <button type="button" className="bt-cmd is-main" disabled={busy || closed} onClick={() => void run(() => rollInitiative(roomId, combat.id, { combatant_ids: [myUnit.id] }))}>
                <Dices aria-hidden="true" /> <span>Инициатива</span>
              </button>
            )}
            {isDm && (
              <>
                <button type="button" className={`bt-group${groupInit ? ' is-on' : ''}`} onClick={() => setGroupInit((v) => !v)} aria-pressed={groupInit} title="Одинаковые существа бросают инициативу один раз">
                  группами
                </button>
                <button type="button" className="bt-cmd" disabled={busy || closed} onClick={() => void run(() => rollInitiative(roomId, combat.id, groupInit ? { group: true } : {}))}>
                  <Dices aria-hidden="true" /> <span>Бросить за всех</span>
                </button>
                <button type="button" className="bt-cmd is-main" disabled={busy || closed} onClick={() => void run(() => beginCombat(roomId, combat.id))}>
                  <Swords aria-hidden="true" /> <span>Начать бой</span>
                </button>
              </>
            )}
          </>
        ) : (
          actor && (
            <>
              <button type="button" className={`bt-cmd${cmd === 'attack' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'attack' ? closeTray() : openCmd('attack'))}>
                <Swords aria-hidden="true" /> <span>{isDm || myTurn ? 'Атака' : 'Реакция'}</span>
              </button>
              <button type="button" className={`bt-cmd${cmd === 'spell' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'spell' ? closeTray() : openCmd('spell'))}>
                <Wand2 aria-hidden="true" /> <span>Магия</span>
              </button>
              <button type="button" className={`bt-cmd${cmd === 'other' ? ' is-on' : ''}`} disabled={closed} onClick={() => (cmd === 'other' ? closeTray() : openCmd('other'))}>
                <Zap aria-hidden="true" /> <span>Другое</span>
              </button>
              {(isDm || myTurn) && (
                <span className="bt-endturn">
                  <button type="button" className="bt-cmd is-main" disabled={busy || closed} onClick={() => void run(() => nextTurn(roomId, combat.id).then(closeTray))}>
                    <ChevronRight aria-hidden="true" /> <span>{myTurn ? 'Конец хода' : 'Следующий'}</span>
                  </button>
                  <button type="button" className="tb-round bt-delay" disabled={busy || closed || !current} onClick={() => void run(() => delayTurn(roomId, combat.id).then(closeTray))} title="Отложить ход: в конец очереди" aria-label="Отложить ход">
                    <Hourglass aria-hidden="true" />
                  </button>
                </span>
              )}
            </>
          )
        )}
      </nav>

      {/* служебное мастера */}
      {isDm && (
        <div className="bt-dmtools">
          <button type="button" className="tb-round" onClick={() => setAdding((v) => !v)} aria-label="Добавить участников" title="Добавить участников" aria-expanded={adding}>
            <Plus aria-hidden="true" />
          </button>
          {!setup && (
            <button type="button" className="tb-round" disabled={busy || closed} onClick={() => void run(() => stepBack(roomId, combat.id).then(closeTray))} aria-label="Вернуть ход назад" title="Вернуть ход назад">
              <ChevronLeft aria-hidden="true" />
            </button>
          )}
          {lastAction && !setup && (
            <button type="button" className="tb-round" disabled={busy || closed} onClick={() => void run(() => revertCombatAction(roomId, combat.id, lastAction).then(() => setLastAction(null)))} aria-label="Отменить последнее действие" title="Отменить последнее действие">
              <Undo2 aria-hidden="true" />
            </button>
          )}
          <button type="button" className="tb-round is-danger" disabled={busy || closed} onClick={() => confirm('Закончить бой?') && void run(() => endCombat(roomId, combat.id))} aria-label="Закончить бой" title="Закончить бой">
            <Flag aria-hidden="true" />
          </button>
        </div>
      )}

      {myChecks.length > 0 && (
        <div className="bt-concs" role="alert">
          {myChecks.map((x) => {
            const unit = byId.get(x.combatant_id)
            return (
              <div key={x.combatant_id} className="bt-conc">
                <span>
                  <b>{unit ? nameOf(unit) : 'Герой'}</b> получил {x.damage} урона: спасбросок концентрации, Сл {x.dc}
                </span>
                <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void run(() => concentrationSave(roomId, combat.id, x.combatant_id))}>
                  <Dices aria-hidden="true" /> Бросить
                </button>
                <button type="button" className="tb-card-x" onClick={() => setConcChecks((l) => l.filter((y) => y.combatant_id !== x.combatant_id))} aria-label="Скрыть">
                  <X aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!isDm && !myUnit && <p className="bt-note"><UserRound aria-hidden="true" /> Вашего героя нет в этом бою</p>}

      {error && (
        <p className="tb-claimerr" role="alert">
          {error}
        </p>
      )}

      {!setup && trayActor?.card && <SlotSky slots={kit.slots} pick={slot} onPick={cmd === 'spell' ? setSlot : undefined} />}
      {cmd && trayActor && (
        <ActionTray
          key={`${cmd}-${trayActor.id}`}
          actor={trayActor}
          cmd={cmd}
          targets={targets}
          reaction={!isDm && !myTurn}
          kit={kit}
          slot={slot}
          onSlot={setSlot}
          onTargets={setTargets}
          onChances={setChances}
          onClose={closeTray}
          mapAim={mapAim}
          onMapAim={onMapAim}
          mapArea={!!aimSpec}
        />
      )}
      {adding && <AddUnits onClose={() => setAdding(false)} />}

      {cardOpen?.c.card && <HeroCard card={cardOpen.c.card} origin={cardOpen.origin} onClose={() => setCardOpen(null)} />}
      {cardOpen?.c.creature && <CreatureCard id={cardOpen.c.creature.id} origin={cardOpen.origin} onClose={() => setCardOpen(null)} />}
    </div>
  )
}

