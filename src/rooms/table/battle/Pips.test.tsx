import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Pips } from './Pips'

const html = (props: Parameters<typeof Pips>[0]) => renderToStaticMarkup(createElement(Pips, props))

describe('Pips', () => {
  it('пока идёт запрос боя, легендарные не тратятся второй раз', () => {
    const busy = html({ n: 3, left: 2, kind: 'action', onSpend: () => {}, disabled: true })
    expect(busy.match(/<button[^>]*disabled/g)).toHaveLength(3)
    const idle = html({ n: 3, left: 2, kind: 'action', onSpend: () => {} })
    expect(idle).not.toContain('disabled')
  })
  it('без мастера — только точки', () => {
    expect(html({ n: 2, left: 1, kind: 'resistance' })).not.toContain('<button')
  })
})
