
export function Pips({ n, left, kind, onSpend }: { n: number; left: number; kind: 'action' | 'resistance'; onSpend?: (amount: number) => void }) {
  if (n <= 0) return null
  return (
    <span className={`bt-pips is-${kind}`} title={`${kind === 'action' ? 'Легендарные действия' : 'Легендарные сопротивления'}: ${left} из ${n}`}>
      <i>{kind === 'action' ? 'ЛД' : 'ЛС'}</i>
      {Array.from({ length: n }, (_, i) => {
        const on = i < left
        return onSpend ? (
          <button key={i} type="button" className={on ? 'is-on' : ''} onClick={() => onSpend(on ? 1 : -1)} aria-label={on ? 'Потратить' : 'Вернуть'} />
        ) : (
          <b key={i} className={on ? 'is-on' : ''} />
        )
      })}
    </span>
  )
}
