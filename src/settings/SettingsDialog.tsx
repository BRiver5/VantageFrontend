/**
 * Центр настроек: вкладки «Настройки» и «Управление». Настройки разбиты по
 * областям — «Это устройство», «Мой профиль», «Эта комната» — и ищутся
 * одним полем. Всё применяется сразу, кнопки «Сохранить» нет (кроме
 * настроек комнаты: их форма своя).
 */
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Keyboard, Monitor, Search, Settings, UserRound, Users, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { CharacterVisibility } from '../types/auth'
import { useFocusTrap } from '../ui/focusTrap'
import { EditionToggle } from '../ui/EditionToggle'
import { countLabel } from '../lib/plural'
import { ControlsPanel } from './ControlsPanel'
import { systemPrefersReducedMotion } from './motion'
import type { SettingsTab } from './open'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FPS_CHOICES,
  resetDeviceSettings,
  setDeviceSettings,
  setUserSettings,
  useDeviceSettings,
  useUserSettings,
} from './settings'

const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е')

/** строка подходит запросу: все слова запроса есть в подписи, пояснении или ключевых словах */
const fits = (q: string, ...texts: string[]) => {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = norm(texts.join(' '))
  return words.every((w) => hay.includes(w))
}

type Row = { key: string; label: string; hint?: string; keywords?: string; node: ReactNode }

const pct = (v: number) => `${Math.round(v * 100)}%`
const VISIBILITY: [CharacterVisibility, string][] = [
  ['private', 'Только я'],
  ['unlisted', 'По ссылке'],
  ['public', 'Все'],
]

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId()
  return (
    <label className="st-row st-toggle" htmlFor={id}>
      <span className="st-row-text">
        <b>{label}</b>
        {hint && <i id={`${id}-hint`}>{hint}</i>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
    </label>
  )
}

function Slider({ value, onChange, label, hint, min = 0, max = 1, step = 0.05, format = pct }: { value: number; onChange: (v: number) => void; label: string; hint?: string; min?: number; max?: number; step?: number; format?: (v: number) => string }) {
  const id = useId()
  return (
    <div className="st-row">
      <label className="st-row-text" htmlFor={id}>
        <b>{label}</b>
        {hint && <i>{hint}</i>}
      </label>
      <span className="st-slider">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={format(value)} />
        <output htmlFor={id}>{format(value)}</output>
      </span>
    </div>
  )
}

function Choice<T extends string | number>({ value, options, onChange, label, hint, disabled }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="st-row">
      <label className="st-row-text" htmlFor={id}>
        <b>{label}</b>
        {hint && <i>{hint}</i>}
      </label>
      <select id={id} value={String(value)} disabled={disabled} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </div>
  )
}

function Section({ icon: Icon, title, scope, rows, children }: { icon: typeof Monitor; title: string; scope: string; rows: Row[]; children?: ReactNode }) {
  const id = useId()
  if (!rows.length && !children) return null
  return (
    <section className="st-section" aria-labelledby={id}>
      <header>
        <Icon aria-hidden="true" />
        <h3 id={id}>{title}</h3>
        <span className="st-scope">{scope}</span>
      </header>
      {rows.map((r) => (
        <div key={r.key}>{r.node}</div>
      ))}
      {children}
    </section>
  )
}

function SettingsPanel({ room }: { room?: ReactNode }) {
  const [query, setQuery] = useState('')
  const device = useDeviceSettings()
  const prefs = useUserSettings()
  const { user, updateMe } = useAuth()
  const [visErr, setVisErr] = useState<string | null>(null)
  const osMotion = systemPrefersReducedMotion()

  const deviceRows: Row[] = [
    {
      key: 'font',
      label: 'Размер шрифта',
      hint: 'Масштаб текста во всём интерфейсе',
      keywords: 'шрифт текст крупнее мельче масштаб',
      node: <Slider label="Размер шрифта" hint="Масштаб текста во всём интерфейсе" value={device.fontScale} min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={0.05} onChange={(v) => setDeviceSettings({ fontScale: v })} />,
    },
    {
      key: 'perf',
      label: 'Режим производительности',
      hint: 'Карта рисуется в меньшем разрешении, без погоды и мерцания света',
      keywords: 'быстродействие слабый ноутбук батарея fps тормозит',
      node: <Toggle label="Режим производительности" hint="Карта рисуется в меньшем разрешении, без погоды и мерцания света" checked={device.performance} onChange={(v) => setDeviceSettings({ performance: v })} />,
    },
    {
      key: 'fps',
      label: 'Предел кадров карты',
      hint: 'Меньше кадров — меньше нагрузка и нагрев',
      keywords: 'fps кадры частота',
      node: (
        <Choice
          label="Предел кадров карты"
          hint="Меньше кадров — меньше нагрузка и нагрев"
          value={(FPS_CHOICES as readonly number[]).includes(device.maxFps) ? device.maxFps : 0}
          options={FPS_CHOICES.map((f) => [f, f === 0 ? 'Без предела' : `${f} кадров/с`] as const)}
          onChange={(v) => setDeviceSettings({ maxFps: v })}
        />
      ),
    },
    {
      key: 'music',
      label: 'Музыка и звуки комнаты',
      hint: 'Ваша громкость того, что включает мастер',
      keywords: 'звук громкость музыка саундборд',
      node: <Slider label="Музыка и звуки комнаты" hint="Ваша громкость того, что включает мастер" value={device.musicVolume} onChange={(v) => setDeviceSettings({ musicVolume: v })} />,
    },
    {
      key: 'ambience',
      label: 'Фон карты',
      hint: 'Звуки местности на карте',
      keywords: 'звук громкость фон местность эмбиент',
      node: <Slider label="Фон карты" hint="Звуки местности на карте" value={device.ambienceVolume} onChange={(v) => setDeviceSettings({ ambienceVolume: v })} />,
    },
    {
      key: 'ui-sound',
      label: 'Звуки интерфейса',
      hint: 'Стук кубиков и итог броска',
      keywords: 'звук громкость кубики интерфейс',
      node: <Slider label="Звуки интерфейса" hint="Стук кубиков и итог броска" value={device.interfaceVolume} onChange={(v) => setDeviceSettings({ interfaceVolume: v })} />,
    },
    {
      key: 'party',
      label: 'Панель отряда развёрнута',
      hint: 'Полоска героев в углу экрана комнаты',
      keywords: 'партия отряд панель',
      node: <Toggle label="Панель отряда развёрнута" hint="Полоска героев в углу экрана комнаты" checked={device.partyHudOpen} onChange={(v) => setDeviceSettings({ partyHudOpen: v })} />,
    },
  ].filter((r) => fits(query, r.label, r.hint ?? '', r.keywords ?? ''))

  const motionHint = osMotion ? 'Уже включено системой: в настройках устройства просили меньше движения' : 'Без анимаций и плавных переходов — вдобавок к настройке системы'
  const overrides = Object.keys(prefs.editionSections).length
  const editionHint = overrides
    ? `Для всего сайта; ${countLabel(overrides, ['раздел', 'раздела', 'разделов'])} со своей редакцией`
    : 'Для всего сайта; у разделов и записей можно выбрать свою'
  const userRows: Row[] = [
    {
      key: 'edition',
      label: 'Редакция правил',
      hint: editionHint,
      keywords: 'редакция правила 2014 2024 dnd phb версия',
      node: (
        <div className="st-row">
          <span className="st-row-text">
            <b>Редакция правил</b>
            <i>{editionHint}</i>
          </span>
          <span className="st-row-actions">
            <EditionToggle value={prefs.edition} onChange={(edition) => setUserSettings({ edition })} />
            {overrides > 0 && (
              <button
                type="button"
                className="st-btn st-btn--small"
                onClick={() => setUserSettings({ editionSections: {} })}
                title="Убрать редакции, выбранные у отдельных разделов"
              >
                все разделы — как везде
              </button>
            )}
          </span>
        </div>
      ),
    },
    {
      key: 'motion',
      label: 'Меньше движения',
      hint: motionHint,
      keywords: 'анимация движение укачивает reduce motion',
      node: <Toggle label="Меньше движения" hint={motionHint} checked={prefs.reduceMotion} onChange={(v) => setUserSettings({ reduceMotion: v })} />,
    },
    {
      key: 'photo',
      label: 'Фоточувствительность',
      hint: 'Без вспышек и мигания на результате броска, в листе героя и на карте',
      keywords: 'вспышки мигание эпилепсия щадящий режим пинги свет',
      node: <Toggle label="Фоточувствительность" hint="Без вспышек и мигания: на результате броска нет вспышек и искр, хиты и ресурсы не пульсируют; на карте пинги — медленный круг, свет не мерцает" checked={prefs.photosensitive} onChange={(v) => setUserSettings({ photosensitive: v })} />,
    },
    ...(user
      ? [
          {
            key: 'visibility',
            label: 'Кто видит новых персонажей',
            hint: 'Видимость по умолчанию при создании',
            keywords: 'персонаж видимость приватный публичный',
            node: (
              <Choice
                label="Кто видит новых персонажей"
                hint={visErr ?? 'Видимость по умолчанию при создании'}
                value={user.preferences?.default_character_visibility ?? 'private'}
                options={VISIBILITY}
                onChange={(v) => {
                  setVisErr(null)
                  updateMe({ preferences: { default_character_visibility: v } }).catch(() => setVisErr('Не сохранилось — попробуйте ещё раз'))
                }}
              />
            ),
          },
        ]
      : []),
  ].filter((r) => fits(query, r.label, r.hint ?? '', r.keywords ?? ''))

  const roomFits = fits(query, 'Эта комната название описание игроков скрытые броски обложка статус мастер')
  const nothing = !deviceRows.length && !userRows.length && !roomFits

  return (
    <div className="st-settings">
      <label className="st-search">
        <Search aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти настройку" aria-label="Поиск по настройкам" data-autofocus />
      </label>
      {nothing && <p className="st-empty">Ничего не нашлось.</p>}

      <Section icon={Monitor} title="Это устройство" scope="Только этот браузер" rows={deviceRows}>
        {deviceRows.length > 0 && !query && (
          <button type="button" className="st-btn st-reset" onClick={resetDeviceSettings}>
            Вернуть настройки устройства по умолчанию
          </button>
        )}
      </Section>

      <Section icon={UserRound} title="Мой профиль" scope={user ? 'На всех устройствах, где вы вошли' : 'Вы не вошли: пока только здесь'} rows={userRows}>
        {userRows.length > 0 && !user && <p className="st-note">После входа эти настройки сохранятся в профиле.</p>}
      </Section>

      {roomFits && (
        <Section icon={Users} title="Эта комната" scope="Для всех участников, меняет мастер" rows={[]}>
          {room ?? <p className="st-note">Настройки комнаты открываются из самой комнаты (шестерёнка в шапке), их меняет мастер.</p>}
        </Section>
      )}
    </div>
  )
}

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: 'settings', label: 'Настройки', icon: Settings },
  { id: 'controls', label: 'Управление', icon: Keyboard },
]

/**
 * Окно настроек. room — блок «Эта комната» (настройки комнаты для мастера);
 * его передаёт шапка комнаты, вне комнаты его нет.
 */
export function SettingsDialog({ onClose, initialTab = 'settings', room }: { onClose: () => void; initialTab?: SettingsTab; room?: ReactNode }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const box = useRef<HTMLDivElement>(null)
  const uid = useId()
  useFocusTrap(box)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // клавиши в окне не доходят до горячих клавиш стола и страницы
    e.stopPropagation()
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      onClose()
    }
  }

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next].id)
    document.getElementById(`${uid}-tab-${TABS[next].id}`)?.focus()
  }

  return createPortal(
    <div className="st-layer" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="st-dialog" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="st-head">
          <h2 id={`${uid}-title`}>Настройки</h2>
          <div className="st-tabs" role="tablist" aria-label="Разделы настроек">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`${uid}-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`${uid}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                className={`st-tab${tab === t.id ? ' is-on' : ''}`}
                onClick={() => setTab(t.id)}
                onKeyDown={onTabKey}
              >
                <t.icon aria-hidden="true" /> {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="st-icon st-close" onClick={onClose} aria-label="Закрыть настройки">
            <X aria-hidden="true" />
          </button>
        </header>
        <div id={`${uid}-panel`} className="st-body" role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
          {tab === 'settings' ? <SettingsPanel room={room} /> : <ControlsPanel />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
