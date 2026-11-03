/**
 * Содержимое книги или мира по разделам. Каждая запись — карточка с картинкой
 * (или значком школы у заклинаний) и короткой подписью: редкость предмета,
 * опасность существа, круг заклинания. Пустые разделы не показываются.
 */
import { Link } from 'react-router-dom'
import { displayName, realImage } from '../api'
import type { BookContents } from '../api'
import { CONTENT_SECTIONS } from '../contentSections'
import { Img } from '../media'
import { spellSchoolIcon } from '../spellSchools'

type Entry = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null)
const list = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : null)

/** Картинка записи: первая настоящая из галереи (заглушки dnd.su пропускаем) */
function entryArt(e: Entry): string | null {
  for (const key of ['item_image_gallery', 'equipment_image_gallery', 'image_gallery', 'class_image_gallery', 'race_image_gallery']) {
    const src = realImage(list(e[key]))
    if (src) return src
  }
  return str(e.image_url) ?? str(e.class_image_url) ?? str(e.picture_url)
}

const CR = (v: number) => (v === 0.125 ? '1/8' : v === 0.25 ? '1/4' : v === 0.5 ? '1/2' : String(v))

/** Короткая подпись под названием — своя для каждого раздела */
function entrySub(key: string, e: Entry): string | null {
  switch (key) {
    case 'spells': {
      const lvl = num(e.spell_level)
      const school = str(e.school)
      return [lvl === 0 ? 'заговор' : lvl != null ? `${lvl} круг` : null, school].filter(Boolean).join(' · ') || null
    }
    case 'items':
      return [str(e.rarity), str(e.item_type)].filter(Boolean).join(' · ') || null
    case 'creatures': {
      const cr = num(e.challenge_rating)
      return [str(e.creature_type), cr != null ? `ПО ${CR(cr)}` : null].filter(Boolean).join(' · ') || null
    }
    case 'subclasses': {
      const lvl = num(e.level_available)
      return lvl ? `с ${lvl} уровня` : null
    }
    default:
      return null
  }
}

function entryHref(base: string | undefined, entry: Entry): string | null {
  const id = entry.id as string | undefined
  if (!base || !id) return null
  return `${base}/${id}`
}

export function TomeSections({ contents }: { contents: BookContents }) {
  return (
    <div className="book-sections">
      {CONTENT_SECTIONS.map((section) => {
        const { key, label, icon: Icon } = section
        const base = 'base' in section ? section.base : undefined
        const entries = contents[key] ?? []
        if (entries.length === 0) return null
        return (
          <details key={key} id={`tome-${key}`} className="tome-section" open={entries.length <= 40}>
            <summary>
              <Icon aria-hidden="true" />
              <span className="tome-section-name">{label}</span>
              <b className="loot-num">{entries.length}</b>
            </summary>
            <ul className="te-cards">
              {entries.map((entry, i) => {
                const href = entryHref(base, entry)
                const name = displayName(entry)
                const school = key === 'spells' ? spellSchoolIcon(str(entry.school)) : null
                const art = school ? null : entryArt(entry)
                const sub = entrySub(key, entry)
                const body = (
                  <>
                    <span className={`te-art${school ? ' is-school' : ''}`}>
                      {school ? <img src={school} alt="" /> : art ? <Img src={art} alt="" loading="lazy" /> : <Icon aria-hidden="true" />}
                    </span>
                    <span className="te-text">
                      <b>{name}</b>
                      {sub && <i>{sub}</i>}
                    </span>
                  </>
                )
                return (
                  <li key={String(entry.id ?? i)}>
                    {href ? (
                      <Link className="te-card" to={href}>
                        {body}
                      </Link>
                    ) : (
                      <span className="te-card">{body}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
    </div>
  )
}
