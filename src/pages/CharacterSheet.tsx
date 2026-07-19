import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Dices, Download, RotateCcw, Upload } from 'lucide-react'
import { Corners } from '../ornaments'

/**
 * Тестовый лист персонажа D&D 5e — автономный, без привязки к аккаунту.
 * Все значения хранятся в одном плоском объекте `data` (ключ → строка|булево),
 * поэтому импорт/экспорт JSON тривиальны, а автосейв идёт в localStorage.
 */

const STORAGE_KEY = 'vantage-character-sheet'

type SheetData = Record<string, string | boolean>

/* шесть характеристик */
const ABILITIES: { key: string; label: string; abbr: string }[] = [
  { key: 'str', label: 'Сила', abbr: 'СИЛ' },
  { key: 'dex', label: 'Ловкость', abbr: 'ЛОВ' },
  { key: 'con', label: 'Телосложение', abbr: 'ТЕЛ' },
  { key: 'int', label: 'Интеллект', abbr: 'ИНТ' },
  { key: 'wis', label: 'Мудрость', abbr: 'МДР' },
  { key: 'cha', label: 'Харизма', abbr: 'ХАР' },
]

/* 18 навыков: ключ, название, ведущая характеристика */
const SKILLS: { key: string; label: string; abbr: string }[] = [
  { key: 'acrobatics', label: 'Акробатика', abbr: 'ЛОВ' },
  { key: 'animal', label: 'Уход за животными', abbr: 'МДР' },
  { key: 'arcana', label: 'Магия', abbr: 'ИНТ' },
  { key: 'athletics', label: 'Атлетика', abbr: 'СИЛ' },
  { key: 'deception', label: 'Обман', abbr: 'ХАР' },
  { key: 'history', label: 'История', abbr: 'ИНТ' },
  { key: 'insight', label: 'Проницательность', abbr: 'МДР' },
  { key: 'intimidation', label: 'Запугивание', abbr: 'ХАР' },
  { key: 'investigation', label: 'Анализ', abbr: 'ИНТ' },
  { key: 'medicine', label: 'Медицина', abbr: 'МДР' },
  { key: 'nature', label: 'Природа', abbr: 'ИНТ' },
  { key: 'perception', label: 'Внимательность', abbr: 'МДР' },
  { key: 'performance', label: 'Выступление', abbr: 'ХАР' },
  { key: 'persuasion', label: 'Убеждение', abbr: 'ХАР' },
  { key: 'religion', label: 'Религия', abbr: 'ИНТ' },
  { key: 'sleight', label: 'Ловкость рук', abbr: 'ЛОВ' },
  { key: 'stealth', label: 'Скрытность', abbr: 'ЛОВ' },
  { key: 'survival', label: 'Выживание', abbr: 'МДР' },
]

/** Модификатор характеристики по её значению: floor((score − 10) / 2). */
function abilityMod(score: string | boolean | undefined): string {
  const n = typeof score === 'string' ? parseInt(score, 10) : NaN
  if (Number.isNaN(n)) return '—'
  const m = Math.floor((n - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

export default function CharacterSheet() {
  const [data, setData] = useState<SheetData>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as SheetData
    } catch {
      /* пустой лист */
    }
    return {}
  })
  const fileRef = useRef<HTMLInputElement>(null)

  // автосейв
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* localStorage недоступен — не страшно */
    }
  }, [data])

  const setField = (key: string, value: string | boolean) => setData((d) => ({ ...d, [key]: value }))
  const toggle = (key: string) => setData((d) => ({ ...d, [key]: !d[key] }))

  /* ---- импорт / экспорт ---- */
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = (typeof data.name === 'string' && data.name.trim()) || 'персонаж'
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // чтобы повторный выбор того же файла срабатывал
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setData(parsed as SheetData)
        } else {
          alert('Это не похоже на лист персонажа.')
        }
      } catch {
        alert('Не удалось прочитать JSON.')
      }
    }
    reader.readAsText(file)
  }

  const clearAll = () => {
    if (confirm('Очистить весь лист? Данные не восстановить.')) setData({})
  }

  /* ---- мелкие поля ---- */
  const Text = ({ k, className = '', placeholder }: { k: string; className?: string; placeholder?: string }) => (
    <input
      type="text"
      className={`cs-input ${className}`}
      value={(data[k] as string) ?? ''}
      placeholder={placeholder}
      onChange={(e) => setField(k, e.target.value)}
    />
  )

  const Area = ({ k, placeholder }: { k: string; placeholder?: string }) => (
    <textarea
      className="cs-area"
      value={(data[k] as string) ?? ''}
      placeholder={placeholder}
      onChange={(e) => setField(k, e.target.value)}
    />
  )

  const Check = ({ k, label }: { k: string; label?: string }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!data[k]}
      aria-label={label}
      className={`cs-check${data[k] ? ' is-on' : ''}`}
      onClick={() => toggle(k)}
    />
  )

  const Labeled = ({ k, label, className = '' }: { k: string; label: string; className?: string }) => (
    <label className={`cs-labeled ${className}`}>
      <Text k={k} />
      <span className="cs-labeled-cap">{label}</span>
    </label>
  )

  return (
    <section className="cs">
      <div className="cs-toolbar">
        <h1 className="section-title gold-text">Лист персонажа</h1>
        <div className="cs-toolbar-actions">
          <button type="button" className="cs-btn" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden="true" /> Импорт
          </button>
          <button type="button" className="cs-btn" onClick={exportJson}>
            <Download aria-hidden="true" /> Экспорт
          </button>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={clearAll}>
            <RotateCcw aria-hidden="true" /> Очистить
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
        </div>
      </div>

      {/* шапка: имя + анкета */}
      <div className="cs-panel cs-head">
        <label className="cs-name">
          <Text k="name" placeholder="Имя персонажа" />
          <span className="cs-labeled-cap">Имя персонажа</span>
        </label>
        <div className="cs-head-grid">
          <Labeled k="classlevel" label="Класс и уровень" />
          <Labeled k="background" label="Предыстория" />
          <Labeled k="player" label="Имя игрока" />
          <Labeled k="race" label="Раса" />
          <Labeled k="alignment" label="Мировоззрение" />
          <Labeled k="xp" label="Опыт" />
        </div>
      </div>

      <div className="cs-cols">
        {/* ---------- Колонка 1: характеристики, спасброски, навыки ---------- */}
        <div className="cs-col">
          <div className="cs-abilities">
            {ABILITIES.map((a) => (
              <div className="cs-panel cs-ability" key={a.key}>
                <Corners size={16} />
                <span className="cs-ability-name">{a.label}</span>
                <span className="cs-ability-mod">{abilityMod(data[`${a.key}_score`])}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="cs-ability-score"
                  value={(data[`${a.key}_score`] as string) ?? ''}
                  onChange={(e) => setField(`${a.key}_score`, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="cs-col-right">
            <div className="cs-panel cs-inspiration">
              <Check k="inspiration" label="Вдохновение" />
              <span>Вдохновение</span>
            </div>
            <div className="cs-panel cs-profbonus">
              <label className="cs-mini">
                <Text k="profbonus" className="cs-num" />
                <span className="cs-labeled-cap">Бонус мастерства</span>
              </label>
            </div>

            <div className="cs-panel cs-list">
              <div className="cs-list-rows">
                {ABILITIES.map((a) => (
                  <div className="cs-list-row" key={a.key}>
                    <Check k={`save_${a.key}`} label={`Спасбросок ${a.label}`} />
                    <Text k={`save_${a.key}_v`} className="cs-num-sm" />
                    <span className="cs-list-name">{a.label}</span>
                  </div>
                ))}
              </div>
              <span className="cs-list-title">Спасброски</span>
            </div>

            <div className="cs-panel cs-list">
              <div className="cs-list-rows">
                {SKILLS.map((s) => (
                  <div className="cs-list-row" key={s.key}>
                    <Check k={`skill_${s.key}`} label={s.label} />
                    <Text k={`skill_${s.key}_v`} className="cs-num-sm" />
                    <span className="cs-list-name">
                      {s.label} <i className="cs-abbr">({s.abbr})</i>
                    </span>
                  </div>
                ))}
              </div>
              <span className="cs-list-title">Навыки</span>
            </div>

            <div className="cs-panel cs-passive">
              <Text k="passive" className="cs-num" />
              <span className="cs-labeled-cap">Пассивная внимательность</span>
            </div>

            <div className="cs-panel cs-block">
              <Area k="otherprof" placeholder="Владение доспехами, оружием, инструментами, языки…" />
              <span className="cs-list-title">Прочие владения и языки</span>
            </div>
          </div>
        </div>

        {/* ---------- Колонка 2: бой, здоровье, снаряжение ---------- */}
        <div className="cs-col">
          <div className="cs-combat-top">
            <div className="cs-panel cs-stat">
              <Text k="ac" className="cs-num" />
              <span className="cs-labeled-cap">Класс доспеха</span>
            </div>
            <div className="cs-panel cs-stat">
              <Text k="initiative" className="cs-num" />
              <span className="cs-labeled-cap">Инициатива</span>
            </div>
            <div className="cs-panel cs-stat">
              <Text k="speed" className="cs-num" />
              <span className="cs-labeled-cap">Скорость</span>
            </div>
          </div>

          <div className="cs-panel cs-hp">
            <div className="cs-hp-row">
              <label className="cs-mini cs-grow">
                <Text k="hp_max" className="cs-num-sm" />
                <span className="cs-labeled-cap">Макс. хиты</span>
              </label>
            </div>
            <label className="cs-hp-current">
              <Text k="hp_current" />
              <span className="cs-labeled-cap">Текущие хиты</span>
            </label>
            <label className="cs-hp-current">
              <Text k="hp_temp" />
              <span className="cs-labeled-cap">Временные хиты</span>
            </label>
          </div>

          <div className="cs-hp-extra">
            <div className="cs-panel cs-block">
              <div className="cs-hd">
                <label className="cs-mini">
                  <Text k="hd_total" className="cs-num-sm" />
                  <span className="cs-labeled-cap">Всего</span>
                </label>
                <Text k="hd" placeholder="напр. 3к8" />
              </div>
              <span className="cs-list-title">Кости хитов</span>
            </div>
            <div className="cs-panel cs-block cs-death">
              <div className="cs-death-row">
                <span className="cs-death-label">Успехи</span>
                <Check k="ds_s1" /> <Check k="ds_s2" /> <Check k="ds_s3" />
              </div>
              <div className="cs-death-row">
                <span className="cs-death-label">Провалы</span>
                <Check k="ds_f1" /> <Check k="ds_f2" /> <Check k="ds_f3" />
              </div>
              <span className="cs-list-title">Спасброски от смерти</span>
            </div>
          </div>

          <div className="cs-panel cs-block cs-attacks">
            <div className="cs-attacks-head">
              <span>Название</span>
              <span>Бонус</span>
              <span>Урон / вид</span>
            </div>
            {[1, 2, 3].map((i) => (
              <div className="cs-attacks-row" key={i}>
                <Text k={`atk${i}_name`} />
                <Text k={`atk${i}_bonus`} />
                <Text k={`atk${i}_dmg`} />
              </div>
            ))}
            <Area k="atk_text" placeholder="Заклинания атаки, особенности…" />
            <span className="cs-list-title">Атаки и заклинания</span>
          </div>

          <div className="cs-panel cs-block cs-equip">
            <div className="cs-money">
              {['мм', 'см', 'эм', 'зм', 'пм'].map((c, i) => (
                <label className="cs-coin" key={c}>
                  <Text k={`coin_${['cp', 'sp', 'ep', 'gp', 'pp'][i]}`} className="cs-num-sm" />
                  <span className="cs-labeled-cap">{c}</span>
                </label>
              ))}
            </div>
            <Area k="equipment" placeholder="Снаряжение, сокровища…" />
            <span className="cs-list-title">Снаряжение</span>
          </div>
        </div>

        {/* ---------- Колонка 3: личность и умения ---------- */}
        <div className="cs-col">
          <div className="cs-panel cs-block">
            <Area k="personality" placeholder="Черты характера…" />
            <span className="cs-list-title">Черты характера</span>
          </div>
          <div className="cs-panel cs-block">
            <Area k="ideals" placeholder="Идеалы…" />
            <span className="cs-list-title">Идеалы</span>
          </div>
          <div className="cs-panel cs-block">
            <Area k="bonds" placeholder="Привязанности…" />
            <span className="cs-list-title">Привязанности</span>
          </div>
          <div className="cs-panel cs-block">
            <Area k="flaws" placeholder="Слабости…" />
            <span className="cs-list-title">Слабости</span>
          </div>
          <div className="cs-panel cs-block cs-features">
            <Area k="features" placeholder="Умения классов, расы, черты…" />
            <span className="cs-list-title">
              <Dices aria-hidden="true" /> Умения и особенности
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
