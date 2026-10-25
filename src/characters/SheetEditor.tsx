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
import {
  BookOpen,
  Check,
  Coins,
  Compass,
  Dumbbell,
  GraduationCap,
  ImagePlus,
  NotebookPen,
  Plus,
  Swords,
  Trash2,
  UserRound,
  Wand2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getSubList, type Background, type Feat, type GameClass, type Race, type Spell, type Subclass } from '../api'
import { CoinImg } from '../coins'
import { ALIGNMENTS } from '../create/steps/AlignmentChart'
import { imageFileToDataUrl } from '../create/flavor'
import { useCatalogList, useSubraces } from '../create/useCatalog'
import { ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT } from '../types/character'
import type { AttackEntry, Character, CharacterInput, ClassLevel, SheetView, SpellKnown } from '../types/character'
import { AreaField, AutoNum, CatalogSearch, EdField, EdSection, Stepper, TextField, Toggle } from './editorFields'
import { FaceAvatar, FaceCropper } from './FacePortrait'
import { DEFAULT_FACE, formatPortrait, parsePortrait, type FaceCrop } from './portrait'
import { abilityPath, contributionsOf, whyText } from './sheetView'

type CombatField = { auto: boolean; value: number; computed: number }

/** КД / хиты / мастерство: авто — как на листе, вручную — оверрайд */
function combatField(character: Character, view: SheetView, path: string, current: number): CombatField {
  const ov = character.manual_overrides?.[path]
  const rows = contributionsOf(view.breakdown, path)
  const overridden = typeof ov === 'number' || rows.some((r) => r.kind === 'override')
  const base = view.bases?.[path]?.value
  const adds = rows.filter((r) => r.kind !== 'override' && r.op === 'add' && r.value != null)
  const computed =
    overridden && typeof base === 'number' ? base + adds.reduce((s, r) => s + (r.value ?? 0), 0) : current
  if (typeof ov === 'number') return { auto: false, computed, value: ov }
  if (overridden) return { auto: false, computed, value: current }
  return { auto: true, computed: current, value: current }
}

const COMBAT_PATHS = { ac: 'char.ac', hp: 'char.hp.max', pb: 'char.pb' } as const

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
const COINS = [
  ['pp', 'Платиновые'],
  ['gp', 'Золотые'],
  ['ep', 'Электрумовые'],
  ['sp', 'Серебряные'],
  ['cp', 'Медные'],
] as const

const SECTIONS: { id: string; title: string; icon: LucideIcon }[] = [
  { id: 'hero', title: 'Герой', icon: UserRound },
  { id: 'origin', title: 'Происхождение', icon: Compass },
  { id: 'classes', title: 'Класс и уровень', icon: GraduationCap },
  { id: 'abilities', title: 'Характеристики', icon: Dumbbell },
  { id: 'attacks', title: 'Атаки', icon: Swords },
  { id: 'magic', title: 'Заклинания', icon: Wand2 },
  { id: 'feats', title: 'Черты', icon: BookOpen },
  { id: 'purse', title: 'Кошелёк', icon: Coins },
  { id: 'persona', title: 'Личность', icon: NotebookPen },
]

const ATTACK_TYPES: { value: AttackEntry['type']; label: string }[] = [
  { value: 'melee', label: 'ближний бой' },
  { value: 'ranged', label: 'дальний бой' },
  { value: 'spell', label: 'заклинание' },
  { value: 'other', label: 'другое' },
]

/** Картинка ссылкой или файлом с устройства (файл ужимается и встраивается в лист) */
function ImageSource({
  label,
  value,
  maxSide,
  onChange,
}: {
  label: string
  value: string | null
  maxSide: number
  onChange: (next: string | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const embedded = !!value?.startsWith('data:')
  const take = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      onChange(await imageFileToDataUrl(file, maxSide))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить картинку')
    }
  }
  return (
    <EdField label={label} wide hint={embedded ? 'загружено с устройства' : undefined}>
      <span className="ed-img-src">
        <input
          className="ed-input"
          value={embedded ? '' : (value ?? '')}
          placeholder={embedded ? 'вставьте ссылку, чтобы заменить' : 'https://…'}
          onChange={(e) => onChange(e.target.value.trim() || null)}
        />
        <button type="button" className="ed-btn" onClick={() => fileRef.current?.click()}>
          <ImagePlus aria-hidden="true" /> файл
        </button>
        {value && (
          <button type="button" className="ed-btn ed-btn--icon is-danger" onClick={() => onChange(null)} title="Убрать" aria-label="Убрать картинку">
            <Trash2 aria-hidden="true" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </span>
      {error && <span className="ed-error">{error}</span>}
    </EdField>
  )
}

/** Порог опыта для уровней 1–20 (PHB) */
const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
const fmtXp = (n: number) => n.toLocaleString('ru')

/**
 * Опыт — просто число. Рядом — таблица развития: какой уровень даёт этот опыт.
 * Уровень героя она не меняет; клик по строке лишь вписывает порог опыта.
 */
function XpField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const byXp = XP_TABLE.findLastIndex((x) => value >= x) + 1
  const ref = useRef<HTMLDivElement>(null)
  // клик мимо таблицы закрывает её
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <EdField label="Опыт" hint={`по опыту — ${byXp} ур.`} className="ed-xp-field">
      <span className="ed-img-src">
        <input
          className="ed-input"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0))}
          aria-label="Опыт"
        />
        <button type="button" className={`ed-btn${open ? ' is-on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <BookOpen aria-hidden="true" /> таблица
        </button>
      </span>
      {open && (
        <div className="ed-xp" ref={ref}>
          <div className="ed-xp-row ed-xp-head">
            <span>Опыт</span>
            <span>Уровень</span>
          </div>
          {XP_TABLE.map((xp, i) => (
            <button
              key={xp}
              type="button"
              className={`ed-xp-row${i + 1 === byXp ? ' is-on' : ''}`}
              onClick={() => onChange(xp)}
              title="Вписать этот порог опыта"
            >
              <span>{fmtXp(xp)}</span>
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </EdField>
  )
}

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
          <EdSection id="hero" icon={UserRound} title="Герой" lead="Имя, портрет и его рамка, фон листа, опыт и мировоззрение.">
            <div className="ed-grid">
              <TextField label="Имя" value={c.character_name} onChange={(v) => set({ character_name: v.slice(0, 120) })} wide />
              <TextField label="Игрок" value={c.player_display_name ?? ''} onChange={(v) => set({ player_display_name: v || null })} />
              <EdField label="Мировоззрение" as="label">
                <select className="ed-input ed-select" value={c.alignment ?? ''} onChange={(e) => set({ alignment: e.target.value || null })}>
                  <option value="">—</option>
                  {Object.values(ALIGNMENTS).map((a) => (
                    <option key={a.abbr} value={a.name}>
                      {a.abbr} · {a.name}
                    </option>
                  ))}
                </select>
              </EdField>
              <XpField value={c.experience_points} onChange={(v) => set({ experience_points: v })} />
              <ImageSource label="Портрет" value={pic.src} maxSide={900} onChange={(src) => setPic((p) => ({ ...p, src }))} />
            </div>
            {pic.src && (
              <div className="ed-sub">
                <h5>Рамка и кадр лица</h5>
                <FaceCropper src={pic.src} crop={face} onChange={setFace} />
              </div>
            )}
            <div className="ed-sub">
              <h5>Фон листа</h5>
              <div className="ed-grid">
                <ImageSource label="Картинка за листом" value={pic.background} maxSide={1600} onChange={(background) => setPic((p) => ({ ...p, background }))} />
              </div>
              {pic.background && <span className="ed-bg-preview" style={{ backgroundImage: `url("${pic.background}")` }} aria-hidden="true" />}
            </div>
          </EdSection>

          {/* ---------- происхождение ---------- */}
          <EdSection
            id="origin"
            icon={Compass}
            title="Происхождение"
            lead="Раса, подраса и предыстория из каталога. Их бонусы, владения и умения сервер выдаст сам после сохранения."
          >
            <div className="ed-grid">
              <EdField label="Раса" as="label">
                <select
                  className="ed-input ed-select"
                  value={c.race_id ?? ''}
                  onChange={(e) => set({ race_id: e.target.value || null, subrace_id: null })}
                >
                  <option value="">—</option>
                  {[...raceCatalog]
                    .sort((a, b) => a.race_name.localeCompare(b.race_name, 'ru'))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.race_name}
                      </option>
                    ))}
                </select>
              </EdField>
              <EdField label="Подраса" as="label">
                <select
                  className="ed-input ed-select"
                  value={c.subrace_id ?? ''}
                  disabled={subraces.length === 0}
                  onChange={(e) => set({ subrace_id: e.target.value || null })}
                >
                  <option value="">{subraces.length ? '—' : 'нет'}</option>
                  {subraces.map((sr) => (
                    <option key={sr.id} value={sr.id}>
                      {sr.subrace_name}
                    </option>
                  ))}
                </select>
              </EdField>
              <EdField label="Предыстория" as="label">
                <select className="ed-input ed-select" value={c.background_id ?? ''} onChange={(e) => set({ background_id: e.target.value || null })}>
                  <option value="">—</option>
                  {[...bgCatalog]
                    .sort((a, b) => a.background_name.localeCompare(b.background_name, 'ru'))
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.background_name}
                      </option>
                    ))}
                </select>
              </EdField>
            </div>
            {originChanged && <p className="ed-warn">Смена расы или предыстории заменит выданные ими умения — сервер пересоберёт их при сохранении.</p>}
            <div className="ed-sub">
              <h5>Внешность</h5>
              <div className="ed-grid">
                <TextField label="Пол" value={c.gender} onChange={(v) => set({ gender: v })} />
                <EdField label="Возраст" as="label">
                  <input
                    className="ed-input"
                    inputMode="numeric"
                    value={c.age ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      set({ age: Number.isNaN(n) ? null : Math.max(0, n) })
                    }}
                  />
                </EdField>
                <TextField label="Рост" value={c.height} onChange={(v) => set({ height: v })} />
                <TextField label="Вес" value={c.weight} onChange={(v) => set({ weight: v })} />
                <TextField label="Глаза" value={c.eyes} onChange={(v) => set({ eyes: v })} />
                <TextField label="Волосы" value={c.hair} onChange={(v) => set({ hair: v })} />
                <TextField label="Кожа" value={c.skin} onChange={(v) => set({ skin: v })} />
              </div>
              <div className="ed-grid">
                <AreaField label="Облик" rows={3} value={c.appearance} onChange={(v) => set({ appearance: v })} />
              </div>
            </div>
          </EdSection>

          {/* ---------- классы ---------- */}
          <EdSection
            id="classes"
            icon={GraduationCap}
            title="Класс и уровень"
            lead="Обычно уровень повышают кнопкой «Новый уровень» на листе: там бросок хитов, выбор подкласса и список новых умений. Здесь — правка вручную."
            actions={
              <button
                type="button"
                className="ed-btn"
                onClick={() => setClasses((list) => [...list, { class_id: '', level: 1, subclass_id: null, hp_rolls: [] }])}
                disabled={level >= 20}
              >
                <Plus aria-hidden="true" /> мультикласс
              </button>
            }
          >
            <div className="ed-table ed-table--classes">
              <div className="ed-tr ed-th">
                <span>Класс</span>
                <span>Подкласс</span>
                <span>Уровень</span>
                <span>Кость хитов</span>
                <span />
              </div>
              {c.classes.map((cl, i) => {
                const cat = classCatalog.find((x) => x.id === cl.class_id)
                const subs = subclasses[cl.class_id] ?? []
                return (
                  <div key={i} className="ed-tr">
                    <select
                      className="ed-input ed-select"
                      value={cl.class_id}
                      onChange={(e) => setClass(i, { class_id: e.target.value, subclass_id: null })}
                      aria-label="Класс"
                    >
                      <option value="">— класс —</option>
                      {classCatalog.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.class_name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ed-input ed-select"
                      value={cl.subclass_id ?? ''}
                      disabled={subs.length === 0}
                      onChange={(e) => setClass(i, { subclass_id: e.target.value || null })}
                      aria-label="Подкласс"
                    >
                      <option value="">{cat?.subclass_level && cl.level < cat.subclass_level ? `с ${cat.subclass_level} ур.` : 'нет'}</option>
                      {subs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.subclass_name}
                        </option>
                      ))}
                    </select>
                    <Stepper
                      value={cl.level}
                      min={1}
                      max={20 - (level - cl.level)}
                      onChange={(v) =>
                        // броски хитов — по одному на уровень после первого
                        setClass(i, { level: v, hp_rolls: cl.hp_rolls.slice(0, Math.max(0, i === 0 ? v - 1 : v)) })
                      }
                    />
                    <span className="ed-readout">к{cat?.hit_dice ?? '—'}</span>
                    <button
                      type="button"
                      className="ed-btn ed-btn--icon is-danger"
                      onClick={() => setClasses((list) => list.filter((_, j) => j !== i))}
                      disabled={c.classes.length <= 1}
                      title="Убрать класс"
                      aria-label="Убрать класс"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="ed-grid">
              <EdField label="Общий уровень" hint="сумма классов">
                <span className="ed-readout">{level}</span>
              </EdField>
            </div>
          </EdSection>

          {/* ---------- характеристики ---------- */}
          <EdSection
            id="abilities"
            icon={Dumbbell}
            title="Характеристики"
            lead="Базовые значения — бросок или покупка очков ДО расовых бонусов. Бонусы расы, черт и предметов сервер добавит сам; справа — итог на листе. КД, хиты и мастерство ниже можно зафиксировать вручную."
          >
            <div className="ed-abils">
              {ABILITY_KEYS.map((k) => {
                const short = ABILITY_SHORT[k]
                const base = c.base_scores[short] ?? 10
                const total = view.ability_scores[k]
                return (
                  <div key={k} className={`ed-abil${total.saving_throw_proficient ? ' is-prof' : ''}`}>
                    <span className="ed-abil-head">
                      <b>{ABILITY_LABELS[k].abbr}</b>
                      <i>{ABILITY_LABELS[k].label}</i>
                    </span>
                    <Stepper value={base} min={1} max={30} onChange={(v) => set({ base_scores: { ...c.base_scores, [short]: v } })} />
                    <span className="ed-abil-mod" title={whyText(view.breakdown, abilityPath(k, 'score'), view.sourceNames)}>
                      <i>на листе</i> <b>{total.score}</b>
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="ed-sub">
              <h5>КД, хиты, мастерство</h5>
              <div className="ed-grid">
                <AutoNum
                  label="Класс доспеха"
                  auto={combat.ac.auto}
                  computed={combat.ac.computed}
                  value={combat.ac.value}
                  min={0}
                  max={40}
                  note={combat.ac.auto ? 'по доспеху и ловкости' : `авто было ${combat.ac.computed}`}
                  onAuto={(auto) => setCombat((p) => ({ ...p, ac: { ...p.ac, auto, value: auto ? p.ac.value : p.ac.computed } }))}
                  onChange={(v) => setCombat((p) => ({ ...p, ac: { ...p.ac, auto: false, value: v } }))}
                />
                <AutoNum
                  label="Максимум хитов"
                  auto={combat.hp.auto}
                  computed={combat.hp.computed}
                  value={combat.hp.value}
                  min={1}
                  max={999}
                  note={combat.hp.auto ? 'по костям хитов' : `авто было ${combat.hp.computed}`}
                  onAuto={(auto) => setCombat((p) => ({ ...p, hp: { ...p.hp, auto, value: auto ? p.hp.value : p.hp.computed } }))}
                  onChange={(v) => setCombat((p) => ({ ...p, hp: { ...p.hp, auto: false, value: v } }))}
                />
                <AutoNum
                  label="Бонус мастерства"
                  auto={combat.pb.auto}
                  computed={combat.pb.computed}
                  value={combat.pb.value}
                  min={1}
                  max={12}
                  sign
                  note={combat.pb.auto ? 'по уровню героя' : `авто было ${signed(combat.pb.computed)}`}
                  onAuto={(auto) => setCombat((p) => ({ ...p, pb: { ...p.pb, auto, value: auto ? p.pb.value : p.pb.computed } }))}
                  onChange={(v) => setCombat((p) => ({ ...p, pb: { ...p.pb, auto: false, value: v } }))}
                />
              </div>
            </div>
          </EdSection>

          {/* ---------- атаки ---------- */}
          <EdSection
            id="attacks"
            icon={Swords}
            title="Атаки"
            lead="Свои атаки — заклинания-атаки, естественное оружие, особые приёмы."
            actions={
              <button
                type="button"
                className="ed-btn"
                onClick={() =>
                  setAttacks((list) => [
                    ...list,
                    { name: 'Новая атака', type: 'melee', attack_bonus: 0, damage: '1к6', damage_type: '', range: '5 фт.', properties: [], inventory_instance_id: null },
                  ])
                }
              >
                <Plus aria-hidden="true" /> атака
              </button>
            }
          >
            {weaponAttacks.length > 0 && (
              <div className="ed-ro-list">
                {weaponAttacks.map((a) => (
                  <span key={a.inventory_instance_id} className="ed-ro">
                    <Swords aria-hidden="true" />
                    <b>{a.name}</b>
                    <i>
                      {signed(a.attack_bonus)} · {a.damage} {a.damage_type}
                    </i>
                    <em>из инвентаря</em>
                  </span>
                ))}
              </div>
            )}
            {ownAttacks.length > 0 ? (
              <div className="ed-table ed-table--attacks">
                <div className="ed-tr ed-th">
                  <span>Название</span>
                  <span>Вид</span>
                  <span>Попадание</span>
                  <span>Урон</span>
                  <span>Тип урона</span>
                  <span>Дистанция</span>
                  <span />
                </div>
                {ownAttacks.map(({ a, i }) => {
                  const setA = (p: Partial<AttackEntry>) => setAttacks((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)))
                  return (
                    <div key={i} className="ed-tr">
                      <input className="ed-input" value={a.name} onChange={(e) => setA({ name: e.target.value })} aria-label="Название" />
                      <select className="ed-input ed-select" value={a.type} onChange={(e) => setA({ type: e.target.value as AttackEntry['type'] })} aria-label="Вид">
                        {ATTACK_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <Stepper value={a.attack_bonus} min={-10} max={30} sign onChange={(v) => setA({ attack_bonus: v })} />
                      <input className="ed-input" value={a.damage} placeholder="1к8+3" onChange={(e) => setA({ damage: e.target.value })} aria-label="Урон" />
                      <input className="ed-input" value={a.damage_type} placeholder="рубящий" onChange={(e) => setA({ damage_type: e.target.value })} aria-label="Тип урона" />
                      <input className="ed-input" value={a.range} placeholder="5 фт." onChange={(e) => setA({ range: e.target.value })} aria-label="Дистанция" />
                      <button
                        type="button"
                        className="ed-btn ed-btn--icon is-danger"
                        onClick={() => setAttacks((list) => list.filter((_, j) => j !== i))}
                        title="Удалить атаку"
                        aria-label="Удалить атаку"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="ed-empty">Своих атак нет — добавьте кнопкой справа сверху.</p>
            )}
          </EdSection>

          {/* ---------- магия ---------- */}
          <EdSection id="magic" icon={Wand2} title="Заклинания" lead="Список известных и подготовленных заклинаний. Ячейки и Сл считает сервер.">
            <CatalogSearch
              items={spellCatalog}
              label={(s) => s.spell_name}
              sub={(s) => [s.spell_level === 0 ? 'заговор' : `${s.spell_level} круг`, s.school].filter(Boolean).join(' · ')}
              exclude={knownSpellNames}
              placeholder="Найти заклинание в каталоге и добавить…"
              onPick={(s) =>
                setSpells((list) => [
                  ...list,
                  { name: s.spell_name, level: s.spell_level, prepared: true, spell_source: s.spell_source ?? null, snapshot: { spell_id: s.id } },
                ])
              }
            />
            <div className="ed-spells">
              {spellsByCircle.map((list, lvl) =>
                list.length === 0 ? null : (
                  <div key={lvl} className="ed-spell-group">
                    <span className="ed-spell-circle">{lvl === 0 ? '◈ Заговоры' : `${ROMAN[lvl]} · ${lvl} круг`}</span>
                    {list.map(({ s, i }) => {
                      const granted = (s.snapshot as { granted?: string } | null)?.granted
                      return (
                        <div key={`${s.name}-${i}`} className={`ed-spell${s.prepared ? '' : ' is-off'}`}>
                          <b>{s.name}</b>
                          {granted && <em>{granted === 'race' ? 'раса' : 'подкласс'}</em>}
                          {lvl > 0 && (
                            <Toggle
                              on={s.prepared}
                              onChange={(v) => setSpells((all) => all.map((x, j) => (j === i ? { ...x, prepared: v } : x)))}
                              label="подготовлено"
                            />
                          )}
                          <button
                            type="button"
                            className="ed-btn ed-btn--icon is-danger"
                            onClick={() => setSpells((all) => all.filter((_, j) => j !== i))}
                            title="Убрать заклинание"
                            aria-label="Убрать заклинание"
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ),
              )}
              {c.spells.length === 0 && <p className="ed-empty">Заклинаний нет — найдите их в каталоге выше.</p>}
            </div>
          </EdSection>

          {/* ---------- черты ---------- */}
          <EdSection
            id="feats"
            icon={BookOpen}
            title="Черты"
            lead="Черты из каталога. Их умения и бонусы выдаёт сервер; умения класса и расы — на странице «Умения» листа."
          >
            <div className="ed-chips">
              {c.feat_ids.map((fid) => (
                <span key={fid} className="ed-chip">
                  {featCatalog.find((f) => f.id === fid)?.feat_name ?? 'Черта'}
                  <button type="button" onClick={() => set({ feat_ids: c.feat_ids.filter((x) => x !== fid) })} aria-label="Убрать черту">
                    <X aria-hidden="true" />
                  </button>
                </span>
              ))}
              {c.feat_ids.length === 0 && <span className="ed-empty">черт нет</span>}
            </div>
            <CatalogSearch
              items={featCatalog}
              label={(f) => f.feat_name}
              sub={(f) => (f.prerequisite ? `требование: ${f.prerequisite}` : '')}
              exclude={featNames}
              placeholder="Найти черту в каталоге и добавить…"
              onPick={(f) => set({ feat_ids: [...c.feat_ids, f.id] })}
            />
          </EdSection>

          {/* ---------- кошелёк ---------- */}
          <EdSection id="purse" icon={Coins} title="Кошелёк" lead="Монеты героя; предметы — в инвентаре на листе.">
            <div className="ed-grid ed-grid--coins">
              {COINS.map(([key, label]) => (
                <EdField key={key} label={label} hint={<CoinImg currency={key} size={16} />}>
                  <Stepper
                    value={c.inventory.currency[key]}
                    min={0}
                    max={9999999}
                    onChange={(v) => set({ inventory: { ...c.inventory, currency: { ...c.inventory.currency, [key]: v } } })}
                  />
                </EdField>
              ))}
            </div>
          </EdSection>

          {/* ---------- личность ---------- */}
          <EdSection id="persona" icon={NotebookPen} title="Личность" lead="То же, что на странице «Характер».">
            <div className="ed-grid ed-grid--two">
              {(
                [
                  ['traits', 'Черты характера'],
                  ['ideals', 'Идеалы'],
                  ['bonds', 'Привязанности'],
                  ['flaws', 'Слабости'],
                ] as const
              ).map(([key, label]) => (
                <AreaField
                  key={key}
                  label={label}
                  rows={3}
                  value={c.personality[key]}
                  onChange={(v) => set({ personality: { ...c.personality, [key]: v } })}
                />
              ))}
            </div>
            <div className="ed-grid">
              <AreaField label="История" rows={6} value={c.backstory} onChange={(v) => set({ backstory: v })} />
              <AreaField label="Заметки" rows={5} value={c.notes} onChange={(v) => set({ notes: v })} />
            </div>
          </EdSection>
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
