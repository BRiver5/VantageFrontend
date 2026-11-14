import type { ReactNode } from 'react'
import type { HotbarBinding, HotbarSpec } from './source'
import { useHotbarAction } from './source'

/** То же, что useHotbarAction, но для кнопок внутри списков (map): хук в своей обёртке */
export function HotbarAction({
  spec,
  run,
  priority,
  characterId,
  children,
}: {
  spec: HotbarSpec | null
  run: () => void
  priority?: number
  characterId?: string | null
  children: (binding: HotbarBinding) => ReactNode
}) {
  const binding = useHotbarAction(spec, run, priority, characterId)
  return <>{children(binding)}</>
}
