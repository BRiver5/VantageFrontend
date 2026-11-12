import type { ReactNode } from 'react'
import { HudSplit } from '../../hud/HudChrome'
import { type FeatureRow, SOURCE_GROUPS } from '../rules'

/** Окно умений на телефоне: группы по источнику, владения и особые правила */
export function HudFeaturesTab({
  featureRows,
  featureTile,
  featureGroup,
  onGroup,
  profs,
  rules,
}: {
  featureRows: FeatureRow[]
  featureTile: (f: FeatureRow) => ReactNode
  featureGroup: string | null
  onGroup: (key: string) => void
  profs: ReactNode
  rules: ReactNode
}) {
  const featureTabs = [
    ...SOURCE_GROUPS.map((g) => ({
      key: g.title,
      label: g.sources.includes('choice') ? 'Выбранные' : g.title,
      count: featureRows.filter((f) => g.sources.includes(f.source)).length,
    })).filter((g) => g.count > 0),
    { key: 'profs', label: 'Владения' },
    ...(rules ? [{ key: 'rules', label: 'Особые правила' }] : []),
  ]
  const featureKey = featureTabs.some((t) => t.key === featureGroup) ? featureGroup! : featureTabs[0].key
  const featureGroupDef = SOURCE_GROUPS.find((g) => g.title === featureKey)
  return (
    <HudSplit tabs={featureTabs} active={featureKey} onChange={onGroup}>
      {featureKey === 'profs' ? profs : featureKey === 'rules' ? rules : (
        <div className="cw-ftiles">{featureRows.filter((f) => featureGroupDef?.sources.includes(f.source)).map(featureTile)}</div>
      )}
    </HudSplit>
  )
}
