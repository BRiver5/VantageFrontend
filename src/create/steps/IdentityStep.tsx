/** Шаг 6 — имя и облик: единственный шаг со свободным вводом. */
import { UserRound } from 'lucide-react'
import type { CharacterVisibility } from '../../api'
import type { StepProps } from '../draft'
import { ChoiceArt, StepHeader, StepPanel } from './ui'

const ALIGNMENTS = [
  'Законопослушный добрый', 'Нейтральный добрый', 'Хаотичный добрый',
  'Законопослушный нейтральный', 'Истинно нейтральный', 'Хаотичный нейтральный',
  'Законопослушный злой', 'Нейтральный злой', 'Хаотичный злой',
]

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="cw-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

export default function IdentityStep({ draft, update }: StepProps) {
  return (
    <div className="cw-step">
      <StepHeader
        kicker="ступень шестая"
        title="Как тебя запомнят?"
        lead="Имя обязательно, остальное — по желанию; всё это допишется в лист."
      />

      <div className="cw-identity">
        <StepPanel className="cw-identity-main">
          <label className="cw-field cw-field--name">
            <span>Имя героя</span>
            <input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Тарин из Серебряной Пади"
              autoFocus
            />
          </label>

          <div className="cw-field-row">
            <label className="cw-field">
              <span>Мировоззрение</span>
              <select
                value={draft.alignment}
                onChange={(e) => update({ alignment: e.target.value })}
              >
                <option value="">— не выбрано —</option>
                {ALIGNMENTS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <Field label="Пол" value={draft.gender} onChange={(v) => update({ gender: v })} />
            <Field
              label="Возраст"
              value={draft.age}
              onChange={(v) => update({ age: v })}
              placeholder={draft.race?.age_of_adulthood ? String(draft.race.age_of_adulthood) : ''}
              type="number"
            />
          </div>

          <div className="cw-field-row">
            <Field label="Рост" value={draft.height} onChange={(v) => update({ height: v })} />
            <Field label="Вес" value={draft.weight} onChange={(v) => update({ weight: v })} />
            <Field label="Глаза" value={draft.eyes} onChange={(v) => update({ eyes: v })} />
          </div>

          <div className="cw-field-row">
            <Field label="Волосы" value={draft.hair} onChange={(v) => update({ hair: v })} />
            <Field label="Кожа" value={draft.skin} onChange={(v) => update({ skin: v })} />
            <label className="cw-field">
              <span>Видимость листа</span>
              <select
                value={draft.visibility}
                onChange={(e) => update({ visibility: e.target.value as CharacterVisibility })}
              >
                <option value="private">только я</option>
                <option value="unlisted">по ссылке</option>
                <option value="public">всем</option>
              </select>
            </label>
          </div>

          <Field
            label="Ссылка на портрет"
            value={draft.avatarUrl}
            onChange={(v) => update({ avatarUrl: v })}
            placeholder="https://…"
          />
        </StepPanel>

        <StepPanel className="cw-identity-portrait">
          <ChoiceArt src={draft.avatarUrl.trim() || null} icon={UserRound} />
          <p className="cw-dossier-name gold-text">{draft.name.trim() || 'Безымянный'}</p>
          <p className="cw-dossier-line">
            {[draft.race?.race_name, draft.subrace?.subrace_name, draft.cls?.class_name]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </StepPanel>
      </div>

      <StepPanel className="cw-personality">
        <h3 className="cw-dossier-name gold-text">Нрав и память</h3>
        <div className="cw-field-row">
          <label className="cw-field">
            <span>Черты характера</span>
            <textarea
              rows={2}
              value={draft.traits}
              onChange={(e) => update({ traits: e.target.value })}
            />
          </label>
          <label className="cw-field">
            <span>Идеалы</span>
            <textarea
              rows={2}
              value={draft.ideals}
              onChange={(e) => update({ ideals: e.target.value })}
            />
          </label>
        </div>
        <div className="cw-field-row">
          <label className="cw-field">
            <span>Привязанности</span>
            <textarea
              rows={2}
              value={draft.bonds}
              onChange={(e) => update({ bonds: e.target.value })}
            />
          </label>
          <label className="cw-field">
            <span>Слабости</span>
            <textarea
              rows={2}
              value={draft.flaws}
              onChange={(e) => update({ flaws: e.target.value })}
            />
          </label>
        </div>
        <label className="cw-field">
          <span>Предыстория</span>
          <textarea
            rows={4}
            value={draft.backstory}
            onChange={(e) => update({ backstory: e.target.value })}
            placeholder="Откуда герой пришёл и зачем отправился в путь…"
          />
        </label>
      </StepPanel>
    </div>
  )
}
