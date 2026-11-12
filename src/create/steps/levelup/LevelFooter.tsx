/** Подвал уровня: что ещё не выбрано и кнопка «Принять» */
type Props = {
  levelReady: boolean
  hpReady: boolean
  skillsReady: boolean
  subclassReady: boolean
  asiReady: boolean
  cantripsReady: boolean
  spellsReady: boolean
  done: boolean
  level: number
  acceptLevel: () => void
}

export function LevelFooter({ levelReady, hpReady, skillsReady, subclassReady, asiReady, cantripsReady, spellsReady, done, level, acceptLevel }: Props) {
  return (
    <footer className="cw-level-foot">
      {!levelReady && (
        <span className="cw-foot-hint">
          {!hpReady && 'Определите хиты. '}
          {!skillsReady && 'Выберите навыки. '}
          {!subclassReady && 'Выберите подкласс. '}
          {!asiReady && 'Распределите усиление или выберите черту. '}
          {(!cantripsReady || !spellsReady) && 'Выберите заклинания.'}
        </span>
      )}
      <button
        type="button"
        className="auth-submit cw-accept"
        onClick={acceptLevel}
        disabled={!levelReady}
      >
        {done ? 'Пересмотреть награды' : `Принять ${level} уровень`}
      </button>
    </footer>
  )
}
