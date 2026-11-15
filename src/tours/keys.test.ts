import { describe, expect, it } from 'vitest'
import { formatKeys } from './keys'

const table: Record<string, string[]> = { 'ruler.toggle': ['R'], 'search.open': ['Ctrl+K', '/'], 'ruler.up': [] }
const lookup = (id: string) => table[id] ?? []

describe('formatKeys', () => {
  it('подставляет текущую комбинацию', () => {
    expect(formatKeys('{key:ruler.toggle} включает линейку', lookup)).toBe('R включает линейку')
  })
  it('несколько комбинаций — через «или»', () => {
    expect(formatKeys('поиск — {key:search.open}', lookup)).toBe('поиск — Ctrl+K или /')
  })
  it('без комбинации — пометка', () => {
    expect(formatKeys('выше — {key:ruler.up}', lookup)).toBe('выше — (клавиша не назначена)')
  })
  it('текст без ключей не меняется', () => {
    expect(formatKeys('просто текст', lookup)).toBe('просто текст')
  })
})
