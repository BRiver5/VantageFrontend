/**
 * Рендер «сырого» HTML описания класса, который лежит в `description` на бэкенде
 * (выгружен из блока <div class="desc card__article-body"> с dnd.su).
 *
 * dnd.su отдаёт готовую разметку со своими классами (bigSectionTitle,
 * smallSectionTitle, tableTitle, table-wrapper/class_table/rolltable,
 * additionalInfo, спойлеры и т.п.). Мы НЕ перевёрстываем её в React-дерево, а
 * приводим в порядок в один проход по DOM (убираем скрипты, обработчики,
 * навигационные меню, интерактив), а стили этих классов переопределяем в CSS
 * (`.class-article …` в styles/class-pages.css). Спойлеры и свёрнутые блоки подклассов
 * превращаем в нативные <details>.
 */
import { useTermIndex } from './terms/terms'
import { createContext, useContext, useMemo, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { normSpellName, useSpellIndex } from './spellIndex'
import { type SubclassFeature, transformClassHtml, withTermTips } from './classArticleHtml'

/**
 * Статья показана внутри другого сценария (попап конструктора персонажа):
 * переходы на заклинания и подклассы открываем в новой вкладке, чтобы не
 * потерять то, что игрок уже собрал.
 */
export const OpenLinksInNewTab = createContext(false)

export function ClassArticle({
  html,
  cutSubclasses = true,
  subclassSectionHtml,
  subclassFeatures,
  isCaster = false,
  backLabel,
}: {
  html: string
  cutSubclasses?: boolean
  subclassSectionHtml?: string | null
  subclassFeatures?: SubclassFeature[]
  /** заклинательный класс — фиолетовые умения подкласса; иначе красные */
  isCaster?: boolean
  /** подпись для кнопки «назад» на странице заклинания (напр. имя класса/подкласса) */
  backLabel?: string
}) {
  const terms = useTermIndex()
  const safe = useMemo(
    () => withTermTips(transformClassHtml(html, { cutSubclasses, subclassSectionHtml: subclassSectionHtml ?? undefined, subclassFeatures }), terms),
    [html, cutSubclasses, subclassSectionHtml, subclassFeatures, terms],
  )

  const articleClass = `class-article${isCaster ? ' class-article--caster' : ' class-article--martial'}`

  const navigate = useNavigate()
  const location = useLocation()
  const spellIndex = useSpellIndex()
  const newTab = useContext(OpenLinksInNewTab)

  // Делегируем клики: заклинание (.ca-spell) → страница заклинания (id ищем в
  // индексе по названию ПРЯМО ПРИ КЛИКЕ — так работает и после возврата назад,
  // когда React пере-вставляет innerHTML и стирает разметку). Кнопка-умение
  // (.ca-link) → прокрутка к способности со вспышкой. На страницу заклинания
  // передаём, откуда пришли, чтобы там была кнопка «назад» именно сюда.
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    // термин D&D → его страница
    const term = (e.target as HTMLElement).closest<HTMLElement>('[data-term]')
    if (term?.dataset.term) {
      e.preventDefault()
      const to = `/terms/${term.dataset.term}`
      if (newTab) window.open(to, '_blank', 'noopener')
      else navigate(to)
      return
    }
    const spell = (e.target as HTMLElement).closest<HTMLElement>('.ca-spell')
    if (spell) {
      const id = spellIndex.get(normSpellName(spell.dataset.spell ?? ''))
      if (id && newTab) {
        window.open(`/spells/${id}`, '_blank', 'noopener')
      } else if (id) {
        navigate(`/spells/${id}`, {
          state: { from: location.pathname + location.search, fromLabel: backLabel },
        })
      }
      return
    }
    const link = (e.target as HTMLElement).closest<HTMLElement>('.ca-link')
    const targetId = link?.dataset.target
    if (!targetId) return
    const target = document.getElementById(targetId)
    if (!target) return
    // цель может лежать в свёрнутых разделах: раскрываем всю цепочку, иначе прокручивать некуда
    for (let d = target.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target.classList.add('ca-flash')
    window.setTimeout(() => target.classList.remove('ca-flash'), 1400)
  }

  return (
    <div className={articleClass} onClick={handleClick} dangerouslySetInnerHTML={{ __html: safe }} />
  )
}

