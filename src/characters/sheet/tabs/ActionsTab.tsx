import type { ReactNode } from 'react'
import { EnginePanel, type EngineView } from '../../EnginePanel'

/** Окно «Действия» на телефоне: ресурсы и панель движка, рядом — бой */
export function ActionsTab({ engine, resources, combat }: { engine?: EngineView; resources: ReactNode; combat: ReactNode }) {
  return (
    <div className="hud-combat">
      <div className="hud-combat-main">
        {resources}
        {engine && <EnginePanel engine={engine} showAll />}
      </div>
      <div className="hud-combat-side">{combat}</div>
    </div>
  )
}
