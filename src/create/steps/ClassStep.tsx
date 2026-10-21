/** Шаг 3 — класс: карточки как в каталоге классов, подробности и снаряжение — в попапе. */
import { useCallback, useMemo, useState } from 'react'
import { Check, Swords } from 'lucide-react'
import { realImage } from '../../api'
import type { GameClass } from '../../api'
import { DIE_NUM_IMAGE_URLS, hitDieType } from '../../dice/diceAssets'
import { ClassDetailView } from '../../pages/DetailPages'
import { CLASS_PRIMARY_ABILITY, casterKind } from '../dnd5e'
import { emptyLevelChoice, type StepProps } from '../draft'
import {
  ChoiceModal,
  MoreTab,
  PickEmpty,
  PickToolbar,
  StepHeader,
  StepStatus,
  bookFilterGroup,
  usePicker,
  type PickFilterGroup,
} from './ui'
import { useBookMap, useCatalogList } from '../useCatalog'

const className = (c: GameClass) => c.class_name
const isCaster = (c: GameClass) => casterKind(c.class_name, c.is_caster) !== 'none'

function ClassPortrait({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="class-card-portrait">
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <Swords className="class-card-fallback" aria-hidden="true" />
      )}
    </span>
  )
}

function ClassStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="ccs-row">
      <span className="ccs-dt">{label}</span>
      <span className="ccs-dd">{value}</span>
    </span>
  )
}

/**
 * Карточка класса как в каталоге: кость хитов за фигурой, панель с главным.
 * Свечение за портретом — фиолетовое у заклинателей, красное у остальных.
 */
function ClassCard({
  cls,
  selected,
  onSelect,
  onDetails,
}: {
  cls: GameClass
  selected: boolean
  onSelect: () => void
  onDetails: () => void
}) {
  const caster = isCaster(cls)
  return (
    <div className="cw-pick-slot cw-pick-slot--catalog">
      <button
        type="button"
        className={`card card--portrait card--class cw-catalog-card cw-class-card ${caster ? 'is-caster' : 'is-martial'}${selected ? ' is-selected' : ''}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="class-card-visual">
          <span className="cw-class-aura" aria-hidden="true" />
          <img
            className="class-card-die"
            src={DIE_NUM_IMAGE_URLS[hitDieType(cls.hit_dice)]}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <ClassPortrait src={realImage(cls.image_gallery)} alt={cls.class_name} />
          {selected && (
            <span className="cw-card-check" aria-hidden="true">
              <Check />
            </span>
          )}
        </span>
        <span className="class-card-lower">
          <span className="class-card-glow" aria-hidden="true" />
          <span className="class-card-panel">
            <span className="class-card-stats">
              <ClassStat label="Кость хитов" value={`к${cls.hit_dice}`} />
              {CLASS_PRIMARY_ABILITY[cls.class_name] && (
                <ClassStat label="Основные характеристики" value={CLASS_PRIMARY_ABILITY[cls.class_name]} />
              )}
              <ClassStat label="Спасброски" value={cls.saving_throw_proficiencies?.join(', ') || '—'} />
            </span>
          </span>
          <span className="class-card-name-plate">{cls.class_name}</span>
        </span>
      </button>
      <MoreTab onClick={onDetails} />
    </div>
  )
}

/** Подробности класса — та же страница, что в разделе классов, внутри попапа */
function ClassModal({
  cls,
  selected,
  onChoose,
  onClose,
}: {
  cls: GameClass
  selected: boolean
  onChoose: () => void
  onClose: () => void
}) {
  return (
    <ChoiceModal bare title={cls.class_name} selected={selected} onChoose={onChoose} onClose={onClose}>
      <div className="cw-sheet-class">
        <ClassDetailView id={cls.id} embedded />
      </div>
    </ChoiceModal>
  )
}

export default function ClassStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<GameClass>('classes')
  const [open, setOpen] = useState<GameClass | null>(null)

  const books = useBookMap()
  const groups = useMemo<PickFilterGroup<GameClass>[]>(() => {
    const dice = [...new Set(items.map((c) => c.hit_dice))].sort((a, b) => a - b)
    return [
      {
        key: 'magic',
        label: 'Магия',
        options: [
          { key: 'yes', label: 'заклинатель' },
          { key: 'no', label: 'без магии' },
        ],
        match: (c, sel) => sel.includes(isCaster(c) ? 'yes' : 'no'),
      },
      {
        key: 'die',
        label: 'Кость хитов',
        options: dice.map((d) => ({ key: String(d), label: `к${d}` })),
        match: (c, sel) => sel.includes(String(c.hit_dice)),
      },
      bookFilterGroup(items, books, (c) => c.book_source_id),
    ]
  }, [items, books])

  const picker = usePicker(items, className, groups)
  const close = useCallback(() => setOpen(null), [])

  const choose = (cls: GameClass) => {
    // новый класс обнуляет подкласс и все решения по уровням:
    // навыки, заклинания и усиления у него свои
    if (draft.cls?.id !== cls.id) {
      update({
        cls,
        subclass: null,
        levels: Array.from({ length: draft.targetLevel }, (_, i) => emptyLevelChoice(i + 1)),
      })
    }
    setOpen(null)
  }

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader title="Чьё ремесло ты избрал?" />

      <PickToolbar picker={picker} groups={groups} placeholder="Искать класс…" />

      <StepStatus loading={loading} error={error} />
      <PickEmpty show={!loading && items.length > 0 && picker.visible.length === 0} />

      <div className="cw-catalog-grid">
        {picker.visible.map((cls) => (
          <ClassCard
            key={cls.id}
            cls={cls}
            selected={draft.cls?.id === cls.id}
            onSelect={() => choose(cls)}
            onDetails={() => setOpen(cls)}
          />
        ))}
      </div>

      {open && (
        <ClassModal
          cls={open}
          selected={draft.cls?.id === open.id}
          onChoose={() => choose(open)}
          onClose={close}
        />
      )}
    </div>
  )
}
