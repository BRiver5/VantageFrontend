/**
 * Ширма мастера (только компьютер). Лежит у нижнего края стола: сложенная —
 * полоска с жетонами разделов, раскрытая — поднимается на петлях и даёт нужный
 * инструмент, при этом сам стол остаётся на виду сверху.
 *
 * Разделы: существа (жетон перетаскивают прямо на стол), добыча, заметки, карты
 * и картинки для всех, дашборд. Кнопка боя всегда под рукой.
 */
import { useState, type ReactNode } from 'react'
import { BookOpen, ChevronDown, Crown, LayoutGrid, Map as MapIcon, Package, Skull, Swords } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DashboardGrid } from '../Dashboard'
import { KnowledgeProvider } from '../kb/KnowledgeProvider'
import { useKnowledge } from '../kb/context'
import { useRoom } from '../RoomProvider'
import { LeafCreatures } from './dm/LeafCreatures'
import { LeafLoot } from './dm/LeafLoot'
import { LeafMaps } from './dm/LeafMaps'
import { BattleSetup } from './dm/BattleSetup'

/* ---------- сама ширма ---------- */

type Leaf = 'creatures' | 'loot' | 'notes' | 'maps' | 'dash'

const LEAVES: { id: Leaf; label: string; icon: LucideIcon }[] = [
  { id: 'creatures', label: 'Существа', icon: Skull },
  { id: 'loot', label: 'Добыча', icon: Package },
  { id: 'notes', label: 'Кодекс', icon: BookOpen },
  { id: 'maps', label: 'Карты', icon: MapIcon },
  { id: 'dash', label: 'Дашборд', icon: LayoutGrid },
]

export function DmScreen() {
  return (
    <KnowledgeProvider>
      <DmScreenIn />
    </KnowledgeProvider>
  )
}

function DmScreenIn() {
  const { data } = useRoom()
  const kb = useKnowledge()
  const [leaf, setLeaf] = useState<Leaf | null>(null)
  const [battle, setBattle] = useState(false)
  const inCombat = !!data?.combat && data.combat.status !== 'ended'
  const body: Record<Leaf, ReactNode> = {
    creatures: <LeafCreatures />,
    loot: <LeafLoot />,
    notes: null,
    maps: <LeafMaps />,
    dash: <DashboardGrid />,
  }
  return (
    <div className={`sc-root${leaf ? ' is-open' : ''}${leaf === 'dash' ? ' is-tall' : ''}`}>
      {leaf && (
        <section key={leaf} className="sc-sheet" aria-label={LEAVES.find((l) => l.id === leaf)?.label}>
          <div className="sc-sheet-in">{body[leaf]}</div>
        </section>
      )}
      <nav className="sc-bar" aria-label="Ширма мастера">
        <span className="sc-bar-sign" aria-hidden="true">
          <Crown />
        </span>
        <div className="sc-tabs" role="tablist">
          {LEAVES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={leaf === id} className={leaf === id ? 'is-on' : ''} onClick={() => (id === 'notes' ? kb?.open() : setLeaf((l) => (l === id ? null : id)))}>
              <span className="sc-tab-hex">
                <Icon aria-hidden="true" />
              </span>
              <i>{label}</i>
            </button>
          ))}
        </div>
        {leaf ? (
          <button type="button" className="tb-round" onClick={() => setLeaf(null)} aria-label="Сложить ширму" title="Сложить ширму">
            <ChevronDown aria-hidden="true" />
          </button>
        ) : (
          !inCombat && (
            <button type="button" className="sc-fight" onClick={() => setBattle((v) => !v)} aria-expanded={battle} title="Начать бой">
              <Swords aria-hidden="true" />
              <span>В бой</span>
            </button>
          )
        )}
      </nav>
      {battle && !inCombat && <BattleSetup onClose={() => setBattle(false)} />}
    </div>
  )
}

