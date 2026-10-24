/**
 * Условие видимости поля поп-апа: `input.mode == 'plus11'`,
 * `input.mode != 'feat' and input.a != null`. Понимает `==`, `!=`, `and`,
 * `or`, `not`, скобки, `input.<ключ>` и литералы (строки, числа, true/false/null).
 * Что разобрать не удалось — считаем видимым: лучше лишнее поле, чем
 * спрятанное обязательное (сервер всё равно проверит ответ).
 */

type Tok = { t: 'id' | 'str' | 'num' | 'op' | 'lp' | 'rp'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
    } else if (ch === '(' || ch === ')') {
      out.push({ t: ch === '(' ? 'lp' : 'rp', v: ch })
      i++
    } else if (ch === "'" || ch === '"') {
      const end = src.indexOf(ch, i + 1)
      if (end < 0) throw new Error('строка без конца')
      out.push({ t: 'str', v: src.slice(i + 1, end) })
      i = end + 1
    } else if (src.startsWith('==', i) || src.startsWith('!=', i)) {
      out.push({ t: 'op', v: src.slice(i, i + 2) })
      i += 2
    } else if (/[-\d]/.test(ch)) {
      const m = /^-?\d+(\.\d+)?/.exec(src.slice(i))
      if (!m) throw new Error('число')
      out.push({ t: 'num', v: m[0] })
      i += m[0].length
    } else {
      const m = /^[A-Za-z_][\w.]*/.exec(src.slice(i))
      if (!m) throw new Error(`символ ${ch}`)
      out.push({ t: 'id', v: m[0] })
      i += m[0].length
    }
  }
  return out
}

export function evalVisibleIf(expr: string | null | undefined, input: Record<string, unknown>): boolean {
  if (!expr) return true
  try {
    const toks = tokenize(expr)
    let pos = 0
    const peek = () => toks[pos]
    const next = () => toks[pos++]

    const value = (): unknown => {
      const tok = next()
      if (!tok) throw new Error('конец')
      if (tok.t === 'lp') {
        const v = or()
        if (next()?.t !== 'rp') throw new Error('скобка')
        return v
      }
      if (tok.t === 'str') return tok.v
      if (tok.t === 'num') return Number(tok.v)
      if (tok.t === 'id') {
        if (tok.v === 'true') return true
        if (tok.v === 'false') return false
        if (tok.v === 'null' || tok.v === 'None') return null
        if (tok.v.startsWith('input.')) return input[tok.v.slice(6)] ?? null
        throw new Error(`неизвестно ${tok.v}`)
      }
      throw new Error('ожидалось значение')
    }
    const cmp = (): unknown => {
      const left = value()
      const op = peek()
      if (op?.t === 'op') {
        next()
        const right = value()
        const eq = left === right || String(left) === String(right)
        return op.v === '==' ? eq : !eq
      }
      return left
    }
    const not = (): unknown => {
      if (peek()?.t === 'id' && peek().v === 'not') {
        next()
        return !not()
      }
      return cmp()
    }
    const and = (): unknown => {
      let v = not()
      while (peek()?.t === 'id' && peek().v === 'and') {
        next()
        const r = not()
        v = Boolean(v) && Boolean(r)
      }
      return v
    }
    function or(): unknown {
      let v = and()
      while (peek()?.t === 'id' && peek().v === 'or') {
        next()
        const r = and()
        v = Boolean(v) || Boolean(r)
      }
      return v
    }
    const result = or()
    if (pos !== toks.length) throw new Error('лишнее')
    return Boolean(result)
  } catch {
    return true
  }
}
