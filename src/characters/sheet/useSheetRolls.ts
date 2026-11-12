/**
 * Броски листа героя: 3D-кости или сервер комнаты, история бросков,
 * очередь «театра» и реакции после к20. Состояние живёт в листе — хук
 * вызывается из `CharacterSheet`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clover, Flame, Sparkles, Star, Swords } from 'lucide-react'
import { useCreatureDice } from '../../creature/dice'
import { useRoomRoll } from '../../rooms/RoomDice'
import { ABILITY_LABELS } from '../../types/character'
import type { LogEntry, SheetView } from '../../types/character'
import type { SheetRoller } from '../sheetPlay'
import { d20Cards, rollMode, tagCards, type RollContext, type RollMode } from '../rollBonuses'
import type { RollReaction, RollSpec } from '../../dice/theater/RollTheater'
import type { EngineView } from '../EnginePanel'
import type { Outcome } from '../useCharacterEngine'
import type { StageEngine } from '../HeroStage'
import { bonusNotes } from '../../dice/bonusDice'
import { type RollShown, parseDamage, sidesOf } from './rules'

export function useSheetRolls({
  sheet,
  stage,
  engine,
  roomMode,
  serverLog,
}: {
  sheet: SheetView
  stage?: StageEngine
  engine?: EngineView
  roomMode?: { isDm: boolean }
  serverLog: Outcome | null
}) {
  const dice = useCreatureDice()
  // в комнате кости бросает сервер; вне её (и в предпросмотре) — локальные 3D-кости
  const roomRoll = useRoomRoll()
  const viaServer = !!roomMode && !!roomRoll
  const [roomPending, setRoomPending] = useState(false)
  // история бросков: свежий — первым, держим последние 30
  const [rolls, setRolls] = useState<RollShown[]>([])
  const clearRolls = useCallback(() => setRolls([]), [])
  // атака, для которой выпала натуральная 20: её следующий урон — критический
  const [critFor, setCritFor] = useState<string | null>(null)
  // крит с 19 у Чемпиона
  const critMin = sheet.extras?.critMin ?? 20

  /* ---------- броски: 3D-кости, затем театр в духе BG3 ---------- */

  const show = (r: Omit<RollShown, 'id'>) =>
    setRolls((prev) => [{ ...r, id: (prev[0]?.id ?? 0) + 1 }, ...prev].slice(0, 30))
  const note = (total: string, label: string) => show({ label, dice: [], sides: 0, bonus: 0, total })

  // очередь показов: каждый бросок — свой «театр», по одному
  const [theater, setTheater] = useState<RollSpec[]>([])
  const theaterId = useRef(0)
  const enqueue = useCallback(
    (spec: Omit<RollSpec, 'id'>) => setTheater((q) => [...q, { ...spec, id: ++theaterId.current }]),
    [],
  )

  /** Выбросить кости: сервером (в комнате) или локальными 3D-костями */
  const rollValues = async (n: number, sides: number, label: string): Promise<number[] | null> => {
    if (!viaServer || !roomRoll) return dice.roll(n, sides)
    setRoomPending(true)
    try {
      const res = await roomRoll.roll({ expression: `${n}d${sides}`, label })
      await roomRoll.whenPlayed(res.seq)
      return res.dice.filter((d) => !d.source).flatMap((d) => d.rolls)
    } catch (e) {
      note('!', e instanceof Error ? e.message : 'Бросок не удался')
      return null
    } finally {
      setRoomPending(false)
    }
  }

  /**
   * Реакции после к20 — что герой может добавить к уже выпавшему:
   * вдохновение и Везунчик — ещё к20 и взять лучшую, кость превосходства — к
   * атаке, Удача темнейшего — к10 к проверке или спасброску, Удача плута —
   * превратить бросок в 20. Ресурс списывает сервер, кость бросает театр.
   */
  const d20Reactions = (kind: RollContext['kind'] | undefined): RollReaction[] => {
    const out: RollReaction[] = []
    const vitals = stage?.onVitals
    const spendRes = stage?.onSpendResource
    const res = (key: string) => engine?.sheet.resources.find((r) => r.key === key && r.current > 0)
    const isAttack = kind === 'attack' || kind === 'spell'
    const isCheck = kind === 'check' || kind === 'skill' || kind === 'init'
    const isSave = kind === 'save'

    if (vitals && (stage?.inspiration ?? 0) > 0) {
      out.push({
        key: 'inspiration',
        label: 'Вдохновение',
        hint: 'перебросить к20 и взять лучшее',
        icon: Star,
        run: async () => {
          vitals('inspiration', -1)
          const v = await rollValues(1, 20, 'Реакция: к20')
          return v ? { newD20: v[0] } : null
        },
      })
    }
    if (!spendRes) return out

    const luck = res('luck')
    if (luck && (isAttack || isCheck || isSave)) {
      out.push({
        key: 'luck',
        label: 'Везунчик',
        hint: `ещё к20 — единиц удачи: ${luck.current}`,
        icon: Clover,
        run: async () => {
          if (!(await spendRes('luck', 1, 'Везунчик: дополнительная к20'))) return null
          const v = await rollValues(1, 20, 'Реакция: к20')
          return v ? { newD20: v[0] } : null
        },
      })
    }

    // кость превосходства мастера боевых искусств — по классу, у черты и стиля — к6
    const sup = ['superiority', 'superiority_feat', 'superiority_style'].map(res).find(Boolean)
    if (sup && isAttack) {
      const dieVar = engine?.sheet.values['var.superiority_die']
      const sides = sup.key === 'superiority' && typeof dieVar === 'number' ? dieVar : 6
      out.push({
        key: 'superiority',
        label: 'Кость превосходства',
        hint: `+к${sides} к атаке — осталось ${sup.current}`,
        icon: Swords,
        run: async () => {
          if (!(await spendRes(sup.key, 1, 'Приём точности: кость к атаке'))) return null
          const v = await rollValues(1, sides, 'Кость превосходства')
          return v ? { addDie: { sides, value: v[0] }, label: 'Кость превосходства' } : null
        },
      })
    }

    const dark = res('dark_ones_luck')
    if (dark && (isCheck || isSave)) {
      out.push({
        key: 'dark_ones_luck',
        label: 'Удача темнейшего',
        hint: '+к10 к проверке или спасброску',
        icon: Flame,
        run: async () => {
          if (!(await spendRes('dark_ones_luck', 1, 'Удача темнейшего: +к10'))) return null
          const v = await rollValues(1, 10, 'Удача темнейшего: к10')
          return v ? { addDie: { sides: 10, value: v[0] }, label: 'Удача темнейшего' } : null
        },
      })
    }

    const stroke = res('stroke_of_luck')
    if (stroke && (isAttack || isCheck)) {
      out.push({
        key: 'stroke_of_luck',
        label: 'Удача',
        hint: 'считать бросок к20 равным 20',
        icon: Sparkles,
        run: async () => ((await spendRes('stroke_of_luck', 1, 'Удача: к20 становится 20')) ? { newD20: 20 } : null),
      })
    }
    return out
  }

  const rollD20 = async (label: string, bonus: number, attackKey?: string, ctx?: RollContext) => {
    // преимущество и помеха — из листа: Безрассудная атака, ярость на Силу
    const { mode, label: modeLabel } = rollMode(sheet, ctx)
    const tagForServer = mode === 'adv' ? ' · преимущество' : mode === 'dis' ? ' · помеха' : ''
    let values: number[] | null
    // кости эффектов (Благословение +1к4, Порча −1к4): их прибавляет сервер, показываем отдельно
    let effects: { source: string; value: number }[] = []
    if (viaServer && roomRoll) {
      // с модификатором и режимом: итог в журнале комнаты сходится с листом
      setRoomPending(true)
      try {
        const k = ctx?.kind
        const res = await roomRoll.roll({
          expression: `1d20${bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : ''}`,
          label: `${label}${tagForServer}`,
          mode: mode === 'normal' ? null : mode,
          kind: k === 'attack' || k === 'spell' ? 'attack' : k === 'save' || k === 'death' ? 'save' : k === 'check' || k === 'skill' || k === 'init' ? 'check' : undefined,
        })
        effects = bonusNotes(res.dice)
        const rolls = res.dice.filter((d) => !d.source).flatMap((d) => d.rolls)
        // в dice остаётся только оставленная кость, вторую восстанавливаем из итога
        const other = res.discarded_total != null ? res.discarded_total - res.modifier : null
        values = rolls.length === 1 && mode !== 'normal' && other != null && other >= 1 && other <= 20 ? [rolls[0], other] : rolls
        // сначала кости ложатся, потом показываем числа
        await roomRoll.whenPlayed(res.seq)
      } catch (e) {
        note('!', e instanceof Error ? e.message : 'Бросок не удался')
        values = null
      } finally {
        setRoomPending(false)
      }
    } else {
      values = await dice.roll(mode === 'normal' ? 1 : 2, 20)
    }
    if (!values) return null
    const kept = mode === 'adv' ? Math.max(...values) : mode === 'dis' ? Math.min(...values) : values[0]
    // у атаки крит может начинаться раньше 20 (Улучшенные критические попадания)
    const crit = kept >= (attackKey ? critMin : 20)
    const tag = mode === 'adv' ? ' · преимущество' : mode === 'dis' ? ' · помеха' : ''
    const effectSum = effects.reduce((s, e) => s + e.value, 0)
    show({ label: `${label}${tag}`, dice: values, sides: 20, bonus: bonus + effectSum, total: kept + bonus + effectSum, crit, fumble: kept === 1 })
    if (attackKey) setCritFor(crit ? attackKey : null)
    enqueue({
      title: label,
      kind: 'd20',
      dice: values.map((value) => ({ sides: 20, value })),
      mode,
      modeLabel,
      bonuses: [...d20Cards(sheet, ctx, bonus), ...effects.map((e) => ({ label: e.source, value: e.value, kind: 'effect' as const }))],
      critMin: attackKey ? critMin : 20,
      reactions: ctx?.kind === 'death' ? [] : d20Reactions(ctx?.kind),
    })
    return kept
  }

  const rollDamage = async (label: string, formula: string, attackKey: string, ctx?: RollContext) => {
    const parsed = parseDamage(formula)
    if (!parsed) return
    const crit = critFor === attackKey
    // бонусы урона по тегам атаки: Ярость +2 к силовой рукопашной
    const extra = ctx?.tags ? tagCards(sheet, 'dmgBonus', ctx.tags) : []
    const extraSum = extra.reduce((s, c) => s + c.value, 0)
    const modCard = parsed.bonus
      ? [{ label: ctx?.ability ? ABILITY_LABELS[ctx.ability].label : 'Модификатор', value: parsed.bonus, kind: 'ability' as const }]
      : []
    if (parsed.n === 0) {
      show({ label, dice: [], sides: 0, bonus: parsed.bonus + extraSum, total: Math.max(1, parsed.bonus + extraSum) })
      return
    }
    const n = crit ? parsed.n * 2 : parsed.n
    let values: number[] | null
    if (viaServer && roomRoll) {
      const mod = parsed.bonus + extraSum
      setRoomPending(true)
      try {
        const res = await roomRoll.roll({ expression: `${n}d${parsed.sides}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`, label: crit ? `${label} · крит!` : label })
        values = res.dice.filter((d) => !d.source).flatMap((d) => d.rolls)
        await roomRoll.whenPlayed(res.seq)
      } catch (e) {
        note('!', e instanceof Error ? e.message : 'Бросок не удался')
        values = null
      } finally {
        setRoomPending(false)
      }
    } else {
      values = await dice.roll(n, parsed.sides)
    }
    if (!values) return
    const total = Math.max(1, values.reduce((a, b) => a + b, 0) + parsed.bonus + extraSum)
    const title = crit ? `${label} · крит!` : label
    show({ label: title, dice: values, sides: parsed.sides, bonus: parsed.bonus + extraSum, total, crit })
    setCritFor(null)
    enqueue({ title, kind: 'dice', dice: values.map((value) => ({ sides: parsed.sides, value })), mode: 'normal', bonuses: [...modCard, ...extra] })
  }

  const rollDice = async (label: string, n: number, sides: number, bonus: number) => {
    let values: number[] | null
    if (viaServer && roomRoll) {
      setRoomPending(true)
      try {
        const res = await roomRoll.roll({ expression: `${n}d${sides}${bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : ''}`, label })
        values = res.dice.filter((d) => !d.source).flatMap((d) => d.rolls)
        await roomRoll.whenPlayed(res.seq)
      } catch (e) {
        note('!', e instanceof Error ? e.message : 'Бросок не удался')
        values = null
      } finally {
        setRoomPending(false)
      }
    } else {
      values = await dice.roll(n, sides)
    }
    if (!values) return null
    show({ label, dice: values, sides, bonus, total: values.reduce((a, b) => a + b, 0) + bonus })
    enqueue({
      title: label,
      kind: 'dice',
      dice: values.map((value) => ({ sides, value })),
      mode: 'normal',
      bonuses: bonus ? [{ label: 'Бонус', value: bonus, kind: 'other' }] : [],
    })
    return values
  }

  const roller: SheetRoller = { rolling: dice.rolling || roomPending, critFor, rollD20, rollDamage, rollDice, note }

  /*
   * Броски сервера (Скрытая атака, отдых): 3D-кости катятся для вида, а театр
   * показывает числа сервера. Пришло одно значение к20 при преимуществе —
   * вторую кость дорисовываем случайно не выше (при помехе — не ниже).
   */
  const rollDice3d = dice.roll
  useEffect(() => {
    if (!serverLog) return
    const shown = serverLog.log.filter((l: LogEntry) => l.kind === 'roll' && Array.isArray(l.data?.rolls))
    setRolls((prev) => {
      let next = prev
      const push = (r: Omit<RollShown, 'id'>) => (next = [{ ...r, id: (next[0]?.id ?? 0) + 1 }, ...next].slice(0, 30))
      for (const l of shown) {
        const rolled = l.data!.rolls!
        const sum = rolled.reduce((a, b) => a + b, 0)
        const total = typeof l.data?.total === 'number' ? l.data.total : sum
        push({ label: `${serverLog.title}: ${l.message.split(':')[0]}`, dice: rolled, sides: sidesOf(l.data?.dice), bonus: total - sum, total })
      }
      if (shown.length === 0) push({ label: serverLog.title, dice: [], sides: 0, bonus: 0, total: '✓' })
      return next
    })
    let cancelled = false
    void (async () => {
      for (const l of shown) {
        if (cancelled) return
        const rolled = l.data!.rolls!
        const sides = sidesOf(l.data?.dice) || 6
        const notation = String(l.data?.dice ?? '')
        // сервер сам присылает режим и обе кости; у старого — догадка по нотации
        const sent = l.data?.mode
        let mode: RollMode =
          sent === 'adv' || sent === 'dis' ? sent : /kh|adv/i.test(notation) ? 'adv' : /kl|dis/i.test(notation) ? 'dis' : 'normal'
        let values = [...rolled]
        if (sides === 20 && mode !== 'normal' && values.length === 1) {
          const v = values[0]
          const other = mode === 'adv' ? 1 + Math.floor(Math.random() * v) : v + Math.floor(Math.random() * (21 - v))
          values = [v, other]
        }
        // две кости не к20 с преимуществом — показываем только оставленную
        if (mode !== 'normal' && sides !== 20 && values.length === 2) {
          values = [mode === 'adv' ? Math.max(...values) : Math.min(...values)]
        }
        if (sides !== 20 || values.length !== 2) mode = 'normal'
        // визуальный бросок: число костей и граней как у сервера
        if (!viaServer) await rollDice3d(values.length, sides).catch(() => null)
        const kept = mode === 'adv' ? Math.max(...values) : mode === 'dis' ? Math.min(...values) : null
        const sum = kept ?? values.reduce((a, b) => a + b, 0)
        const total = typeof l.data?.total === 'number' ? l.data.total : sum
        enqueue({
          title: `${serverLog.title}: ${l.message.split(':')[0]}`,
          kind: sides === 20 ? 'd20' : 'dice',
          dice: values.map((value) => ({ sides, value })),
          mode,
          bonuses: total - sum ? [{ label: serverLog.title, value: total - sum, kind: 'feature' }] : [],
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [serverLog]) // eslint-disable-line react-hooks/exhaustive-deps

  return { dice, roller, rolls, clearRolls, critFor, rollD20, rollDamage, theater, setTheater }
}
