import type { ReactNode } from 'react'
import { EnginePanel, type EngineView } from '../../EnginePanel'

/** Страница «Лист»: игровая панель, характеристики, бой и инвентарь */
export function MainTab({
  engine,
  abilities,
  combat,
  inventory,
}: {
  engine?: EngineView
  abilities: ReactNode
  combat: ReactNode
  inventory: ReactNode
}) {
  return (
    <>
      {engine && <EnginePanel engine={engine} />}
      {abilities}
      {combat}
      {inventory}
    </>
  )
}
