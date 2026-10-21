/**
 * Подсказки для шага «Имя» из описаний каталога: имена из статьи расы
 * («Мужские имена: Адрик, Баренд…») и таблицы черт характера, идеалов,
 * привязанностей и слабостей из статьи предыстории («к8 | Черта характера»).
 */

export interface NameGroup {
  label: string
  names: string[]
  /** фамилии, имена кланов и прозвища дописываются к имени, а не заменяют его */
  appendable: boolean
}

export type PersonalityKey = 'traits' | 'ideals' | 'bonds' | 'flaws'
export type Personality = Record<PersonalityKey, string[]>

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

function parse(html: string | null | undefined): Document | null {
  if (!html || typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

/** Имя из списка: без перевода в скобках и точки в конце, с заглавной буквы */
function toName(raw: string): string | null {
  const name = raw.replace(/\([^)]*\)/g, '').replace(/[.;:]+$/, '').trim()
  if (name.length < 2 || name.length > 32) return null
  return /^\p{Lu}/u.test(name) ? name : null
}

/** Группы имён из статьи расы (и подрасы): «Мужские имена», «Фамилии», «Имена дамарцев»… */
export function raceNameGroups(...htmls: (string | null | undefined)[]): NameGroup[] {
  const groups: NameGroup[] = []
  const seen = new Set<string>()
  for (const html of htmls) {
    const doc = parse(html)
    if (!doc) continue
    for (const strong of doc.querySelectorAll('strong, b')) {
      const label = clean(strong.textContent).replace(/[:.]+$/, '')
      if (!/имен|прозвищ|фамили|клан/i.test(label) || label.length > 60) continue
      const parent = strong.parentElement
      if (!parent) continue
      const rest = clean(parent.textContent).slice(clean(parent.textContent).indexOf(label) + label.length)
      // у людей в одном абзаце: «(Мужские) Айвор, Бор; (женские) Аризима…»
      for (const segment of rest.replace(/^[\s:.]+/, '').split(';')) {
        const m = /^\s*\(([^)]+)\)\s*(.*)$/.exec(segment)
        const sub = m ? m[1].trim() : null
        const names = (m ? m[2] : segment).split(',').map(toName).filter((n): n is string => !!n)
        if (names.length < 2) continue
        const full = sub ? `${label} — ${sub.toLocaleLowerCase('ru')}` : label
        if (seen.has(full)) continue
        seen.add(full)
        groups.push({
          label: full,
          names: [...new Set(names)],
          appendable: /фамили|клан|прозвищ|род/i.test(full),
        })
      }
    }
  }
  return groups
}

const COLUMNS: [PersonalityKey, RegExp][] = [
  ['traits', /черт/i],
  ['ideals', /идеал/i],
  ['bonds', /привязан/i],
  ['flaws', /слабост|недостат|порок/i],
]

/** Таблицы бросков из статьи предыстории: черты, идеалы, привязанности, слабости */
export function backgroundPersonality(html: string | null | undefined): Personality {
  const out: Personality = { traits: [], ideals: [], bonds: [], flaws: [] }
  const doc = parse(html)
  if (!doc) return out
  for (const table of doc.querySelectorAll('table')) {
    const rows = [...table.querySelectorAll('tr')]
    const head = rows[0]
    if (!head) continue
    const cells = [...head.querySelectorAll('td, th')].map((c) => clean(c.textContent))
    // заголовок вида «к8 | Черта характера»: первая колонка — номер на кости
    if (!/^к\d+$/i.test(cells[0] ?? '')) continue
    const key = COLUMNS.find(([, re]) => re.test(cells[1] ?? ''))?.[0]
    if (!key) continue
    for (const row of rows.slice(1)) {
      const text = clean(row.querySelectorAll('td')[1]?.textContent)
      if (text) out[key].push(text)
    }
  }
  return out
}

export function pickRandom<T>(list: T[]): T | undefined {
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * Картинку с компьютера уменьшаем до разумного размера и кладём в лист как
 * data URL: отдельной загрузки файлов у API нет, а исходник может весить мегабайты.
 */
export function imageFileToDataUrl(file: File, maxSide = 640, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Это не картинка'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      // PNG с прозрачностью оставляем PNG, остальное — компактный JPEG
      resolve(
        file.type === 'image/png'
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', quality),
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось прочитать картинку'))
    }
    img.src = url
  })
}
