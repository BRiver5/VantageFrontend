import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Dices, Plus, Trash2 } from 'lucide-react'
import {
  getCharacter,
  updateCharacter,
  type Character,
  type CharacterVisibility,
  type Equipment,
  type Item,
} from '../api'
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  DEFAULT_SKILLS,
  type AbilityName,
  type InventoryItemInstance,
} from '../types/character'
import { Corners } from '../ornaments'

function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

function itemDisplayName(it: InventoryItemInstance): string {
  if (it.kind === 'equipment') return it.equipment?.equipment_name || 'Снаряжение'
  return it.magic_item?.item_name || 'Предмет'
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [character, setCharacter] = useState<Character | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipSave = useRef(true)
  const latest = useRef<Character | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoadError(null)
    setCharacter(null)
    skipSave.current = true
    getCharacter(id)
      .then((c) => {
        if (cancelled) return
        setCharacter(c)
        latest.current = c
        skipSave.current = true
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не найден')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const persist = useCallback(async (c: Character) => {
    if (!c.id) return
    setSaveState('saving')
    setSaveError(null)
    try {
      const updated = await updateCharacter(c.id, c)
      latest.current = updated
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      setSaveError(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }, [])

  useEffect(() => {
    if (!character) return
    latest.current = character
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persist(character)
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [character, persist])

  const patch = useCallback((fn: (c: Character) => Character) => {
    setCharacter((prev) => (prev ? fn(prev) : prev))
  }, [])

  if (loadError) {
    return (
      <section className="chars-page">
        <p className="auth-error">{loadError}</p>
        <Link to="/characters" className="cs-btn">
          К списку
        </Link>
      </section>
    )
  }

  if (!character) {
    return (
      <section className="chars-page">
        <p className="muted">Загрузка листа…</p>
      </section>
    )
  }

  const bi = character.basic_info
  const primary = bi.classes[0]

  const setAbilityScore = (ability: AbilityName, score: number) => {
    patch((c) => ({
      ...c,
      ability_scores: {
        ...c.ability_scores,
        [ability]: { ...c.ability_scores[ability], score },
      },
    }))
  }

  const toggleSave = (ability: AbilityName) => {
    patch((c) => ({
      ...c,
      ability_scores: {
        ...c.ability_scores,
        [ability]: {
          ...c.ability_scores[ability],
          saving_throw_proficient: !c.ability_scores[ability].saving_throw_proficient,
        },
      },
    }))
  }

  const toggleSkill = (key: string, field: 'proficient' | 'expertise') => {
    patch((c) => {
      const cur = c.skills[key]
      if (!cur) return c
      return {
        ...c,
        skills: {
          ...c.skills,
          [key]: { ...cur, [field]: !cur[field] },
        },
      }
    })
  }

  const setDeath = (kind: 'successes' | 'failures', n: number) => {
    patch((c) => ({
      ...c,
      combat: {
        ...c.combat,
        death_saves: { ...c.combat.death_saves, [kind]: Math.min(3, Math.max(0, n)) },
      },
    }))
  }

  const updateCurrency = (key: keyof Character['inventory']['currency'], value: number) => {
    patch((c) => ({
      ...c,
      inventory: {
        ...c.inventory,
        currency: { ...c.inventory.currency, [key]: value },
      },
    }))
  }

  const addInventoryNoteItem = () => {
    patch((c) => {
      const row = c.inventory.items.length
      const item: InventoryItemInstance = {
        instance_id: crypto.randomUUID(),
        kind: 'equipment',
        equipment: {
          id: '',
          slug: 'custom-note',
          equipment_name: 'Новый предмет',
          equipment_name_en: null,
          category: 'Прочее',
          subcategory: null,
          tags: [],
          weight: null,
          cost: null,
          cost_copper: null,
          bundle_size: null,
          stackable: true,
          stack_size: 1,
          container: null,
          description: null,
          weapon: null,
          defense: null,
          book_source_id: null,
          source_url: null,
          equipment_image_gallery: null,
        } satisfies Equipment,
        magic_item: null,
        catalog_ref: null,
        quantity: 1,
        notes: '',
        position: { col: 0, row },
        equipped: false,
        equip_slot: null,
        is_attuned: false,
      }
      return {
        ...c,
        inventory: { ...c.inventory, items: [...c.inventory.items, item] },
      }
    })
  }

  const updateItem = (instanceId: string, fn: (it: InventoryItemInstance) => InventoryItemInstance) => {
    patch((c) => ({
      ...c,
      inventory: {
        ...c.inventory,
        items: c.inventory.items.map((it) => (it.instance_id === instanceId ? fn(it) : it)),
      },
    }))
  }

  const removeItem = (instanceId: string) => {
    patch((c) => ({
      ...c,
      inventory: {
        ...c.inventory,
        items: c.inventory.items
          .filter((it) => it.instance_id !== instanceId)
          .map((it, i) => ({ ...it, position: { col: 0, row: i } })),
      },
    }))
  }

  const setAttack = (index: number, field: 'name' | 'attack_bonus' | 'damage', value: string | number) => {
    patch((c) => {
      const attacks = [...c.attacks]
      while (attacks.length < 3) {
        attacks.push({
          name: '',
          type: 'other',
          attack_bonus: 0,
          damage: '',
          damage_type: '',
          range: '',
          properties: [],
          inventory_instance_id: null,
        })
      }
      attacks[index] = { ...attacks[index], [field]: value }
      return { ...c, attacks }
    })
  }

  const saveLabel =
    saveState === 'saving'
      ? 'Сохранение…'
      : saveState === 'saved'
        ? 'Сохранено'
        : saveState === 'error'
          ? 'Ошибка'
          : ''

  return (
    <section className="cs">
      <div className="cs-toolbar">
        <div className="cs-toolbar-left">
          <Link to="/characters" className="cs-btn cs-btn--ghost">
            <ArrowLeft aria-hidden="true" /> К списку
          </Link>
          <h1 className="section-title gold-text">{bi.name || 'Лист персонажа'}</h1>
        </div>
        <div className="cs-toolbar-actions">
          <span className={`cs-save-state cs-save-state--${saveState}`}>{saveLabel}</span>
          {saveError && <span className="auth-error">{saveError}</span>}
          <label className="cs-vis-select">
            <span>Видимость</span>
            <select
              value={character.visibility}
              onChange={(e) =>
                patch((c) => ({ ...c, visibility: e.target.value as CharacterVisibility }))
              }
            >
              <option value="private">private</option>
              <option value="unlisted">unlisted</option>
              <option value="public">public</option>
            </select>
          </label>
        </div>
      </div>

      <div className="cs-panel cs-head">
        <label className="cs-name">
          <input
            className="cs-input"
            value={bi.name}
            placeholder="Имя персонажа"
            onChange={(e) =>
              patch((c) => ({ ...c, basic_info: { ...c.basic_info, name: e.target.value } }))
            }
          />
          <span className="cs-labeled-cap">Имя персонажа</span>
        </label>
        <div className="cs-head-grid">
          <label className="cs-labeled">
            <input
              className="cs-input"
              value={primary?.name ?? ''}
              onChange={(e) =>
                patch((c) => {
                  const classes = [...c.basic_info.classes]
                  if (!classes[0]) {
                    classes[0] = { name: e.target.value, level: c.basic_info.total_level, hit_die: 8 }
                  } else {
                    classes[0] = { ...classes[0], name: e.target.value }
                  }
                  return { ...c, basic_info: { ...c.basic_info, classes } }
                })
              }
            />
            <span className="cs-labeled-cap">Класс</span>
          </label>
          <label className="cs-labeled">
            <input
              className="cs-input"
              type="number"
              min={1}
              max={20}
              value={bi.total_level}
              onChange={(e) => {
                const level = Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1))
                patch((c) => {
                  const classes = [...c.basic_info.classes]
                  if (classes[0]) classes[0] = { ...classes[0], level }
                  return {
                    ...c,
                    basic_info: { ...c.basic_info, total_level: level, classes },
                  }
                })
              }}
            />
            <span className="cs-labeled-cap">Уровень</span>
          </label>
          <label className="cs-labeled">
            <input
              className="cs-input"
              value={bi.background?.name ?? ''}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  basic_info: {
                    ...c.basic_info,
                    background: e.target.value ? { name: e.target.value } : null,
                  },
                }))
              }
            />
            <span className="cs-labeled-cap">Предыстория</span>
          </label>
          <label className="cs-labeled">
            <input
              className="cs-input"
              value={bi.player_display_name ?? ''}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  basic_info: { ...c.basic_info, player_display_name: e.target.value || null },
                }))
              }
            />
            <span className="cs-labeled-cap">Имя игрока</span>
          </label>
          <label className="cs-labeled">
            <input
              className="cs-input"
              value={bi.race?.name ?? ''}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  basic_info: { ...c.basic_info, race: { ...c.basic_info.race, name: e.target.value } },
                }))
              }
            />
            <span className="cs-labeled-cap">Раса</span>
          </label>
          <label className="cs-labeled">
            <input
              className="cs-input"
              value={bi.alignment ?? ''}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  basic_info: { ...c.basic_info, alignment: e.target.value },
                }))
              }
            />
            <span className="cs-labeled-cap">Мировоззрение</span>
          </label>
          <label className="cs-labeled">
            <input
              className="cs-input"
              type="number"
              value={bi.experience_points ?? 0}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  basic_info: {
                    ...c.basic_info,
                    experience_points: parseInt(e.target.value, 10) || 0,
                  },
                }))
              }
            />
            <span className="cs-labeled-cap">Опыт</span>
          </label>
        </div>
      </div>

      <div className="cs-cols">
        <div className="cs-col">
          <div className="cs-abilities">
            {ABILITY_KEYS.map((ability) => {
              const block = character.ability_scores[ability]
              const meta = ABILITY_LABELS[ability]
              return (
                <div className="cs-panel cs-ability" key={ability}>
                  <Corners size={16} />
                  <span className="cs-ability-name">{meta.label}</span>
                  <span className="cs-ability-mod">{abilityMod(block.score)}</span>
                  <input
                    type="number"
                    className="cs-ability-score"
                    value={block.score}
                    onChange={(e) => setAbilityScore(ability, parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              )
            })}
          </div>

          <div className="cs-col-right">
            <div className="cs-panel cs-inspiration">
              <button
                type="button"
                role="checkbox"
                aria-checked={character.combat.inspiration}
                aria-label="Вдохновение"
                className={`cs-check${character.combat.inspiration ? ' is-on' : ''}`}
                onClick={() =>
                  patch((c) => ({
                    ...c,
                    combat: { ...c.combat, inspiration: !c.combat.inspiration },
                  }))
                }
              />
              <span>Вдохновение</span>
            </div>
            <div className="cs-panel cs-profbonus">
              <label className="cs-mini">
                <input
                  className="cs-input cs-num"
                  type="number"
                  value={character.proficiency_bonus}
                  onChange={(e) =>
                    patch((c) => ({
                      ...c,
                      proficiency_bonus: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
                <span className="cs-labeled-cap">Бонус мастерства</span>
              </label>
            </div>

            <div className="cs-panel cs-list">
              <div className="cs-list-rows">
                {ABILITY_KEYS.map((ability) => (
                  <div className="cs-list-row" key={ability}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={character.ability_scores[ability].saving_throw_proficient}
                      className={`cs-check${
                        character.ability_scores[ability].saving_throw_proficient ? ' is-on' : ''
                      }`}
                      onClick={() => toggleSave(ability)}
                    />
                    <span className="cs-num-sm">{abilityMod(character.ability_scores[ability].score)}</span>
                    <span className="cs-list-name">{ABILITY_LABELS[ability].label}</span>
                  </div>
                ))}
              </div>
              <span className="cs-list-title">Спасброски</span>
            </div>

            <div className="cs-panel cs-list">
              <div className="cs-list-rows">
                {DEFAULT_SKILLS.map((s) => {
                  const entry = character.skills[s.key]
                  return (
                    <div className="cs-list-row" key={s.key}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={!!entry?.proficient}
                        className={`cs-check${entry?.proficient ? ' is-on' : ''}`}
                        onClick={() => toggleSkill(s.key, 'proficient')}
                        title="Владение"
                      />
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={!!entry?.expertise}
                        className={`cs-check cs-check--sm${entry?.expertise ? ' is-on' : ''}`}
                        onClick={() => toggleSkill(s.key, 'expertise')}
                        title="Компетентность"
                      />
                      <span className="cs-list-name">
                        {s.label}{' '}
                        <i className="cs-abbr">({ABILITY_LABELS[s.ability].abbr})</i>
                      </span>
                    </div>
                  )
                })}
              </div>
              <span className="cs-list-title">Навыки</span>
            </div>

            <div className="cs-panel cs-passive">
              <input
                className="cs-input cs-num"
                type="number"
                value={character.combat.passive_perception}
                onChange={(e) =>
                  patch((c) => ({
                    ...c,
                    combat: {
                      ...c.combat,
                      passive_perception: parseInt(e.target.value, 10) || 0,
                    },
                  }))
                }
              />
              <span className="cs-labeled-cap">Пассивная внимательность</span>
            </div>

            <div className="cs-panel cs-block">
              <textarea
                className="cs-area"
                value={[
                  ...character.proficiencies.armor,
                  ...character.proficiencies.weapons,
                  ...character.proficiencies.tools,
                  ...character.proficiencies.languages,
                ].join(', ')}
                placeholder="Владение доспехами, оружием, инструментами, языки…"
                onChange={(e) => {
                  const parts = e.target.value
                    .split(/[,;\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                  patch((c) => ({
                    ...c,
                    proficiencies: {
                      armor: [],
                      weapons: [],
                      tools: [],
                      languages: parts,
                    },
                  }))
                }}
              />
              <span className="cs-list-title">Прочие владения и языки</span>
            </div>
          </div>
        </div>

        <div className="cs-col">
          <div className="cs-combat-top">
            {(
              [
                ['armor_class', 'Класс доспеха'],
                ['initiative', 'Инициатива'],
                ['speed', 'Скорость'],
              ] as const
            ).map(([key, label]) => (
              <div className="cs-panel cs-stat" key={key}>
                <input
                  className="cs-input cs-num"
                  type="number"
                  value={character.combat[key]}
                  onChange={(e) =>
                    patch((c) => ({
                      ...c,
                      combat: { ...c.combat, [key]: parseInt(e.target.value, 10) || 0 },
                    }))
                  }
                />
                <span className="cs-labeled-cap">{label}</span>
              </div>
            ))}
          </div>

          <div className="cs-panel cs-hp">
            <div className="cs-hp-row">
              <label className="cs-mini cs-grow">
                <input
                  className="cs-input cs-num-sm"
                  type="number"
                  value={character.combat.hit_points.max}
                  onChange={(e) =>
                    patch((c) => ({
                      ...c,
                      combat: {
                        ...c.combat,
                        hit_points: {
                          ...c.combat.hit_points,
                          max: parseInt(e.target.value, 10) || 0,
                        },
                      },
                    }))
                  }
                />
                <span className="cs-labeled-cap">Макс. хиты</span>
              </label>
            </div>
            <label className="cs-hp-current">
              <input
                className="cs-input"
                type="number"
                value={character.combat.hit_points.current}
                onChange={(e) =>
                  patch((c) => ({
                    ...c,
                    combat: {
                      ...c.combat,
                      hit_points: {
                        ...c.combat.hit_points,
                        current: parseInt(e.target.value, 10) || 0,
                      },
                    },
                  }))
                }
              />
              <span className="cs-labeled-cap">Текущие хиты</span>
            </label>
            <label className="cs-hp-current">
              <input
                className="cs-input"
                type="number"
                value={character.combat.hit_points.temp}
                onChange={(e) =>
                  patch((c) => ({
                    ...c,
                    combat: {
                      ...c.combat,
                      hit_points: {
                        ...c.combat.hit_points,
                        temp: parseInt(e.target.value, 10) || 0,
                      },
                    },
                  }))
                }
              />
              <span className="cs-labeled-cap">Временные хиты</span>
            </label>
          </div>

          <div className="cs-hp-extra">
            <div className="cs-panel cs-block">
              <div className="cs-hd">
                <label className="cs-mini">
                  <input
                    className="cs-input cs-num-sm"
                    type="number"
                    value={character.combat.hit_dice.remaining}
                    onChange={(e) =>
                      patch((c) => ({
                        ...c,
                        combat: {
                          ...c.combat,
                          hit_dice: {
                            ...c.combat.hit_dice,
                            remaining: parseInt(e.target.value, 10) || 0,
                          },
                        },
                      }))
                    }
                  />
                  <span className="cs-labeled-cap">Осталось</span>
                </label>
                <input
                  className="cs-input"
                  value={character.combat.hit_dice.total}
                  placeholder="5d10"
                  onChange={(e) =>
                    patch((c) => ({
                      ...c,
                      combat: {
                        ...c.combat,
                        hit_dice: { ...c.combat.hit_dice, total: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <span className="cs-list-title">Кости хитов</span>
            </div>
            <div className="cs-panel cs-block cs-death">
              <div className="cs-death-row">
                <span className="cs-death-label">Успехи</span>
                {[1, 2, 3].map((n) => (
                  <button
                    key={`s${n}`}
                    type="button"
                    role="checkbox"
                    aria-checked={character.combat.death_saves.successes >= n}
                    className={`cs-check${character.combat.death_saves.successes >= n ? ' is-on' : ''}`}
                    onClick={() =>
                      setDeath(
                        'successes',
                        character.combat.death_saves.successes === n ? n - 1 : n,
                      )
                    }
                  />
                ))}
              </div>
              <div className="cs-death-row">
                <span className="cs-death-label">Провалы</span>
                {[1, 2, 3].map((n) => (
                  <button
                    key={`f${n}`}
                    type="button"
                    role="checkbox"
                    aria-checked={character.combat.death_saves.failures >= n}
                    className={`cs-check${character.combat.death_saves.failures >= n ? ' is-on' : ''}`}
                    onClick={() =>
                      setDeath(
                        'failures',
                        character.combat.death_saves.failures === n ? n - 1 : n,
                      )
                    }
                  />
                ))}
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
            {[0, 1, 2].map((i) => {
              const atk = character.attacks[i]
              return (
                <div className="cs-attacks-row" key={i}>
                  <input
                    className="cs-input"
                    value={atk?.name ?? ''}
                    onChange={(e) => setAttack(i, 'name', e.target.value)}
                  />
                  <input
                    className="cs-input"
                    value={atk?.attack_bonus ?? ''}
                    onChange={(e) => setAttack(i, 'attack_bonus', parseInt(e.target.value, 10) || 0)}
                  />
                  <input
                    className="cs-input"
                    value={atk?.damage ?? ''}
                    onChange={(e) => setAttack(i, 'damage', e.target.value)}
                  />
                </div>
              )
            })}
            <span className="cs-list-title">Атаки</span>
          </div>

          <div className="cs-panel cs-block cs-equip">
            <div className="cs-money">
              {(
                [
                  ['cp', 'мм'],
                  ['sp', 'см'],
                  ['ep', 'эм'],
                  ['gp', 'зм'],
                  ['pp', 'пм'],
                ] as const
              ).map(([key, label]) => (
                <label className="cs-coin" key={key}>
                  <input
                    className="cs-input cs-num-sm"
                    type="number"
                    value={character.inventory.currency[key]}
                    onChange={(e) => updateCurrency(key, parseInt(e.target.value, 10) || 0)}
                  />
                  <span className="cs-labeled-cap">{label}</span>
                </label>
              ))}
            </div>
            <ul className="inv-list">
              {character.inventory.items.map((it) => (
                <li key={it.instance_id} className="inv-row">
                  <input
                    className="cs-input"
                    value={itemDisplayName(it)}
                    onChange={(e) =>
                      updateItem(it.instance_id, (cur) => {
                        if (cur.kind === 'equipment' && cur.equipment) {
                          return {
                            ...cur,
                            equipment: { ...cur.equipment, equipment_name: e.target.value },
                          }
                        }
                        if (cur.magic_item) {
                          return {
                            ...cur,
                            magic_item: { ...cur.magic_item, item_name: e.target.value } as Item,
                          }
                        }
                        return cur
                      })
                    }
                  />
                  <input
                    className="cs-input cs-num-sm"
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) =>
                      updateItem(it.instance_id, (cur) => ({
                        ...cur,
                        quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                      }))
                    }
                  />
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={it.equipped}
                    className={`cs-check${it.equipped ? ' is-on' : ''}`}
                    title="Экипировано"
                    onClick={() =>
                      updateItem(it.instance_id, (cur) => ({ ...cur, equipped: !cur.equipped }))
                    }
                  />
                  <input
                    className="cs-input"
                    placeholder="Заметки"
                    value={it.notes}
                    onChange={(e) =>
                      updateItem(it.instance_id, (cur) => ({ ...cur, notes: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="inv-del"
                    aria-label="Удалить предмет"
                    onClick={() => removeItem(it.instance_id)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="cs-btn cs-btn--ghost" onClick={addInventoryNoteItem}>
              <Plus aria-hidden="true" /> Добавить предмет
            </button>
            <span className="cs-list-title">Снаряжение</span>
          </div>
        </div>

        <div className="cs-col">
          <div className="cs-panel cs-block">
            <textarea
              className="cs-area"
              value={character.personality.traits}
              placeholder="Черты характера…"
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  personality: { ...c.personality, traits: e.target.value },
                }))
              }
            />
            <span className="cs-list-title">Черты характера</span>
          </div>
          <div className="cs-panel cs-block">
            <textarea
              className="cs-area"
              value={character.personality.ideals}
              placeholder="Идеалы…"
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  personality: { ...c.personality, ideals: e.target.value },
                }))
              }
            />
            <span className="cs-list-title">Идеалы</span>
          </div>
          <div className="cs-panel cs-block">
            <textarea
              className="cs-area"
              value={character.personality.bonds}
              placeholder="Привязанности…"
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  personality: { ...c.personality, bonds: e.target.value },
                }))
              }
            />
            <span className="cs-list-title">Привязанности</span>
          </div>
          <div className="cs-panel cs-block">
            <textarea
              className="cs-area"
              value={character.personality.flaws}
              placeholder="Слабости…"
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  personality: { ...c.personality, flaws: e.target.value },
                }))
              }
            />
            <span className="cs-list-title">Слабости</span>
          </div>
          <div className="cs-panel cs-block cs-features">
            <textarea
              className="cs-area"
              value={
                character.features.length
                  ? character.features.map((f) => `${f.name}: ${f.description}`).join('\n\n')
                  : character.notes
              }
              placeholder="Умения классов, расы, черты…"
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  features: [
                    {
                      name: 'Умения',
                      source: 'other',
                      description: e.target.value,
                      level: null,
                      feature_source: null,
                    },
                  ],
                  notes: e.target.value,
                }))
              }
            />
            <span className="cs-list-title">
              <Dices aria-hidden="true" /> Умения и особенности
            </span>
          </div>
          <div className="cs-panel cs-block">
            <textarea
              className="cs-area"
              value={character.backstory}
              placeholder="Предыстория…"
              onChange={(e) => patch((c) => ({ ...c, backstory: e.target.value }))}
            />
            <span className="cs-list-title">Предыстория</span>
          </div>
        </div>
      </div>
    </section>
  )
}
