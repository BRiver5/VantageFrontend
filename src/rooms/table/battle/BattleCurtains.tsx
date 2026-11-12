import { useEffect } from 'react'

/** Заставка входа в бой: два удара клинком и надпись */
export function BattleIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1650)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="bt-intro" aria-hidden="true">
      <span className="bt-slash is-a" />
      <span className="bt-slash is-b" />
      <b>К бою!</b>
    </div>
  )
}

/** Заставка конца боя */
export function BattleOutro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1300)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="bt-outro" aria-hidden="true">
      <b>Бой окончен</b>
    </div>
  )
}
