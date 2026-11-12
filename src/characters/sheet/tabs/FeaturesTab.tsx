import type { ReactNode } from 'react'
import { type FeatureRow, SOURCE_GROUPS } from '../rules'

/** Страница умений: группы по источнику, клик — попап с описанием */
export function FeaturesTab({
  featureRows,
  featureTile,
  profs,
  rules,
}: {
  featureRows: FeatureRow[]
  featureTile: (f: FeatureRow) => ReactNode
  profs: ReactNode
  rules: ReactNode
}) {
  return (
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
        {profs}
        {rules}
      </div>
    </div>
  )
}
