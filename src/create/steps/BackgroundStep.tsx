/**
 * Шаг 7 — предыстория: даёт владения навыками, инструментами, языки и умение.
 * Шаг можно пропустить, тогда этих владений у героя просто не будет.
 */
import { useCallback, useMemo, useState } from 'react'
import { Check, Landmark, Star } from 'lucide-react'
import { realImage } from '../../api'
import type { Background } from '../../api'
import { EquipmentIconRow } from '../../pages/StartingEquipment'
import { BackgroundDetailBody } from '../../pages/DetailPages'
import type { StepProps } from '../draft'
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
import { abilitiesFromSkills, skillKeysFromNames } from '../../skills'
import { ABILITY_KEYS, ABILITY_LABELS, DEFAULT_SKILLS } from '../../types/character'

const bgName = (b: Background) => b.background_name

/** Навыки предыстории чистыми названиями — в данных они часто записаны фразами */
function skillLabels(bg: Background): string[] {
  const keys = new Set(skillKeysFromNames(bg.skill_proficiencies))
  return DEFAULT_SKILLS.filter((sk) => keys.has(sk.key)).map((sk) => sk.label)
}

/**
 * Карточка предыстории в стиле каталога, но проще: гекс с артом, название,
 * навыки и иконки снаряжения — без описания. Клик — выбор, язычок — подробности.
 */
function BackgroundCard({
  bg,
  selected,
  onSelect,
  onDetails,
}: {
  bg: Background
  selected: boolean
  onSelect: () => void
  onDetails: () => void
}) {
  const [broken, setBroken] = useState(false)
  const src = realImage(bg.image_gallery)
  const skills = skillLabels(bg)
  return (
    <div className="cw-pick-slot cw-pick-slot--bg">
      <button
        type="button"
        className={`card card--bg cw-bg-card${selected ? ' is-selected' : ''}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="bg-card-hex">
          <span className="bg-card-hex-inner">
            {src && !broken ? (
              <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
            ) : (
              <Landmark className="bg-card-hex-fallback" aria-hidden="true" />
            )}
          </span>
        </span>
        <span className="bg-card-body">
          <span className="bg-card-head">
            <span className="card-name">{bg.background_name}</span>
          </span>
          {skills.length > 0 && (
            <span className="card-chips bg-card-skills">
              {skills.map((sk) => (
                <span key={sk} className="chip">
                  <Star aria-hidden="true" /> {sk}
                </span>
              ))}
            </span>
          )}
          <span className="bg-card-foot">
            <EquipmentIconRow grants={bg.starting_equipment} max={4} />
          </span>
        </span>
        {selected && (
          <span className="cw-card-check" aria-hidden="true">
            <Check />
          </span>
        )}
      </button>
      <MoreTab onClick={onDetails} />
    </div>
  )
}

/** Подробности предыстории — та же страница, что в разделе предысторий, внутри попапа */
function BackgroundModal({
  bg,
  selected,
  onChoose,
  onClose,
}: {
  bg: Background
  selected: boolean
  onChoose: () => void
  onClose: () => void
}) {
  return (
    <ChoiceModal bare title={bg.background_name} selected={selected} onChoose={onChoose} onClose={onClose}>
      <div className="bg-detail-page cw-sheet-bg">
        <BackgroundDetailBody bg={bg} embedded />
      </div>
    </ChoiceModal>
  )
}

export default function BackgroundStep({ draft, update }: StepProps) {
  const { items, loading, error } = useCatalogList<Background>('backgrounds')
  const [open, setOpen] = useState<Background | null>(null)

  const books = useBookMap()
  const groups = useMemo<PickFilterGroup<Background>[]>(() => {
    // навыки в данных бывают фразами («Выберите два навыка из следующих: Магия…»),
    // поэтому фильтруем по каноническим навыкам, найденным внутри текста
    const skillsOf = (b: Background) => skillKeysFromNames(b.skill_proficiencies)
    const present = new Set(items.flatMap(skillsOf))
    const abilities = new Set(items.flatMap((b) => abilitiesFromSkills(b.skill_proficiencies)))
    return [
      {
        key: 'skill',
        label: 'Навыки',
        options: DEFAULT_SKILLS.filter((sk) => present.has(sk.key))
          .map((sk) => ({ key: sk.key, label: sk.label }))
          .sort((x, y) => x.label.localeCompare(y.label, 'ru')),
        match: (b, sel) => skillsOf(b).some((k) => sel.includes(k)),
      },
      {
        key: 'ability',
        label: 'Характеристика навыков',
        options: ABILITY_KEYS.filter((a) => abilities.has(a)).map((a) => ({
          key: a,
          label: ABILITY_LABELS[a].label,
        })),
        match: (b, sel) => abilitiesFromSkills(b.skill_proficiencies).some((a) => sel.includes(a)),
      },
      bookFilterGroup(items, books, (b) => b.book_source_id),
    ]
  }, [items, books])

  const picker = usePicker(items, bgName, groups)
  const close = useCallback(() => setOpen(null), [])

  return (
    <div className="cw-step cw-step--picker">
      <StepHeader title="Кем ты был до приключений?" />

      <PickToolbar
        picker={picker}
        groups={groups}
        placeholder="Искать предысторию…"
        extra={
          draft.background && (
            <button
              type="button"
              className="cs-btn cs-btn--ghost"
              onClick={() => update({ background: null })}
            >
              Без предыстории
            </button>
          )
        }
      />

      <StepStatus loading={loading} error={error} />
      <PickEmpty show={!loading && items.length > 0 && picker.visible.length === 0} />

      <div className="cw-bg-grid">
        {picker.visible.map((bg) => (
          <BackgroundCard
            key={bg.id}
            bg={bg}
            selected={draft.background?.id === bg.id}
            onSelect={() => update({ background: bg })}
            onDetails={() => setOpen(bg)}
          />
        ))}
      </div>

      {open && (
        <BackgroundModal
          bg={open}
          selected={draft.background?.id === open.id}
          onChoose={() => {
            update({ background: open })
            setOpen(null)
          }}
          onClose={close}
        />
      )}
    </div>
  )
}
