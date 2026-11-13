/**
 * Сотворение заклинания по механике сервера. Клиент правил не считает: он
 * спрашивает предпросмотр (Сл, бонус атаки, формулы с усилением, шанс по
 * каждой цели), показывает его и отправляет POST /cast. В ручном режиме
 * игрок вписывает, что выпало на живых кубиках, — сервер проверит грани и
 * прибавит модификаторы, а 3D-кости упадут на те же значения.
 */
import type { AimInfo, AimRequest, SpellTargeting } from '../../maps/types'
import { aimColor, targetingOf } from '../../maps/aim'

export interface MapAimSpec {
  targeting: SpellTargeting
  spell: string
  color: string
}
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Clock3, Crosshair, Dices, Hand, Info, Minus, Plus, Shield, Sparkles, Sun, Wand2 } from 'lucide-react'
import { fetchPage, type SpellMechanics } from '../../api'
import type { CastPlan, CastPreview, CastRequest, CombatantView, FixedRolls, StatKey } from '../../types/rooms'
import { useRoom } from '../RoomProvider'
import { castPreview, castSpell } from '../roomsApi'
import { errText } from './parts'

const SAVE_RU: Record<StatKey, string> = { str: 'Силы', dex: 'Ловкости', con: 'Телосложения', int: 'Интеллекта', wis: 'Мудрости', cha: 'Харизмы' }
const UNIT_RU: Record<string, string> = { action: 'действие', bonus: 'бонусное', reaction: 'реакция', minute: 'минута', hour: 'час' }
const TYPE_RU: Record<string, string> = {
  acid: 'кислотой', bludgeoning: 'дробящий', cold: 'холодом', fire: 'огнём', force: 'силовым полем', lightning: 'электричеством', necrotic: 'некротический',
  piercing: 'колющий', poison: 'ядом', psychic: 'психический', radiant: 'излучением', slashing: 'рубящий', thunder: 'звуком',
}
const AREA_RU: Record<string, string> = { sphere: 'сфера', cube: 'куб', cone: 'конус', line: 'линия', cylinder: 'цилиндр', emanation: 'вокруг себя', square: 'квадрат', wall: 'стена' }
const typeRu = (t: string | null | undefined) => (t ? (TYPE_RU[t] ?? t) : '')

/** Грани, которые нужно вписать: «8d6+1d4» → [6×8, 4] */
export function facesFor(exprs: (string | null | undefined)[]): number[] {
  const out: number[] = []
  for (const e of exprs) {
    if (!e) continue
    for (const m of e.replace(/[кk]/gi, 'd').matchAll(/(\d*)d(\d+)/gi)) {
      const n = Math.min(60, Number(m[1] || 1))
      for (let i = 0; i < n; i++) out.push(Number(m[2]))
    }
  }
  return out
}

export type ChanceMap = Record<string, { chance: number; kind: 'attack' | 'save' | 'auto' }>

/** Поля для живых кубиков: к20 по целям и грани урона по порядку */
export function ManualRolls({
  attackFor,
  saveFor,
  faces,
  value,
  onChange,
}: {
  attackFor: { id: string; name: string }[]
  saveFor: { id: string; name: string }[]
  faces: number[]
  value: FixedRolls
  onChange: (v: FixedRolls) => void
}) {
  const num = (raw: string, max: number) => {
    const n = Number(raw)
    return raw === '' || Number.isNaN(n) ? undefined : Math.max(1, Math.min(max, Math.round(n)))
  }
  const setMap = (key: 'attack' | 'save', id: string, raw: string) => {
    const next = { ...(value[key] ?? {}) }
    const n = num(raw, 20)
    if (n == null) delete next[id]
    else next[id] = n
    onChange({ ...value, [key]: next })
  }
  return (
    <div className="sp-manual">
      {attackFor.length > 0 && (
        <div className="sp-manual-row">
          <i>к20 атаки</i>
          {attackFor.map((t) => (
            <label key={t.id} className="sp-d20" title={t.name}>
              <span>{t.name}</span>
              <input type="number" inputMode="numeric" min={1} max={20} value={value.attack?.[t.id] ?? ''} placeholder="к20" onChange={(e) => setMap('attack', t.id, e.target.value)} />
            </label>
          ))}
        </div>
      )}
      {saveFor.length > 0 && (
        <div className="sp-manual-row">
          <i>к20 спасброска (пусто — бросит сервер)</i>
          {saveFor.map((t) => (
            <label key={t.id} className="sp-d20 is-save" title={t.name}>
              <span>{t.name}</span>
              <input type="number" inputMode="numeric" min={1} max={20} value={value.save?.[t.id] ?? ''} placeholder="к20" onChange={(e) => setMap('save', t.id, e.target.value)} />
            </label>
          ))}
        </div>
      )}
      {faces.length > 0 && (
        <div className="sp-manual-row">
          <i>грани урона и лечения</i>
          <div className="sp-faces">
            {faces.map((sides, i) => (
              <label key={i} className="sp-face" title={`к${sides}`}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={sides}
                  value={value.damage?.[i] ?? ''}
                  placeholder={`к${sides}`}
                  onChange={(e) => {
                    const list = [...(value.damage ?? [])]
                    list[i] = num(e.target.value, sides) as number
                    onChange({ ...value, damage: list })
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Ручной режим заполнен: все к20 атаки и все грани */
export const manualReady = (v: FixedRolls, attackFor: { id: string }[], faces: number[]) =>
  attackFor.every((t) => v.attack?.[t.id] != null) && faces.every((_, i) => v.damage?.[i] != null)

function PlanLine({ icon: Icon, children, tone }: { icon: typeof Sun; children: ReactNode; tone?: string }) {
  return (
    <li className={tone ? `is-${tone}` : ''}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

export function SpellCast({
  actor,
  spellName,
  mech,
  slot,
  targets,
  units,
  reaction,
  onChances,
  onClose,
  aim,
  top,
  mapAim,
  onMapAim,
}: {
  actor: CombatantView
  spellName: string
  mech: SpellMechanics
  slot: { level: number; pool: 'spell' | 'pact' } | null
  targets: string[]
  units: CombatantView[]
  reaction: boolean
  onChances: (c: ChanceMap) => void
  onClose: () => void
  /** быстрый выбор целей и строка ячейки — из панели */
  aim: ReactNode
  /** список заклинаний над карточкой: можно передумать */
  top?: ReactNode
  /** наведение на карте: запрос от MapField */
  mapAim?: AimRequest | null
  /** что наводить (null — убрать) и ответ сервера */
  onMapAim?: (spec: MapAimSpec | null, info: AimInfo | null) => void
}) {
  const { roomId, data, isDm } = useRoom()
  const combat = data?.combat
  const choice = mech.damage.find((d) => d.type === 'choice')?.choices ?? []
  const [damageType, setDamageType] = useState<string | null>(choice[0] ?? null)
  const [advantage, setAdvantage] = useState<'adv' | 'dis' | null>(null)
  const [ritual, setRitual] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [summonCount, setSummonCount] = useState(1)
  // форма призыва из бестиария: «Призыв феи», фамильяр, скакун
  const wantsForm = !!mech.ui?.some((g) => g.inputs.some((i) => i.type === 'creature' || i.key === 'summon_ref'))
  const [summonRef, setSummonRef] = useState<{ id: string; name: string } | null>(null)
  const [shots, setShots] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [fixed, setFixed] = useState<FixedRolls>({})
  const [secret, setSecret] = useState(false)
  const [preview, setPreview] = useState<CastPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan: CastPlan | null = preview?.spell ?? null
  const nameOf = (id: string) => {
    const c = units.find((u) => u.id === id)
    const cr = c?.creature
    return c?.card?.name ?? (cr ? ('snapshot' in cr ? cr.display_name : cr.name) : 'цель')
  }

  // снаряды: по умолчанию все в первую цель; при смене целей — перераспределить
  const total = plan?.projectiles?.count ?? mech.projectiles?.count ?? 0
  useEffect(() => {
    if (!total || targets.length === 0) return setShots({})
    setShots((cur) => {
      const kept = Object.fromEntries(Object.entries(cur).filter(([id]) => targets.includes(id)))
      const used = Object.values(kept).reduce((a, b) => a + b, 0)
      if (used === 0) return { [targets[0]]: total }
      return kept
    })
  }, [targets, total])

  // на карте область наводится фигурой; одиночные цели — кликом по жетонам
  const onMap = !!data?.activeMap
  const aimTg = useMemo(() => (onMap ? targetingOf(mech) : null), [onMap, mech])
  useEffect(() => {
    onMapAim?.(aimTg ? { targeting: aimTg, spell: spellName, color: aimColor(mech) } : null, null)
    return () => onMapAim?.(null, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aimTg, spellName])

  const body = useMemo<CastRequest | null>(() => {
    if (!combat) return null
    return {
      actor_combatant_id: actor.id,
      spell_name: spellName,
      ...(slot && mech.level > 0 && !ritual && !repeat ? { slot_level: slot.level, pool: slot.pool } : {}),
      target_ids: targets,
      ...(ritual ? { ritual: true } : {}),
      ...(repeat ? { repeat: true } : {}),
      ...(damageType ? { damage_type: damageType } : {}),
      ...(advantage ? { advantage } : {}),
      ...(total && Object.keys(shots).length ? { projectiles: shots } : {}),
      ...(mech.summons?.some((s) => s.choose_count) ? { summon_count: summonCount } : {}),
      ...(wantsForm && summonRef ? { summon_ref: summonRef.id } : {}),
      ...(aimTg && mapAim ? { aim: mapAim } : {}),
    }
  }, [combat, actor.id, spellName, slot, mech, ritual, repeat, targets, damageType, advantage, total, shots, summonCount, aimTg, mapAim, wantsForm, summonRef])

  // предпросмотр: Сл, формулы и шансы — не чаще раза в 250 мс
  const seq = useRef(0)
  useEffect(() => {
    if (!body || !combat) return
    const my = ++seq.current
    const t = setTimeout(() => {
      castPreview(roomId, combat.id, body).then(
        (p) => {
          if (my !== seq.current) return
          setPreview(p)
          if (aimTg) onMapAim?.({ targeting: aimTg, spell: spellName, color: aimColor(mech) }, p.aim ?? null)
          onChances(Object.fromEntries((p.targets ?? []).map((x) => [x.combatant_id, { chance: x.chance, kind: x.kind }])))
        },
        () => undefined,
      )
    }, 250)
    return () => clearTimeout(t)
    // onChances — сеттер родителя
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, roomId, combat?.id])
  useEffect(() => () => onChances({}), [onChances])

  // ручной режим: какие кости вписывать
  const attackFor = plan && plan.attack_bonus != null && (plan.attack || plan.projectiles?.attack) ? targets.map((id) => ({ id, name: nameOf(id) })) : []
  const saveFor = plan?.save ? targets.map((id) => ({ id, name: nameOf(id) })) : []
  const faces = plan
    ? plan.projectiles
      ? facesFor(plan.projectiles.shared_roll ? [plan.projectiles.dice] : Object.values(shots).flatMap((n) => Array.from({ length: n }, () => plan.projectiles!.dice)))
      : facesFor([...(plan.damage ?? []).map((d) => d.dice), plan.heal_dice, plan.temp_hp_dice])
    : []
  const ready = mode === 'auto' || manualReady(fixed, attackFor, faces)

  const cast = async () => {
    if (!body || !combat) return
    setBusy(true)
    setError(null)
    try {
      const clean: FixedRolls = { attack: fixed.attack, save: fixed.save, damage: (fixed.damage ?? []).slice(0, faces.length) }
      await castSpell(roomId, combat.id, { ...body, mode, ...(mode === 'manual' ? { fixed: clean } : {}), ...(isDm && secret ? { secret: true } : {}) })
      onClose()
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const left = total - Object.values(shots).reduce((a, b) => a + b, 0)
  const range = mech.range.kind === 'self' ? 'на себя' : mech.range.kind === 'touch' ? 'касание' : mech.range.feet ? `${mech.range.feet} фт.` : mech.range.kind === 'sight' ? 'в пределах видимости' : ''
  const save = plan?.save
  const maxTargets = plan?.max_targets
  return (
    <>
      <div className="bt-tray-scroll sp-card">
        {top}
        <div className="sp-tags">
          <span>
            <Clock3 aria-hidden="true" /> {UNIT_RU[mech.casting.unit] ?? mech.casting.unit}
          </span>
          {range && (
            <span>
              <Crosshair aria-hidden="true" /> {range}
            </span>
          )}
          {mech.area && (
            <span>
              {AREA_RU[mech.area.shape] ?? mech.area.shape} {mech.area.size_ft} фт.
            </span>
          )}
          {mech.concentration && <span className="is-conc">концентрация</span>}
          {mech.status === 'narrative' && <span className="is-story">разыгрывает мастер</span>}
        </div>

        <ul className="sp-plan" aria-live="polite">
          {!plan && <li className="sp-wait">считаем…</li>}
          {plan?.attack_bonus != null && (plan.attack || plan.projectiles?.attack) && (
            <PlanLine icon={Crosshair}>атака заклинанием {plan.attack_bonus >= 0 ? '+' : ''}{plan.attack_bonus}</PlanLine>
          )}
          {save && (
            <PlanLine icon={Shield}>
              спасбросок {SAVE_RU[save.ability]}, Сл {save.dc}
              {save.half_on_success ? ' · половина при успехе' : ''}
            </PlanLine>
          )}
          {(plan?.damage ?? []).map((d, i) => (
            <PlanLine key={i} icon={Sparkles} tone="dmg">
              {d.dice} {typeRu(d.type === 'choice' ? damageType : d.type)}
            </PlanLine>
          ))}
          {plan?.projectiles && (
            <PlanLine icon={Sparkles} tone="dmg">
              {plan.projectiles.count} × {plan.projectiles.dice} {typeRu(plan.projectiles.type)}
              {plan.projectiles.shared_roll ? ' (одна кость на все)' : ''}
            </PlanLine>
          )}
          {plan?.heal_dice && (
            <PlanLine icon={Sun} tone="heal">
              лечение {plan.heal_dice}
            </PlanLine>
          )}
          {plan?.temp_hp_dice && (
            <PlanLine icon={Shield} tone="heal">
              временные хиты {plan.temp_hp_dice}
            </PlanLine>
          )}
          {plan?.effect?.label && <PlanLine icon={Wand2}>на цели: {plan.effect.label}</PlanLine>}
          {plan?.self_effect?.label && <PlanLine icon={Wand2}>на себя: {plan.self_effect.label}</PlanLine>}
          {(plan?.rider_damage ?? []).map((d, i) => (
            <PlanLine key={`r${i}`} icon={Hand}>
              +{d.dice} {typeRu(d.type)} к попаданиям, пока действует
            </PlanLine>
          ))}
          {maxTargets != null && <PlanLine icon={Crosshair}>до {maxTargets} {maxTargets === 1 ? 'цели' : 'целей'}</PlanLine>}
        </ul>
        {(plan?.notes || mech.notes) && (
          <p className="sp-notes">
            <Info aria-hidden="true" /> {plan?.notes ?? mech.notes}
          </p>
        )}

        {choice.length > 0 && (
          <div className="sp-choice" role="radiogroup" aria-label="Вид урона">
            {choice.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={damageType === c} className={damageType === c ? 'is-on' : ''} onClick={() => setDamageType(c)}>
                {typeRu(c)}
              </button>
            ))}
          </div>
        )}

        {total > 0 && targets.length > 0 && (
          <div className="sp-shots">
            <i>
              снаряды: {total}
              {left > 0 ? `, свободно ${left}` : ''}
            </i>
            {targets.map((id) => (
              <span key={id} className="sp-shot">
                <b>{nameOf(id)}</b>
                <button type="button" disabled={!shots[id]} onClick={() => setShots((s) => ({ ...s, [id]: Math.max(0, (s[id] ?? 0) - 1) }))} aria-label="Меньше">
                  <Minus aria-hidden="true" />
                </button>
                <em>{shots[id] ?? 0}</em>
                <button type="button" disabled={left <= 0} onClick={() => setShots((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }))} aria-label="Больше">
                  <Plus aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        {(mech.attack || mech.projectiles?.attack) && (
          <div className="tb-tri" role="radiogroup" aria-label="Преимущество">
            {([[null, 'Обычно'], ['adv', 'Преимущество'], ['dis', 'Помеха']] as const).map(([v, text]) => (
              <button key={text} type="button" role="radio" aria-checked={advantage === v} className={advantage === v ? 'is-on' : ''} onClick={() => setAdvantage(v)}>
                {text}
              </button>
            ))}
          </div>
        )}

        <div className="sp-flags">
          {mech.ritual && (
            <label className="bt-check">
              <input type="checkbox" checked={ritual} onChange={(e) => (setRitual(e.target.checked), e.target.checked && setRepeat(false))} />
              <span>ритуалом — без ячейки</span>
            </label>
          )}
          {mech.level > 0 && mech.duration.kind !== 'instant' && (
            <label className="bt-check">
              <input type="checkbox" checked={repeat} onChange={(e) => (setRepeat(e.target.checked), e.target.checked && setRitual(false))} />
              <span>повтор длящегося — без ячейки</span>
            </label>
          )}
          {mech.summons?.some((s) => s.choose_count) && (
            <label className="sp-count">
              <span>сколько призвать</span>
              <input className="bt-in" type="number" min={1} max={30} value={summonCount} onChange={(e) => setSummonCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
            </label>
          )}
          {wantsForm && <SummonForm hint={mech.summons?.[0]?.name} value={summonRef} onChange={setSummonRef} />}
          {isDm && (
            <label className="bt-check">
              <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
              <span>скрыто от игроков</span>
            </label>
          )}
        </div>

        <div className="sp-mode" role="radiogroup" aria-label="Кто бросает">
          <button type="button" role="radio" aria-checked={mode === 'auto'} className={mode === 'auto' ? 'is-on' : ''} onClick={() => setMode('auto')}>
            <Dices aria-hidden="true" /> бросает сервер
          </button>
          <button type="button" role="radio" aria-checked={mode === 'manual'} className={mode === 'manual' ? 'is-on' : ''} onClick={() => setMode('manual')}>
            <Hand aria-hidden="true" /> ввожу сам
          </button>
        </div>
        {mode === 'manual' && <ManualRolls attackFor={attackFor} saveFor={saveFor} faces={faces} value={fixed} onChange={setFixed} />}
      </div>
      <footer>
        {error && <p className="tb-err">{error}</p>}
        {aim}
        {targets.length > 0 && preview && preview.targets.length > 0 && (
          <ul className="sp-odds">
            {preview.targets.map((t) => (
              <li key={t.combatant_id} className={t.chance >= 0.65 ? 'is-good' : t.chance <= 0.35 ? 'is-bad' : ''}>
                <b>{nameOf(t.combatant_id)}</b>
                <i>
                  {t.kind === 'auto' ? 'без броска' : `${Math.round(t.chance * 100)}%`}
                  {t.kind === 'save' ? ' провала' : t.kind === 'attack' ? ' попасть' : ''}
                  {t.ac != null ? ` · КД ${t.ac}` : ''}
                  {t.high_ground ? ' · ▲ высота: преимущество' : ''}
                </i>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="tb-goldbtn" disabled={busy || !ready || (!!maxTargets && targets.length > maxTargets)} onClick={() => void cast()}>
          <Wand2 aria-hidden="true" /> {busy ? 'творим…' : reaction ? 'Сотворить реакцией' : 'Сотворить'}
        </button>
      </footer>
    </>
  )
}

/** Форма призыва: существо из бестиария. Без выбора сервер возьмёт простой статблок из механики */
function SummonForm({ hint, value, onChange }: { hint?: string; value: { id: string; name: string } | null; onChange: (v: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ id: string; name: string; challenge_rating?: string | number | null }[]>([])
  useEffect(() => {
    const query = q.trim()
    if (!query) return setFound([])
    let on = true
    const t = setTimeout(() => {
      fetchPage<{ id: string; name: string; challenge_rating?: string | number | null }>('creatures', { q: query, limit: 8 }).then(
        (r) => on && setFound(r.items),
        () => on && setFound([]),
      )
    }, 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])
  if (value) {
    return (
      <div className="sp-form is-set">
        <span>Форма: <b>{value.name}</b></span>
        <button type="button" className="tb-linkbtn" onClick={() => onChange(null)}>
          сменить
        </button>
      </div>
    )
  }
  return (
    <div className="sp-form">
      <span>Форма призыва{hint ? ` (${hint})` : ''}</span>
      <input className="bt-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Существо из бестиария…" aria-label="Форма призыва" />
      {found.length > 0 && (
        <ul>
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange({ id: c.id, name: c.name })}>
                {c.name}
                {c.challenge_rating != null && <i> · ПО {c.challenge_rating}</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
