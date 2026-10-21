/**
 * Выбор черты на уровне усиления: карточка выбранной черты и окно-каталог с
 * поиском, фильтрами (книга, характеристики, требования — как в разделе черт)
 * и карточками с картинками. Клик по карточке выбирает черту.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, BookOpen, Check, Lock, Repeat, Shield, Sparkles, X } from 'lucide-react'
import { ABILITY_RU, descriptionPreview, realImage } from '../../api'
import type { Feat } from '../../api'
import { ABILITY_KEYS, ABILITY_LABELS } from '../../types/character'
import { FeatDetailBody } from '../../pages/DetailPages'
import type { PrereqResult } from '../prereq'
import { useBookMap } from '../useCatalog'
import {
  PickEmpty,
  PickToolbar,
  bookFilterGroup,
  usePicker,
  type PickFilterGroup,
} from './ui'

const featName = (f: Feat) => f.feat_name

function FeatArt({ feat }: { feat: Feat }) {
  const [broken, setBroken] = useState(false)
  const src = realImage(feat.image_gallery)
  return (
    <span className="cw-feat-art">
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Sparkles aria-hidden="true" />
      )}
    </span>
  )
}

/** Прибавки характеристик черты плитками, как в каталоге */
function FeatBoosts({ feat }: { feat: Feat }) {
  const entries = Object.entries(feat.increase_ability_scores ?? {})
  if (entries.length === 0) return null
  return (
    <span className="fa-row">
      {entries.map(([k, v]) => (
        <span className="fa-tile" key={k}>
          {ABILITY_RU[k] ?? k}
          <b>+{v}</b>
        </span>
      ))}
    </span>
  )
}

/** Карточка черты: картинка, название, требование, прибавки, начало описания */
function FeatCard({
  feat,
  selected,
  onClick,
  descLength = 140,
  locked,
  onDetails,
}: {
  feat: Feat
  selected?: boolean
  onClick?: () => void
  descLength?: number
  /** причина, по которой черту нельзя взять */
  locked?: string | null
  /** открыть полное описание черты */
  onDetails?: () => void
}) {
  const body = (
    <>
      <FeatArt feat={feat} />
      <span className="cw-feat-body">
        <b className="cw-feat-name">{feat.feat_name}</b>
        {feat.prerequisite && (
          <span className={`cw-feat-req${locked ? '' : ' is-met'}`}>
            <Shield aria-hidden="true" /> {feat.prerequisite}
          </span>
        )}
        {locked && (
          <span className="cw-feat-lock">
            <Lock aria-hidden="true" /> {locked}
          </span>
        )}
        <span className="cw-feat-desc">{descriptionPreview(feat.description, descLength)}</span>
        <FeatBoosts feat={feat} />
      </span>
    </>
  )
  const card = locked ? (
    <div className="cw-feat-card is-locked">{body}</div>
  ) : onClick ? (
    <button
      type="button"
      className={`cw-feat-card${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {body}
    </button>
  ) : (
    <div className="cw-feat-card is-static">{body}</div>
  )
  if (!onDetails) return card
  return (
    <div className="cw-feat-slot">
      {card}
      <button type="button" className="cw-feat-more" onClick={onDetails} title="Подробнее о черте">
        <BookOpen aria-hidden="true" /> Подробнее
      </button>
    </div>
  )
}

function FeatCatalog({
  feats,
  value,
  check,
  onPick,
  onClose,
  initialDetail = null,
}: {
  feats: Feat[]
  value: string
  check: (f: Feat) => PrereqResult
  onPick: (name: string) => void
  onClose: () => void
  /** открыть сразу подробности этой черты */
  initialDetail?: Feat | null
}) {
  // черта, открытая подробно; null — список
  const [detail, setDetail] = useState<Feat | null>(initialDetail)
  const books = useBookMap()
  const groups = useMemo<PickFilterGroup<Feat>[]>(
    () => [
      bookFilterGroup(feats, books, (f) => f.book_source_id),
      {
        key: 'ability',
        label: 'Характеристики',
        options: ABILITY_KEYS.map((a) => ({ key: a, label: ABILITY_LABELS[a].label, hint: ABILITY_LABELS[a].abbr })),
        match: (f, sel) => sel.some((a) => a in (f.increase_ability_scores ?? {})),
      },
      {
        key: 'prereq',
        label: 'Требования',
        options: [
          { key: 'yes', label: 'Есть требование' },
          { key: 'no', label: 'Без требований' },
        ],
        match: (f, sel) => sel.includes(f.prerequisite ? 'yes' : 'no'),
      },
    ],
    [feats, books],
  )
  const picker = usePicker(feats, featName, groups)
  // доступные — сверху, недоступные по требованиям — отдельным разделом внизу
  const { open, locked } = useMemo(() => {
    const open: Feat[] = []
    const locked: { feat: Feat; reason: string }[] = []
    for (const f of picker.visible) {
      const r = check(f)
      if (r.ok) open.push(f)
      else locked.push({ feat: f, reason: r.reason ?? 'требования не выполнены' })
    }
    return { open, locked }
  }, [picker.visible, check])

  // Escape из подробностей возвращает к списку, из списка — закрывает окно
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (detail && !initialDetail) setDetail(null)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, detail, initialDetail])

  const detailCheck = detail ? check(detail) : null

  return createPortal(
    <div className="cw-modal-layer" onClick={onClose}>
      <div
        className="cw-modal cw-feat-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Выбор черты"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="cw-modal-close" onClick={onClose} aria-label="Закрыть">
          <X aria-hidden="true" />
        </button>
        {detail && detailCheck ? (
          <>
            <div className="cw-modal-scroll">
              {!initialDetail && (
                <button type="button" className="back-link back-link--btn" onClick={() => setDetail(null)}>
                  <ArrowLeft aria-hidden="true" /> к списку черт
                </button>
              )}
              <div className="bg-detail-page cw-sheet-bg">
                <FeatDetailBody f={detail} embedded />
              </div>
            </div>
            <footer className="cw-modal-foot cw-feat-detail-foot">
              {detailCheck.ok ? (
                <button type="button" className="cs-btn cw-next" onClick={() => onPick(detail.feat_name)}>
                  <Check aria-hidden="true" /> {detail.feat_name === value ? 'Выбрана' : 'Выбрать эту черту'}
                </button>
              ) : (
                <span className="cw-feat-lock">
                  <Lock aria-hidden="true" /> {detailCheck.reason}
                </span>
              )}
            </footer>
          </>
        ) : (
        <div className="cw-modal-scroll">
          <h3 className="cw-modal-title gold-text">Выбор черты</h3>
          <PickToolbar picker={picker} groups={groups} placeholder="Искать черту…" />
          <p className="cw-feat-count">
            Доступно: {open.length}
            {locked.length > 0 && ` · недоступно по требованиям: ${locked.length}`}
          </p>
          <PickEmpty show={feats.length > 0 && picker.visible.length === 0} />
          <div className="cw-feat-grid">
            {open.map((f) => (
              <FeatCard
                key={f.id}
                feat={f}
                selected={f.feat_name === value}
                onClick={() => onPick(f.feat_name)}
                onDetails={() => setDetail(f)}
              />
            ))}
          </div>
          {locked.length > 0 && (
            <section className="cw-feat-locked">
              <h4 className="cw-feat-locked-title">
                <Lock aria-hidden="true" /> Недоступны по требованиям
              </h4>
              <div className="cw-feat-grid">
                {locked.map(({ feat, reason }) => (
                  <FeatCard key={feat.id} feat={feat} locked={reason} onDetails={() => setDetail(feat)} />
                ))}
              </div>
            </section>
          )}
        </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function FeatPicker({
  feats,
  value,
  onChange,
  check,
}: {
  feats: Feat[]
  value: string
  onChange: (name: string) => void
  /** проверка требований черты для этого героя и уровня */
  check: (f: Feat) => PrereqResult
}) {
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const current = feats.find((f) => f.feat_name === value) ?? null

  return (
    <div className="cw-feat-picker">
      {current ? (
        <div className="cw-feat-current">
          <FeatCard feat={current} descLength={260} />
          <span className="cw-feat-actions">
            <button type="button" className="cs-btn cs-btn--ghost" onClick={() => setReading(true)}>
              <BookOpen aria-hidden="true" /> Подробнее
            </button>
            <button type="button" className="cs-btn cs-btn--ghost" onClick={() => setOpen(true)}>
              <Repeat aria-hidden="true" /> Сменить черту
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className="cw-feat-empty" onClick={() => setOpen(true)}>
          <Sparkles aria-hidden="true" />
          <b>Выбрать черту</b>
          <span>
            {feats.length > 0 ? `${feats.length} черт с поиском и фильтрами` : 'Загружаем список черт…'}
          </span>
        </button>
      )}
      {open && (
        <FeatCatalog
          feats={feats}
          value={value}
          check={check}
          onPick={(name) => {
            onChange(name)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
      {reading && current && (
        <FeatCatalog
          feats={feats}
          value={value}
          check={check}
          initialDetail={current}
          onPick={() => setReading(false)}
          onClose={() => setReading(false)}
        />
      )}
    </div>
  )
}
