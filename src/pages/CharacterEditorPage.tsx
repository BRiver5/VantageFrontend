/**
 * Сохранённый персонаж — тот же лист, что на итоге конструктора, но живой и
 * собранный сервером: все числа приходят из `/sheet`, действия, хиты, отдых и
 * уровень выполняет движок. В шапке — журнал действий, отдых и новый уровень
 * (он открывает тот же пошаговый мастер, что и создание героя). Сам документ (инвентарь, кошелёк, записи,
 * видимость) правится прямо в листе и сохраняется с небольшой задержкой;
 * остальное — в окне «Правка листа». Чужой публичный лист открывается для
 * просмотра: бросать кости можно, менять — нет. В шапке такого листа —
 * «Скопировать персонажа себе»: тот же POST /characters, что и при создании.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  CloudOff,
  Coffee,
  Copy,
  Eye,
  Globe,
  GraduationCap,
  Loader2,
  Lock,
  Moon,
  PencilLine,
  RefreshCw,
  ScrollText,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { castSpellFromSheet, createCharacter, getOne, realImage, type Creature } from '../api'
import { useAuth } from '../auth/AuthContext'
import { ActionDialog } from '../characters/ActionDialog'
import CharacterSheet, { type SheetTab } from '../characters/CharacterSheet'
import { JournalDrawer, JournalModal, PendingBanner, ShortRestDialog } from '../characters/EngineDialogs'
import type { EngineView } from '../characters/EnginePanel'
import type { StageEngine } from '../characters/HeroStage'
import { parsePortrait } from '../characters/portrait'
import { SheetEditor } from '../characters/SheetEditor'
import { sheetPlayFromServer } from '../characters/sheetPlay'
import { buildSheetView, valuesOf } from '../characters/sheetView'
import { useCharacterEngine } from '../characters/useCharacterEngine'
import { useRoomOptional } from '../rooms/RoomProvider'
import { syncRoomInventory } from '../rooms/inventorySync'
import type { HudControls, HudExtra } from '../characters/GameHud'
import { useAppShell } from '../shell'
import { useNames } from '../characters/useNames'
import { WorldBackdrop } from '../creatureSheet'
import { getEngineCatalog, getEngineDictionaries, type EngineDictionaries } from '../api'
import type { InventoryItemInstance, SheetView } from '../types/character'
import type { CharacterVisibility } from '../types/auth'

const VISIBILITY: Record<CharacterVisibility, { icon: LucideIcon; label: string }> = {
  private: { icon: Lock, label: 'Только вы' },
  unlisted: { icon: Eye, label: 'По ссылке' },
  public: { icon: Globe, label: 'Публичный' },
}

/** Сколько держится тост «Сделано · Отменить» */
const TOAST_MS = 7000

/** Лист героя, играемый внутри комнаты */
export interface RoomLiveContext {
  roomId: string
  /** мастер комнаты: действует за любого и правит лист целиком */
  isDm: boolean
  /** id персонажа-источника: по нему каталог движка подписывает способности */
  sourceCharacterId?: string | null
  /** картинка героя, если в комнатной копии её нет (берётся из оригинала) */
  avatarFallback?: string | null
  /** куда ведёт «назад» и как подписана ссылка */
  backTo: { to: string; label: string }
  /** окна и пункты меню экрана героя на телефоне (партия, стол) */
  hudExtra?: HudExtra
  /** действия с предметами и монетами героя: диалоги открывает комната */
  items?: {
    onTransfer: (item: InventoryItemInstance) => void
    onDropToTable: (item: InventoryItemInstance) => void
    onTransferCoins: () => void
  }
}

export interface LiveCharacterProps {
  /** id персонажа или база пути копии в комнате (api.ts, CharacterRef) */
  characterRef: string
  tab: SheetTab
  onTab: (t: SheetTab) => void
  room?: RoomLiveContext
}

/** Страница /characters/:id: открытая вкладка листа живёт в адресе, чтобы её можно было переслать */
export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as SheetTab | null) ?? 'main'
  const setTab = (t: SheetTab) => setParams(t === 'main' ? {} : { tab: t }, { replace: true })
  if (!id) return null
  return <LiveCharacter key={id} characterRef={id} tab={tab} onTab={setTab} />
}

export function LiveCharacter({ characterRef, tab, onTab: setTab, room }: LiveCharacterProps) {
  const { user, ready } = useAuth()
  const roomCtx = useRoomOptional()
  const eng = useCharacterEngine(characterRef)
  const { character, sheet } = eng
  const { names, races, classes } = useNames(character)
  const [dict, setDict] = useState<EngineDictionaries | null>(null)
  // подписи var.*, state.*, char.flags.* — их объявляют способности этого героя
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [editOpen, setEditOpen] = useState(false)
  // журнал действий — панель справа из шапки; журнал хитов — окно у шестигранника
  const [journalOpen, setJournalOpen] = useState(false)
  const [hpJournalOpen, setHpJournalOpen] = useState(false)
  const [restOpen, setRestOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { app: hudMode } = useAppShell()

  useEffect(() => {
    void getEngineDictionaries().then(setDict)
  }, [])

  // набор способностей поменялся (уровень, выбор, предмет) — подписи перечитываем
  const abilityKey = sheet?.abilities.map((a) => a.slug).join(',') ?? ''
  const characterId = character?.id
  const sourceId = room ? (character as { source_character_id?: string } | null)?.source_character_id : undefined
  useEffect(() => {
    if (!characterId || !abilityKey) return
    let alive = true
    // у копии в комнате подписи способностей берём по её источнику: каталог знает его набор
    getEngineCatalog(room?.sourceCharacterId ?? sourceId ?? characterId)
      .then((c) => {
        if (!alive) return
        setLabels(c.labels)
        if (c.dictionaries) setDict(c.dictionaries)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [characterId, abilityKey, room?.sourceCharacterId, sourceId])

  // свой лист — играть и сохранять; админ видит и меняет всё
  // в комнате мастер действует как админ: за любого игрока и с правкой листа
  const admin = user?.role === 'admin' || !!room?.isDm
  const owner = !!character && !!user && (admin || character.player_id === user.id)
  // копию в комнате игрок правит ограниченно: числа, уровень и состав способностей — мастер
  const canEditSheet = room ? room.isDm : owner

  // лист изменили на сервере (мастер, другой клиент): комната сообщает новую ревизию
  const roomRev = room && character ? roomCtx?.data?.sheetRev[character.id] : undefined
  const { reload } = eng
  const sheetRevision = sheet?.revision ?? 0
  useEffect(() => {
    if (roomRev != null && roomRev > sheetRevision) void reload()
  }, [roomRev, sheetRevision, reload])

  const view = useMemo(
    () => (character && sheet ? buildSheetView(character.avatar_url || !room?.avatarFallback ? character : { ...character, avatar_url: room.avatarFallback }, sheet, names, dict, labels) : null),
    [character, sheet, names, dict, labels, room?.avatarFallback],
  )

  // дикий облик: зверь из листа — его картинка на аватаре, пока облик активен
  const formActive = sheet?.values['form.wild_shape.active'] === true
  const formCreatureId = formActive ? String(sheet?.values['form.wild_shape.creature_id'] ?? '') : ''
  const [creature, setCreature] = useState<Creature | null>(null)
  useEffect(() => {
    if (!formCreatureId) {
      setCreature(null)
      return
    }
    let alive = true
    getOne<Creature>('creatures', formCreatureId)
      .then((c) => alive && setCreature(c))
      .catch(() => alive && setCreature(null))
    return () => {
      alive = false
    }
  }, [formCreatureId])

  // тост с отменой гаснет сам
  const { outcome, clearOutcome } = eng
  useEffect(() => {
    if (!outcome) return
    const t = setTimeout(clearOutcome, TOAST_MS)
    return () => clearTimeout(t)
  }, [outcome, clearOutcome])

  const { patchDoc } = eng
  /** Правки листа (записи, кошелёк) — в документ; числа листа здесь не меняются */
  const sheetPatch = useCallback(
    (fn: (c: SheetView) => SheetView) => {
      if (!view) return
      const next = fn(view)
      patchDoc((c) => ({
        ...(next.personality !== view.personality ? { personality: next.personality } : {}),
        ...(next.backstory !== view.backstory ? { backstory: next.backstory } : {}),
        ...(next.notes !== view.notes ? { notes: next.notes } : {}),
        ...(next.inventory.currency !== view.inventory.currency && (!room || room.isDm)
          ? { inventory: { ...c.inventory, currency: next.inventory.currency } }
          : {}),
      }))
    },
    [view, patchDoc, room],
  )

  /** Инвентарь: монеты из контейнера — в кошелёк; КД и умения предметов пересчитает сервер */
  const onInventory = useCallback(
    (items: InventoryItemInstance[], coins?: Partial<Record<keyof SheetView['inventory']['currency'], number>>) => {
      if (room && character) {
        // копия в комнате: владелец не может править инвентарь через PATCH персонажа,
        // перемещения и «надето» идут на маршруты предметов; сначала показываем сразу
        const before = character.inventory.items
        eng.patchLocal((c) => ({ ...c, inventory: { ...c.inventory, items } }))
        void syncRoomInventory(room.roomId, character.id, before, items, { canRemove: room.isDm }).finally(() => void reload())
        return
      }
      patchDoc((c) => {
        const currency = { ...c.inventory.currency }
        for (const [k, v] of Object.entries(coins ?? {})) currency[k as keyof typeof currency] += v ?? 0
        // атаки удалённого оружия уходят вместе с ним
        const ids = new Set(items.map((it) => it.instance_id))
        const attacks = c.attacks.filter((a) => !a.inventory_instance_id || ids.has(a.inventory_instance_id))
        return {
          inventory: { ...c.inventory, items, currency },
          ...(attacks.length !== c.attacks.length ? { attacks } : {}),
        }
      })
    },
    [patchDoc, room, character, eng, reload],
  )

  const fallbackPortrait = useMemo(() => {
    if (!character) return null
    const r = races.find((x) => x.id === character.race_id)
    const cl = classes.find((x) => x.id === character.classes[0]?.class_id)
    return realImage(r?.image_gallery) ?? realImage(cl?.image_gallery)
  }, [character, races, classes])

  if (eng.loadError) {
    return (
      <section className="cw cw-live">
        <p className="auth-error">{eng.loadError}</p>
        <Link to={room?.backTo.to ?? '/characters'} className="cs-btn">
          {room ? room.backTo.label : 'К списку'}
        </Link>
      </section>
    )
  }

  if (!character || !sheet || !view) {
    return (
      <section className="cw cw-live">
        <p className="muted cw-live-loading">
          <Loader2 className="cw-spin" aria-hidden="true" /> Загрузка листа…
        </p>
      </section>
    )
  }

  const vis = VISIBILITY[character.visibility] ?? VISIBILITY.private
  const VisIcon = vis.icon
  const pic = parsePortrait(character.avatar_url || room?.avatarFallback)
  const master = admin ? eng.master : undefined

  const play = sheetPlayFromServer(view, {
    master,
    // сотворение с листа: сервер тратит ячейку, ставит концентрацию, лечит и вешает эффект на себя
    cast: owner || admin
      ? async (spell, how) => {
          const m = spell.mechanics
          const onSelf = !!(m?.heal || m?.temp_hp || m?.effect?.on === 'self' || m?.targets?.kind === 'self' || m?.range?.kind === 'self')
          const res = await castSpellFromSheet(characterRef, {
            spell_name: spell.name,
            ...(typeof how === 'number' ? { slot_level: how } : {}),
            ...(how === 'ritual' ? { ritual: true } : {}),
            ...(m?.damage?.some((d) => d.type === 'choice') ? { damage_type: m.damage.find((d) => d.type === 'choice')?.choices?.[0] ?? null } : {}),
            target: onSelf ? 'self' : 'other',
          })
          void reload()
          const rolled = (res.rolls ?? []).map((r) => `${r.label ?? r.expression ?? ''} ${r.total ?? ''}`.trim()).filter(Boolean)
          const line = res.log?.find((l) => l.message)?.message
          return [line ?? `${spell.name}${typeof how === 'number' && how > spell.level ? ` · ${how} круг` : ''}`, ...rolled].join(' · ')
        }
      : undefined,
    setSpent: owner
      ? (next) =>
          patchDoc((c) => ({
            spells: c.spells.map((sp) => {
              const snap = (sp.snapshot ?? {}) as Record<string, unknown>
              const spent = next.has(sp.name)
              return !!snap.spent === spent ? sp : { ...sp, snapshot: { ...snap, spent } }
            }),
          }))
      : undefined,
  })

  /** Продолжительный отдых: сервер восстанавливает всё своё, расовую магию — документ */
  const longRest = () =>
    eng.longRest(() => {
      if (play.racialUsed.size) play.setRacialUsed(() => new Set())
    })

  const engineView: EngineView = {
    sheet,
    labels,
    busy: eng.busy,
    canPlay: owner,
    onAction: (a) => eng.action(a.grant_id, a.key, a.label),
  }

  const num = valuesOf(sheet).num
  const revert = sheet.actions.find((a) => a.key === 'revert' && a.ability_slug.endsWith('wild_shape'))
  const stage: StageEngine = {
    busy: eng.busy,
    inspiration: num('char.inspiration'),
    onVitals: owner ? eng.vitals : undefined,
    onSpendResource: owner ? eng.spend : undefined,
    damageTypes: dict?.damage_types,
    onShortRest: owner ? () => setRestOpen(true) : undefined,
    onHpJournal: owner ? () => setHpJournalOpen(true) : undefined,
    form: formActive
      ? {
          name: creature?.name ?? 'зверь',
          hp: num('form.wild_shape.hp'),
          max: num('form.wild_shape.max_hp'),
          onRevert: owner && revert ? () => eng.action(revert.grant_id, revert.key, revert.label) : undefined,
        }
      : null,
  }
  // в облике на печати — зверь целиком; картинку отдаёт сам лист
  const formImage = sheet.values['form.wild_shape.image']
  const creatureArt =
    (typeof formImage === 'string' && formImage) || (creature ? (realImage(creature.image_gallery) ?? realImage(creature.image_url)) : null)
  const portrait = formActive && creatureArt ? creatureArt : pic.src
  const portraitFace = formActive && creatureArt ? { cx: 0.5, cy: 0.3, r: 0.5, shape: 'full' as const } : pic.face

  const save = eng.saveState
  const status = !owner
    ? { icon: Eye, text: 'Просмотр — изменения не сохраняются' }
    : save === 'error'
      ? { icon: CloudOff, text: eng.saveError ?? 'Ошибка сохранения' }
      : save === 'saving' || save === 'pending'
        ? { icon: Loader2, text: 'Сохранение…' }
        : save === 'saved'
          ? { icon: Check, text: 'Сохранено' }
          : null
  const StatusIcon = status?.icon
  const flow = eng.flow
  const banner = eng.conflict ?? eng.notice
  const canCopy = ready && !owner && !room

  /** Чужой лист целиком — новый персонаж текущего игрока */
  const copyToMe = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/characters/${character.id}`)}`)
      return
    }
    setCopying(true)
    setCopyError(null)
    try {
      const created = await createCharacter({
        ...character,
        visibility: 'private',
        campaign_id: null,
        player_display_name: user.display_name,
      })
      if (!created.id) throw new Error('Сервер не вернул копию')
      navigate(`/characters/${created.id}`)
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Не удалось скопировать персонажа')
    } finally {
      setCopying(false)
    }
  }

  const statusNode = status && StatusIcon && (
    <span className={`cw-save cw-save--${owner ? save : 'view'}`} role="status">
      <StatusIcon aria-hidden="true" />
      {status.text}
      {save === 'error' && owner && (
        <button type="button" className="cw-mini-btn" onClick={() => void eng.retrySave()}>
          повторить
        </button>
      )}
    </span>
  )
  const bannerNode = banner && (
    <div key="banner" className={`eng-banner${eng.conflict ? ' is-conflict' : ''}`} role="alert">
      {eng.conflict ? <RefreshCw aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
      <span>{banner}</span>
      <button type="button" className="cw-mini-btn" onClick={eng.dismissNotice} aria-label="Скрыть">
        <X aria-hidden="true" />
      </button>
    </div>
  )
  const pendingNode = (
    <PendingBanner
      decisions={sheet.pending_decisions}
      canPlay={owner}
      busy={eng.busy}
      onDecide={(d) => eng.decide(d.id, d.label)}
      onDismiss={(d) => void eng.dismiss(d.id)}
    />
  )
  const warningsNode = admin && sheet.warnings.length > 0 && (
    <details key="warnings" className="eng-warnings">
      <summary>Предупреждения движка · {sheet.warnings.length}</summary>
      <ul>
        {sheet.warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  )

  const hudControls: HudControls = {
    background: pic.background,
    notices: [
      bannerNode,
      save === 'error' && owner ? <div key="save">{statusNode}</div> : null,
      warningsNode,
    ].filter(Boolean),
    noticeKey: [banner, save === 'error' ? eng.saveError : ''].filter(Boolean).join('|'),
    decisions: pendingNode,
    decisionCount: sheet.pending_decisions.length,
    onJournal: owner ? () => setJournalOpen(true) : undefined,
    onLongRest: owner ? longRest : undefined,
    backTo: room?.backTo,
    extra: room?.hudExtra,
    status: statusNode || undefined,
    menu: (
      <>
        {canCopy && (
          <>
            <button type="button" className="hud-menu-item" onClick={() => void copyToMe()} disabled={copying}>
              {copying ? <Loader2 className="cw-spin" aria-hidden="true" /> : <Copy aria-hidden="true" />}
              Скопировать себе
            </button>
            {copyError && <span className="cw-save cw-save--error">{copyError}</span>}
          </>
        )}
        {owner && !room && (
          <button
            type="button"
            className="hud-menu-item"
            onClick={() => navigate(`/characters/${character.id}/level-up`)}
            disabled={eng.busy || view.basic_info.total_level >= 20}
          >
            <GraduationCap aria-hidden="true" /> Новый уровень
          </button>
        )}
        {canEditSheet && (
          <button type="button" className="hud-menu-item" onClick={() => setEditOpen(true)}>
            <PencilLine aria-hidden="true" /> Правка листа
          </button>
        )}
        {owner && !room && (
          <>
            <div className="hud-menu-vis" role="group" aria-label="Кто видит лист">
              <span>Кто видит лист</span>
              <div>
                {(Object.keys(VISIBILITY) as CharacterVisibility[]).map((v) => {
                  const Icon = VISIBILITY[v].icon
                  return (
                    <button
                      key={v}
                      type="button"
                      className={character.visibility === v ? 'is-on' : ''}
                      aria-pressed={character.visibility === v}
                      onClick={() => patchDoc(() => ({ visibility: v }))}
                    >
                      <Icon aria-hidden="true" /> {VISIBILITY[v].label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </>
    ),
  }

  return (
    <section className={`cw cw-live${pic.background ? ' has-world' : ''}`}>
      {!hudMode && pic.background && <WorldBackdrop key={pic.background} art={pic.background} />}
      {!hudMode && <header className="cw-live-top">
        <Link to={room?.backTo.to ?? '/characters'} className="back-link back-link--btn">
          <ChevronLeft aria-hidden="true" /> {room ? room.backTo.label : 'к персонажам'}
        </Link>
        <div className="cw-live-actions">
          {status && StatusIcon && (
            <span className={`cw-save cw-save--${owner ? save : 'view'}`} role="status">
              <StatusIcon aria-hidden="true" />
              {status.text}
              {save === 'error' && owner && (
                <button type="button" className="cw-mini-btn" onClick={() => void eng.retrySave()}>
                  повторить
                </button>
              )}
            </span>
          )}
          {canCopy && (
            <>
              <button type="button" className="cs-btn" onClick={() => void copyToMe()} disabled={copying}>
                {copying ? <Loader2 className="cw-spin" aria-hidden="true" /> : <Copy aria-hidden="true" />}
                Скопировать персонажа себе
              </button>
              {copyError && <span className="cw-save cw-save--error">{copyError}</span>}
            </>
          )}
          {owner && (
            <>
              {!room && (
              <label className="cw-vis" title={vis.label}>
                <VisIcon aria-hidden="true" />
                <select
                  value={character.visibility}
                  aria-label="Кто видит лист"
                  onChange={(e) => patchDoc(() => ({ visibility: e.target.value as CharacterVisibility }))}
                >
                  {(Object.keys(VISIBILITY) as CharacterVisibility[]).map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY[v].label}
                    </option>
                  ))}
                </select>
              </label>
              )}
              <span className="cw-live-group" role="group" aria-label="Отдых и журнал">
                <button type="button" className="cw-mini-btn" onClick={() => setRestOpen(true)} disabled={eng.busy} title="Кости хитов, ресурсы короткого отдыха">
                  <Coffee aria-hidden="true" /> короткий отдых
                </button>
                <button type="button" className="cw-mini-btn" onClick={longRest} disabled={eng.busy} title="Хиты, ячейки, ресурсы и половина костей хитов">
                  <Moon aria-hidden="true" /> продолжительный отдых
                </button>
                <button type="button" className="cw-mini-btn" onClick={() => setJournalOpen(true)} title="Журнал действий: всё, что делал герой">
                  <ScrollText aria-hidden="true" /> журнал
                </button>
              </span>
              {!room && (
                <button
                  type="button"
                  className="cs-btn"
                  onClick={() => navigate(`/characters/${character.id}/level-up`)}
                  disabled={eng.busy || view.basic_info.total_level >= 20}
                >
                  <GraduationCap aria-hidden="true" /> Новый уровень
                </button>
              )}
              {canEditSheet && (
                <button type="button" className="cs-btn" onClick={() => setEditOpen(true)}>
                  <PencilLine aria-hidden="true" /> Правка листа
                </button>
              )}
            </>
          )}
        </div>
      </header>}

      {!hudMode && banner && (
        <div className={`eng-banner${eng.conflict ? ' is-conflict' : ''}`} role="alert">
          {eng.conflict ? <RefreshCw aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
          <span>{banner}</span>
          <button type="button" className="cw-mini-btn" onClick={eng.dismissNotice} aria-label="Скрыть">
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {!hudMode && pendingNode}

      {!hudMode && admin && sheet.warnings.length > 0 && (
        <details className="eng-warnings">
          <summary>Предупреждения движка · {sheet.warnings.length}</summary>
          <ul>
            {sheet.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <CharacterSheet
        sheet={view}
        portrait={portrait}
        face={portraitFace}
        paged
        tab={tab}
        onTab={setTab}
        fallbackPortrait={fallbackPortrait}
        play={play}
        onPatch={owner ? sheetPatch : undefined}
        onPortraitClick={canEditSheet ? () => setEditOpen(true) : undefined}
        onInventory={owner ? onInventory : () => {}}
        roomMode={room ? { isDm: room.isDm, ...room.items } : undefined}
        engine={engineView}
        stage={stage}
        serverLog={eng.outcome}
        onToggleAbility={owner ? (g, on) => void eng.toggle(g, on) : undefined}
        hud={hudControls}
      />

      {flow && (flow.prompt || flow.message) && <ActionDialog flow={flow} onAnswer={eng.answer} onClose={eng.closeFlow} />}

      {eng.outcome && (
        <div className="eng-toast" role="status">
          <Check aria-hidden="true" />
          <span>
            <b>{eng.outcome.title}</b>
            {eng.outcome.log.length > 0 && <i>{eng.outcome.log[eng.outcome.log.length - 1].message}</i>}
          </span>
          {owner && eng.outcome.eventId && (
            <button type="button" className="cw-mini-btn" onClick={() => void eng.undo(eng.outcome!.eventId!)} disabled={eng.busy}>
              <Undo2 aria-hidden="true" /> отменить
            </button>
          )}
          <button type="button" className="cw-mini-btn" onClick={eng.clearOutcome} aria-label="Скрыть">
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {restOpen && (
        <ShortRestDialog character={character} sheet={sheet} names={names} onRest={eng.shortRest} onClose={() => setRestOpen(false)} />
      )}
      {journalOpen && (
        <JournalDrawer
          characterId={characterRef}
          revision={sheet.revision}
          canUndo={owner}
          onUndo={(eventId) => void eng.undo(eventId)}
          onClose={() => setJournalOpen(false)}
        />
      )}
      {hpJournalOpen && (
        <JournalModal
          characterId={characterRef}
          revision={sheet.revision}
          canUndo={owner}
          onUndo={(eventId) => void eng.undo(eventId)}
          onClose={() => setHpJournalOpen(false)}
        />
      )}
      {editOpen && (
        <SheetEditor
          character={character}
          view={view}
          onSave={(patch, overrides) => {
            if (Object.keys(patch).length) patchDoc(() => patch)
            if (overrides && Object.keys(overrides).length) {
              const go = async () => {
                if (Object.keys(patch).length) await eng.retrySave()
                await eng.override(overrides)
              }
              void go()
            }
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </section>
  )
}
