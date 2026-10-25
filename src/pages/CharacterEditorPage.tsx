/**
 * Сохранённый персонаж — тот же лист, что на итоге конструктора, но живой и
 * собранный сервером: все числа приходят из `/sheet`, действия, хиты, отдых и
 * уровень выполняет движок. В шапке — журнал действий, отдых и новый уровень
 * (он открывает тот же пошаговый мастер, что и создание героя). Сам документ (инвентарь, кошелёк, записи,
 * видимость) правится прямо в листе и сохраняется с небольшой задержкой;
 * остальное — в окне «Правка листа». Чужой публичный лист открывается для
 * просмотра: бросать кости можно, менять — нет.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  CloudOff,
  Coffee,
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
import { getOne, realImage, type Creature } from '../api'
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

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>()
  // открытая страница листа — в адресе, чтобы её можно было переслать и обновить
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as SheetTab | null) ?? 'main'
  const setTab = (t: SheetTab) => setParams(t === 'main' ? {} : { tab: t }, { replace: true })
  const { user } = useAuth()
  const eng = useCharacterEngine(id)
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
  const navigate = useNavigate()

  useEffect(() => {
    void getEngineDictionaries().then(setDict)
  }, [])

  // набор способностей поменялся (уровень, выбор, предмет) — подписи перечитываем
  const abilityKey = sheet?.abilities.map((a) => a.slug).join(',') ?? ''
  const characterId = character?.id
  useEffect(() => {
    if (!characterId || !abilityKey) return
    let alive = true
    getEngineCatalog(characterId)
      .then((c) => {
        if (!alive) return
        setLabels(c.labels)
        if (c.dictionaries) setDict(c.dictionaries)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [characterId, abilityKey])

  // свой лист — играть и сохранять; админ видит и меняет всё
  const admin = user?.role === 'admin'
  const owner = !!character && !!user && (admin || character.player_id === user.id)

  const view = useMemo(
    () => (character && sheet ? buildSheetView(character, sheet, names, dict, labels) : null),
    [character, sheet, names, dict, labels],
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
        ...(next.inventory.currency !== view.inventory.currency
          ? { inventory: { ...c.inventory, currency: next.inventory.currency } }
          : {}),
      }))
    },
    [view, patchDoc],
  )

  /** Инвентарь: монеты из контейнера — в кошелёк; КД и умения предметов пересчитает сервер */
  const onInventory = useCallback(
    (items: InventoryItemInstance[], coins?: Partial<Record<keyof SheetView['inventory']['currency'], number>>) =>
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
      }),
    [patchDoc],
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
        <Link to="/characters" className="cs-btn">
          К списку
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
  const pic = parsePortrait(character.avatar_url)
  const master = admin ? eng.master : undefined

  const play = sheetPlayFromServer(view, {
    master,
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

  return (
    <section className={`cw cw-live${pic.background ? ' has-world' : ''}`}>
      {pic.background && <WorldBackdrop key={pic.background} art={pic.background} />}
      <header className="cw-live-top">
        <Link to="/characters" className="back-link back-link--btn">
          <ChevronLeft aria-hidden="true" /> к персонажам
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
          {owner && (
            <>
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
              <button
                type="button"
                className="cs-btn"
                onClick={() => navigate(`/characters/${character.id}/level-up`)}
                disabled={eng.busy || view.basic_info.total_level >= 20}
              >
                <GraduationCap aria-hidden="true" /> Новый уровень
              </button>
              <button type="button" className="cs-btn" onClick={() => setEditOpen(true)}>
                <PencilLine aria-hidden="true" /> Правка листа
              </button>
            </>
          )}
        </div>
      </header>

      {banner && (
        <div className={`eng-banner${eng.conflict ? ' is-conflict' : ''}`} role="alert">
          {eng.conflict ? <RefreshCw aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
          <span>{banner}</span>
          <button type="button" className="cw-mini-btn" onClick={eng.dismissNotice} aria-label="Скрыть">
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <PendingBanner
        decisions={sheet.pending_decisions}
        canPlay={owner}
        busy={eng.busy}
        onDecide={(d) => eng.decide(d.id, d.label)}
        onDismiss={(d) => void eng.dismiss(d.id)}
      />

      {admin && sheet.warnings.length > 0 && (
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
        onPortraitClick={owner ? () => setEditOpen(true) : undefined}
        onInventory={owner ? onInventory : () => {}}
        engine={engineView}
        stage={stage}
        serverLog={eng.outcome}
        onToggleAbility={owner ? (g, on) => void eng.toggle(g, on) : undefined}
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
          characterId={character.id}
          revision={sheet.revision}
          canUndo={owner}
          onUndo={(eventId) => void eng.undo(eventId)}
          onClose={() => setJournalOpen(false)}
        />
      )}
      {hpJournalOpen && (
        <JournalModal
          characterId={character.id}
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
