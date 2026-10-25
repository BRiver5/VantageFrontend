/**
 * Верхняя полоса живого листа на телефоне: имя, хиты, КД и быстрые числа.
 * На ландшафте заменяет высокую сцену героя — всё нужное за столом в одну строку.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  Ellipsis,
  Footprints,
  Heart,
  Minus,
  Plus,
  Shield,
  ShieldPlus,
  Skull,
  Star,
  Swords,
  Zap,
} from 'lucide-react'
import type { VitalsOp } from '../api'
import { DamageTypePicker } from './DamageTypePicker'
import type { StageEngine } from './HeroStage'
import type { SheetRoller } from './sheetPlay'
import type { SheetView } from '../types/character'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

export function HudBar({
  sheet,
  roller,
  stage,
  extras,
}: {
  sheet: SheetView
  roller: SheetRoller
  stage?: StageEngine
  extras?: ReactNode
}) {
  const [hpOpen, setHpOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [dmgType, setDmgType] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  const info = sheet.basic_info
  const cls = info.classes[0] ?? { name: '—', level: info.total_level }
  const combat = sheet.combat
  const form = stage?.form ?? null
  const hp = form ? { current: form.hp, max: form.max, temp: combat.hit_points.temp } : combat.hit_points
  const vitals = stage?.onVitals
  const busy = !!stage?.busy
  const inspiration = stage?.inspiration ?? (combat.inspiration ? 1 : 0)
  const ratio = hp.max > 0 ? Math.min(1, hp.current / hp.max) : 0
  const tone = hp.current === 0 ? 'down' : ratio <= 0.3 ? 'low' : ratio <= 0.6 ? 'mid' : 'ok'
  const dying = !form && combat.hit_points.current === 0
  const who = [info.subrace?.name ?? info.race.name, `${cls.name} ${info.total_level}`].filter(Boolean).join(' · ')

  const apply = (op: 'damage' | 'heal' | 'temp') => {
    const n = Math.abs(parseInt(amount, 10))
    if (!n) {
      amountRef.current?.focus()
      return
    }
    vitals?.(op, n, op === 'damage' ? { damageType: dmgType || null } : undefined)
    setAmount('')
  }

  const setDeath = (kind: 'successes' | 'failures', n: number) =>
    vitals?.('death_save' as VitalsOp, Math.max(0, Math.min(3, n)), { success: kind === 'successes' })

  const rollDeathSave = async () => {
    const die = await roller.rollD20('Спасбросок от смерти', 0)
    if (die == null || !vitals) return
    const ds = combat.death_saves
    if (die === 20) vitals('heal', 1)
    else if (die === 1) setDeath('failures', ds.failures + 2)
    else if (die >= 10) setDeath('successes', ds.successes + 1)
    else setDeath('failures', ds.failures + 1)
  }

  return (
    <header className={`cw-hud-bar is-${tone}`}>
      <Link to="/characters" className="cw-hud-back" title="К персонажам">
        <ChevronLeft aria-hidden="true" />
      </Link>
      <div className="cw-hud-who">
        <b className="gold-text">{info.name}</b>
        <i>{who}</i>
      </div>

      <button
        type="button"
        className={`cw-hud-hp is-${tone}`}
        onClick={() => {
          setMoreOpen(false)
          setHpOpen((v) => !v)
        }}
        aria-expanded={hpOpen}
        title="Хиты"
      >
        <span className="cw-hud-hp-fill" style={{ width: `${ratio * 100}%` }} aria-hidden="true" />
        <Heart aria-hidden="true" />
        <b>
          {hp.current}
          <em>/{hp.max}</em>
        </b>
        {hp.temp > 0 && <span className="cw-hud-hp-temp">+{hp.temp}</span>}
      </button>

      <div className="cw-hud-nums">
        <span className="cw-hud-stat cw-hud-stat--ac" title="Класс доспеха">
          <Shield aria-hidden="true" />
          <b>{combat.armor_class}</b>
        </span>
        <button
          type="button"
          className="cw-hud-stat cw-hud-stat--init is-roll"
          onClick={() => void roller.rollD20('Инициатива', combat.initiative, undefined, { kind: 'init' })}
          disabled={roller.rolling}
          title="Бросить инициативу"
        >
          <Zap aria-hidden="true" />
          <b>{signed(combat.initiative)}</b>
        </button>
        <span className="cw-hud-stat cw-hud-stat--spd" title="Скорость">
          <Footprints aria-hidden="true" />
          <b>{combat.speed}</b>
        </span>
        <span className={`cw-hud-stat cw-hud-stat--insp${inspiration > 0 ? ' is-on' : ''}`} title="Вдохновение">
          <Star aria-hidden="true" />
          {vitals ? (
            <span className="cw-hud-insp">
              <button type="button" onClick={() => vitals('inspiration', -1)} disabled={inspiration <= 0 || busy} aria-label="Потратить вдохновение">
                <Minus aria-hidden="true" />
              </button>
              <b>{inspiration}</b>
              <button type="button" onClick={() => vitals('inspiration', 1)} disabled={busy} aria-label="Получить вдохновение">
                <Plus aria-hidden="true" />
              </button>
            </span>
          ) : (
            <b>{inspiration}</b>
          )}
        </span>
      </div>

      {extras && (
        <button
          type="button"
          className={`cw-hud-more${moreOpen ? ' is-on' : ''}`}
          onClick={() => {
            setHpOpen(false)
            setMoreOpen((v) => !v)
          }}
          aria-expanded={moreOpen}
          aria-label="Ещё действия"
        >
          <Ellipsis aria-hidden="true" />
        </button>
      )}

      {hpOpen && (
        <div className="cw-hud-pop cw-hud-pop--hp">
          {dying && stage ? (
            <div className="cw-hud-death">
              <Skull aria-hidden="true" />
              {(['successes', 'failures'] as const).map((kind) => (
                <span key={kind} className={`cw-hud-pips is-${kind}`}>
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={combat.death_saves[kind] >= n ? 'is-on' : ''}
                      onClick={() => setDeath(kind, combat.death_saves[kind] === n ? n - 1 : n)}
                      disabled={!vitals || busy}
                      aria-label={`${kind === 'successes' ? 'успехи' : 'провалы'}: ${n}`}
                    />
                  ))}
                </span>
              ))}
              {vitals && (
                <button type="button" className="cw-mini-btn" onClick={() => void rollDeathSave()} disabled={roller.rolling || busy}>
                  спасбросок
                </button>
              )}
            </div>
          ) : vitals ? (
            <form
              className="cw-hud-hpctl"
              onSubmit={(e) => {
                e.preventDefault()
                apply('damage')
              }}
            >
              <input
                ref={amountRef}
                type="number"
                min={0}
                inputMode="numeric"
                value={amount}
                placeholder="хиты"
                aria-label="Сколько хитов"
                onChange={(e) => setAmount(e.target.value)}
              />
              <button type="submit" className="cw-hud-hpbtn is-dmg" disabled={busy} title="Урон">
                <Swords aria-hidden="true" />
              </button>
              <button type="button" className="cw-hud-hpbtn is-heal" onClick={() => apply('heal')} disabled={busy} title="Лечение">
                <Heart aria-hidden="true" />
              </button>
              <button type="button" className="cw-hud-hpbtn is-temp" onClick={() => apply('temp')} disabled={busy} title="Временные хиты">
                <ShieldPlus aria-hidden="true" />
              </button>
              {stage?.damageTypes && stage.damageTypes.length > 0 && (
                <DamageTypePicker types={stage.damageTypes} value={dmgType} onChange={setDmgType} />
              )}
            </form>
          ) : (
            <p className="cw-hud-pop-note">
              {hp.current} из {hp.max}
            </p>
          )}
          {form && (
            <p className="cw-hud-pop-note">
              {form.name}
              {form.onRevert && (
                <button type="button" className="cw-mini-btn" onClick={form.onRevert} disabled={busy}>
                  выйти
                </button>
              )}
              · свои {combat.hit_points.current}/{combat.hit_points.max}
            </p>
          )}
        </div>
      )}

      {moreOpen && extras && <div className="cw-hud-pop cw-hud-pop--more">{extras}</div>}
    </header>
  )
}
