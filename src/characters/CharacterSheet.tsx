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
  Backpack,
  BookOpen,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Currency, Feat } from '../api'
import { useCatalogList } from '../create/useCatalog'
import type { AbilityName, InventoryItemInstance, SheetView } from '../types/character'
import { abilityMod } from '../create/dnd5e'
import { GameHud, type HudControls, type HudTab } from './GameHud'
import { RotateGate } from './hud/HudChrome'
import { HeroStage } from './HeroStage'
import { useAppShell } from '../shell'
import { SpellBook } from './SpellBook'
import type { FaceCrop } from './portrait'
import type { SheetPatch, SheetPlay } from './sheetPlay'
import { RollTheater } from '../dice/theater/RollTheater'
import { activeStates, type EngineView } from './EnginePanel'
import { ResourceBand } from './ResourceBand'
import { WhyProvider } from './WhyPopover'
import type { Outcome } from './useCharacterEngine'
import type { StageEngine } from './HeroStage'
import { type FeatureRow, type SheetAttack, attacksPerAction, personaOf } from './sheet/rules'
import { buildAttacks, buildFeatureRows } from './sheet/sheetRows'
import { Card, RollLog } from './sheet/parts'
import { useSheetRolls } from './sheet/useSheetRolls'
import { AbilitiesCard } from './sheet/AbilitiesCard'
import { AttackRow, CombatCard, SpellAttackRow } from './sheet/CombatCard'
import { InventoryCard } from './sheet/InventoryCard'
import { FeaturesCard, FeatureTile, ProfsCard, RulesCard } from './sheet/FeatureCards'
import { PersonaCard, PersonaEditCard } from './sheet/PersonaCard'
import { FlatHero } from './sheet/FlatHero'
import { SheetTabs, type TabRow } from './sheet/SheetTabs'
import { ReviewTabs } from './sheet/ReviewTabs'
import { FeatureModal } from './sheet/FeatureModal'
import { FeaturesTab } from './sheet/tabs/FeaturesTab'
import { StoryTab } from './sheet/tabs/StoryTab'
import { MainTab } from './sheet/tabs/MainTab'
import { ActionsTab } from './sheet/tabs/ActionsTab'
import { HudFeaturesTab } from './sheet/tabs/HudFeaturesTab'

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
  const perAction = extras?.perAction ?? attacksPerAction(cls.name, level)
  const combat = sheet.combat
  const spell = sheet.spellcasting
  const hasMagic = spell.is_spellcaster || spell.spells_known.length > 0

  const attacks = buildAttacks(sheet, mod, pb)

  // включённые состояния (идёт ярость) — подсветка ресурса того же ключа
  const activeKeys = new Set(engine ? activeStates(engine.sheet, engine.labels).map((x) => x.key) : [])

  // элементы способности по grant_id: её кнопки и её счётчики
  const actionsOf = (grantId: string) => engine?.sheet.actions.filter((a) => a.grant_id === grantId) ?? []
  const resourcesOf = (slug: string | undefined) => (slug ? (engine?.sheet.resources.filter((r) => r.declared_by === slug) ?? []) : [])

  const featureRows = buildFeatureRows(sheet, featCatalog)

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

  const featuresPage = <FeaturesTab featureRows={featureRows} featureTile={featureTile} profs={profsCard} rules={rulesCard} />

  const personaCard = onPatch ? <PersonaEditCard sheet={sheet} onPatch={onPatch} /> : persona.length > 0 && <PersonaCard persona={persona} />

  const storyPage = (
    <StoryTab info={info} portrait={portrait} fallbackPortrait={fallbackPortrait} onPortraitClick={onPortraitClick} persona={personaCard} />
  )

  const flatHero = (
    <FlatHero
      info={info}
      cls={cls}
      level={level}
      combat={combat}
      pb={pb}
      portrait={portrait}
      fallbackPortrait={fallbackPortrait}
      rollD20={rollD20}
      rolling={dice.rolling}
    />
  )

  /* ---------- раскладка ---------- */

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

  const hudFeatures = (
    <HudFeaturesTab
      featureRows={featureRows}
      featureTile={featureTile}
      featureGroup={featureGroup}
      onGroup={setFeatureGroup}
      profs={profsCard}
      rules={rulesCard}
    />
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
              actions: <ActionsTab engine={engine} resources={resources} combat={combatCard} />,
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
          <SheetTabs rows={deskTabs} current={current} onTab={setTab} />
          <div key={current} className={`cw-page cw-page--${current}`} role="tabpanel">
            {current === 'main' && <MainTab engine={engine} abilities={abilitiesCard} combat={combatCard} inventory={invCard} />}
            {current === 'magic' && spellBook}
            {current === 'features' && featuresPage}
            {current === 'story' && storyPage}
          </div>
        </>
      ) : shell.app ? (
        <>
          {flatHero}
          <ReviewTabs tabs={reviewTabs} current={reviewCurrent} onSelect={setReviewTab} />
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
        <FeatureModal
          feature={openFeature}
          engine={engine}
          activeKeys={activeKeys}
          actionsOf={actionsOf}
          resourcesOf={resourcesOf}
          onToggleAbility={onToggleAbility}
          onClose={() => setOpenFeature(null)}
        />
      )}
    </div>
    </WhyProvider>
  )
}
