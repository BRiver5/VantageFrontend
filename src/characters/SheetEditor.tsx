/**
 * Правка листа — профессиональный редактор для тех, кто знает правила.
 *
 * Слева — оглавление разделов (подсвечивается тот, что сейчас на экране),
 * справа — сами разделы: герой и портрет, происхождение и внешность, классы
 * с мультиклассом и уровнями, характеристики, навыки, бой и хиты, атаки,
 * магия вплоть до ячеек каждого круга и списка заклинаний, умения и черты,
 * владения, кошелёк, личность. У производных чисел (КД, инициатива, пассивная
 * внимательность, бонус мастерства, кости хитов, Сл заклинаний) есть режим
 * «авто» — посчитать по правилам — и «вручную». Правки копятся в окне и
 * применяются разом; закрыть с несохранёнными правками — только с подтверждением.
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
  HeartPulse,
  ImagePlus,
  Languages,
  NotebookPen,
  Plus,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
  Wand2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Background, Feat, GameClass, Race, Spell } from '../api'
import { CoinImg } from '../coins'
import {
  abilityMod,
  cantripsAt,
  casterKind,
  preparedSpellsMax,
  proficiencyBonus,
  spellSlotsAt,
  spellcastingAbility,
} from '../create/dnd5e'
import { ALIGNMENTS } from '../create/steps/AlignmentChart'
import { imageFileToDataUrl } from '../create/flavor'
import { useCatalogList } from '../create/useCatalog'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../types/character'
import type { AbilityName, AttackEntry, Character, FeatureEntry } from '../types/character'
import {
  AreaField,
  AutoNum,
  CatalogSearch,
  ChipList,
  EdField,
  EdSection,
  NumField,
  Segmented,
  Stepper,
  TextField,
  Toggle,
} from './editorFields'
import { FaceAvatar, FaceCropper } from './FacePortrait'
import { DEFAULT_FACE, formatPortrait, parsePortrait, type FaceCrop } from './portrait'
import { derive, recalcCharacter } from './recalc'

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
const HIT_DICE = [6, 8, 10, 12] as const
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
  { id: 'skills', title: 'Навыки', icon: Sparkles },
  { id: 'combat', title: 'Бой и хиты', icon: HeartPulse },
  { id: 'attacks', title: 'Атаки', icon: Swords },
  { id: 'magic', title: 'Магия', icon: Wand2 },
  { id: 'features', title: 'Умения и черты', icon: BookOpen },
  { id: 'profs', title: 'Владения', icon: Languages },
  { id: 'purse', title: 'Кошелёк', icon: Coins },
  { id: 'persona', title: 'Личность', icon: NotebookPen },
]

const FEATURE_SOURCES: { value: FeatureEntry['source']; label: string }[] = [
  { value: 'class', label: 'класс' },
  { value: 'subclass', label: 'подкласс' },
  { value: 'race', label: 'раса' },
  { value: 'subrace', label: 'подраса' },
  { value: 'background', label: 'предыстория' },
  { value: 'feat', label: 'черта' },
  { value: 'other', label: 'прочее' },
]

const ATTACK_TYPES: { value: AttackEntry['type']; label: string }[] = [
  { value: 'melee', label: 'ближний бой' },
  { value: 'ranged', label: 'дальний бой' },
  { value: 'spell', label: 'заклинание' },
  { value: 'other', label: 'другое' },
]

type SkillState = 'none' | 'prof' | 'expert'

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

/** Одно умение: строка с названием, источником и уровнем; описание раскрывается */
function FeatureRow({
  f,
  onChange,
  onRemove,
}: {
  f: FeatureEntry
  onChange: (next: FeatureEntry) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`ed-feat${open ? ' is-open' : ''} ed-src--${f.source}`}>
      <div className="ed-feat-row">
        <input className="ed-input ed-feat-name" value={f.name} onChange={(e) => onChange({ ...f, name: e.target.value })} aria-label="Название" />
        <select className="ed-input ed-select" value={f.source} onChange={(e) => onChange({ ...f, source: e.target.value as FeatureEntry['source'] })} aria-label="Источник">
          {FEATURE_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Stepper value={f.level ?? 0} min={0} max={20} onChange={(v) => onChange({ ...f, level: v || null })} />
        <button type="button" className={`ed-btn ed-btn--icon${open ? ' is-on' : ''}`} onClick={() => setOpen((v) => !v)} title="Описание" aria-expanded={open}>
          <NotebookPen aria-hidden="true" />
        </button>
        <button type="button" className="ed-btn ed-btn--icon is-danger" onClick={onRemove} title="Удалить умение" aria-label="Удалить умение">
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      {open && (
        <textarea
          className="ed-input ed-area"
          rows={5}
          value={f.description}
          placeholder="Что даёт умение, сколько раз, восстановление…"
          onChange={(e) => onChange({ ...f, description: e.target.value })}
        />
      )}
    </div>
  )
}

export function SheetEditor({
  character,
  onSave,
  onClose,
}: {
  character: Character
  onSave: (next: Character) => void
  onClose: () => void
}) {
  const [c, setC] = useState(character)
  const initialPic = useMemo(() => parsePortrait(character.basic_info.avatar_url), [character])
  const [pic, setPic] = useState(initialPic)
  const face = pic.face ?? DEFAULT_FACE
  const setFace = useCallback((next: FaceCrop) => setPic((p) => ({ ...p, face: next })), [])
  const inspiration = pic.inspiration ?? (c.combat.inspiration ? 1 : 0)

  // производное «авто», если сохранённое совпадает с расчётом по правилам
  const [initialAuto] = useState(() => {
    const d = derive(character)
    return {
      ac: d.ac != null && d.ac === character.combat.armor_class,
      initiative: d.initiative === character.combat.initiative,
      passive: d.passive === character.combat.passive_perception,
      spell: d.spellDc != null && d.spellDc === character.spellcasting.spell_save_dc && d.spellAttack === character.spellcasting.spell_attack_bonus,
      proficiency: d.proficiency === character.proficiency_bonus,
      hitDice: d.hitDice === character.combat.hit_dice.total,
    }
  })
  const [auto, setAuto] = useState(initialAuto)
  const setAutoKey = (key: keyof typeof auto, v: boolean) => setAuto((a) => ({ ...a, [key]: v }))

  const { items: classCatalog } = useCatalogList<GameClass>('classes')
  const { items: raceCatalog } = useCatalogList<Race>('races')
  const { items: bgCatalog } = useCatalogList<Background>('backgrounds')
  const { items: spellCatalog } = useCatalogList<Spell>('spells')
  const { items: featCatalog } = useCatalogList<Feat>('feats')

  /* ---------- текущее состояние и расчёт по правилам ---------- */

  const bi = c.basic_info
  const level = Math.max(1, bi.classes.reduce((s, cl) => s + cl.level, 0))
  const pb = auto.proficiency ? proficiencyBonus(level) : c.proficiency_bonus
  const view: Character = { ...c, proficiency_bonus: pb, basic_info: { ...bi, total_level: level } }
  const d = derive(view)
  const sc = c.spellcasting
  const mainCaster = bi.classes.find((cl) => casterKind(cl.name, cl.is_caster) !== 'none') ?? bi.classes[0]
  const castMod = sc.spellcasting_ability ? abilityMod(c.ability_scores[sc.spellcasting_ability].score) : 0

  /* ---------- правки ---------- */

  const setInfo = (patch: Partial<Character['basic_info']>) => setC((p) => ({ ...p, basic_info: { ...p.basic_info, ...patch } }))
  const setCombat = (patch: Partial<Character['combat']>) => setC((p) => ({ ...p, combat: { ...p.combat, ...patch } }))
  const setHp = (patch: Partial<Character['combat']['hit_points']>) =>
    setC((p) => ({ ...p, combat: { ...p.combat, hit_points: { ...p.combat.hit_points, ...patch } } }))
  const setSc = (patch: Partial<Character['spellcasting']>) => setC((p) => ({ ...p, spellcasting: { ...p.spellcasting, ...patch } }))
  const setAbility = (k: AbilityName, patch: Partial<Character['ability_scores'][AbilityName]>) =>
    setC((p) => ({ ...p, ability_scores: { ...p.ability_scores, [k]: { ...p.ability_scores[k], ...patch } } }))
  const setClasses = (fn: (list: Character['basic_info']['classes']) => Character['basic_info']['classes']) =>
    setC((p) => {
      const classes = fn(p.basic_info.classes)
      return { ...p, basic_info: { ...p.basic_info, classes, total_level: Math.max(1, classes.reduce((s, cl) => s + cl.level, 0)) } }
    })
  const setClass = (i: number, patch: Partial<Character['basic_info']['classes'][number]>) =>
    setClasses((list) => list.map((cl, j) => (j === i ? { ...cl, ...patch } : cl)))
  /** Знакомый класс из каталога: кость хитов, заклинательство и ссылка на источник — сразу */
  const pickClassName = (i: number, name: string) => {
    const known = classCatalog.find((x) => x.class_name.toLocaleLowerCase('ru') === name.trim().toLocaleLowerCase('ru'))
    setClass(
      i,
      known
        ? { name: known.class_name, hit_die: known.hit_dice, is_caster: known.is_caster, source: known.id, spellcasting_ability: spellcastingAbility(known.class_name) }
        : { name },
    )
  }
  const setSkill = (key: string, state: SkillState) =>
    setC((p) => {
      const cur = p.skills[key]
      if (!cur) return p
      return { ...p, skills: { ...p.skills, [key]: { ...cur, proficient: state !== 'none', expertise: state === 'expert' } } }
    })
  const setSlot = (circle: number, patch: { max?: number; used?: number }) =>
    setC((p) => {
      const key = String(circle)
      const cur = p.spellcasting.spell_slots[key] ?? { max: 0, used: 0 }
      const next = { ...cur, ...patch }
      next.used = Math.min(next.used, next.max)
      return { ...p, spellcasting: { ...p.spellcasting, spell_slots: { ...p.spellcasting.spell_slots, [key]: next } } }
    })
  const slotsByRules = () => {
    if (!mainCaster) return
    const table = spellSlotsAt(casterKind(mainCaster.name, mainCaster.is_caster), mainCaster.level)
    setC((p) => {
      const spell_slots = Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => String(i + 1))
          .filter((k) => table[k])
          .map((k) => [k, { max: table[k], used: Math.min(table[k], p.spellcasting.spell_slots[k]?.used ?? 0) }]),
      )
      return { ...p, spellcasting: { ...p.spellcasting, spell_slots } }
    })
  }
  const setAttacks = (fn: (list: AttackEntry[]) => AttackEntry[]) => setC((p) => ({ ...p, attacks: fn(p.attacks) }))
  const setFeatures = (fn: (list: FeatureEntry[]) => FeatureEntry[]) => setC((p) => ({ ...p, features: fn(p.features) }))
  const setProfs = (key: keyof Character['proficiencies'], list: string[]) =>
    setC((p) => ({ ...p, proficiencies: { ...p.proficiencies, [key]: list } }))

  /* ---------- сохранить / закрыть ---------- */

  const dirty = useMemo(
    () =>
      JSON.stringify(c) !== JSON.stringify(character) ||
      JSON.stringify(pic) !== JSON.stringify(initialPic) ||
      JSON.stringify(auto) !== JSON.stringify(initialAuto),
    [c, character, pic, initialPic, auto, initialAuto],
  )

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
    const slots = Object.fromEntries(
      Object.entries(c.spellcasting.spell_slots)
        .filter(([, s]) => s.max > 0)
        .map(([k, s]) => [k, { max: s.max, used: Math.min(s.used, s.max) }]),
    )
    const next: Character = {
      ...view,
      basic_info: { ...view.basic_info, avatar_url: formatPortrait({ ...pic, face: pic.src ? face : null }) },
      combat: {
        ...c.combat,
        inspiration: inspiration > 0,
        hit_points: { ...c.combat.hit_points, current: Math.min(c.combat.hit_points.current, c.combat.hit_points.max) },
        hit_dice: { total: auto.hitDice ? d.hitDice : c.combat.hit_dice.total, remaining: Math.min(level, c.combat.hit_dice.remaining) },
      },
      spellcasting: { ...c.spellcasting, spell_slots: slots },
    }
    onSave(
      recalcCharacter(next, {
        armor: auto.ac,
        attacks: true,
        initiative: auto.initiative,
        passive: auto.passive,
        spell: auto.spell,
      }),
    )
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
    classes: bi.classes.length > 1 ? bi.classes.length : undefined,
    attacks: c.attacks.length || undefined,
    magic: sc.spells_known.length || undefined,
    features: c.features.length + c.feats.length || undefined,
  }
  const weaponAttacks = c.attacks.filter((a) => a.inventory_instance_id)
  const ownAttacks = c.attacks.map((a, i) => ({ a, i })).filter(({ a }) => !a.inventory_instance_id)
  const preparedCount = sc.spells_known.filter((s) => s.prepared && s.level > 0).length
  const spellsByCircle = Array.from({ length: 10 }, (_, lvl) =>
    sc.spells_known.map((s, i) => ({ s, i })).filter(({ s }) => s.level === lvl),
  )
  const knownSpellNames = useMemo(() => new Set(sc.spells_known.map((s) => s.name)), [sc.spells_known])
  const featNames = useMemo(() => new Set(c.feats.map((id) => featCatalog.find((f) => f.id === id)?.feat_name ?? id)), [c.feats, featCatalog])

  return createPortal(
    <div className="cw-modal-layer" onClick={requestClose}>
      <div className="ed" role="dialog" aria-modal="true" aria-label="Правка листа" onClick={(e) => e.stopPropagation()}>
        {/* ---------- шапка ---------- */}
        <header className="ed-head">
          <FaceAvatar src={pic.src} crop={pic.src ? face : { ...DEFAULT_FACE, shape: 'hex' }} className="ed-head-face" />
          <span className="ed-head-titles">
            <i>Правка листа</i>
            <b>{bi.name || 'Без имени'}</b>
          </span>
          <span className="ed-head-stats">
            <span>
              <i>уровень</i>
              <b>{level}</b>
            </span>
            <span>
              <i>мастерство</i>
              <b>{signed(pb)}</b>
            </span>
            <span>
              <i>КД</i>
              <b>{auto.ac && d.ac != null ? d.ac : c.combat.armor_class}</b>
            </span>
            <span>
              <i>хиты</i>
              <b>{c.combat.hit_points.max}</b>
            </span>
            {sc.is_spellcaster && (
              <span>
                <i>Сл закл.</i>
                <b>{auto.spell && d.spellDc != null ? d.spellDc : (sc.spell_save_dc ?? '—')}</b>
              </span>
            )}
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
          {/* ---------- герой ---------- */}
          <EdSection id="hero" icon={UserRound} title="Герой" lead="Имя, портрет и его рамка, фон листа, опыт и вдохновение.">
            <div className="ed-grid">
              <TextField label="Имя" value={bi.name} onChange={(v) => setInfo({ name: v })} wide />
              <TextField label="Игрок" value={bi.player_display_name ?? ''} onChange={(v) => setInfo({ player_display_name: v || null })} />
              <EdField label="Мировоззрение" as="label">
                <select className="ed-input ed-select" value={bi.alignment ?? ''} onChange={(e) => setInfo({ alignment: e.target.value })}>
                  <option value="">—</option>
                  {Object.values(ALIGNMENTS).map((a) => (
                    <option key={a.abbr} value={a.name}>
                      {a.abbr} · {a.name}
                    </option>
                  ))}
                </select>
              </EdField>
              <XpField value={bi.experience_points ?? 0} onChange={(v) => setInfo({ experience_points: v })} />
              <NumField label="Вдохновение" value={inspiration} min={0} max={99} onChange={(v) => setPic((p) => ({ ...p, inspiration: v }))} />
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
          <EdSection id="origin" icon={Compass} title="Происхождение" lead="Раса, подраса и предыстория — названия на листе; внешность — для страницы «Характер».">
            <datalist id="ed-races">
              {raceCatalog.map((r) => (
                <option key={r.id} value={r.race_name} />
              ))}
            </datalist>
            <datalist id="ed-backgrounds">
              {bgCatalog.map((b) => (
                <option key={b.id} value={b.background_name} />
              ))}
            </datalist>
            <div className="ed-grid">
              <EdField label="Раса" as="label">
                <input className="ed-input" list="ed-races" value={bi.race.name} onChange={(e) => setInfo({ race: { ...bi.race, name: e.target.value } })} />
              </EdField>
              <TextField
                label="Подраса"
                value={bi.subrace?.name ?? ''}
                placeholder="нет"
                onChange={(v) => setInfo({ subrace: v.trim() ? { ...(bi.subrace ?? {}), name: v } : null })}
              />
              <EdField label="Предыстория" as="label">
                <input
                  className="ed-input"
                  list="ed-backgrounds"
                  value={bi.background?.name ?? ''}
                  placeholder="нет"
                  onChange={(e) => setInfo({ background: e.target.value.trim() ? { ...(bi.background ?? {}), name: e.target.value } : null })}
                />
              </EdField>
            </div>
            <div className="ed-sub">
              <h5>Внешность</h5>
              <div className="ed-grid">
                <TextField label="Пол" value={bi.gender ?? ''} onChange={(v) => setInfo({ gender: v })} />
                <EdField label="Возраст" as="label">
                  <input
                    className="ed-input"
                    inputMode="numeric"
                    value={bi.age ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      setInfo({ age: Number.isNaN(n) ? null : Math.max(0, n) })
                    }}
                  />
                </EdField>
                <TextField label="Рост" value={bi.height ?? ''} onChange={(v) => setInfo({ height: v })} />
                <TextField label="Вес" value={bi.weight ?? ''} onChange={(v) => setInfo({ weight: v })} />
                <TextField label="Глаза" value={bi.eyes ?? ''} onChange={(v) => setInfo({ eyes: v })} />
                <TextField label="Волосы" value={bi.hair ?? ''} onChange={(v) => setInfo({ hair: v })} />
                <TextField label="Кожа" value={bi.skin ?? ''} onChange={(v) => setInfo({ skin: v })} />
              </div>
            </div>
          </EdSection>

          {/* ---------- классы ---------- */}
          <EdSection
            id="classes"
            icon={GraduationCap}
            title="Класс и уровень"
            lead="Мультикласс — отдельной строкой. Знакомый класс из каталога сам подставит кость хитов и заклинательство."
            actions={
              <button
                type="button"
                className="ed-btn"
                onClick={() => setClasses((list) => [...list, { name: '', level: 1, hit_die: 8, is_caster: false, subclass_name: null, subclass_source: null, source: null, spellcasting_ability: null }])}
                disabled={level >= 20}
              >
                <Plus aria-hidden="true" /> мультикласс
              </button>
            }
          >
            <datalist id="ed-classes">
              {classCatalog.map((cl) => (
                <option key={cl.id} value={cl.class_name} />
              ))}
            </datalist>
            <div className="ed-table ed-table--classes">
              <div className="ed-tr ed-th">
                <span>Класс</span>
                <span>Подкласс</span>
                <span>Уровень</span>
                <span>Кость хитов</span>
                <span />
              </div>
              {bi.classes.map((cl, i) => (
                <div key={i} className="ed-tr">
                  <input className="ed-input" list="ed-classes" value={cl.name} placeholder="класс" onChange={(e) => pickClassName(i, e.target.value)} aria-label="Класс" />
                  <input
                    className="ed-input"
                    value={cl.subclass_name ?? ''}
                    placeholder="нет"
                    onChange={(e) => setClass(i, { subclass_name: e.target.value || null })}
                    aria-label="Подкласс"
                  />
                  <Stepper value={cl.level} min={1} max={20 - (level - cl.level)} onChange={(v) => setClass(i, { level: v })} />
                  <Segmented
                    size="sm"
                    value={cl.hit_die ?? 8}
                    onChange={(v) => setClass(i, { hit_die: v })}
                    options={HIT_DICE.map((n) => ({ value: n, label: `к${n}` }))}
                  />
                  <button
                    type="button"
                    className="ed-btn ed-btn--icon is-danger"
                    onClick={() => setClasses((list) => list.filter((_, j) => j !== i))}
                    disabled={bi.classes.length <= 1}
                    title="Убрать класс"
                    aria-label="Убрать класс"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <div className="ed-grid">
              <EdField label="Общий уровень" hint="сумма классов">
                <span className="ed-readout">{level}</span>
              </EdField>
              <AutoNum
                label="Бонус мастерства"
                auto={auto.proficiency}
                computed={proficiencyBonus(level)}
                value={c.proficiency_bonus}
                onAuto={(v) => setAutoKey('proficiency', v)}
                onChange={(v) => setC((p) => ({ ...p, proficiency_bonus: v }))}
                min={0}
                max={10}
                sign
              />
              <div className={`ed-field ed-auto${auto.hitDice ? ' is-auto' : ''}`}>
                <span className="ed-label">
                  Кости хитов
                  <button type="button" className={`ed-auto-tag${auto.hitDice ? ' is-on' : ''}`} onClick={() => setAutoKey('hitDice', !auto.hitDice)}>
                    <Wand2 aria-hidden="true" /> {auto.hitDice ? 'авто' : 'вручную'}
                  </button>
                </span>
                <input
                  className="ed-input"
                  value={auto.hitDice ? d.hitDice : c.combat.hit_dice.total}
                  disabled={auto.hitDice}
                  onChange={(e) => setCombat({ hit_dice: { ...c.combat.hit_dice, total: e.target.value } })}
                />
              </div>
              <NumField
                label="Костей осталось"
                value={Math.min(level, c.combat.hit_dice.remaining)}
                min={0}
                max={level}
                onChange={(v) => setCombat({ hit_dice: { ...c.combat.hit_dice, remaining: v } })}
              />
            </div>
          </EdSection>

          {/* ---------- характеристики ---------- */}
          <EdSection id="abilities" icon={Dumbbell} title="Характеристики" lead="Значения с уже учтёнными бонусами расы и усилениями; спасброски с владением отмечены.">
            <div className="ed-abils">
              {ABILITY_KEYS.map((k) => {
                const block = c.ability_scores[k]
                const m = abilityMod(block.score)
                return (
                  <div key={k} className={`ed-abil${block.saving_throw_proficient ? ' is-prof' : ''}`}>
                    <span className="ed-abil-head">
                      <b>{ABILITY_LABELS[k].abbr}</b>
                      <i>{ABILITY_LABELS[k].label}</i>
                    </span>
                    <Stepper value={block.score} min={1} max={30} onChange={(v) => setAbility(k, { score: v })} />
                    <span className="ed-abil-mod">
                      <i>мод</i> <b>{signed(m)}</b>
                    </span>
                    <span className="ed-abil-save">
                      <Toggle on={block.saving_throw_proficient} onChange={(v) => setAbility(k, { saving_throw_proficient: v })} label="спасбросок" />
                      <b>{signed(m + (block.saving_throw_proficient ? pb : 0))}</b>
                    </span>
                  </div>
                )
              })}
            </div>
          </EdSection>

          {/* ---------- навыки ---------- */}
          <EdSection id="skills" icon={Sparkles} title="Навыки" lead="Владение даёт бонус мастерства, компетентность — двойной.">
            <div className="ed-skills">
              {DEFAULT_SKILLS.map((s) => {
                const e = c.skills[s.key]
                const state: SkillState = e?.proficient ? (e.expertise ? 'expert' : 'prof') : 'none'
                const total = abilityMod(c.ability_scores[s.ability].score) + (state === 'expert' ? pb * 2 : state === 'prof' ? pb : 0)
                return (
                  <div key={s.key} className={`ed-skill is-${state}`}>
                    <span className="ed-skill-name">
                      {s.label} <i>{ABILITY_LABELS[s.ability].abbr}</i>
                    </span>
                    <Segmented
                      size="sm"
                      value={state}
                      onChange={(v) => setSkill(s.key, v)}
                      options={[
                        { value: 'none', label: '—', title: 'Без владения' },
                        { value: 'prof', label: '◆', title: 'Владение' },
                        { value: 'expert', label: '◆◆', title: 'Компетентность' },
                      ]}
                    />
                    <b className="ed-skill-total">{signed(total)}</b>
                  </div>
                )
              })}
            </div>
            <div className="ed-grid">
              <AutoNum
                label="Пассивная внимательность"
                auto={auto.passive}
                computed={d.passive}
                value={c.combat.passive_perception}
                onAuto={(v) => setAutoKey('passive', v)}
                onChange={(v) => setCombat({ passive_perception: v })}
                min={0}
                max={40}
              />
            </div>
          </EdSection>

          {/* ---------- бой и хиты ---------- */}
          <EdSection id="combat" icon={HeartPulse} title="Бой и хиты" lead="КД по снаряжению считается так же, как при создании: лучший доспех, щит, защита без доспехов.">
            <div className="ed-grid">
              <AutoNum
                label="Класс доспеха"
                auto={auto.ac}
                computed={d.ac}
                value={c.combat.armor_class}
                onAuto={(v) => setAutoKey('ac', v)}
                onChange={(v) => setCombat({ armor_class: v })}
                min={0}
                max={40}
                note={d.ac == null ? 'в инвентаре нет снаряжения — только вручную' : undefined}
              />
              <AutoNum
                label="Инициатива"
                auto={auto.initiative}
                computed={d.initiative}
                value={c.combat.initiative}
                onAuto={(v) => setAutoKey('initiative', v)}
                onChange={(v) => setCombat({ initiative: v })}
                min={-10}
                max={20}
                sign
              />
              <NumField label="Скорость" hint="фт." value={c.combat.speed} min={0} max={200} onChange={(v) => setCombat({ speed: v })} />
              <NumField label="Хиты: максимум" value={c.combat.hit_points.max} min={1} max={999} onChange={(v) => setHp({ max: v })} />
              <NumField label="Хиты: текущие" value={c.combat.hit_points.current} min={0} max={c.combat.hit_points.max} onChange={(v) => setHp({ current: v })} />
              <NumField label="Временные хиты" value={c.combat.hit_points.temp} min={0} max={999} onChange={(v) => setHp({ temp: v })} />
              <NumField
                label="Спасброски: успехи"
                value={c.combat.death_saves.successes}
                min={0}
                max={3}
                onChange={(v) => setCombat({ death_saves: { ...c.combat.death_saves, successes: v } })}
              />
              <NumField
                label="Спасброски: провалы"
                value={c.combat.death_saves.failures}
                min={0}
                max={3}
                onChange={(v) => setCombat({ death_saves: { ...c.combat.death_saves, failures: v } })}
              />
            </div>
          </EdSection>

          {/* ---------- атаки ---------- */}
          <EdSection
            id="attacks"
            icon={Swords}
            title="Атаки"
            lead="Оружие из инвентаря пересчитывается само; свои атаки — заклинания-атаки, естественное оружие, особые приёмы — вписываются здесь."
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
                  const set = (patch: Partial<AttackEntry>) => setAttacks((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return (
                    <div key={i} className="ed-tr">
                      <input className="ed-input" value={a.name} onChange={(e) => set({ name: e.target.value })} aria-label="Название" />
                      <select className="ed-input ed-select" value={a.type} onChange={(e) => set({ type: e.target.value as AttackEntry['type'] })} aria-label="Вид">
                        {ATTACK_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <Stepper value={a.attack_bonus} min={-10} max={30} sign onChange={(v) => set({ attack_bonus: v })} />
                      <input className="ed-input" value={a.damage} placeholder="1к8+3" onChange={(e) => set({ damage: e.target.value })} aria-label="Урон" />
                      <input className="ed-input" value={a.damage_type} placeholder="рубящий" onChange={(e) => set({ damage_type: e.target.value })} aria-label="Тип урона" />
                      <input className="ed-input" value={a.range} placeholder="5 фт." onChange={(e) => set({ range: e.target.value })} aria-label="Дистанция" />
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
          <EdSection
            id="magic"
            icon={Wand2}
            title="Магия"
            lead="Заклинательная характеристика, ячейки каждого круга и список заклинаний."
            actions={<Toggle on={sc.is_spellcaster} onChange={(v) => setSc({ is_spellcaster: v })} label="заклинатель" />}
          >
            <div className="ed-grid">
              <EdField label="Базовая характеристика" wide>
                <Segmented
                  value={sc.spellcasting_ability ?? 'none'}
                  onChange={(v) => setSc({ spellcasting_ability: v === 'none' ? null : (v as AbilityName) })}
                  options={[
                    { value: 'none', label: '—' },
                    ...ABILITY_KEYS.map((k) => ({ value: k, label: ABILITY_LABELS[k].abbr, title: ABILITY_LABELS[k].label })),
                  ]}
                />
              </EdField>
              <AutoNum
                label="Сл спасброска"
                auto={auto.spell}
                computed={d.spellDc}
                value={sc.spell_save_dc ?? 0}
                onAuto={(v) => setAutoKey('spell', v)}
                onChange={(v) => setSc({ spell_save_dc: v })}
                min={0}
                max={30}
              />
              <AutoNum
                label="Атака заклинанием"
                auto={auto.spell}
                computed={d.spellAttack}
                value={sc.spell_attack_bonus ?? 0}
                onAuto={(v) => setAutoKey('spell', v)}
                onChange={(v) => setSc({ spell_attack_bonus: v })}
                min={-5}
                max={20}
                sign
              />
              <NumField
                label="Заговоров"
                hint={mainCaster ? `по правилам ${cantripsAt(mainCaster.name, mainCaster.level)}` : undefined}
                value={sc.cantrips_amount}
                min={0}
                max={12}
                onChange={(v) => setSc({ cantrips_amount: v })}
              />
              <NumField
                label="Готовится максимум"
                hint={
                  mainCaster && preparedSpellsMax(mainCaster.name, mainCaster.level, castMod) != null
                    ? `по правилам ${preparedSpellsMax(mainCaster.name, mainCaster.level, castMod)}`
                    : 'не готовит'
                }
                value={sc.prepared_spells_max ?? 0}
                min={0}
                max={40}
                onChange={(v) => setSc({ prepared_spells_max: v || null })}
              />
            </div>

            <div className="ed-sub">
              <h5>
                Ячейки заклинаний
                <span className="ed-sub-actions">
                  {mainCaster && casterKind(mainCaster.name, mainCaster.is_caster) !== 'none' && (
                    <button type="button" className="ed-btn" onClick={slotsByRules}>
                      <Wand2 aria-hidden="true" /> по таблице: {mainCaster.name} {mainCaster.level}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ed-btn"
                    onClick={() =>
                      setSc({
                        spell_slots: Object.fromEntries(Object.entries(sc.spell_slots).map(([k, s]) => [k, { ...s, used: 0 }])),
                      })
                    }
                  >
                    <Check aria-hidden="true" /> вернуть потраченные
                  </button>
                </span>
              </h5>
              <div className="ed-slots">
                {Array.from({ length: 9 }, (_, i) => i + 1).map((circle) => {
                  const slot = sc.spell_slots[String(circle)] ?? { max: 0, used: 0 }
                  return (
                    <div key={circle} className={`ed-slot${slot.max > 0 ? ' is-on' : ''}`}>
                      <span className="ed-slot-num">{ROMAN[circle]}</span>
                      <span className="ed-slot-label">ячеек</span>
                      <Stepper value={slot.max} min={0} max={9} onChange={(v) => setSlot(circle, { max: v })} />
                      <span className="ed-slot-label">потрачено</span>
                      <Stepper value={slot.used} min={0} max={slot.max} onChange={(v) => setSlot(circle, { used: v })} disabled={slot.max === 0} />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="ed-sub">
              <h5>
                Заклинания
                <span className="ed-sub-note">
                  {sc.spells_known.length} всего
                  {sc.prepared_spells_max ? ` · подготовлено ${preparedCount} из ${sc.prepared_spells_max}` : ''}
                </span>
              </h5>
              <CatalogSearch
                items={spellCatalog}
                label={(s) => s.spell_name}
                sub={(s) => [s.spell_level === 0 ? 'заговор' : `${s.spell_level} круг`, s.school].filter(Boolean).join(' · ')}
                exclude={knownSpellNames}
                placeholder="Найти заклинание в каталоге и добавить…"
                onPick={(s) =>
                  setSc({
                    spells_known: [
                      ...sc.spells_known,
                      { name: s.spell_name, level: s.spell_level, prepared: true, spell_source: s.spell_source ?? null, snapshot: { spell_id: s.id } },
                    ],
                  })
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
                                onChange={(v) =>
                                  setSc({ spells_known: sc.spells_known.map((x, j) => (j === i ? { ...x, prepared: v } : x)) })
                                }
                                label="подготовлено"
                              />
                            )}
                            <button
                              type="button"
                              className="ed-btn ed-btn--icon is-danger"
                              onClick={() => setSc({ spells_known: sc.spells_known.filter((_, j) => j !== i) })}
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
                {sc.spells_known.length === 0 && <p className="ed-empty">Заклинаний нет — найдите их в каталоге выше.</p>}
              </div>
            </div>
          </EdSection>

          {/* ---------- умения и черты ---------- */}
          <EdSection
            id="features"
            icon={BookOpen}
            title="Умения и черты"
            lead="Умения класса, расы и предыстории — с описанием для попапа на листе. Черты — из каталога."
            actions={
              <button
                type="button"
                className="ed-btn"
                onClick={() => setFeatures((list) => [...list, { name: 'Новое умение', source: 'other', level: null, description: '', feature_source: null }])}
              >
                <Plus aria-hidden="true" /> умение
              </button>
            }
          >
            <div className="ed-feats">
              <div className="ed-feat-head">
                <span>Название</span>
                <span>Источник</span>
                <span>Уровень</span>
                <span />
              </div>
              {c.features.map((f, i) => (
                <FeatureRow
                  key={i}
                  f={f}
                  onChange={(next) => setFeatures((list) => list.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setFeatures((list) => list.filter((_, j) => j !== i))}
                />
              ))}
              {c.features.length === 0 && <p className="ed-empty">Умений нет.</p>}
            </div>
            <div className="ed-sub">
              <h5>Черты</h5>
              <div className="ed-chips">
                {c.feats.map((id) => (
                  <span key={id} className="ed-chip">
                    {featCatalog.find((f) => f.id === id)?.feat_name ?? 'Черта'}
                    <button type="button" onClick={() => setC((p) => ({ ...p, feats: p.feats.filter((x) => x !== id) }))} aria-label="Убрать черту">
                      <X aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {c.feats.length === 0 && <span className="ed-empty">черт нет</span>}
              </div>
              <CatalogSearch
                items={featCatalog}
                label={(f) => f.feat_name}
                sub={(f) => (f.prerequisite ? `требование: ${f.prerequisite}` : '')}
                exclude={featNames}
                placeholder="Найти черту в каталоге и добавить…"
                onPick={(f) => setC((p) => ({ ...p, feats: [...p.feats, f.id] }))}
              />
            </div>
          </EdSection>

          {/* ---------- владения ---------- */}
          <EdSection id="profs" icon={Languages} title="Владения" lead="Enter или запятая — добавить, × — убрать. Владение оружием влияет на бонус атаки.">
            <div className="ed-grid ed-grid--two">
              <EdField label="Доспехи" wide>
                <ChipList items={c.proficiencies.armor} onChange={(v) => setProfs('armor', v)} placeholder="лёгкие доспехи…" />
              </EdField>
              <EdField label="Оружие" wide>
                <ChipList items={c.proficiencies.weapons} onChange={(v) => setProfs('weapons', v)} placeholder="воинское оружие…" />
              </EdField>
              <EdField label="Инструменты" wide>
                <ChipList items={c.proficiencies.tools} onChange={(v) => setProfs('tools', v)} placeholder="воровские инструменты…" />
              </EdField>
              <EdField label="Языки" wide>
                <ChipList items={c.proficiencies.languages} onChange={(v) => setProfs('languages', v)} placeholder="Общий…" />
              </EdField>
            </div>
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
                    onChange={(v) => setC((p) => ({ ...p, inventory: { ...p.inventory, currency: { ...p.inventory.currency, [key]: v } } }))}
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
                  onChange={(v) => setC((p) => ({ ...p, personality: { ...p.personality, [key]: v } }))}
                />
              ))}
            </div>
            <div className="ed-grid">
              <AreaField label="История" rows={6} value={c.backstory} onChange={(v) => setC((p) => ({ ...p, backstory: v }))} />
              <AreaField label="Заметки" rows={5} value={c.notes} onChange={(v) => setC((p) => ({ ...p, notes: v }))} />
            </div>
          </EdSection>
        </div>

        {/* ---------- подвал ---------- */}
        <footer className="ed-foot">
          <span className={`ed-dirty${dirty ? ' is-on' : ''}`}>{dirty ? 'Есть несохранённые правки' : 'Без изменений'}</span>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={requestClose}>
            Отмена
          </button>
          <button type="button" className="cs-btn cw-next" onClick={save} disabled={!dirty}>
            <Check aria-hidden="true" /> Применить
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
