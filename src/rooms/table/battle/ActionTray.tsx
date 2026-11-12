import { useEffect, useMemo, useState } from 'react'
import { BookmarkPlus, Hand, Crosshair, Dices, PawPrint, Sparkles, Swords, Wand2, X } from 'lucide-react'
import { getEngineDictionaries, type EngineDictionaries, type Spell } from '../../../api'
import { useCatalogList } from '../../../create/useCatalog'
import { SpellSchoolMark, spellSchoolIcon } from '../../../spellSchools'
import type { AttackEntry } from '../../../types/character'
import type { CombatActionRequest, CombatantView, FixedRolls, EffectExpiry, StatKey } from '../../../types/rooms'
import { isFullCreature } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { combatAction, patchRoomCharacter } from '../../roomsApi'
import { attackPresets, castable, loadBeastPresets, normDice, presetFromText, saveBeastPresets, spellLookup, spellPreset, type Preset } from '../actionPresets'
import { facesFor, ManualRolls, manualReady, SpellCast, type ChanceMap, type MapAimSpec } from '../SpellCast'
import type { AimInfo, AimRequest } from '../../../maps/types'
import { Img } from '../../../media'
import { errText, nameOf } from './combatMath'
import { ABILITIES, CUSTOM_TAG, type Cmd, type HeroKit, ROMAN, type SlotPick, slotFor } from './heroKit'
import { AimBlock } from './AimBlock'

function PresetArt({ p }: { p: Preset }) {
  const [broken, setBroken] = useState(false)
  if (p.image && !broken) return <Img src={p.image} alt="" draggable={false} onError={() => setBroken(true)} />
  if (p.look === 'spell') return spellSchoolIcon(p.school) ? <SpellSchoolMark school={p.school} /> : <Sparkles aria-hidden="true" />
  const Icon = p.look === 'ranged' ? Crosshair : p.look === 'beast' ? PawPrint : Swords
  return <Icon aria-hidden="true" />
}

export function ActionTray({
  actor,
  cmd,
  targets,
  reaction,
  kit,
  slot,
  onSlot,
  onTargets,
  onChances,
  onClose,
  mapAim,
  onMapAim,
  mapArea,
}: {
  mapAim?: AimRequest | null
  onMapAim?: (spec: MapAimSpec | null, info: AimInfo | null) => void
  mapArea?: boolean
  actor: CombatantView
  cmd: Cmd
  targets: string[]
  reaction: boolean
  kit: HeroKit
  slot: SlotPick | null
  onSlot: (p: SlotPick | null) => void
  onTargets: (ids: string[]) => void
  onChances: (c: ChanceMap) => void
  onClose: () => void
}) {
  const { data, roomId, isDm } = useRoom()
  const combat = data?.combat
  const [label, setLabel] = useState('')
  const [bonus, setBonus] = useState('')
  const [advantage, setAdvantage] = useState<'adv' | 'dis' | null>(null)
  const [dice, setDice] = useState(cmd === 'attack' ? '1d8' : '')
  const [type, setType] = useState('')
  const [more, setMore] = useState(cmd === 'other')
  const [heal, setHeal] = useState('')
  const [saveOn, setSaveOn] = useState(false)
  const [saveAbility, setSaveAbility] = useState<StatKey>('dex')
  const [saveDc, setSaveDc] = useState('13')
  const [half, setHalf] = useState(true)
  const [secret, setSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dict, setDict] = useState<EngineDictionaries | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  // эффект на целях: длительность, концентрация, «до успешного спасброска»
  const [effOn, setEffOn] = useState(false)
  const [effLabel, setEffLabel] = useState('')
  const [effExpiry, setEffExpiry] = useState<EffectExpiry>('rounds')
  const [effRounds, setEffRounds] = useState('10')
  const [effConc, setEffConc] = useState(false)
  const [effAbility, setEffAbility] = useState<StatKey>('wis')
  const [effDc, setEffDc] = useState('')
  const [beastOwn, setBeastOwn] = useState<Preset[]>(() => (actor.creature ? loadBeastPresets(actor.creature.id) : []))
  // заклинание с механикой творит сервер — для него своя карточка
  const [castPick, setCastPick] = useState<Preset | null>(null)
  // живые кубики: игрок вписывает выпавшее, модификаторы прибавит сервер
  const [manual, setManual] = useState(false)
  const [fixed, setFixed] = useState<FixedRolls>({})
  const [saving, setSaving] = useState(false)
  const hero = !!actor.card
  const { doc, slots, hints } = kit
  const { items: catalog } = useCatalogList<Spell>('spells', cmd === 'spell' && hero)

  useEffect(() => {
    void getEngineDictionaries().then(setDict)
  }, [])
  // заклинание по умолчанию бьёт с бонусом и Сл героя
  useEffect(() => {
    if (cmd !== 'spell') return
    if (hints.dc != null) setSaveDc(String(hints.dc))
  }, [cmd, hints.dc])

  const presets = useMemo<Preset[]>(() => {
    if (cmd === 'attack') {
      if (hero) {
        const atk = [...(doc?.attacks ?? []), ...kit.natural.filter((n) => !(doc?.attacks ?? []).some((a) => a.name === n.name))]
        return attackPresets(atk, doc?.inventory, dict, new Set(atk.filter((a) => a.properties?.includes(CUSTOM_TAG)).map((a) => a.name)))
      }
      const c = actor.creature
      // у призванного игроку статблок открыт: действия есть и в его виде
      const acts = c ? (isFullCreature(c) ? c.snapshot.actions : c.actions) : null
      const own = (acts ?? []).map((a) => presetFromText(String(a.name ?? a.title ?? 'Действие'), String(a.description ?? a.text ?? ''), dict)).filter((p): p is Preset => !!p)
      return [...own, ...beastOwn]
    }
    if (cmd === 'spell' && hero && doc) {
      const find = spellLookup(catalog)
      return castable([...(doc.spells ?? []), ...kit.granted]).map((sp) => {
        const known = sp.level >= 0 ? sp : { ...sp, level: find(sp)?.spell_level ?? 0 }
        return spellPreset(known, find(known), hints, dict)
      })
    }
    return []
  }, [cmd, hero, doc, kit.natural, kit.granted, actor.creature, beastOwn, dict, catalog, hints])

  if (!combat) return null
  const me = actor
  const alive = combat.combatants.filter((c) => !c.defeated)
  const allies = alive.filter((c) => c.side === me.side && c.id !== me.id).map((c) => c.id)
  const foes = alive.filter((c) => c.side !== me.side).map((c) => c.id)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

  const applyPreset = (p: Preset) => {
    setPicked(p.key)
    if (p.look === 'spell' && p.mech && hero) {
      setCastPick(p)
      onSlot(p.level ? slotFor(p.level, slots) : null)
      const m = p.mech
      // на себя — сразу себя; лечение — без врагов в целях
      if (m.range.kind === 'self' || m.targets?.kind === 'self') onTargets([me.id])
      else if (m.heal && !m.damage.length) onTargets(targets.filter((t) => t === me.id || allies.includes(t)))
      return
    }
    setCastPick(null)
    setLabel(p.name)
    setBonus(p.bonus != null ? String(p.bonus) : '')
    setDice(p.dice)
    setType(p.type)
    if (p.look !== 'spell') return
    setHeal(p.heal ?? '')
    setSaveOn(!!p.save)
    if (p.save) {
      setSaveAbility(p.save.ability)
      setHalf(p.save.half)
      if (hints.dc != null) setSaveDc(String(hints.dc))
    }
    onSlot(p.level ? slotFor(p.level, slots) : null)
    // концентрация или «до спасброска»: эффект с именем заклинания
    const effect = !!p.conc || !!p.saveEnds
    setEffOn(effect)
    if (effect) {
      setEffLabel(p.name)
      setEffConc(!!p.conc)
      setEffExpiry(p.saveEnds ? 'save_ends' : p.conc ? 'never' : 'rounds')
      if (p.saveEnds) setEffAbility(p.saveEnds)
      setEffDc(hints.dc != null ? String(hints.dc) : '')
      setMore(true)
    }
    if (p.self) onTargets([me.id])
    else if (p.heal && !p.dice) onTargets(targets.filter((t) => t === me.id || allies.includes(t)))
  }

  /** Записать то, что в форме, как свой приём: у героя — в лист, у существа — в браузер */
  const saveOwn = async () => {
    const name = label.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    const typeLabel = dict?.damage_types.find((t) => t.value === type)?.label ?? type
    try {
      if (hero && actor.card && doc) {
        const entry: AttackEntry = { name, type: 'melee', attack_bonus: Number(bonus) || 0, damage: normDice(dice), damage_type: typeLabel, range: '', properties: [CUSTOM_TAG] }
        const next = [...(doc.attacks ?? []).filter((a) => a.name !== name), entry]
        await patchRoomCharacter(roomId, actor.card.id, { attacks: next })
        kit.setDoc({ ...doc, attacks: next })
      } else if (actor.creature) {
        const entry: Preset = { key: `own-${name}`, name, bonus: bonus.trim() === '' ? null : Number(bonus), dice: normDice(dice), type, look: 'beast', custom: true }
        const next = [...beastOwn.filter((p) => p.name !== name), entry]
        setBeastOwn(next)
        saveBeastPresets(actor.creature.id, next)
      }
      setPicked(hero ? `atk-${(doc?.attacks ?? []).filter((a) => a.name !== name).length}-${name}` : `own-${name}`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const dropOwn = async (p: Preset) => {
    setError(null)
    try {
      if (hero && actor.card && doc) {
        const next = (doc.attacks ?? []).filter((a) => !(a.name === p.name && a.properties?.includes(CUSTOM_TAG)))
        await patchRoomCharacter(roomId, actor.card.id, { attacks: next })
        kit.setDoc({ ...doc, attacks: next })
      } else if (actor.creature) {
        const next = beastOwn.filter((x) => x.name !== p.name)
        setBeastOwn(next)
        saveBeastPresets(actor.creature.id, next)
      }
    } catch (e) {
      setError(errText(e))
    }
  }

  const submit = async () => {
    const req: CombatActionRequest = {
      actor_combatant_id: actor.id,
      kind: cmd,
      label: label.trim() || undefined,
      target_ids: targets,
      as_reaction: reaction || undefined,
      secret: isDm && secret ? true : undefined,
    }
    if (dice.trim()) req.damage = [{ dice: normDice(dice), type: type || null }]
    if (heal.trim()) req.heal_dice = normDice(heal)
    if (bonus.trim() !== '' && !Number.isNaN(Number(bonus))) req.attack_bonus = Number(bonus)
    if (advantage) req.advantage = advantage
    if (saveOn) req.save = { ability: saveAbility, dc: Number(saveDc) || 10, half_on_success: half }
    if (slot) req.slot = slot
    if (manual) req.fixed = { attack: fixed.attack, damage: (fixed.damage ?? []).slice(0, manualFaces.length) }
    if (effOn && effLabel.trim()) {
      req.effect = {
        label: effLabel.trim(),
        modifiers: [],
        expires: effExpiry,
        rounds_left: effExpiry === 'rounds' ? Math.max(1, Number(effRounds) || 1) : null,
        concentration: effConc,
        ...(effExpiry === 'save_ends' ? { save_ability: effAbility, save_dc: Number(effDc) || hints.dc || 10 } : {}),
      }
    }
    setBusy(true)
    setError(null)
    try {
      await combatAction(roomId, combat.id, req)
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const needsTarget = cmd !== 'other'
  const hasSky = hero && slots.some((s) => s.max > 0)
  const unitName = (id: string) => {
    const c = combat.combatants.find((u) => u.id === id)
    return c ? nameOf(c) : 'цель'
  }
  const manualAttack = bonus.trim() !== '' ? targets.map((id) => ({ id, name: unitName(id) })) : []
  const manualFaces = facesFor([dice, heal])
  const canSave = cmd === 'attack' && !!label.trim() && (!!dice.trim() || bonus.trim() !== '') && !presets.some((p) => p.name === label.trim() && !p.custom && p.dice === normDice(dice) && String(p.bonus ?? '') === bonus)
  const slotText = slot ? `${slot.pool === 'pact' ? 'договор, ' : ''}${slot.level} круг` : 'без ячейки'
  const aimBlock = <AimBlock cmd={cmd} hasSky={hasSky} slot={slot} slotText={slotText} onSlot={onSlot} me={me} targets={targets} allies={allies} foes={foes} same={same} onTargets={onTargets} needsTarget={needsTarget} mapArea={mapArea} />
  const presetList = presets.length > 0 && (
    <ul className={`bt-presets${cmd === 'spell' ? ' is-spells' : ''}${castPick ? ' is-compact' : ''}`}>
      {presets.map((p) => (
        <li key={p.key}>
          <button type="button" className={picked === p.key ? 'is-on' : ''} onClick={() => applyPreset(p)}>
            <span className="bt-preset-art">
              <PresetArt p={p} />
            </span>
            <b>{p.name}</b>
            <i>
              {p.look === 'spell' && <em className="bt-circle">{p.level ? ROMAN[p.level] : 'заг.'}</em>}
              {p.mech ? '' : `${p.bonus != null ? `${p.bonus >= 0 ? '+' : ''}${p.bonus} ` : ''}${p.dice || (p.heal ? `♥ ${p.heal}` : '')}`}
            </i>
          </button>
        </li>
      ))}
    </ul>
  )
  const head = (
    <header>
      <b>{reaction ? 'Реакция' : cmd === 'attack' ? 'Атака' : cmd === 'spell' ? 'Заклинание' : 'Действие'}</b>
      <i>{castPick ? `${nameOf(actor)} · ${castPick.name}` : nameOf(actor)}</i>
      <button type="button" className="tb-card-x" onClick={onClose} aria-label="Отменить">
        <X aria-hidden="true" />
      </button>
    </header>
  )
  if (castPick?.mech) {
    return (
      <aside className="bt-tray" aria-label="Заклинание">
        {head}
        <SpellCast
          key={castPick.key}
          actor={actor}
          spellName={castPick.spellName ?? castPick.name}
          mech={castPick.mech}
          slot={slot}
          targets={targets}
          units={combat.combatants}
          reaction={reaction}
          onChances={onChances}
          onClose={onClose}
          aim={aimBlock}
          top={presetList}
          mapAim={mapAim}
          onMapAim={onMapAim}
        />
      </aside>
    )
  }
  return (
    <aside className="bt-tray" aria-label="Действие">
      {head}
      <div className="bt-tray-scroll">
        {presets.length > 0 && (
          <ul className={`bt-presets${cmd === 'spell' ? ' is-spells' : ''}`}>
            {presets.map((p) => (
              <li key={p.key}>
                <button type="button" className={picked === p.key ? 'is-on' : ''} onClick={() => applyPreset(p)}>
                  <span className="bt-preset-art">
                    <PresetArt p={p} />
                  </span>
                  <b>{p.name}</b>
                  <i>
                    {p.look === 'spell' && <em className="bt-circle">{p.level ? ROMAN[p.level] : 'заг.'}</em>}
                    {p.bonus != null ? `${p.bonus >= 0 ? '+' : ''}${p.bonus} ` : ''}
                    {p.dice || (p.heal ? `♥ ${p.heal}` : '')}
                  </i>
                </button>
                {p.custom && (
                  <button type="button" className="bt-preset-x" onClick={() => void dropOwn(p)} aria-label={`Убрать приём: ${p.name}`} title="Убрать приём">
                    <X aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {cmd === 'spell' && hero && doc && presets.length === 0 && <p className="bt-empty">В листе нет заклинаний — опишите его ниже</p>}
        <div className="bt-name">
          <input className="bt-in" value={label} placeholder={cmd === 'spell' ? 'Название заклинания' : cmd === 'attack' ? 'Чем бьёт' : 'Что делает'} aria-label="Название" onChange={(e) => setLabel(e.target.value)} />
          {cmd === 'attack' && (
            <button type="button" className="bt-save" disabled={!canSave || saving} onClick={() => void saveOwn()} title={hero ? 'Сохранить приём в лист героя' : 'Запомнить приём существа'}>
              <BookmarkPlus aria-hidden="true" />
              <span>в приёмы</span>
            </button>
          )}
        </div>
        <div className="bt-pair">
          <label>
            <span>Бонус</span>
            <input className="bt-in" type="number" inputMode="numeric" value={bonus} placeholder="без броска" onChange={(e) => setBonus(e.target.value)} />
          </label>
          <label>
            <span>Урон</span>
            <input className="bt-in" value={dice} placeholder="2d6+3" onChange={(e) => setDice(e.target.value)} />
          </label>
        </div>
        <select className="bt-in" value={type} aria-label="Тип урона" onChange={(e) => setType(e.target.value)}>
          <option value="">тип урона не важен</option>
          {(dict?.damage_types ?? []).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="tb-tri" role="radiogroup" aria-label="Преимущество">
          {([[null, 'Обычно'], ['adv', 'Преимущество'], ['dis', 'Помеха']] as const).map(([v, text]) => (
            <button key={text} type="button" role="radio" aria-checked={advantage === v} className={advantage === v ? 'is-on' : ''} onClick={() => setAdvantage(v)}>
              {text}
            </button>
          ))}
        </div>
        <div className="sp-mode" role="radiogroup" aria-label="Кто бросает">
          <button type="button" role="radio" aria-checked={!manual} className={!manual ? 'is-on' : ''} onClick={() => setManual(false)}>
            <Dices aria-hidden="true" /> бросает сервер
          </button>
          <button type="button" role="radio" aria-checked={manual} className={manual ? 'is-on' : ''} onClick={() => setManual(true)}>
            <Hand aria-hidden="true" /> ввожу сам
          </button>
        </div>
        {manual && <ManualRolls attackFor={manualAttack} saveFor={[]} faces={manualFaces} value={fixed} onChange={setFixed} />}

        {cmd === 'spell' && (heal || saveOn) && !more && (
          <p className="bt-spellnote">
            {heal && <span>лечение {heal}</span>}
            {saveOn && (
              <span>
                спасбросок: {ABILITIES.find((a) => a.key === saveAbility)?.label}, Сл {saveDc}
                {half ? ', половина при успехе' : ''}
              </span>
            )}
          </p>
        )}

        <button type="button" className="tb-linkbtn bt-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? 'меньше' : hasSky ? 'лечение, спасбросок…' : 'ячейка, лечение, спасбросок…'}
        </button>
        {more && (
          <div className="bt-moreform">
            <label>
              <span>Лечение</span>
              <input className="bt-in" value={heal} placeholder="2d4+2" onChange={(e) => setHeal(e.target.value)} />
            </label>
            {!hasSky && (
              <div className="bt-pair">
                <label>
                  <span>Ячейка</span>
                  <select className="bt-in" value={slot?.level ?? ''} onChange={(e) => onSlot(e.target.value ? { level: Number(e.target.value), pool: slot?.pool ?? 'spell' } : null)}>
                    <option value="">не тратить</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <option key={n} value={n}>
                        {n} круг
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Откуда</span>
                  <select className="bt-in" value={slot?.pool ?? 'spell'} disabled={!slot} onChange={(e) => slot && onSlot({ ...slot, pool: e.target.value as 'spell' | 'pact' })}>
                    <option value="spell">обычная</option>
                    <option value="pact">договор</option>
                  </select>
                </label>
              </div>
            )}
            <label className="bt-check">
              <input type="checkbox" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} />
              <span>Цели делают спасбросок{hints.dc != null ? ` (Сл ${hints.dc})` : ''}</span>
            </label>
            {saveOn && (
              <>
                <div className="bt-pair">
                  <select className="bt-in" value={saveAbility} aria-label="Характеристика" onChange={(e) => setSaveAbility(e.target.value as StatKey)}>
                    {ABILITIES.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <input className="bt-in" type="number" inputMode="numeric" aria-label="Сложность" value={saveDc} onChange={(e) => setSaveDc(e.target.value)} />
                </div>
                <label className="bt-check">
                  <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
                  <span>половина урона при успехе</span>
                </label>
              </>
            )}
            <label className="bt-check">
              <input type="checkbox" checked={effOn} onChange={(e) => (setEffOn(e.target.checked), !effLabel && setEffLabel(label))} />
              <span>Наложить эффект на цели</span>
            </label>
            {effOn && (
              <div className="bt-effect">
                <input className="bt-in" value={effLabel} maxLength={120} placeholder="Отравлен, Опутан, Благословение…" aria-label="Название эффекта" onChange={(e) => setEffLabel(e.target.value)} />
                <div className="bt-pair">
                  <select className="bt-in" value={effExpiry} aria-label="Сколько длится" onChange={(e) => setEffExpiry(e.target.value as EffectExpiry)}>
                    <option value="rounds">раундов</option>
                    <option value="save_ends">до успешного спасброска</option>
                    <option value="turn_end">до конца хода</option>
                    <option value="turn_start">до начала хода</option>
                    <option value="never">пока не снимут</option>
                    <option value="short_rest">до короткого отдыха</option>
                    <option value="long_rest">до долгого отдыха</option>
                  </select>
                  {effExpiry === 'rounds' && <input className="bt-in" type="number" min={1} max={1000} inputMode="numeric" aria-label="Раундов" value={effRounds} onChange={(e) => setEffRounds(e.target.value)} />}
                  {effExpiry === 'save_ends' && (
                    <span className="bt-pair is-tight">
                      <select className="bt-in" value={effAbility} aria-label="Спасбросок" onChange={(e) => setEffAbility(e.target.value as StatKey)}>
                        {ABILITIES.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                      <input className="bt-in" type="number" inputMode="numeric" aria-label="Сложность" placeholder={hints.dc != null ? String(hints.dc) : 'Сл'} value={effDc} onChange={(e) => setEffDc(e.target.value)} />
                    </span>
                  )}
                </div>
                <label className="bt-check">
                  <input type="checkbox" checked={effConc} onChange={(e) => setEffConc(e.target.checked)} />
                  <span>Требует концентрации</span>
                </label>
              </div>
            )}
            {isDm && (
              <label className="bt-check">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
                <span>Скрытое действие</span>
              </label>
            )}
          </div>
        )}
      </div>
      <footer>
        {error && <p className="tb-err">{error}</p>}
        {aimBlock}
        <button type="button" className="tb-goldbtn" disabled={busy || (needsTarget && targets.length === 0) || (manual && !manualReady(fixed, manualAttack, manualFaces))} onClick={() => void submit()}>
          {cmd === 'spell' ? <Wand2 aria-hidden="true" /> : <Dices aria-hidden="true" />} {cmd === 'spell' ? 'Сотворить' : 'Бросить кости'}
        </button>
      </footer>
    </aside>
  )
}
