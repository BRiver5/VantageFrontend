/**
 * Разбор таблицы развития класса, которую «выжиматель» вшивает прямо в
 * `description` одним плоским потоком слов. Заголовок и набор колонок у разных
 * типов классов различаются, поэтому таблица описывается ОБЩЕЙ моделью: список
 * колонок + строки, где ячейки выровнены по колонкам, а колонка умений держит
 * массив строк-умений.
 *
 * Заклинатели / Воин / Плут разбираются общей (по «числовому хвосту») моделью.
 * У Варвара и Монаха свои ресурсные колонки (ярость / кости ки, движение) —
 * для них отдельные разборщики.
 */

export interface ClassTableColumn {
  key: string
  label: string
  /** колонка ячейки заклинаний (группа «Ячейки заклинаний») */
  slot?: boolean
  /** колонка умений — её ячейка хранит массив строк */
  feat?: boolean
}

export interface ClassTableRow {
  /** ячейки строго по порядку `columns`; для feat-колонки это string[] */
  cells: (string | string[])[]
}

export interface ClassTable {
  columns: ClassTableColumn[]
  rows: ClassTableRow[]
}

const HEADER_RE = /Уровень\s+ур\s+Бонус\s+мастерства/i
const HEADING_RE = /[А-ЯЁ]{2,}(?:[ ]+[А-ЯЁ]+)+/

const isProf = (t: string) => /^\+\d+$/.test(t)
const isLevel = (t: string) => /^\d+$/.test(t) && +t >= 1 && +t <= 20
const isNum = (t: string) => /^\d+$/.test(t) || t === '-' || t === '—'

/** «Умения через запятую» → массив умений. */
function featList(tokens: string[]): string[] {
  const t = tokens.join(' ').replace(/\s*,\s*/g, '§').trim()
  if (t === '' || t === '-' || t === '—') return []
  return t.split('§').map((s) => s.trim()).filter(Boolean)
}

const COL = {
  level: { key: 'level', label: 'Ур.' } as ClassTableColumn,
  prof: { key: 'prof', label: 'Бонус' } as ClassTableColumn,
  feat: { key: 'feat', label: 'Умения', feat: true } as ClassTableColumn,
}

/** Границы [start, end) таблицы в описании — для вырезки из прозы. */
export function findTableRange(description: string | null | undefined): [number, number] | null {
  if (!description) return null
  const m = HEADER_RE.exec(description)
  if (!m) return null
  const start = m.index
  const rest = description.slice(start)
  const hm = HEADING_RE.exec(rest)
  const end = hm ? start + hm.index : description.length
  return [start, end]
}

/** Индекс первой строки данных (уровень 1 + бонус). -1 если нет. */
function firstRowIndex(tokens: string[]): number {
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === '1' && isProf(tokens[i + 1])) return i
  }
  return -1
}

/* ---------- Варвар: … Умения | Ярость | Урон ярости ---------- */
function parseBarbarian(tokens: string[], hdrLen: number): ClassTable {
  const isVal = (t: string) => /^\+?\d+$/.test(t) || t === '—' || t === '-' || t === '∞' || t === 'Неограниченно'
  const rows: ClassTableRow[] = []
  let i = hdrLen
  for (let L = 1; L <= 20 && i < tokens.length; L++) {
    if (tokens[i] !== String(L) || !isProf(tokens[i + 1] ?? '')) break
    const level = tokens[i++]
    const prof = tokens[i++]
    const feat: string[] = []
    while (i < tokens.length && !isVal(tokens[i])) feat.push(tokens[i++])
    const rc: string[] = []
    while (i < tokens.length && !/^\+\d+$/.test(tokens[i])) rc.push(tokens[i++])
    let rage = rc.join(' ').trim() || '—'
    if (/Неограничен/i.test(rage)) rage = '∞'
    const dmg = /^\+\d+$/.test(tokens[i] ?? '') ? tokens[i++] : '—'
    rows.push({ cells: [level, prof, featList(feat), rage, dmg] })
  }
  return {
    columns: [COL.level, COL.prof, COL.feat, { key: 'rage', label: 'Ярость' }, { key: 'ragedmg', label: 'Урон яр.' }],
    rows,
  }
}

/* ---------- Монах: … Боевые искусства | Очки ци | Скорость | Умения ---------- */
function parseMonk(tokens: string[], hdrLen: number): ClassTable {
  const rows: ClassTableRow[] = []
  let i = hdrLen
  for (let L = 1; L <= 20 && i < tokens.length; L++) {
    if (tokens[i] !== String(L) || !isProf(tokens[i + 1] ?? '')) break
    const level = tokens[i++]
    const prof = tokens[i++]
    const die = tokens[i++] ?? '—' // «1к4» или «—»
    const ki = tokens[i++] ?? '—' // число или «—»
    let move = tokens[i++] ?? '—'
    if (/^\+\d+$/.test(move) && /^фут/i.test(tokens[i] ?? '')) {
      i++ // «футов»
      move += ' фт'
    }
    const feat: string[] = []
    while (
      i < tokens.length &&
      !(/^\d+$/.test(tokens[i]) && +tokens[i] === L + 1 && isProf(tokens[i + 1] ?? ''))
    ) {
      feat.push(tokens[i++])
    }
    rows.push({ cells: [level, prof, die, ki, move, featList(feat)] })
  }
  return {
    columns: [
      COL.level,
      COL.prof,
      { key: 'ma', label: 'Боевые иск.' },
      { key: 'ki', label: 'Очки ци' },
      { key: 'move', label: 'Скорость' },
      COL.feat,
    ],
    rows,
  }
}

/* ---------- Общий разбор (заклинатели / Воин / Плут) ---------- */
function parseGeneric(tokens: string[]): ClassTable | null {
  const starts: number[] = []
  for (let i = 0; i < tokens.length - 1; i++) {
    if (isLevel(tokens[i]) && isProf(tokens[i + 1]) && +tokens[i] === starts.length + 1) starts.push(i)
  }
  if (!starts.length) return null

  const header = tokens.slice(0, starts[0])
  const rowSlice = (si: number) => tokens.slice(starts[si], starts[si + 1] ?? tokens.length)

  const first = rowSlice(0).slice(2)
  let n = 0
  while (n < first.length && isNum(first[first.length - 1 - n])) n++

  const tail: number[] = []
  for (let j = header.length - 1; j >= 0; j--) {
    if (/^\d+$/.test(header[j])) tail.unshift(+header[j])
    else break
  }
  let slotCount = 0
  if (tail.length && tail[0] === 1 && tail.every((v, idx) => v === idx + 1)) slotCount = tail.length

  const knownCount = Math.max(0, n - slotCount)
  const hdr = header.join(' ')
  const found: { i: number; label: string }[] = []
  const pick = (re: RegExp, label: string) => {
    const mm = re.exec(hdr)
    if (mm) found.push({ i: mm.index, label })
  }
  pick(/Известные\s+инфузии/i, 'Инфузии')
  pick(/Инфузии\s+предметов/i, 'Инфузии предм.')
  pick(/Известные\s+заговор/i, 'Заговоры')
  pick(/Известные\s+заклинания/i, 'Заклинания')
  if (slotCount === 0) pick(/Ячейки\s+заклинаний/i, 'Ячейки')
  pick(/Уровень\s+ячеек/i, 'Ур. ячеек')
  pick(/воззвани/i, 'Воззвания')
  found.sort((a, b) => a.i - b.i)
  const knownLabels = found.map((f) => f.label)
  while (knownLabels.length < knownCount) knownLabels.push('—')
  knownLabels.length = knownCount

  const columns: ClassTableColumn[] = [COL.level, COL.prof, COL.feat]
  knownLabels.forEach((l, i) => columns.push({ key: `k${i}`, label: l }))
  for (let s = 1; s <= slotCount; s++) columns.push({ key: `s${s}`, label: String(s), slot: true })

  const rows: ClassTableRow[] = starts.map((_, si) => {
    const row = rowSlice(si)
    const body = row.slice(2)
    const trailing = n > 0 ? body.slice(body.length - n) : []
    const featTok = n > 0 ? body.slice(0, body.length - n) : body.slice()
    while (featTok.length && (isNum(featTok[0]) || /^\d+к\d+$/i.test(featTok[0]))) featTok.shift()
    const values = trailing.map((v) => (v === '-' ? '—' : v))
    return { cells: [row[0], row[1], featList(featTok), ...values] }
  })

  // защита от «грязных» таблиц: уровни по порядку и умения без числового мусора
  const levelsOk = rows.length >= 2 && rows.every((r, i) => +String(r.cells[0]) === i + 1)
  const featsOk = rows.every((r) => {
    const f = r.cells[2]
    return Array.isArray(f) && f.every((x) => !/[+]\d/.test(x) && !/^\d/.test(x) && !/\bфут/.test(x) && x.length < 90)
  })
  if (!levelsOk || !featsOk) return null

  return { columns, rows }
}

/** Разобрать таблицу из описания класса. null — если таблицы нет или она «грязная». */
export function parseClassTable(description: string | null | undefined): ClassTable | null {
  const range = findTableRange(description)
  if (!description || !range) return null
  const text = description.slice(range[0], range[1]).trim()
  const tokens = text.split(/\s+/).filter(Boolean)
  const hdrLen = firstRowIndex(tokens)
  if (hdrLen < 0) return null
  const hdr = tokens.slice(0, hdrLen).join(' ')

  if (/Боевые\s+искусства/i.test(hdr) && /Очки\s+ци/i.test(hdr)) return parseMonk(tokens, hdrLen)
  if (/Ярость/i.test(hdr) && /Урон\s+ярости/i.test(hdr)) return parseBarbarian(tokens, hdrLen)
  return parseGeneric(tokens)
}

/**
 * Вырезать таблицу из описания, чтобы её сырой текст не попал в прозу.
 * Режем всегда, когда таблица найдена — даже если разобрать её не удалось.
 */
export function stripClassTable(description: string | null | undefined): string {
  if (!description) return ''
  const range = findTableRange(description)
  if (!range) return description
  const [s, e] = range
  return (description.slice(0, s) + '\n\n' + description.slice(e)).trim()
}
