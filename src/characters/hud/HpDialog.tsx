import { useState } from 'react'
import {
  Delete,
  Heart,
  PawPrint,
  ScrollText,
  ShieldPlus,
  Skull,
  Swords,
  X,
} from 'lucide-react'
import { Corners } from '../../ornaments'
import type { SheetView } from '../../types/character'
import { DamageTypePicker } from '../DamageTypePicker'
import { type StageEngine } from '../HeroStage'
import type { SheetRoller } from '../sheetPlay'

/* ---------- хиты ---------- */

/** Окно хитов: свой набор цифр — системная клавиатура закрыла бы половину экрана */
export function HpDialog({
  sheet,
  roller,
  stage,
  onClose,
}: {
  sheet: SheetView
  roller: SheetRoller
  stage?: StageEngine
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [dmgType, setDmgType] = useState('')
  const combat = sheet.combat
  const form = stage?.form ?? null
  const hp = form ? { current: form.hp, max: form.max, temp: combat.hit_points.temp } : combat.hit_points
  const vitals = stage?.onVitals
  const busy = !!stage?.busy
  const dying = !form && combat.hit_points.current === 0
  const n = Number(amount) || 0

  const press = (d: string) => setAmount((a) => (a + d).replace(/^0+/, '').slice(0, 4))
  const apply = (op: 'damage' | 'heal' | 'temp') => {
    if (!n) return
    vitals?.(op, n, op === 'damage' ? { damageType: dmgType || null } : undefined)
    setAmount('')
  }
  const setDeath = (kind: 'successes' | 'failures', v: number) =>
    vitals?.('death_save', Math.max(0, Math.min(3, v)), { success: kind === 'successes' })
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
    <div className="hud-dialog-layer" onClick={onClose}>
      <div className="hud-hp" role="dialog" aria-label="Хиты" onClick={(e) => e.stopPropagation()}>
        <Corners size={18} gold />
        <button type="button" className="hud-win-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>

        <div className="hud-hp-now">
          <span className="hud-hp-caption">{form ? form.name : 'Хиты'}</span>
          <b className="gold-text">{hp.current}</b>
          <i>из {hp.max}</i>
          {hp.temp > 0 && <em>+{hp.temp} временных</em>}
          {form && (
            <span className="hud-hp-form">
              <PawPrint aria-hidden="true" /> свои {combat.hit_points.current}/{combat.hit_points.max}
              {form.onRevert && (
                <button type="button" className="cw-mini-btn" onClick={form.onRevert} disabled={busy}>
                  выйти
                </button>
              )}
            </span>
          )}
          {stage?.onHpJournal && (
            <button type="button" className="hud-hp-log" onClick={stage.onHpJournal}>
              <ScrollText aria-hidden="true" /> журнал хитов
            </button>
          )}
        </div>

        {dying && stage ? (
          <div className="hud-hp-death">
            <Skull aria-hidden="true" />
            <p>Спасброски от смерти</p>
            {(['successes', 'failures'] as const).map((kind) => (
              <div key={kind} className={`hud-hp-pips is-${kind}`}>
                <span>{kind === 'successes' ? 'успехи' : 'провалы'}</span>
                {[1, 2, 3].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={combat.death_saves[kind] >= v ? 'is-on' : ''}
                    onClick={() => setDeath(kind, combat.death_saves[kind] === v ? v - 1 : v)}
                    disabled={!vitals || busy}
                    aria-label={`${kind === 'successes' ? 'успехи' : 'провалы'}: ${v}`}
                  />
                ))}
              </div>
            ))}
            {vitals && (
              <button type="button" className="cs-btn" onClick={() => void rollDeathSave()} disabled={roller.rolling || busy}>
                Бросить спасбросок
              </button>
            )}
          </div>
        ) : vitals ? (
          <>
            <div className="hud-hp-pad">
              <output className={`hud-hp-amount${amount ? '' : ' is-empty'}`} aria-label="Сколько хитов">
                {amount || 'сколько?'}
              </output>
              <div className="hud-hp-keys">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button key={d} type="button" onClick={() => press(d)}>
                    {d}
                  </button>
                ))}
                <button type="button" onClick={() => setAmount('')} aria-label="Очистить">
                  <X aria-hidden="true" />
                </button>
                <button type="button" onClick={() => press('0')}>
                  0
                </button>
                <button type="button" onClick={() => setAmount((a) => a.slice(0, -1))} aria-label="Стереть цифру">
                  <Delete aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="hud-hp-acts">
              <button type="button" className="hud-hp-act is-dmg" disabled={busy || !n} onClick={() => apply('damage')}>
                <Swords aria-hidden="true" /> Урон
              </button>
              {stage?.damageTypes && stage.damageTypes.length > 0 && (
                <DamageTypePicker types={stage.damageTypes} value={dmgType} onChange={setDmgType} />
              )}
              <button type="button" className="hud-hp-act is-heal" disabled={busy || !n} onClick={() => apply('heal')}>
                <Heart aria-hidden="true" /> Лечение
              </button>
              <button type="button" className="hud-hp-act is-temp" disabled={busy || !n} onClick={() => apply('temp')}>
                <ShieldPlus aria-hidden="true" /> Временные
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
