import { describe, expect, it } from 'vitest'
import { dndSuTarget } from './dndsuLinks'

describe('dndSuTarget', () => {
  it('глоссарий → термин, с поправкой расходящихся slug', () => {
    expect(dndSuTarget('/glossary/long-rest', 'Долгий отдых')).toEqual({ route: '/terms/long-rest' })
    expect(dndSuTarget('https://next.dnd.su/glossary/opportunity-attacks', 'атаки')).toEqual({ route: '/terms/opportunity-attack' })
    expect(dndSuTarget('/glossary/skill.perception', 'Восприятие')).toEqual({ route: '/terms/perception' })
  })

  it('список заклинаний класса по кругу', () => {
    expect(dndSuTarget('https://next.dnd.su/spells/?level=9&class=warlock', 'заклинание 9-го уровня')).toEqual({ route: '/spells?class=колдун&level=9' })
    expect(dndSuTarget('/spells/?class=12&level=0', 'списка заклинаний Барда')).toEqual({ route: '/spells?class=бард&level=0' })
    // класс не указан — берётся класс страницы
    expect(dndSuTarget('/spells/?level=3', 'заклинание', 'Колдун')).toEqual({ route: '/spells?class=колдун&level=3' })
  })

  it('черта: конкретная — поиск по названию, «черту» — каталог', () => {
    expect(dndSuTarget('/feats/320-ability-score-improvement/', 'Увеличение характеристик')).toEqual({
      find: 'feats',
      q: 'Увеличение характеристик',
      alt: 'ability score improvement',
      fallback: '/feats',
    })
    expect(dndSuTarget('/feats/', 'черту')).toEqual({ route: '/feats' })
    expect(dndSuTarget('/feats/?category=epic_boon', 'Эпических даров')).toEqual({ route: '/feats' })
  })

  it('существо — с английским именем из адреса', () => {
    expect(dndSuTarget('/bestiary/27369-eldritch-cannon', 'Мистическую пушку')).toMatchObject({ find: 'creatures', alt: 'eldritch cannon' })
  })

  it('механика и чужие сайты — без ссылки', () => {
    expect(dndSuTarget('/mechanics/spellcasting', 'статье')).toBeNull()
    expect(dndSuTarget('https://example.com/feats/1-x', 'x')).toBeNull()
  })
})
