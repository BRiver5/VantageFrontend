import { BookOpen, Eye, EyeOff } from 'lucide-react'
import type { SheetAction, SheetResource } from '../../types/character'
import { ActionButton, type EngineView } from '../EnginePanel'
import { ResourceBand } from '../ResourceBand'
import { SheetModal } from '../SheetModal'
import { type FeatureRow, STATUS_LABEL } from './rules'
import { FeatureText } from './parts'

/** Попап умения: описание, статус автоматизации, его ресурсы и действия */
export function FeatureModal({
  feature: openFeature,
  engine,
  activeKeys,
  actionsOf,
  resourcesOf,
  onToggleAbility,
  onClose,
}: {
  feature: FeatureRow
  engine?: EngineView
  activeKeys: Set<string>
  actionsOf: (grantId: string) => SheetAction[]
  resourcesOf: (slug: string | undefined) => SheetResource[]
  onToggleAbility?: (grantId: string, enabled: boolean) => void
  onClose: () => void
}) {
  return (
    <SheetModal
      title={openFeature.title}
      kicker={openFeature.sub}
      tone={openFeature.source}
      visual={<BookOpen className="cw-smodal-glyph" aria-hidden="true" />}
      onClose={onClose}
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
          <button type="button" className="cs-btn cw-next" onClick={onClose}>
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
              engine={{ ...engine, onAction: (x) => (onClose(), engine.onAction(x)) }}
              showAbility={false}
            />
          ))}
        </div>
      )}
      <FeatureText row={openFeature} />
    </SheetModal>
  )
}
