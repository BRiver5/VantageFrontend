/** Настройка пингов в шапке комнаты: щадящий режим и памятка по видам */
import { setPingCalmSetting, usePingCalm } from '../../maps/pingSettings'

export function PingSettingsPanel({ isDm }: { isDm: boolean }) {
  const [manual, active] = usePingCalm()
  return (
    <section className="tb-pings" aria-label="Пинги на карте">
      <h3>Пинги на карте</h3>
      <label className="rm-check">
        <input type="checkbox" checked={manual} onChange={(e) => setPingCalmSetting(e.target.checked)} />
        <span>Щадящий режим: медленный круг со стрелкой, без вспышек и мигания</span>
      </label>
      {active && !manual && <p className="tb-drawer-text">Включён системой: в настройках устройства просили меньше движения.</p>}
      <ul className="tb-pings-help">
        <li>Долгое нажатие или правая кнопка — пинг</li>
        <li>Alt+клик — «внимание»</li>
        {isDm && <li>Shift+клик — «сюда»: камеры всех переедут в точку</li>}
      </ul>
    </section>
  )
}
