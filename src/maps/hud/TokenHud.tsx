/**
 * Панель жетона (как Token HUD в Foundry): правый клик или долгое нажатие на
 * жетон. Хиты, состояния, высота, цель, участие в бою, скрытие — только то, что
 * сервер разрешит этому человеку (permissions.ts). Esc или клик мимо — закрыть.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Crosshair, Eye, EyeOff, Sparkle, SquareUser, Swords, X } from 'lucide-react'
import { applyVitals, roomCharacterRef } from '../../api'
import { useKeybinding } from '../../input/useKeybinding'
import { useRoom } from '../../rooms/RoomProvider'
import { addCombatants, creatureVitals, removeCombatant } from '../../rooms/roomsApi'
import { CONDITIONS, ConditionPicker } from '../../rooms/table/effects'
import { BAND_RU, creatureHp } from '../../rooms/table/parts'
import { useEffectControl, useTargetEffects } from '../../rooms/table/useEffects'
import { patchToken } from '../api'
import type { BattleMap, MapToken } from '../types'
import { heroVitals, HP_OP_LABEL, parseHpInput } from './hpInput'
import { hudPermissions, subjectOf } from './permissions'
import { targetStore } from './targets'
import type { HudAnchor } from './useMapHud'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось')
const QUICK = CONDITIONS.filter((c) => c.key !== 'concentration')
const STEP_FT = 5

export function TokenHud({ map, token, anchor, targeted, onClose, onOpenCard }: { map: BattleMap; token: MapToken; anchor: HudAnchor; targeted: boolean; onClose: () => void; onOpenCard?: (t: MapToken) => void }) {
  const { data, roomId, isDm } = useRoom()
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.x + 14, top: anchor.y - 20 })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)
  const [hpText, setHpText] = useState('')
  const [picker, setPicker] = useState(false)
  const hpHint = useId()

  const card = token.character_id ? (data?.characters.find((c) => c.id === token.character_id) ?? null) : null
  const creature = token.creature_id ? (data?.creatures.find((c) => c.id === token.creature_id) ?? null) : null
  const combat = data?.combat && data.combat.status !== 'ended' ? data.combat : null
  const combatant = combat?.combatants.find((c) => (token.combatant_id && c.id === token.combatant_id) || (card ? c.kind === 'character' && c.ref_id === card.id : creature ? c.kind === 'creature' && c.ref_id === creature.id : false)) ?? null
  const owners = useMemo(() => Object.fromEntries((data?.characters ?? []).map((c) => [c.id, c.user_id])), [data?.characters])
  const subject = subjectOf(token, owners)
  const can = hudPermissions(token, subject, { live: !!combat, combatantId: combatant?.id ?? null }, { isDm, userId: data?.me.user_id })

  const effects = useTargetEffects({ card, creature })
  const control = useEffectControl({ card, creature })

  // на экране: справа от точки клика, но не за краем поля
  useLayoutEffect(() => {
    const el = panel.current
    const field = el?.offsetParent as HTMLElement | null
    if (!el || !field) return
    const W = field.clientWidth
    const H = field.clientHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = anchor.x + 14
    if (left + w > W - 8) left = Math.max(8, anchor.x - 14 - w)
    const top = Math.max(8, Math.min(H - h - 8, anchor.y - 20))
    setPos({ left, top })
  }, [anchor.x, anchor.y, can.hp, can.effects])

  // фокус в панель, по закрытии — обратно
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input, button:not(.mp-hud-x)')?.focus({ preventScroll: true })
    return () => before?.focus?.({ preventScroll: true })
  }, [token.id])

  // клик мимо панели — закрыть (выбор состояния открыт поверх — не считается)
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (panel.current?.contains(t) || t?.closest?.('.fx-layer')) return
      onClose()
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [onClose])
  useKeybinding('dialog.close', () => {
    if (!picker) onClose()
  })

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    setNote(null)
    try {
      await fn()
      if (ok) setNote({ text: ok, bad: false })
    } catch (e) {
      setNote({ text: errText(e), bad: true })
    } finally {
      setBusy(false)
    }
  }

  const applyHp = () => {
    const parsed = parseHpInput(hpText)
    if (!parsed) return setNote({ text: 'Например: −7 урон, +5 лечение, =12 хиты, в5 временные', bad: true })
    if (subject.kind === 'character' && card) {
      const ch = heroVitals(parsed, card.hp)
      if (!ch) return setHpText('')
      if ('error' in ch) return setNote({ text: ch.error, bad: true })
      if (ch.op === 'set') return
      void run(async () => {
        await applyVitals(roomCharacterRef(roomId, card.id), { op: ch.op as 'damage' | 'heal' | 'temp', amount: ch.amount })
        setHpText('')
      }, `${HP_OP_LABEL[ch.op]}: ${ch.amount}`)
      return
    }
    if (subject.kind === 'creature' && creature) {
      void run(async () => {
        await creatureVitals(roomId, creature.id, { op: parsed.op, amount: parsed.amount })
        setHpText('')
      }, `${HP_OP_LABEL[parsed.op]}: ${parsed.amount}`)
    }
  }

  const hp = card ? { current: card.hp.current, max: card.hp.max, temp: card.hp.temp } : creature ? creatureHp(creature) : null
  const hpLine = !hp ? null : hp.current != null ? `${hp.current} / ${hp.max}${hp.temp ? ` (+${hp.temp})` : ''}` : 'band' in hp && hp.band ? BAND_RU[hp.band] : null
  const elevation = token.elevation_ft ?? 0
  const label = token.label || card?.name || 'Жетон'

  return (
    <div ref={panel} className="mp-hud" role="dialog" aria-label={`Жетон: ${label}`} style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()}>
      <header className="mp-hud-head">
        <b>{label}</b>
        {hpLine && <span className="mp-hud-hp">{hpLine}</span>}
        <button type="button" className="mp-hud-x" onClick={onClose} aria-label="Закрыть панель жетона" title="Закрыть (Esc)">
          <X aria-hidden="true" />
        </button>
      </header>

      {can.hp && (
        <form
          className="mp-hud-hpform"
          onSubmit={(e) => {
            e.preventDefault()
            applyHp()
          }}
        >
          <input
            className="mp-hud-in"
            value={hpText}
            onChange={(e) => setHpText(e.target.value)}
            inputMode="text"
            autoComplete="off"
            placeholder="−7 / +5"
            aria-label="Изменить хиты"
            aria-describedby={hpHint}
            disabled={busy}
          />
          <button type="submit" className="mp-hud-btn" disabled={busy || !hpText.trim()}>
            ОК
          </button>
          <span id={hpHint} className="mp-hud-sr">
            Минус — урон, плюс — лечение, равно или число — установить, «в» — временные хиты
          </span>
        </form>
      )}

      <div className="mp-hud-row" role="group" aria-label="Действия с жетоном">
        {can.target && (
          <button type="button" className={`mp-hud-btn${targeted ? ' is-on' : ''}`} aria-pressed={targeted} onClick={() => targetStore.toggle(token.id)} title="Цель (T)">
            <Crosshair aria-hidden="true" /> <span>Цель</span>
          </button>
        )}
        {can.combat &&
          (combatant ? (
            <button type="button" className="mp-hud-btn is-on" aria-pressed="true" disabled={busy} onClick={() => void run(() => removeCombatant(roomId, combat!.id, combatant.id), 'Убран из боя')}>
              <Swords aria-hidden="true" /> <span>Из боя</span>
            </button>
          ) : (
            <button
              type="button"
              className="mp-hud-btn"
              aria-pressed="false"
              disabled={busy}
              onClick={() => void run(() => addCombatants(roomId, combat!.id, subject.kind === 'character' ? { character_ids: [subject.refId!] } : { creature_ids: [subject.refId!], hidden: token.hidden }), 'Добавлен в бой')}
            >
              <Swords aria-hidden="true" /> <span>В бой</span>
            </button>
          ))}
        {can.hide && (
          <button type="button" className={`mp-hud-btn${token.hidden ? ' is-on' : ''}`} aria-pressed={token.hidden} disabled={busy} onClick={() => void run(() => patchToken(roomId, map.id, token.id, { hidden: !token.hidden }))} title={token.hidden ? 'Игроки не видят жетон' : 'Спрятать от игроков'}>
            {token.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />} <span>{token.hidden ? 'Скрыт' : 'Виден'}</span>
          </button>
        )}
        {onOpenCard && (
          <button
            type="button"
            className="mp-hud-btn"
            onClick={() => {
              onClose()
              onOpenCard(token)
            }}
            title="Карточка (двойной правый клик)"
          >
            <SquareUser aria-hidden="true" /> <span>Карточка</span>
          </button>
        )}
      </div>

      {can.elevation && (
        <div className="mp-hud-elev" role="group" aria-label="Высота">
          <button type="button" className="mp-hud-btn" disabled={busy} onClick={() => void run(() => patchToken(roomId, map.id, token.id, { elevation_ft: elevation - STEP_FT }))} aria-label={`Ниже на ${STEP_FT} футов`}>
            <ChevronDown aria-hidden="true" />
          </button>
          <output aria-live="polite" aria-label="Высота в футах">
            {elevation > 0 ? '▲' : elevation < 0 ? '▼' : ''}
            {Math.abs(elevation)} фт.
          </output>
          <button type="button" className="mp-hud-btn" disabled={busy} onClick={() => void run(() => patchToken(roomId, map.id, token.id, { elevation_ft: elevation + STEP_FT }))} aria-label={`Выше на ${STEP_FT} футов`}>
            <ChevronUp aria-hidden="true" />
          </button>
        </div>
      )}

      {can.effects && (
        <div className="mp-hud-fx" role="group" aria-label="Состояния">
          {QUICK.map((c) => {
            const on = effects.filter((e) => e.def.key === c.key)
            const Icon = c.icon
            return (
              <button
                key={c.key}
                type="button"
                className={`mp-hud-fxbtn is-${c.key}${on.length ? ' is-on' : ''}`}
                aria-pressed={on.length > 0}
                aria-label={c.label}
                title={`${c.label}: ${c.hint}`}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (on.length) for (const e of on) await control.remove(e)
                    else await control.apply({ label: c.label, expires: 'never', rounds_left: null, concentration: false })
                  })
                }
              >
                <Icon aria-hidden="true" />
              </button>
            )
          })}
          <button type="button" className="mp-hud-fxbtn is-more" onClick={() => setPicker(true)} aria-label="Другое состояние или длительность" title="Своё состояние, раунды, спасбросок">
            <Sparkle aria-hidden="true" />
          </button>
        </div>
      )}

      {note && (
        <p className={`mp-hud-note${note.bad ? ' is-bad' : ''}`} role={note.bad ? 'alert' : 'status'}>
          {note.text}
        </p>
      )}
      {picker && <ConditionPicker title={label} inCombat={control.inCombat} onApply={control.apply} onClose={() => setPicker(false)} />}
    </div>
  )
}
