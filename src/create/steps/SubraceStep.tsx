/**
 * Шаг 2 — подраса: родословное древо. Сверху — карточка выбранной расы, от неё
 * ветвями расходятся подрасы. Карточки те же, что на шаге расы; арта у подрас
 * в API нет, поэтому они берут арт родительской расы.
 * Если все ветви заменяют расу (`replaces_race`), базовый народ можно оставить —
 * тогда корень древа тоже выбирается.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Eye, Footprints, Languages, Users } from 'lucide-react'
import { ABILITY_RU, realImage } from '../../api'
import type { Race, Subrace } from '../../api'
import { AbilityList } from '../../abilities/AbilityList'
import { ClassArticle, OpenLinksInNewTab, isHtmlDescription } from '../../classArticle'
import { splitRaceArticle } from '../../raceArticle'
import { RichText } from '../../terms/terms'
import { abilityFromAny } from '../dnd5e'
import type { StepProps } from '../draft'
import { ChoiceModal, FactChip, ModalLine, ModalSection, StepHeader } from './ui'
import { RaceCard, RaceModal } from './RaceStep'

function SubraceFacts({ sr }: { sr: Subrace }) {
  const boosts = Object.entries(sr.increase_ability_scores ?? {})
  return (
    <>
      {boosts.map(([k, v]) => (
        <FactChip key={k}>
          {ABILITY_RU[k] ?? k} +{v}
        </FactChip>
      ))}
      {sr.speed_bonus > 0 && <FactChip icon={Footprints}>+{sr.speed_bonus} фт.</FactChip>}
      {sr.darkvision_override != null && (
        <FactChip icon={Eye}>тьма {sr.darkvision_override} фт.</FactChip>
      )}
    </>
  )
}

/** Итоговые прибавки: обычная ветвь добавляется к расе, самостоятельная — заменяет её */
function branchBoosts(sr: Subrace, parent: Race): Record<string, number> {
  const own = sr.increase_ability_scores ?? {}
  if (sr.replaces_race) return own
  const out: Record<string, number> = {}
  for (const scores of [parent.increase_ability_scores ?? {}, own]) {
    for (const [raw, value] of Object.entries(scores)) {
      const key = abilityFromAny(raw) ?? raw
      out[key] = (out[key] ?? 0) + value
    }
  }
  return out
}

/** Подраса в виде карточки расы: какой станет герой, если выбрать эту ветвь */
function branchAsRace(sr: Subrace, parent: Race): Race {
  return {
    ...parent,
    id: sr.id,
    race_name: sr.subrace_name,
    increase_ability_scores: branchBoosts(sr, parent),
    size: sr.size ?? parent.size,
    speed: (sr.speed ?? parent.speed) + (sr.speed_bonus ?? 0),
    darkvision: sr.darkvision_override ?? parent.darkvision,
    book_source_id: sr.book_source_id ?? parent.book_source_id,
  }
}

interface TreeLines {
  w: number
  h: number
  /** ствол и перекладины над рядами */
  trunk: string
  /** отводы к каждой ветви */
  drops: { id: string; d: string; x: number; y: number }[]
}

/** отступ перекладины над верхом ряда */
const BUS_GAP = 22

/**
 * Линии древа по фактическому положению карточек: перенос рядов, ширина
 * экрана и шрифт меняют раскладку, поэтому координаты меряются, а не задаются.
 * К следующему ряду ствол спускается через просвет между карточками, ближайший
 * к центру, — линия не перечёркивает карточки.
 */
function measureTree(tree: HTMLElement, root: HTMLElement, branches: Map<string, HTMLElement>): TreeLines {
  const box = tree.getBoundingClientRect()
  const rel = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return {
      x: r.left - box.left + r.width / 2,
      left: r.left - box.left,
      right: r.right - box.left,
      top: r.top - box.top,
      bottom: r.bottom - box.top,
    }
  }
  const r = rel(root)
  const nodes = [...branches].map(([id, el]) => ({ id, ...rel(el) }))

  const rows: (typeof nodes)[] = []
  for (const n of [...nodes].sort((a, b) => a.top - b.top || a.x - b.x)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].top - n.top) < 8) row.push(n)
    else rows.push([n])
  }

  const busY = rows.map((row) => row[0].top - BUS_GAP)
  // где ствол входит в ряд: у первого — из-под корня, дальше — через просвет выше
  const trunkX = rows.map((_, i) => {
    if (i === 0) return r.x
    const prev = rows[i - 1]
    const gaps = prev.slice(1).map((n, k) => (prev[k].right + n.left) / 2)
    if (gaps.length === 0) gaps.push(prev[0].right + 11)
    return gaps.reduce((best, g) => (Math.abs(g - r.x) < Math.abs(best - r.x) ? g : best))
  })

  const parts: string[] = []
  rows.forEach((row, i) => {
    parts.push(`M${trunkX[i]} ${i === 0 ? r.bottom : busY[i - 1]}V${busY[i]}`)
    const xs = [trunkX[i], ...row.map((n) => n.x)]
    if (i + 1 < rows.length) xs.push(trunkX[i + 1])
    parts.push(`M${Math.min(...xs)} ${busY[i]}H${Math.max(...xs)}`)
  })

  const drops = rows.flatMap((row, i) =>
    row.map((n) => ({ id: n.id, d: `M${n.x} ${busY[i]}V${n.top}`, x: n.x, y: busY[i] })),
  )
  return { w: box.width, h: box.height, trunk: parts.join(''), drops }
}

export default function SubraceStep({
  draft,
  update,
  subraces,
  allowBase = false,
}: StepProps & { subraces: Subrace[]; allowBase?: boolean }) {
  const race = draft.race
  const [open, setOpen] = useState<Subrace | null>(null)
  const [baseOpen, setBaseOpen] = useState(false)
  const close = useCallback(() => setOpen(null), [])

  const treeRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const branchRefs = useRef(new Map<string, HTMLElement>())
  const [lines, setLines] = useState<TreeLines | null>(null)

  // у большинства подрас своего текста нет — он лежит в статье расы
  const articles = useMemo(
    () =>
      race && isHtmlDescription(race.description)
        ? splitRaceArticle(race.description!, race.race_name, subraces).bySubrace
        : new Map<string, string>(),
    [race, subraces],
  )

  useLayoutEffect(() => {
    const tree = treeRef.current
    const root = rootRef.current
    if (!tree || !root) return
    const measure = () => setLines(measureTree(tree, root, branchRefs.current))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(tree)
    return () => ro.disconnect()
  }, [subraces, race])

  if (!race) return null

  const baseSelected = allowBase && draft.subrace === null
  const chooseBase = () => {
    update({ subrace: null })
    setBaseOpen(false)
  }

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader
        title={`Ветвь народа «${race.race_name}»`}
        lead={
          allowBase
            ? 'Оставьте народ как есть или выберите ветвь, которая его заменяет.'
            : 'Выберите ветвь, к которой принадлежит ваш герой.'
        }
      />

      <div className="cw-race-tree" ref={treeRef}>
        {lines && (
          <svg
            className="cw-race-tree-lines"
            width={lines.w}
            height={lines.h}
            viewBox={`0 0 ${lines.w} ${lines.h}`}
            aria-hidden="true"
          >
            <path className="cw-race-tree-trunk" d={lines.trunk} />
            {lines.drops.map((dr) => (
              <g key={dr.id} className={draft.subrace?.id === dr.id ? 'is-on' : undefined}>
                <path className="cw-race-tree-drop" d={dr.d} />
                <rect className="cw-race-tree-knot" x={dr.x - 4} y={dr.y - 4} width={8} height={8} />
              </g>
            ))}
          </svg>
        )}

        <div className="cw-race-tree-root">
          <span className="cw-race-tree-label">{allowBase ? 'Основной народ' : 'Народ'}</span>
          <RaceCard
            race={race}
            selected={baseSelected}
            onSelect={allowBase ? chooseBase : () => setBaseOpen(true)}
            onDetails={() => setBaseOpen(true)}
            slotRef={(el) => {
              rootRef.current = el
            }}
          />
        </div>

        <div className="cw-race-tree-branches">
          {subraces.map((sr) => (
            <RaceCard
              key={sr.id}
              race={branchAsRace(sr, race)}
              selected={draft.subrace?.id === sr.id}
              onSelect={() => update({ subrace: sr })}
              onDetails={() => setOpen(sr)}
              slotRef={(el) => {
                if (el) branchRefs.current.set(sr.id, el)
                else branchRefs.current.delete(sr.id)
              }}
            />
          ))}
        </div>
      </div>

      {baseOpen && (
        <RaceModal
          race={race}
          selected={baseSelected}
          chooseLabel={allowBase ? undefined : 'Закрыть'}
          onChoose={allowBase ? chooseBase : () => setBaseOpen(false)}
          onClose={() => setBaseOpen(false)}
        />
      )}

      {open && (
        <ChoiceModal
          art={realImage(race.image_gallery)}
          icon={Users}
          title={open.subrace_name}
          selected={draft.subrace?.id === open.id}
          onChoose={() => {
            update({ subrace: open })
            setOpen(null)
          }}
          onClose={close}
          facts={<SubraceFacts sr={open} />}
        >
          {open.extra_languages && open.extra_languages.length > 0 && (
            <ModalLine icon={Languages}>{open.extra_languages.join(', ')}</ModalLine>
          )}
          {(open.abilities?.length ?? 0) > 0 && (
            <ModalSection title="Способности">
              <AbilityList refs={open.abilities} />
            </ModalSection>
          )}
          {articles.has(open.id) && (
            <ModalSection title="Особенности и описание">
              <OpenLinksInNewTab.Provider value>
                <ClassArticle html={articles.get(open.id)!} cutSubclasses={false} backLabel={open.subrace_name} />
              </OpenLinksInNewTab.Provider>
            </ModalSection>
          )}
          {open.traits && (
            <ModalSection title="Особенности">
              <RichText text={open.traits} />
            </ModalSection>
          )}
          {/* в данных описание подрасы почти всегда дословно повторяет особенности */}
          {open.description && open.description.trim() !== open.traits?.trim() && (
            <ModalSection title="Описание">
              <RichText text={open.description} />
            </ModalSection>
          )}
        </ChoiceModal>
      )}
    </div>
  )
}
