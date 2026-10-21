/**
 * Шаг «Имя»: имя (с подсказками из статьи расы), видимость листа, мировоззрение
 * по схеме, облик и характер (с вариантами из таблиц предыстории). Слева —
 * карточка героя; на её портрет можно перетащить свою картинку.
 */
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { ChevronDown, Dices, Eye, Globe, ImagePlus, Lock, Trash2, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { realImage } from '../../api'
import type { CharacterVisibility } from '../../api'
import type { StepProps } from '../draft'
import {
  backgroundPersonality,
  imageFileToDataUrl,
  pickRandom,
  raceNameGroups,
  type PersonalityKey,
} from '../flavor'
import { AlignmentChart, alignmentAbbr } from './AlignmentChart'
import { AppearanceSection } from './AppearanceSection'
import { ChoicePortrait, StepHeader, StepPanel } from './ui'

const VISIBILITY: { id: CharacterVisibility; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'private', label: 'Только я', hint: 'Лист видите только вы', icon: Lock },
  { id: 'unlisted', label: 'По ссылке', hint: 'Откроет тот, у кого есть ссылка', icon: Eye },
  { id: 'public', label: 'Всем', hint: 'Лист виден в общем списке', icon: Globe },
]

/** Поле характера с вариантами из таблицы предыстории и случайным броском */
function PersonalityField({
  label,
  value,
  onChange,
  options,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  rows?: number
}) {
  const [open, setOpen] = useState(false)
  // вариант дописывается с новой строки, если поле уже заполнено
  const add = (text: string) => onChange(value.trim() ? `${value.trim()}\n${text}` : text)

  return (
    <div className="cw-field cw-pfield">
      <span className="cw-pfield-head">
        <span>{label}</span>
        {options.length > 0 && (
          <span className="cw-pfield-tools">
            <button
              type="button"
              className="cw-mini-btn"
              onClick={() => {
                const pick = pickRandom(options)
                if (pick) add(pick)
              }}
              title="Случайный вариант из предыстории"
            >
              <Dices aria-hidden="true" /> к{options.length}
            </button>
            <button
              type="button"
              className={`cw-mini-btn${open ? ' is-on' : ''}`}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              варианты <ChevronDown aria-hidden="true" />
            </button>
          </span>
        )}
      </span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      {open && (
        <ol className="cw-pfield-list">
          {options.map((o, i) => (
            <li key={i}>
              <button type="button" onClick={() => add(o)} title="Добавить в поле">
                <b>{i + 1}</b>
                <span>{o}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * Карточка героя: портрет (свой или арт расы) с зоной для перетаскивания
 * картинки, имя на серебряной плашке, кто он и мировоззрение.
 */
function HeroPreview({ draft, update }: StepProps) {
  const [broken, setBroken] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatar = draft.avatarUrl.trim()
  const ownArt = avatar && broken !== avatar ? avatar : null
  const who = [draft.subrace?.subrace_name ?? draft.race?.race_name, draft.cls?.class_name]
    .filter(Boolean)
    .join(' · ')
  const abbr = alignmentAbbr(draft.alignment)

  const takeFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      update({ avatarUrl: await imageFileToDataUrl(file) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить картинку')
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void takeFile(e.dataTransfer.files[0])
  }

  return (
    <aside className="cw-hero-card">
      <div
        className={`cw-hero-art${ownArt ? ' is-own' : ''}${dragging ? ' is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {ownArt ? (
          <img src={ownArt} alt="" onError={() => setBroken(avatar)} />
        ) : (
          <ChoicePortrait src={realImage(draft.race?.image_gallery)} icon={UserRound} />
        )}
        {abbr && (
          <span className="cw-hero-align" title={draft.alignment}>
            {abbr}
          </span>
        )}
        <button type="button" className="cw-hero-drop" onClick={() => fileRef.current?.click()}>
          <ImagePlus aria-hidden="true" />
          <span>{dragging ? 'Отпустите, чтобы поставить портрет' : 'Перетащите картинку или нажмите'}</span>
        </button>
        {ownArt && (
          <button
            type="button"
            className="cw-hero-clear"
            onClick={() => update({ avatarUrl: '' })}
            title="Убрать свой портрет"
            aria-label="Убрать свой портрет"
          >
            <Trash2 aria-hidden="true" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void takeFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <div className="cw-hero-plate">
        <b className={draft.name.trim() ? '' : 'is-empty'}>{draft.name.trim() || 'Безымянный'}</b>
        {who && <i>{who}</i>}
      </div>
      {error && <p className="auth-error">{error}</p>}
    </aside>
  )
}

export default function IdentityStep({ draft, update }: StepProps) {
  const [alignOpen, setAlignOpen] = useState(false)
  const [namesOpen, setNamesOpen] = useState(false)
  const race = draft.race

  const nameGroups = useMemo(
    () => raceNameGroups(race?.description, draft.subrace?.description),
    [race?.description, draft.subrace?.description],
  )
  const personality = useMemo(
    () => backgroundPersonality(draft.background?.description),
    [draft.background?.description],
  )

  /** Имя из подсказки: фамилии и прозвища дописываются, остальное заменяет */
  const applyName = (name: string, appendable: boolean) => {
    const current = draft.name.trim()
    update({ name: appendable && current ? `${current} ${name}` : name })
  }

  const randomName = () => {
    const given = nameGroups.filter((g) => !g.appendable)
    const first = pickRandom(pickRandom(given.length ? given : nameGroups)?.names ?? [])
    const surname = pickRandom(pickRandom(nameGroups.filter((g) => g.appendable))?.names ?? [])
    if (first) update({ name: surname ? `${first} ${surname}` : first })
  }

  const personalityField = (key: PersonalityKey, label: string) => (
    <PersonalityField
      label={label}
      value={draft[key]}
      onChange={(v) => update({ [key]: v })}
      options={personality[key]}
    />
  )

  const abbr = alignmentAbbr(draft.alignment)

  return (
    <div className="cw-step">
      <StepHeader title="Как тебя запомнят?" />

      <div className="cw-identity">
        <HeroPreview draft={draft} update={update} />

        <div className="cw-identity-form">
          <StepPanel className="cw-id-section">
            <div className="cw-name-row">
              <label className="cw-field cw-field--name">
                <span>Имя героя</span>
                <input
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                  autoFocus
                  aria-required="true"
                />
              </label>
              {nameGroups.length > 0 && (
                <div className="cw-name-tools">
                  <button type="button" className="cw-mini-btn" onClick={randomName} title="Случайное имя расы">
                    <Dices aria-hidden="true" /> случайное
                  </button>
                  <button
                    type="button"
                    className={`cw-mini-btn${namesOpen ? ' is-on' : ''}`}
                    onClick={() => setNamesOpen((v) => !v)}
                    aria-expanded={namesOpen}
                  >
                    имена расы <ChevronDown aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {namesOpen && (
              <div className="cw-names">
                {nameGroups.map((g) => (
                  <div key={g.label} className="cw-names-group">
                    <span className="cw-id-label">
                      {g.label}
                      {g.appendable && <i> — дописывается к имени</i>}
                    </span>
                    <div className="cw-names-list">
                      {g.names.map((n) => (
                        <button key={n} type="button" className="cw-name-chip" onClick={() => applyName(n, g.appendable)}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="cw-id-row">
              <div className="cw-id-sub">
                <span className="cw-id-label">Кто видит лист</span>
                <div className="cw-seg" role="radiogroup" aria-label="Видимость листа">
                  {VISIBILITY.map(({ id, label, hint, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={draft.visibility === id}
                      className={`cw-seg-btn${draft.visibility === id ? ' is-on' : ''}`}
                      onClick={() => update({ visibility: id })}
                      title={hint}
                    >
                      <Icon aria-hidden="true" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cw-id-sub">
                <span className="cw-id-label">Мировоззрение</span>
                <button
                  type="button"
                  className={`cw-align-btn${draft.alignment ? ' is-set' : ''}`}
                  onClick={() => setAlignOpen(true)}
                >
                  <span className="cw-align-btn-hex">{abbr ?? '?'}</span>
                  {draft.alignment || 'Выбрать по схеме'}
                </button>
              </div>
            </div>
          </StepPanel>

          <StepPanel className="cw-id-section">
            <h3 className="cw-id-title">Облик</h3>
            <AppearanceSection draft={draft} update={update} />
          </StepPanel>

          <StepPanel className="cw-id-section">
            <h3 className="cw-id-title">Нрав и память</h3>
            {draft.background && personality.traits.length + personality.ideals.length > 0 && (
              <p className="cw-field-note">
                Варианты взяты из таблиц предыстории «{draft.background.background_name}».
              </p>
            )}
            <div className="cw-id-grid cw-id-grid--two">
              {personalityField('traits', 'Черты характера')}
              {personalityField('ideals', 'Идеалы')}
              {personalityField('bonds', 'Привязанности')}
              {personalityField('flaws', 'Слабости')}
              <label className="cw-field cw-field--wide">
                <span>История героя</span>
                <textarea rows={5} value={draft.backstory} onChange={(e) => update({ backstory: e.target.value })} />
              </label>
            </div>
          </StepPanel>
        </div>
      </div>

      {alignOpen && (
        <AlignmentChart
          value={draft.alignment}
          onChange={(name) => {
            update({ alignment: name })
            setAlignOpen(false)
          }}
          onClose={() => setAlignOpen(false)}
        />
      )}
    </div>
  )
}
