/**
 * Угол экрана с отрядом: полоска героев (портрет, хиты, временные хиты, КД,
 * пассивная Внимательность, состояния) и над ней панель эффектов своего героя.
 * Нажатие на героя наводит карту на его жетон. Мастер видит всех и, выбрав
 * героя (или в его ход), может снимать с него эффекты.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { ChevronDown, Eye, Shield, Sparkles, Users, X } from 'lucide-react'
import { parsePortrait } from '../../characters/portrait'
import { focusToken } from '../../maps/focus'
import { Img } from '../../media'
import type { CharacterCard } from '../../types/rooms'
import { heroHealth, healthText } from '../health'
import { useRoom } from '../RoomProvider'
import { describeEffect } from '../table/effects'
import { errText } from '../table/parts'
import { useEffectControl } from '../table/useEffects'
import { durationText, effectsOfCard, selectParty, type PartyMember } from './partyData'

const PREF = 'vantage.partyHud.open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(PREF) !== '0'
  } catch {
    return true
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(PREF, open ? '1' : '0')
  } catch {
    /* хранилище недоступно — просто не запоминаем */
  }
}

export function PartyHud() {
  const { data, isDm } = useRoom()
  const [open, setOpen] = useState(readOpen)
  const [picked, setPicked] = useState<string | null>(null)
  const mine = data?.me.room_character_id ?? null
  const characters = data?.characters
  const map = data?.activeMap ?? null
  const combat = data?.combat ?? null
  const party = useMemo(() => selectParty(characters ?? [], { mine, map, combat }), [characters, mine, map, combat])

  if (!data || party.length === 0) return null

  // чьи эффекты: игроку — свой герой; мастеру — выбранный или тот, чей ход
  const fxCard = isDm ? (party.find((m) => m.card.id === picked) ?? party.find((m) => m.current))?.card : party.find((m) => m.mine)?.card
  const toggle = () => {
    setOpen((v) => {
      writeOpen(!v)
      return !v
    })
  }
  const onPick = (m: PartyMember) => {
    if (isDm) setPicked((p) => (p === m.card.id ? null : m.card.id))
    if (m.tokenId) focusToken(m.tokenId)
  }

  return (
    <aside className={`pt-hud${open ? '' : ' is-closed'}`} aria-label="Отряд">
      {open && fxCard && <EffectsPanel key={fxCard.id} card={fxCard} canRemove={isDm} own={!isDm} onClose={isDm ? () => setPicked(null) : undefined} />}
      <div className="pt-bar">
        <button type="button" className="pt-toggle" onClick={toggle} aria-expanded={open} title={open ? 'Свернуть отряд' : 'Показать отряд'} aria-label={open ? 'Свернуть отряд' : 'Показать отряд'}>
          {open ? <ChevronDown aria-hidden="true" /> : <Users aria-hidden="true" />}
        </button>
        {open && (
          <ol className="pt-list">
            {party.map((m) => (
              <li key={m.card.id}>
                <PartyChip m={m} picked={isDm && picked === m.card.id} onPick={() => onPick(m)} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
}

function PartyChip({ m, picked, onPick }: { m: PartyMember; picked: boolean; onPick: () => void }) {
  const { card } = m
  const hp = heroHealth(card)
  const [broken, setBroken] = useState(false)
  const src = parsePortrait(card.avatar_url).src
  const temp = card.hp.temp ?? 0
  const max = Math.max(1, card.hp.max)
  const effects = effectsOfCard(card).map((e) => describeEffect(e.label, { id: e.id, rounds: e.rounds_left }))
  const pp = card.passive_perception
  const tone = hp.kind !== 'hidden' ? hp.band : 'healthy'
  const where = m.tokenId ? 'Показать на карте' : 'Нет на карте'
  const label = `${card.name}${m.mine ? ' (вы)' : ''}. ${healthText(hp)}. КД ${card.ac}${pp != null ? `, пассивная Внимательность ${pp}` : ''}${effects.length ? `. Состояния: ${effects.map((e) => e.title).join(', ')}` : ''}. ${where}`
  const cls = ['pt-chip', `is-${tone}`, m.mine && 'is-mine', m.current && 'is-current', m.down && 'is-down', picked && 'is-picked', !m.tokenId && 'is-off'].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={onPick} aria-label={label} title={label} aria-pressed={picked || undefined}>
      <span className="pt-face" aria-hidden="true">
        {src && !broken ? <Img src={src} alt="" draggable={false} onError={() => setBroken(true)} /> : <b>{card.name.trim().charAt(0).toUpperCase()}</b>}
      </span>
      <span className="pt-body">
        <span className="pt-name">{card.name}</span>
        <span className="pt-hp" style={{ '--hp': hp.kind === 'exact' ? hp.ratio : 0, '--tmp': Math.min(1, temp / max) } as CSSProperties}>
          <i className="pt-hp-fill" />
          {temp > 0 && <i className="pt-hp-temp" />}
          <b>
            {card.hp.current}/{card.hp.max}
            {temp > 0 && <em>+{temp}</em>}
          </b>
        </span>
        <span className="pt-stats">
          <span title="Класс доспеха">
            <Shield aria-hidden="true" />
            {card.ac}
          </span>
          <span title="Пассивная Внимательность">
            <Eye aria-hidden="true" />
            {pp ?? '—'}
          </span>
          {effects.length > 0 && (
            <span className="pt-conds">
              {effects.slice(0, 4).map((e, i) => {
                const Icon = e.def.icon
                return <Icon key={`${e.label}-${i}`} className={`is-${e.def.key}`} aria-hidden="true" />
              })}
              {effects.length > 4 && <em>+{effects.length - 4}</em>}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

function EffectsPanel({ card, canRemove, own, onClose }: { card: CharacterCard; canRemove: boolean; own: boolean; onClose?: () => void }) {
  const list = effectsOfCard(card)
  const { remove } = useEffectControl({ card })
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (list.length === 0) return null

  const drop = async (key: string, id: string, label: string, rounds: number | null) => {
    setBusy(key)
    setError(null)
    try {
      await remove(describeEffect(label, { id, rounds }))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="pt-fx" aria-label={own ? 'Эффекты вашего героя' : `Эффекты: ${card.name}`}>
      <header className="pt-fx-head">
        <Sparkles aria-hidden="true" />
        <span>{own ? 'Эффекты' : card.name}</span>
        {onClose && (
          <button type="button" className="pt-fx-x" onClick={onClose} aria-label="Закрыть панель эффектов" title="Закрыть">
            <X aria-hidden="true" />
          </button>
        )}
      </header>
      <ul className="pt-fx-list">
        {list.map((e, i) => {
          const shown = describeEffect(e.label, { id: e.id, rounds: e.rounds_left })
          const Icon = shown.def.icon
          const key = e.id || `${e.label}-${i}`
          const expanded = openId === key
          const title = shown.def.key === 'concentration' ? `Концентрация: ${shown.title}` : shown.title
          return (
            <li key={key} className={`pt-fx-row is-${shown.def.key}${expanded ? ' is-open' : ''}`}>
              <button type="button" className="pt-fx-main" onClick={() => setOpenId(expanded ? null : key)} aria-expanded={expanded}>
                <span className="pt-fx-seal">
                  <Icon aria-hidden="true" />
                </span>
                <span className="pt-fx-name">{title}</span>
                {e.rounds_left != null && e.rounds_left > 0 && (
                  <span className="pt-fx-rounds" title={durationText(e)}>
                    {e.rounds_left}
                  </span>
                )}
              </button>
              {canRemove && e.id && (
                <button type="button" className="pt-fx-off" disabled={busy === key} onClick={() => void drop(key, e.id, e.label, e.rounds_left)} aria-label={`Снять: ${title}`} title="Снять">
                  <X aria-hidden="true" />
                </button>
              )}
              {expanded && (
                <p className="pt-fx-more">
                  {shown.def.hint && <span>{shown.def.hint}</span>}
                  <span>Длительность: {durationText(e)}</span>
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p className="pt-fx-err" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
