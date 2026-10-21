/**
 * «Облик» на шаге имени: пол, возраст ползунком в пределах жизни расы, рост на
 * графике рядом с рыцарем (как в бестиарии) и вес ползунком под ним. Глаза,
 * волосы и кожа — в раскрывающемся «Дополнительно».
 */
import { useState, type CSSProperties } from 'react'
import { ChevronDown, UserRound } from 'lucide-react'
import { realImage } from '../../api'
import { HeightChart, fmtM, raceAverageHeight, sizeHeightRange } from '../../creatureSheet'
import type { StepProps } from '../draft'

const GENDERS = ['Мужской', 'Женский']

/** Число из свободного текста: «1,82 м», «182 см», «89 кг» */
function parseNumber(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(text)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** Рост в метрах: меньше трёх — уже метры, иначе сантиметры */
function parseHeight(text: string): number | null {
  const n = parseNumber(text)
  if (n == null) return null
  return n < 3 ? n : n / 100
}

/**
 * Ползунок с полем для точного числа. Значение хранится само по себе: в поле
 * можно ввести и то, что за пределами ползунка, — тогда бегунок просто упрётся
 * в край. Пока значения нет, бегунок стоит на ориентире расы и приглушён.
 */
function Slider({
  label,
  value,
  fallback,
  min,
  max,
  step,
  unit,
  note,
  hint,
  onChange,
}: {
  label: string
  value: number | null
  /** ориентир расы, когда значение не задано */
  fallback: number
  min: number
  max: number
  step: number
  unit: string
  /** подпись рядом с полем (напр. этап жизни) */
  note?: string | null
  hint?: string | null
  onChange: (v: number | null) => void
}) {
  const shown = Math.min(max, Math.max(min, value ?? fallback))
  const pct = ((shown - min) / (max - min)) * 100
  return (
    <div className={`cw-slider${value == null ? ' is-default' : ''}`}>
      <div className="cw-slider-head">
        <span className="cw-id-label">{label}</span>
        <span className="cw-slider-value">
          {note && <i>{note}</i>}
          <input
            type="number"
            className="cw-slider-num"
            value={value ?? ''}
            min={0}
            step={step}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            aria-label={`${label}, ${unit}`}
          />
          <span className="cw-slider-unit">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        className="cw-range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        aria-label={label}
      />
      {hint && <small className="cw-field-note">{hint}</small>}
    </div>
  )
}

export function AppearanceSection({ draft, update }: StepProps) {
  const race = draft.race
  const [customGender, setCustomGender] = useState(
    () => draft.gender !== '' && !GENDERS.includes(draft.gender),
  )
  const [extraOpen, setExtraOpen] = useState(
    () => !!(draft.eyes || draft.hair || draft.skin),
  )

  /* ---------- рост (в см): средний для расы, ползунок — ±20% в пределах категории размера ---------- */
  const size = sizeHeightRange(race?.size)
  const avgHeight =
    raceAverageHeight(draft.subrace?.subrace_name) ??
    raceAverageHeight(race?.race_name) ??
    size?.m ??
    1.75
  const avgCm = Math.round(avgHeight * 100)
  const hMin = Math.round(Math.max(size?.min ?? 0.3, avgHeight * 0.8) * 100)
  const hMax = Math.round(Math.min(size?.max ?? 3, avgHeight * 1.2) * 100)
  const heightSet = parseHeight(draft.height)
  const heightCm = heightSet != null ? Math.round(heightSet * 100) : null
  // на графике — введённый рост как есть, даже если он вне ползунка
  const chartHeight = (heightCm ?? avgCm) / 100

  /* ---------- вес (в кг): от среднего роста расы, а не от выбранного — ползунки независимы ---------- */
  const baseWeight = Math.round(23 * avgHeight * avgHeight)
  const wMin = Math.max(1, Math.round(baseWeight * 0.6))
  const wMax = Math.round(baseWeight * 2)
  const weightSet = parseNumber(draft.weight)

  /* ---------- возраст: от 0 до предела жизни расы ---------- */
  const adult = race?.age_of_adulthood ?? 18
  const maxAge = Math.max(race?.max_age ?? 100, adult + 10)
  const ageSet = parseNumber(draft.age)
  const age = ageSet ?? adult
  const life = (age - adult) / (maxAge - adult)
  const stage =
    age < adult
      ? 'юный'
      : life < 0.25
        ? 'молодой'
        : life < 0.55
          ? 'зрелый'
          : life < 0.8
            ? 'в летах'
            : 'на склоне лет'

  // для сравнения роста — всегда арт расы, а не загруженный портрет
  const figure = realImage(race?.image_gallery)

  return (
    <div className="cw-look">
      <div className="cw-look-chart">
        <HeightChart
          height={chartHeight}
          image={figure}
          name={race?.race_name ?? 'Герой'}
          fallback={UserRound}
          scaleMax={hMax / 100}
        />
        <Slider
          label="Рост"
          value={heightCm}
          fallback={avgCm}
          min={hMin}
          max={hMax}
          step={1}
          unit="см"
          hint={`в среднем для расы ${fmtM(avgHeight)}`}
          onChange={(cm) => update({ height: cm == null ? '' : `${cm} см` })}
        />
        <Slider
          label="Вес"
          value={weightSet}
          fallback={baseWeight}
          min={wMin}
          max={wMax}
          step={1}
          unit="кг"
          onChange={(kg) => update({ weight: kg == null ? '' : `${kg} кг` })}
        />
      </div>

      <div className="cw-look-side">
        <div className="cw-id-sub">
          <span className="cw-id-label">Пол</span>
          <div className="cw-seg" role="radiogroup" aria-label="Пол">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={!customGender && draft.gender === g}
                className={`cw-seg-btn${!customGender && draft.gender === g ? ' is-on' : ''}`}
                onClick={() => {
                  setCustomGender(false)
                  update({ gender: draft.gender === g ? '' : g })
                }}
              >
                {g}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={customGender}
              className={`cw-seg-btn${customGender ? ' is-on' : ''}`}
              onClick={() => {
                setCustomGender(true)
                if (GENDERS.includes(draft.gender)) update({ gender: '' })
              }}
            >
              Свой
            </button>
          </div>
          {customGender && (
            <input
              className="cw-plain-input"
              value={draft.gender}
              onChange={(e) => update({ gender: e.target.value })}
              aria-label="Свой вариант"
              autoFocus
            />
          )}
        </div>

        <Slider
          label="Возраст"
          value={ageSet}
          fallback={adult}
          min={0}
          max={maxAge}
          step={1}
          unit="лет"
          note={stage}
          hint={`взрослеют к ${adult}, живут до ${maxAge}`}
          onChange={(v) => update({ age: v == null ? '' : String(v) })}
        />

        <div className="cw-look-extra">
          <button
            type="button"
            className={`cw-mini-btn${extraOpen ? ' is-on' : ''}`}
            onClick={() => setExtraOpen((v) => !v)}
            aria-expanded={extraOpen}
          >
            Дополнительно: глаза, волосы, кожа <ChevronDown aria-hidden="true" />
          </button>
          {extraOpen && (
            <div className="cw-id-grid">
              <label className="cw-field">
                <span>Глаза</span>
                <input value={draft.eyes} onChange={(e) => update({ eyes: e.target.value })} />
              </label>
              <label className="cw-field">
                <span>Волосы</span>
                <input value={draft.hair} onChange={(e) => update({ hair: e.target.value })} />
              </label>
              <label className="cw-field">
                <span>Кожа</span>
                <input value={draft.skin} onChange={(e) => update({ skin: e.target.value })} />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
