import type { ReactNode } from 'react'
import { BookOpen, EyeOff, Languages, Sparkles, Zap } from 'lucide-react'
import type { SheetView } from '../../types/character'
import { formatDice } from '../../equipment'
import { type FeatureRow, STATUS_LABEL } from './rules'
import { Card } from './parts'

/** Плитка умения: клик — попап с описанием */
export function FeatureTile({
  f,
  actionsOf,
  onOpen,
}: {
  f: FeatureRow
  actionsOf: (grantId: string) => unknown[]
  onOpen: (f: FeatureRow) => void
}) {
  return (
    <button
      type="button"
      className={`cw-ftile cw-feat-line--${f.source}${f.disabled ? ' is-disabled' : f.active === false ? ' is-off' : ''}${f.status ? ` is-${f.status}` : ''}`}
      onClick={() => onOpen(f)}
      title={f.disabled ? 'Отключено — бонусы не действуют' : f.status ? STATUS_LABEL[f.status] : undefined}
    >
      <b>
        {f.disabled && <EyeOff className="cw-ftile-lock" aria-label="отключено" />}
        {f.title}
      </b>
      <i>
        {f.sub}
        {f.disabled ? ' · отключено' : f.active === false ? ' · не действует' : ''}
        {f.status === 'partial' && ' · частично'}
      </i>
      {f.grantId && actionsOf(f.grantId).length > 0 && (
        <span className="cw-ftile-acts" title="Действий у способности">
          <Zap aria-hidden="true" />
          {actionsOf(f.grantId).length}
        </span>
      )}
      <BookOpen className="cw-ftile-ico" aria-hidden="true" />
    </button>
  )
}

/** Карточка «Умения» — все плитки подряд */
export function FeaturesCard({ featureRows, featureTile }: { featureRows: FeatureRow[]; featureTile: (f: FeatureRow) => ReactNode }) {
  return (
    <Card title="Умения" icon={BookOpen} className="cw-sheet-card--features" aside={String(featureRows.length)}>
      <div className="cw-ftiles">{featureRows.map(featureTile)}</div>
    </Card>
  )
}

/** Карточка «Владения»: доспехи, оружие, инструменты, языки */
export function ProfsCard({ proficiencies }: { proficiencies: SheetView['proficiencies'] }) {
  return (
    <Card title="Владения" icon={Languages} className="cw-sheet-card--profs">
      <dl className="cw-profs">
        {(
          [
            ['Доспехи', proficiencies.armor],
            ['Оружие', proficiencies.weapons],
            ['Инструменты', proficiencies.tools],
            ['Языки', proficiencies.languages],
          ] as const
        )
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{list.join(', ')}</dd>
            </div>
          ))}
      </dl>
    </Card>
  )
}

/** Что выдают способности: приёмы, особые правила, величины (кость скрытой атаки…) */
export function RulesCard({ extras }: { extras: NonNullable<SheetView['extras']> }) {
  return (
    <Card title="Особые правила" icon={Sparkles} className="cw-sheet-card--rules">
      <dl className="cw-profs">
        {extras.vars.length > 0 && (
          <div>
            <dt>Величины</dt>
            <dd>
              <ul className="cw-rules-vars">
                {extras.vars.map((v) => (
                  <li key={v.key}>
                    <span>{v.label}</span>
                    <b>{formatDice(v.value) ?? v.value}</b>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {extras.maneuvers.length > 0 && (
          <div>
            <dt>Боевые приёмы</dt>
            <dd>{extras.maneuvers.join(', ')}</dd>
          </div>
        )}
        {extras.flags.length > 0 && (
          <div>
            <dt>Помнить за столом</dt>
            <dd>
              <ul className="cw-rules-flags">
                {extras.flags.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </Card>
  )
}
