/**
 * Правка листа — редактор входных данных персонажа (схема v2).
 *
 * Слева — оглавление разделов (подсвечивается тот, что сейчас на экране),
 * справа — сами разделы: герой и портрет, происхождение и внешность, классы
 * с мультиклассом, базовые характеристики, атаки, заклинания, черты, кошелёк,
 * личность. КД, максимум хитов и бонус мастерства сервер считает сам, но их
 * можно зафиксировать вручную (оверрайд). Остальное вычисляемое — спасброски,
 * навыки, ячейки — только с сервера. Правки копятся в окне; закрыть с
 * несохранёнными — с подтверждением.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { getSubList, type Background, type Feat, type GameClass, type Race, type Spell, type Subclass } from '../api'
import { useCatalogList, useSubraces } from '../create/useCatalog'
import type { AttackEntry, Character, CharacterInput, ClassLevel, SheetView, SpellKnown } from '../types/character'
import { FaceAvatar } from './FacePortrait'
import { DEFAULT_FACE, formatPortrait, parsePortrait, type FaceCrop } from './portrait'
import { COMBAT_PATHS, type CombatField, SECTIONS, combatField } from './sheet/editorData'
import { signed } from './sheet/rules'
import { AbilitiesSection } from './sheet/editor/AbilitiesSection'
import { AttacksSection } from './sheet/editor/AttacksSection'
import { ClassesSection } from './sheet/editor/ClassesSection'
import { FeatsSection } from './sheet/editor/FeatsSection'
import { HeroSection } from './sheet/editor/HeroSection'
import { MagicSection } from './sheet/editor/MagicSection'
import { OriginSection } from './sheet/editor/OriginSection'
import { PersonaSection } from './sheet/editor/PersonaSection'
import { PurseSection } from './sheet/editor/PurseSection'

export function SheetEditor({
  character,
  view,
  onSave,
  onClose,
}: {
  character: Character
  /** текущий лист — показать итоговые значения рядом с базовыми */
  view: SheetView
  /** изменённые поля документа и оверрайды листа (null снимает) */
  onSave: (patch: CharacterInput, overrides?: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [c, setC] = useState(character)
  const combatInit = useMemo(
    () => ({
      ac: combatField(character, view, COMBAT_PATHS.ac, view.combat.armor_class),
      hp: combatField(character, view, COMBAT_PATHS.hp, view.combat.hit_points.max),
      pb: combatField(character, view, COMBAT_PATHS.pb, view.proficiency_bonus),
    }),
    [character, view],
  )
  const [combat, setCombat] = useState(combatInit)
  const initialPic = useMemo(() => parsePortrait(character.avatar_url), [character])
  const [pic, setPic] = useState(initialPic)
  const face = pic.face ?? DEFAULT_FACE
  const setFace = useCallback((next: FaceCrop) => setPic((p) => ({ ...p, face: next })), [])

  const { items: classCatalog } = useCatalogList<GameClass>('classes')
  const { items: raceCatalog } = useCatalogList<Race>('races')
  const { items: bgCatalog } = useCatalogList<Background>('backgrounds')
  const { items: spellCatalog } = useCatalogList<Spell>('spells')
  const { items: featCatalog } = useCatalogList<Feat>('feats')
  const { items: subraces } = useSubraces(c.race_id)
  const [subclasses, setSubclasses] = useState<Record<string, Subclass[]>>({})

  // подклассы каждого выбранного класса — для селектов
  useEffect(() => {
    for (const cl of c.classes) {
      if (!cl.class_id || subclasses[cl.class_id]) continue
      void getSubList<Subclass>('classes', cl.class_id, 'subclasses').then((list) =>
        setSubclasses((prev) => ({ ...prev, [cl.class_id]: list })),
      )
    }
  }, [c.classes, subclasses])

  /* ---------- правки ---------- */

  const set = (patch: Partial<Character>) => setC((p) => ({ ...p, ...patch }))
  const setClasses = (fn: (list: ClassLevel[]) => ClassLevel[]) => setC((p) => ({ ...p, classes: fn(p.classes) }))
  const setClass = (i: number, patch: Partial<ClassLevel>) => setClasses((list) => list.map((cl, j) => (j === i ? { ...cl, ...patch } : cl)))
  const setAttacks = (fn: (list: AttackEntry[]) => AttackEntry[]) => setC((p) => ({ ...p, attacks: fn(p.attacks) }))
  const setSpells = (fn: (list: SpellKnown[]) => SpellKnown[]) => setC((p) => ({ ...p, spells: fn(p.spells) }))
  const level = c.classes.reduce((s, cl) => s + cl.level, 0)

  /* ---------- сохранить / закрыть ---------- */

  /** Изменённые поля документа — только они уходят PATCH-ем */
  const patch = useMemo(() => {
    const next: Character = { ...c, avatar_url: formatPortrait({ ...pic, face: pic.src ? face : null }) }
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(next) as (keyof Character)[]) {
      if (JSON.stringify(next[key]) !== JSON.stringify(character[key])) out[key] = next[key]
    }
    return out as CharacterInput
  }, [c, pic, face, character])
  const overrides = useMemo(() => {
    const out: Record<string, unknown> = {}
    const put = (path: string, field: CombatField, orig: CombatField) => {
      if (field.auto === orig.auto && (field.auto || field.value === orig.value)) return
      out[path] = field.auto ? null : field.value
    }
    put(COMBAT_PATHS.ac, combat.ac, combatInit.ac)
    put(COMBAT_PATHS.hp, combat.hp, combatInit.hp)
    put(COMBAT_PATHS.pb, combat.pb, combatInit.pb)
    return out
  }, [combat, combatInit])
  const dirty = Object.keys(patch).length > 0 || Object.keys(overrides).length > 0

  const requestClose = useCallback(() => {
    if (!dirty || confirm('Закрыть без сохранения? Правки пропадут.')) onClose()
  }, [dirty, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.eq-drawer-layer')) requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  const save = () => {
    onSave(patch, Object.keys(overrides).length ? overrides : undefined)
    onClose()
  }

  /* ---------- оглавление: подсветка раздела на экране ---------- */

  const mainRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('hero')
  const onScroll = () => {
    const main = mainRef.current
    if (!main) return
    let current = SECTIONS[0].id
    for (const el of main.querySelectorAll<HTMLElement>('[data-section]')) {
      if (el.offsetTop - main.scrollTop <= 90) current = el.dataset.section ?? current
    }
    // докрутили до конца — последний раздел
    if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1].id
    setActive(current)
  }
  const jump = (id: string) => {
    const main = mainRef.current
    const el = main?.querySelector<HTMLElement>(`[data-section="${id}"]`)
    if (main && el) main.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' })
  }

  /* ---------- разделы ---------- */

  const count: Record<string, number | undefined> = {
    classes: c.classes.length > 1 ? c.classes.length : undefined,
    attacks: c.attacks.length || undefined,
    magic: c.spells.length || undefined,
    feats: c.feat_ids.length || undefined,
  }
  const weaponAttacks = c.attacks.filter((a) => a.inventory_instance_id)
  const ownAttacks = c.attacks.map((a, i) => ({ a, i })).filter(({ a }) => !a.inventory_instance_id)
  const spellsByCircle = Array.from({ length: 10 }, (_, lvl) => c.spells.map((s, i) => ({ s, i })).filter(({ s }) => s.level === lvl))
  const knownSpellNames = useMemo(() => new Set(c.spells.map((s) => s.name)), [c.spells])
  const featNames = useMemo(() => new Set(c.feat_ids.map((id) => featCatalog.find((f) => f.id === id)?.feat_name ?? id)), [c.feat_ids, featCatalog])
  const originChanged = c.race_id !== character.race_id || c.subrace_id !== character.subrace_id || c.background_id !== character.background_id

  return createPortal(
    <div className="cw-modal-layer" onClick={requestClose}>
      <div className="ed" role="dialog" aria-modal="true" aria-label="Правка листа" onClick={(e) => e.stopPropagation()}>
        {/* ---------- шапка ---------- */}
        <header className="ed-head">
          <FaceAvatar src={pic.src} crop={pic.src ? face : { ...DEFAULT_FACE, shape: 'hex' }} className="ed-head-face" />
          <span className="ed-head-titles">
            <i>Правка листа</i>
            <b>{c.character_name || 'Без имени'}</b>
          </span>
          <span className="ed-head-stats">
            <span>
              <i>уровень</i>
              <b>{level}</b>
            </span>
            <span>
              <i>мастерство</i>
              <b>{signed(combat.pb.auto ? combat.pb.computed : combat.pb.value)}</b>
            </span>
            <span>
              <i>КД</i>
              <b>{combat.ac.auto ? combat.ac.computed : combat.ac.value}</b>
            </span>
            <span>
              <i>хиты</i>
              <b>{combat.hp.auto ? combat.hp.computed : combat.hp.value}</b>
            </span>
          </span>
          <button type="button" className="ed-close" onClick={requestClose} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>

        {/* ---------- оглавление ---------- */}
        <nav className="ed-nav" aria-label="Разделы">
          {SECTIONS.map(({ id, title, icon: Icon }) => (
            <button key={id} type="button" className={active === id ? 'is-on' : ''} onClick={() => jump(id)}>
              <Icon aria-hidden="true" />
              <span>{title}</span>
              {count[id] ? <em>{count[id]}</em> : null}
            </button>
          ))}
        </nav>

        <div className="ed-main" ref={mainRef} onScroll={onScroll}>
          <p className="ed-lead-note">
            КД, максимум хитов и бонус мастерства сервер считает по расе, классам и предметам — их можно оставить на
            «авто» или вписать вручную. Спасброски, навыки и ячейки по-прежнему только с сервера.
          </p>

          {/* ---------- герой ---------- */}
          <HeroSection c={c} set={set} pic={pic} setPic={setPic} face={face} setFace={setFace} />

          {/* ---------- происхождение ---------- */}
          <OriginSection c={c} set={set} raceCatalog={raceCatalog} bgCatalog={bgCatalog} subraces={subraces} originChanged={originChanged} />

          {/* ---------- классы ---------- */}
          <ClassesSection c={c} level={level} classCatalog={classCatalog} subclasses={subclasses} setClasses={setClasses} setClass={setClass} />

          {/* ---------- характеристики ---------- */}
          <AbilitiesSection c={c} set={set} view={view} combat={combat} setCombat={setCombat} />

          {/* ---------- атаки ---------- */}
          <AttacksSection weaponAttacks={weaponAttacks} ownAttacks={ownAttacks} setAttacks={setAttacks} />

          {/* ---------- магия ---------- */}
          <MagicSection c={c} spellCatalog={spellCatalog} knownSpellNames={knownSpellNames} spellsByCircle={spellsByCircle} setSpells={setSpells} />

          {/* ---------- черты ---------- */}
          <FeatsSection c={c} set={set} featCatalog={featCatalog} featNames={featNames} />

          {/* ---------- кошелёк ---------- */}
          <PurseSection c={c} set={set} />

          {/* ---------- личность ---------- */}
          <PersonaSection c={c} set={set} />
        </div>

        {/* ---------- подвал ---------- */}
        <footer className="ed-foot">
          <span className={`ed-dirty${dirty ? ' is-on' : ''}`}>{dirty ? 'Есть несохранённые правки' : 'Без изменений'}</span>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={requestClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" onClick={save} disabled={!dirty || !c.character_name.trim() || c.classes.some((cl) => !cl.class_id)}>
            <Check aria-hidden="true" /> Применить
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
