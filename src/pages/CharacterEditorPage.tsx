/**
 * Сохранённый персонаж — тот же лист, что на итоге конструктора, но живой:
 * хиты, ячейки, кости хитов, состояния, кошелёк, инвентарь и записи правятся
 * прямо в листе и сохраняются на сервер с небольшой задержкой. Остальное —
 * в окне «Правка листа». Чужой публичный лист открывается для просмотра:
 * играть в нём можно, но на сервер ничего не уходит.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, CloudOff, Eye, Globe, Loader2, Lock, PencilLine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCharacter, realImage, updateCharacter, type Character, type GameClass, type Race } from '../api'
import { useAuth } from '../auth/AuthContext'
import CharacterSheet, { type SheetTab } from '../characters/CharacterSheet'
import { formatPortrait, parsePortrait } from '../characters/portrait'
import { WorldBackdrop } from '../creatureSheet'
import { sheetPlayFromCharacter } from '../characters/sheetPlay'
import { SheetEditor } from '../characters/SheetEditor'
import { normalizeCharacter, recalcCharacter } from '../characters/recalc'
import { useCatalogList } from '../create/useCatalog'
import type { CharacterCreate } from '../types/character'
import type { CharacterVisibility } from '../types/auth'

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const VISIBILITY: Record<CharacterVisibility, { icon: LucideIcon; label: string }> = {
  private: { icon: Lock, label: 'Только вы' },
  unlisted: { icon: Eye, label: 'По ссылке' },
  public: { icon: Globe, label: 'Публичный' },
}

const SAVE_DELAY = 700

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>()
  // открытая страница листа — в адресе, чтобы её можно было переслать и обновить
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as SheetTab | null) ?? 'main'
  const setTab = (t: SheetTab) => setParams(t === 'main' ? {} : { tab: t }, { replace: true })
  const { user } = useAuth()
  const [character, setCharacter] = useState<Character | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // правка, ещё не ушедшая на сервер (её дошлём при уходе со страницы)
  const pending = useRef<Character | null>(null)

  const { items: races } = useCatalogList<Race>('races')
  const { items: classes } = useCatalogList<GameClass>('classes')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadError(null)
    setCharacter(null)
    getCharacter(id)
      .then((c) => {
        if (!cancelled) setCharacter(normalizeCharacter(c))
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не найден')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // свой лист сохраняем; у чужого player_id другой — его можно только листать
  const owner = !!character && !!user && (!character.player_id || character.player_id === user.id)

  const persist = useCallback(async (c: Character) => {
    if (!c.id) return
    setSaveState('saving')
    setSaveError(null)
    try {
      await updateCharacter(c.id, c)
      if (pending.current === c) pending.current = null
      setSaveState((s) => (s === 'saving' ? 'saved' : s))
    } catch (e) {
      setSaveState('error')
      setSaveError(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }, [])

  // несколько правок за один клик (отдых: хиты, ячейки, расовая магия) идут
  // друг за другом — каждая строится на результате предыдущей
  const latest = useRef<Character | null>(null)
  latest.current = character
  const patch = useCallback(
    (fn: (c: Character) => Character) => {
      const prev = latest.current
      if (!prev) return
      const next = fn(prev)
      latest.current = next
      setCharacter(next)
      if (!owner) return
      pending.current = next
      setSaveState('pending')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void persist(next), SAVE_DELAY)
    },
    [owner, persist],
  )

  // уход со страницы не теряет последнюю правку
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const last = pending.current
      if (last?.id) void updateCharacter(last.id, last).catch(() => {})
    }
  }, [])

  // лист отдаёт правки в виде CharacterCreate — id и player_id остаются от сохранённого
  const sheetPatch = useCallback(
    (fn: (c: CharacterCreate) => CharacterCreate) => patch((c) => ({ ...c, ...fn(c) }) as Character),
    [patch],
  )

  const fallbackPortrait = useMemo(() => {
    if (!character) return null
    const race = character.basic_info.race
    const r = races.find((x) => x.id === race.source || x.race_name === race.name)
    const cl = classes.find((x) => x.class_name === character.basic_info.classes[0]?.name)
    return realImage(r?.image_gallery) ?? realImage(cl?.image_gallery)
  }, [character, races, classes])

  if (loadError) {
    return (
      <section className="cw cw-live">
        <p className="auth-error">{loadError}</p>
        <Link to="/characters" className="cs-btn">
          К списку
        </Link>
      </section>
    )
  }

  if (!character) {
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
  const play = sheetPlayFromCharacter(character, sheetPatch)
  const pic = parsePortrait(character.basic_info.avatar_url)

  const status =
    !owner
      ? { icon: Eye, text: 'Просмотр — изменения не сохраняются' }
      : saveState === 'error'
        ? { icon: CloudOff, text: saveError ?? 'Ошибка сохранения' }
        : saveState === 'saving' || saveState === 'pending'
          ? { icon: Loader2, text: 'Сохранение…' }
          : saveState === 'saved'
            ? { icon: Check, text: 'Сохранено' }
            : null
  const StatusIcon = status?.icon

  return (
    <section className={`cw cw-live${pic.background ? ' has-world' : ''}`}>
      {pic.background && <WorldBackdrop key={pic.background} art={pic.background} />}
      <header className="cw-live-top">
        <Link to="/characters" className="back-link back-link--btn">
          <ChevronLeft aria-hidden="true" /> к персонажам
        </Link>
        <div className="cw-live-actions">
          {status && StatusIcon && (
            <span className={`cw-save cw-save--${owner ? saveState : 'view'}`} role="status">
              <StatusIcon aria-hidden="true" />
              {status.text}
              {saveState === 'error' && owner && (
                <button type="button" className="cw-mini-btn" onClick={() => void persist(character)}>
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
                  onChange={(e) => patch((c) => ({ ...c, visibility: e.target.value as CharacterVisibility }))}
                >
                  {(Object.keys(VISIBILITY) as CharacterVisibility[]).map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY[v].label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="cs-btn" onClick={() => setEditOpen(true)}>
                <PencilLine aria-hidden="true" /> Правка листа
              </button>
            </>
          )}
        </div>
      </header>

      <CharacterSheet
        sheet={character}
        portrait={pic.src}
        face={pic.face}
        paged
        tab={tab}
        onTab={setTab}
        logKey={character.id ?? null}
        inspiration={pic.inspiration ?? (character.combat.inspiration ? 1 : 0)}
        onInspiration={(n) =>
          patch((c) => {
            // счётчик — во фрагменте ссылки портрета, на сервере только «есть/нет»
            const cur = parsePortrait(c.basic_info.avatar_url)
            return {
              ...c,
              basic_info: { ...c.basic_info, avatar_url: formatPortrait({ ...cur, inspiration: n }) },
              combat: { ...c.combat, inspiration: n > 0 },
            }
          })
        }
        fallbackPortrait={fallbackPortrait}
        play={play}
        onPatch={sheetPatch}
        onPortraitClick={owner ? () => setEditOpen(true) : undefined}
        onInventory={(items, coins) =>
          patch((c) => {
            // монеты, высыпанные из кошеля или набора, — в кошелёк героя
            const currency = { ...c.inventory.currency }
            for (const [k, v] of Object.entries(coins ?? {})) currency[k as keyof typeof currency] += v ?? 0
            return recalcCharacter({ ...c, inventory: { ...c.inventory, items, currency } }, { armor: true, attacks: true })
          })
        }
      />

      {editOpen && <SheetEditor character={character} onSave={(next) => patch(() => next)} onClose={() => setEditOpen(false)} />}
    </section>
  )
}
