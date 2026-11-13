/** Палитра конструктора: состояние и хранение в браузере между сессиями */
import { useCallback, useEffect, useState } from 'react'
import { loadPalette, savePalette, type Palette } from './palette'

export function usePalette() {
  const [palette, setState] = useState<Palette>(loadPalette)
  useEffect(() => savePalette(palette), [palette])
  const setPalette = useCallback((fn: (p: Palette) => Palette) => setState(fn), [])
  return { palette, setPalette }
}
