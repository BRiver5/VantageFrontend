/**
 * Лист героя «в духе бестиария» — общий для итога конструктора и для
 * сохранённого персонажа.
 *
 * Сохранённый лист идёт по страницам (`paged`): «Лист» — сцена героя,
 * характеристики с навыками, оружие и инвентарь; «Магия» — книга заклинаний;
 * «Умения» — умения, черты и владения; «Характер» — портрет во весь рост,
 * внешность и записи. Итог визарда — одна страница с теми же карточками.
 *
 * Без `onPatch` лист — витрина (итог визарда, предпросмотр). У сохранённого
 * героя все числа приходят с сервера (`/sheet`): игровая панель `engine`
 * шлёт действия, отдых и ход движку, а `onPatch` правит только документ —
 * кошелёк и записи. Всё, что бросается, бросается кликом — общими 3D-костями,
 * с историей бросков в углу экрана; туда же попадают броски сервера.
 */
import { useLayoutEffect, useState, type ReactNode } from 'react'
import {
  Award,
  Backpack,
  BookOpen,
  Camera,
  Dices,
  Eye,
  EyeOff,
  Footprints,
  Heart,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cleanDescription, realImage } from '../api'
import type { Currency, Feat } from '../api'
import { formatDice } from '../equipment'
import { useCatalogList } from '../create/useCatalog'
import { parseAbilityText } from '../abilities/AbilityText'
import type { AbilityName, InventoryItemInstance, SheetView } from '../types/character'
import { abilityMod } from '../create/dnd5e'
import { alignmentAbbr } from '../create/steps/AlignmentChart'
import { GameHud, type HudControls, type HudTab } from './GameHud'
import { HudSplit, RotateGate } from './hud/HudChrome'
import { HeroStage } from './HeroStage'
import { useAppShell } from '../shell'
import { SheetModal } from './SheetModal'
import { SpellBook } from './SpellBook'
import type { FaceCrop } from './portrait'
import type { SheetPatch, SheetPlay } from './sheetPlay'
import { RollTheater } from '../dice/theater/RollTheater'
import { ActionButton, activeStates, EnginePanel, type EngineView } from './EnginePanel'
import { ResourceBand } from './ResourceBand'
import { WhyProvider } from './WhyPopover'
import type { Outcome } from './useCharacterEngine'
import type { StageEngine } from './HeroStage'
import { type FeatureRow, SOURCE_GROUPS, SOURCE_LABEL, STATUS_LABEL, type SheetAttack, attacksPerAction, personaOf, signed } from './sheet/rules'
import { Card, FeatureText, HeroPortrait, RollLog } from './sheet/parts'
import { useSheetRolls } from './sheet/useSheetRolls'
import { AbilitiesCard } from './sheet/AbilitiesCard'
import { AttackRow, CombatCard, SpellAttackRow } from './sheet/CombatCard'
import { InventoryCard } from './sheet/InventoryCard'
import { FeaturesCard, FeatureTile, ProfsCard, RulesCard } from './sheet/FeatureCards'
import { PersonaCard, PersonaEditCard } from './sheet/PersonaCard'

/** Страницы листа: на телефоне — бой / сумка / герой, на столе — те же четыре */
export type SheetTab = 'main' | 'magic' | 'features' | 'story' | 'bag' | 'hero' | 'skills' | 'actions'

export interface CharacterSheetProps {
  sheet: SheetView
  /** свой портрет героя (ссылка) и запасной — арт расы */
  portrait: string | null
  fallbackPortrait: string | null
  /** заголовок над шапкой (например, «Герой готов» в визарде) */
  heading?: ReactNode
  play: SheetPlay
  /** инвентарь изменён; coins — монеты, высыпанные из контейнера */
  onInventory: (items: InventoryItemInstance[], coins?: Partial<Record<Currency, number>>) => void
  /** живой лист: правки хитов, состояний, кошелька и записей */
  onPatch?: SheetPatch
  /** клик по портрету в живом листе — сменить картинку */
  onPortraitClick?: () => void
  /** кадр лица и рамка своего портрета (для сцены героя) */
  face?: FaceCrop | null
  /** лист по страницам: «Лист», «Магия», «Умения», «Характер» */
  paged?: boolean
  tab?: SheetTab
  onTab?: (tab: SheetTab) => void
  /** игровая панель сохранённого героя: действия, ресурсы, ход, отдых */
  engine?: EngineView
  /** сцена героя: отдых, журнал и правка мастера */
  stage?: StageEngine
  /** итог последнего действия сервера — его броски идут в историю */
  serverLog?: Outcome | null
  /** включить или отключить умение (только своё) */
  onToggleAbility?: (grantId: string, enabled: boolean) => void
  /** телефон: уведомления, выборы, журнал, отдых и меню экрана героя */
  hud?: HudControls
  /**
   * Лист играется в комнате: кости бросает сервер (запрос + событие у всех),
   * а у игрока инвентарь и кошелёк закрыты от правки — выдаёт и забирает мастер.
   */
  roomMode?: {
    isDm: boolean
    /** передать предмет другому герою партии */
    onTransfer?: (item: InventoryItemInstance) => void
    /** бросить предмет на общий стол */
    onDropToTable?: (item: InventoryItemInstance) => void
    /** передать монеты */
    onTransferCoins?: () => void
  }
}

export default function CharacterSheet({
  sheet,
  portrait,
  fallbackPortrait,
  heading,
  play,
  onInventory,
  onPatch,
  onPortraitClick,
  face = null,
  paged = false,
  tab: tabProp,
  onTab,
  engine,
  stage,
  serverLog = null,
  onToggleAbility,
  hud,
  roomMode,
}: CharacterSheetProps) {
  const [ownTab, setOwnTab] = useState<SheetTab>('main')
  const tab = tabProp ?? ownTab
  const setTab = (t: SheetTab) => (onTab ? onTab(t) : setOwnTab(t))
  const shell = useAppShell()
  const hudMode = paged && shell.app
  const [featureGroup, setFeatureGroup] = useState<string | null>(null)
  const [reviewTab, setReviewTab] = useState('combat')
  const live = !!onPatch

  useLayoutEffect(() => {
    if (!hudMode) return
    document.documentElement.dataset.hud = 'sheet'
    return () => {
      delete document.documentElement.dataset.hud
    }
  }, [hudMode])
  const { dice, roller, rolls, clearRolls, critFor, rollD20, rollDamage, theater, setTheater } = useSheetRolls({
    sheet,
    stage,
    engine,
    roomMode,
    serverLog,
  })
  const lockedPurse = !!roomMode && !roomMode.isDm
  const [openFeatureKey, setOpenFeatureKey] = useState<string | null>(null)
  const setOpenFeature = (f: FeatureRow | null) => setOpenFeatureKey(f?.key ?? null)
  const { items: featCatalog } = useCatalogList<Feat>('feats', sheet.feats.length > 0)

  const info = sheet.basic_info
  // способности движка: крит с 19 у Чемпиона, атак за действие у Дополнительной атаки
  const extras = sheet.extras
  const critMin = extras?.critMin ?? 20

  /* ---------- значения листа ---------- */

  const cls = info.classes[0] ?? { name: '—', level: info.total_level }
  const level = info.total_level
  const pb = sheet.proficiency_bonus
  const score = (k: AbilityName) => sheet.ability_scores[k].score
  // у листа с сервера модификатор и спасбросок готовые; у черновика визарда — по таблице
  const mod = (k: AbilityName) => sheet.ability_scores[k].modifier ?? abilityMod(score(k))
  const strMod = mod('strength')
  const perAction = extras?.perAction ?? attacksPerAction(cls.name, level)
  const combat = sheet.combat
  const spell = sheet.spellcasting
  const items = sheet.inventory.items
  const hasMagic = spell.is_spellcaster || spell.spells_known.length > 0

  // оружие — по экземплярам инвентаря: оттуда картинка и универсальный хват
  const itemById = new Map(items.map((it) => [it.instance_id, it]))
  const attacks: SheetAttack[] = sheet.attacks.map((a, i) => {
    const eq = a.inventory_instance_id ? itemById.get(a.inventory_instance_id)?.equipment : null
    const modPart = /[+\-−]\d+$/.exec(a.damage)?.[0] ?? ''
    return {
      ...a,
      key: a.inventory_instance_id ?? `atk-${i}`,
      versatile: eq?.weapon?.versatile_dice ? `${eq.weapon.versatile_dice}${modPart}` : null,
      image: realImage(eq?.equipment_image_gallery),
    }
  })
  // кость безоружного удара от Боевых искусств монаха: с ней можно бить Ловкостью
  const unarmedDie = extras?.unarmedDie ?? 1
  const unarmedMod = unarmedDie > 1 ? Math.max(strMod, mod('dexterity')) : strMod
  const signedMod = unarmedMod ? (unarmedMod > 0 ? `+${unarmedMod}` : `${unarmedMod}`) : ''
  attacks.push({
    key: 'unarmed',
    name: 'Безоружный удар',
    type: 'melee',
    attack_bonus: unarmedMod + pb,
    damage: unarmedDie > 1 ? `1d${unarmedDie}${signedMod}` : String(Math.max(1, 1 + unarmedMod)),
    damage_type: 'дробящий',
    range: '5 фт.',
    properties: [],
    versatile: null,
    image: null,
  })

  // feature_source в листе — UUID; в подписи показываем название владельца
  const ownerOf = (source: string): string | null =>
    source === 'class'
      ? (info.classes[0]?.name ?? null)
      : source === 'subclass'
        ? (info.classes[0]?.subclass_name ?? null)
        : source === 'subrace'
          ? (info.subrace?.name ?? null)
          : source === 'race'
            ? info.race.name
            : source === 'background'
              ? (info.background?.name ?? null)
              : null

  // включённые состояния (идёт ярость) — подсветка ресурса того же ключа
  const activeKeys = new Set(engine ? activeStates(engine.sheet, engine.labels).map((x) => x.key) : [])

  // элементы способности по grant_id: её кнопки и её счётчики
  const actionsOf = (grantId: string) => engine?.sheet.actions.filter((a) => a.grant_id === grantId) ?? []
  const resourcesOf = (slug: string | undefined) => (slug ? (engine?.sheet.resources.filter((r) => r.declared_by === slug) ?? []) : [])

  const featureRows: FeatureRow[] = [
    ...sheet.features.map((f, i) => ({
      key: f.grant_id ?? `${f.name}-${i}`,
      source: f.source,
      title: f.name,
      // уровень получения — из служебной строки описания («3-й уровень, умение воина»)
      sub: [
        SOURCE_LABEL[f.source] ?? '',
        ownerOf(f.source),
        f.level ? `${f.level} ур.` : (/^\d+ ур\./.exec(parseAbilityText(f.description).meta[0] ?? '')?.[0] ?? ''),
      ]
        .filter(Boolean)
        .join(' · '),
      text: f.description,
      grantId: f.grant_id,
      slug: f.slug,
      disabled: f.disabled,
      status: f.implementation_status,
      active: f.active,
    })),
    ...sheet.feats.map((featId) => {
      const feat = featCatalog.find((x) => x.id === featId)
      return {
        key: featId,
        source: 'feat',
        title: feat?.feat_name ?? 'Черта',
        sub: ['черта', feat?.prerequisite ? `требование: ${feat.prerequisite}` : ''].filter(Boolean).join(' · '),
        text: cleanDescription(feat?.description),
      }
    }),
  ]

  const persona = personaOf(sheet)

  const openFeature = openFeatureKey ? (featureRows.find((f) => f.key === openFeatureKey) ?? null) : null

  /* ---------- карточки ---------- */

  const abilitiesCard = <AbilitiesCard sheet={sheet} mod={mod} score={score} pb={pb} rollD20={rollD20} rolling={dice.rolling} />

  const attackRow = (a: SheetAttack) => (
    <AttackRow key={a.key} a={a} sheet={sheet} critFor={critFor} rollD20={rollD20} rollDamage={rollDamage} rolling={dice.rolling} />
  )

  const spellAttackRow = spell.is_spellcaster && spell.spell_attack_bonus != null && (
    <SpellAttackRow spell={spell} rollD20={rollD20} rolling={dice.rolling} />
  )

  const combatCard = (
    <CombatCard perAction={perAction} critMin={critMin}>
      {attacks.map(attackRow)}
      {spellAttackRow}
    </CombatCard>
  )

  const invCard = (
    <InventoryCard sheet={sheet} onInventory={onInventory} onPatch={onPatch} live={live} lockedPurse={lockedPurse} roomMode={roomMode} />
  )

  const spellBook = hasMagic && <SpellBook spellcasting={spell} play={play} roller={roller} tabbed={hudMode} />

  const featureTile = (f: FeatureRow) => <FeatureTile key={f.key} f={f} actionsOf={actionsOf} onOpen={setOpenFeature} />

  const featuresCard = <FeaturesCard featureRows={featureRows} featureTile={featureTile} />

  const profsCard = <ProfsCard proficiencies={sheet.proficiencies} />

  const rulesCard = extras && (extras.maneuvers.length > 0 || extras.flags.length > 0 || extras.vars.length > 0) && <RulesCard extras={extras} />

  /** Страница умений: группы по источнику, клик — попап с описанием */
  const featuresPage = (
    <div className="cw-fpage">
      <div className="cw-fpage-groups">
        {featureRows.length === 0 && <p className="cw-field-note">Умений пока нет.</p>}
        {SOURCE_GROUPS.map((g) => {
          const list = featureRows.filter((f) => g.sources.includes(f.source))
          if (!list.length) return null
          return (
            <section key={g.title} className="cw-fgroup">
              <h4 className="cw-fgroup-title">
                {g.title} <em>{list.length}</em>
              </h4>
              <div className="cw-ftiles">{list.map(featureTile)}</div>
            </section>
          )
        })}
      </div>
      <div className="cw-fpage-side">
        {profsCard}
        {rulesCard}
      </div>
    </div>
  )

  const personaCard = onPatch ? <PersonaEditCard sheet={sheet} onPatch={onPatch} /> : persona.length > 0 && <PersonaCard persona={persona} />

  /** Страница характера: большой портрет во весь рост и всё о внешности */
  const looks = (
    [
      ['Раса', info.subrace?.name ?? info.race.name],
      ['Предыстория', info.background?.name],
      ['Мировоззрение', info.alignment],
      ['Пол', info.gender],
      ['Возраст', info.age != null ? String(info.age) : ''],
      ['Рост', info.height],
      ['Вес', info.weight],
      ['Глаза', info.eyes],
      ['Волосы', info.hair],
      ['Кожа', info.skin],
    ] as const
  ).filter(([, v]) => v && String(v).trim())

  const storyPage = (
    <div className="cw-story">
      <figure className="cw-story-art">
        <HeroPortrait own={portrait} fallback={fallbackPortrait} />
        {onPortraitClick && (
          <button type="button" className="cw-portrait-edit" onClick={onPortraitClick} title="Сменить портрет">
            <Camera aria-hidden="true" />
          </button>
        )}
        {looks.length > 0 && (
          <figcaption className="cw-story-looks">
            {looks.map(([label, value]) => (
              <span key={label}>
                <i>{label}</i>
                <b>{value}</b>
              </span>
            ))}
          </figcaption>
        )}
      </figure>
      <div className="cw-story-text">{personaCard}</div>
    </div>
  )

  /** Шапка итога визарда: портрет целиком и главные числа строкой */
  const abbr = alignmentAbbr(info.alignment ?? '')
  const flatHero = (
    <header className="cw-sheet-hero">
      <span className="cw-sheet-portrait">
        <HeroPortrait own={portrait} fallback={fallbackPortrait} />
        {abbr && <span className="cw-hero-align">{abbr}</span>}
      </span>
      <div className="cw-sheet-id">
        <h2 className="cw-sheet-name gold-text">{info.name}</h2>
        <p className="cw-sheet-who">
          {[info.subrace?.name ?? info.race.name, `${cls.name} ${level} ур.`, cls.subclass_name].filter(Boolean).join(' · ')}
        </p>
        {(info.background || info.alignment) && (
          <p className="cw-sheet-sub">
            {[info.background?.name && `предыстория: ${info.background.name}`, info.alignment].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="cw-sheet-stats">
          <span className="cw-stat cw-stat--ac" title="Класс доспеха">
            <Shield aria-hidden="true" />
            <b>{combat.armor_class}</b>
            <i>КД</i>
          </span>
          <span className="cw-stat cw-stat--hp" title="Максимум хитов">
            <Heart aria-hidden="true" />
            <b>{combat.hit_points.max}</b>
            <i>хиты</i>
          </span>
          <button
            type="button"
            className="cw-stat cw-stat--roll"
            onClick={() => void rollD20('Инициатива', combat.initiative, undefined, { kind: 'init' })}
            disabled={dice.rolling}
            title="Бросить инициативу"
          >
            <Zap aria-hidden="true" />
            <b>{signed(combat.initiative)}</b>
            <i>инициатива</i>
          </button>
          <span className="cw-stat">
            <Footprints aria-hidden="true" />
            <b>{combat.speed}</b>
            <i>фт. скорость</i>
          </span>
          <span className="cw-stat">
            <Award aria-hidden="true" />
            <b>+{pb}</b>
            <i>мастерство</i>
          </span>
          <span className="cw-stat">
            <Dices aria-hidden="true" />
            <b>{formatDice(combat.hit_dice.total)}</b>
            <i>кости хитов</i>
          </span>
        </div>
      </div>
    </header>
  )

  /* ---------- раскладка ---------- */

  type TabRow = { id: SheetTab; label: string; icon: LucideIcon; badge?: number; alert?: number }
  const deskTabs: TabRow[] = [
    { id: 'main', label: 'Лист', icon: Swords },
    ...(hasMagic ? [{ id: 'magic' as const, label: 'Магия', icon: Sparkles, badge: spell.spells_known.length }] : []),
    { id: 'features', label: 'Умения', icon: BookOpen, badge: featureRows.length, alert: engine?.sheet.pending_decisions.length },
    { id: 'story', label: 'Характер', icon: UserRound },
  ]
  const rawTab = tab === 'hero' ? 'story' : tab
  const current = deskTabs.some((t) => t.id === rawTab) ? rawTab : 'main'

  const resources = engine && (
    <ResourceBand
      resources={engine.sheet.resources}
      activeKeys={activeKeys}
      onOpen={(slug) => setOpenFeature(featureRows.find((f) => f.slug === slug) ?? null)}
    />
  )

  const tabButtons = (rows: TabRow[]) => (
    <nav className="cw-tabs" role="tablist" aria-label="Страницы листа">
      {rows.map(({ id, label, icon: Icon, badge, alert }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={current === id}
          className={`cw-tab${current === id ? ' is-on' : ''}`}
          onClick={() => setTab(id)}
        >
          <Icon aria-hidden="true" /> {label}
          {badge ? <em>{badge}</em> : null}
          {alert ? (
            <em className="is-alert" title="Нерешённые выборы">
              !{alert}
            </em>
          ) : null}
        </button>
      ))}
    </nav>
  )

  /* ---------- итог создания на телефоне: разделы вместо длинной ленты ---------- */

  const reviewTabs: { id: string; label: string; icon: LucideIcon; body: ReactNode }[] = [
    { id: 'combat', label: 'Бой', icon: Swords, body: combatCard },
    { id: 'skills', label: 'Навыки', icon: ShieldCheck, body: abilitiesCard },
    { id: 'bag', label: 'Сумка', icon: Backpack, body: invCard },
    ...(spellBook ? [{ id: 'magic', label: 'Магия', icon: Sparkles, body: <Card title="Магия" icon={Sparkles} className="cw-sheet-card--magic">{spellBook}</Card> }] : []),
    { id: 'features', label: 'Умения', icon: BookOpen, body: <>{featuresCard}{profsCard}</> },
    ...(personaCard ? [{ id: 'persona', label: 'Характер', icon: UserRound, body: personaCard }] : []),
  ]
  const reviewCurrent = reviewTabs.find((t) => t.id === reviewTab) ?? reviewTabs[0]

  /* ---------- экран героя на телефоне ---------- */

  const hudTab: HudTab | null =
    tab === 'story' || tab === 'hero' ? 'hero' : tab === 'bag' || tab === 'magic' || tab === 'features' || tab === 'skills' || tab === 'actions' ? tab : null

  // на экране — оружие, атака заклинанием и безоружный удар, сколько поместится
  const hotbarRows = [
    ...attacks.filter((a) => a.key !== 'unarmed').map(attackRow),
    ...(spellAttackRow ? [spellAttackRow] : []),
    ...attacks.filter((a) => a.key === 'unarmed').map(attackRow),
  ]

  const featureTabs = [
    ...SOURCE_GROUPS.map((g) => ({
      key: g.title,
      label: g.sources.includes('choice') ? 'Выбранные' : g.title,
      count: featureRows.filter((f) => g.sources.includes(f.source)).length,
    })).filter((g) => g.count > 0),
    { key: 'profs', label: 'Владения' },
    ...(rulesCard ? [{ key: 'rules', label: 'Особые правила' }] : []),
  ]
  const featureKey = featureTabs.some((t) => t.key === featureGroup) ? featureGroup! : featureTabs[0].key
  const featureGroupDef = SOURCE_GROUPS.find((g) => g.title === featureKey)
  const hudFeatures = (
    <HudSplit tabs={featureTabs} active={featureKey} onChange={setFeatureGroup}>
      {featureKey === 'profs' ? profsCard : featureKey === 'rules' ? rulesCard : (
        <div className="cw-ftiles">{featureRows.filter((f) => featureGroupDef?.sources.includes(f.source)).map(featureTile)}</div>
      )}
    </HudSplit>
  )

  const hudSlots = Object.entries(spell.spell_slots)
    .map(([c, sl]) => ({ circle: Number(c), max: sl.max, used: Math.min(sl.max, play.slotsUsed[c] ?? 0) }))
    .filter((sl) => sl.max > 0)
    .sort((a, b) => a.circle - b.circle)

  const hudActive = engine
    ? [...activeStates(engine.sheet, engine.labels).map((x) => x.label), ...engine.sheet.active_effects.map((e) => e.label)]
    : []

  return (
    <WhyProvider breakdown={sheet.breakdown} bases={sheet.bases} names={sheet.sourceNames}>
    <div className={`cw-step cw-sheet${paged ? ' is-paged' : ''}${hudMode ? ' is-hud' : ''}`}>
      {heading}

      {hudMode ? (
        shell.rotate ? (
          <RotateGate coarse={shell.coarse} />
        ) : (
          <GameHud
            sheet={sheet}
            roller={roller}
            stage={stage}
            portrait={portrait}
            face={face}
            fallbackPortrait={fallbackPortrait}
            controls={hud}
            hotbar={hotbarRows.slice(0, 3)}
            hotbarMore={Math.max(0, hotbarRows.length - 3)}
            resources={engine?.sheet.resources ?? []}
            activeKeys={activeKeys}
            activeLabels={hudActive}
            onOpenAbility={(slug) => setOpenFeature(featureRows.find((f) => f.slug === slug) ?? null)}
            slots={hudSlots}
            rollLog={<RollLog rolls={rolls} onClear={clearRolls} inline />}
            rollCount={rolls.length}
            tab={hudTab}
            onTab={(t) => setTab(t ?? 'main')}
            windows={{
              actions: (
                <div className="hud-combat">
                  <div className="hud-combat-main">
                    {resources}
                    {engine && <EnginePanel engine={engine} showAll />}
                  </div>
                  <div className="hud-combat-side">{combatCard}</div>
                </div>
              ),
              skills: abilitiesCard,
              bag: invCard,
              magic: spellBook || undefined,
              features: hudFeatures,
              hero: storyPage,
            }}
          />
        )
      ) : paged ? (
        <>
          <HeroStage
            sheet={sheet}
            portrait={portrait}
            face={face}
            fallbackPortrait={fallbackPortrait}
            onPortraitClick={onPortraitClick}
            roller={roller}
            stage={stage}
          />
          {resources}
          {tabButtons(deskTabs)}
          <div key={current} className={`cw-page cw-page--${current}`} role="tabpanel">
            {current === 'main' && (
              <>
                {engine && <EnginePanel engine={engine} />}
                {abilitiesCard}
                {combatCard}
                {invCard}
              </>
            )}
            {current === 'magic' && spellBook}
            {current === 'features' && featuresPage}
            {current === 'story' && storyPage}
          </div>
        </>
      ) : shell.app ? (
        <>
          {flatHero}
          <nav className="cw-rtabs" aria-label="Разделы листа">
            {reviewTabs.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" className={reviewCurrent.id === id ? 'is-on' : ''} aria-pressed={reviewCurrent.id === id} onClick={() => setReviewTab(id)}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div key={reviewCurrent.id} className="cw-rpane">
            {reviewCurrent.body}
          </div>
        </>
      ) : (
        <>
          {flatHero}
          <div className="cw-sheet-grid">
            {combatCard}
            {abilitiesCard}
            {invCard}
            {spellBook && (
              <Card title="Магия" icon={Sparkles} className="cw-sheet-card--magic">
                {spellBook}
              </Card>
            )}
            {featuresCard}
            {profsCard}
            {personaCard}
          </div>
        </>
      )}

      {!hudMode && <RollLog rolls={rolls} onClear={clearRolls} />}
      {theater[0] && <RollTheater key={theater[0].id} spec={theater[0]} onDone={() => setTheater((q) => q.slice(1))} />}
      {openFeature && (
        <SheetModal
          title={openFeature.title}
          kicker={openFeature.sub}
          tone={openFeature.source}
          visual={<BookOpen className="cw-smodal-glyph" aria-hidden="true" />}
          onClose={() => setOpenFeature(null)}
          actions={
            <>
              {onToggleAbility && openFeature.grantId && (
                <label className={`cw-ftoggle${openFeature.disabled ? '' : ' is-on'}`} title="Отключённое умение остаётся в списке, но его бонусы и действия не работают">
                  <input
                    type="checkbox"
                    checked={!openFeature.disabled}
                    onChange={(e) => onToggleAbility(openFeature.grantId!, e.target.checked)}
                  />
                  <span className="cw-ftoggle-track" aria-hidden="true">
                    <span className="cw-ftoggle-knob">{openFeature.disabled ? <EyeOff /> : <Eye />}</span>
                  </span>
                  <span>{openFeature.disabled ? 'Умение отключено' : 'Умение действует'}</span>
                </label>
              )}
              <button type="button" className="cs-btn cw-next" onClick={() => setOpenFeature(null)}>
                Закрыть
              </button>
            </>
          }
        >
          {openFeature.status && openFeature.status !== 'full' && !openFeature.disabled && (
            <p className={`cw-field-note cw-fstatus is-${openFeature.status}`}>{STATUS_LABEL[openFeature.status] ?? openFeature.status}</p>
          )}
          {openFeature.disabled ? (
            <p className="cw-field-note cw-fstatus is-off">Отключено: бонусы и действия умения не работают, пока его не включить.</p>
          ) : (
            openFeature.active === false && (
              <p className="cw-field-note cw-fstatus is-off">Сейчас не действует: условие умения не выполнено.</p>
            )
          )}
          {engine && !openFeature.disabled && resourcesOf(openFeature.slug).length > 0 && (
            <div className="cw-fcard-res">
              <ResourceBand resources={resourcesOf(openFeature.slug)} activeKeys={activeKeys} />
            </div>
          )}
          {engine && !openFeature.disabled && openFeature.grantId && actionsOf(openFeature.grantId).length > 0 && (
            <div className="eng-actions cw-fcard-acts">
              {actionsOf(openFeature.grantId).map((a) => (
                <ActionButton
                  key={a.key}
                  a={a}
                  // поп-ап действия откроется поверх — карточку закрываем
                  engine={{ ...engine, onAction: (x) => (setOpenFeature(null), engine.onAction(x)) }}
                  showAbility={false}
                />
              ))}
            </div>
          )}
          <FeatureText row={openFeature} />
        </SheetModal>
      )}
    </div>
    </WhyProvider>
  )
}
