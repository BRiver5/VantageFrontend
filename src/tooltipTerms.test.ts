import { describe, expect, it } from 'vitest'
import { tooltipTerm } from './classArticleHtml'

describe('tooltipTerm', () => {
  it('подсказки dnd.su → термины Vantage', () => {
    expect(tooltipTerm('skill.performance')).toBe('performance')
    expect(tooltipTerm('skill.deception')).toBe('deception')
    expect(tooltipTerm('skill.animal')).toBe('animal-handling')
    expect(tooltipTerm('light.dim')).toBe('dim-light')
    expect(tooltipTerm('condition.prone')).toBe('prone')
    expect(tooltipTerm('cover.half')).toBe('cover')
    expect(tooltipTerm('option.')).toBeNull()
    expect(tooltipTerm('tools.brewer')).toBeNull()
  })
})
