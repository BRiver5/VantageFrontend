/**
 * Связь меток карты с базой знаний мастера (она живёт в ширме, карта — на
 * столе, общих предков у них нет):
 * - openKbPage — клик по метке открывает страницу в базе знаний;
 * - showPageOnMap — «Показать на карте» со страницы: камера к её метке;
 * - placePageOnMap — «Поставить на карту»: следующий клик по карте ставит метку.
 */
type Fn<T> = (v: T) => boolean | void

function channel<T>() {
  const ls = new Set<Fn<T>>()
  return {
    emit: (v: T) => {
      let handled = false
      ls.forEach((fn) => {
        if (fn(v) !== false) handled = true
      })
      return handled
    },
    on: (fn: Fn<T>) => {
      ls.add(fn)
      return () => {
        ls.delete(fn)
      }
    },
  }
}

const open = channel<string>()
const show = channel<string>()
const place = channel<{ pageId: string; title: string }>()

/** открыть страницу в базе знаний; false — базы нет на экране */
export const openKbPage = (pageId: string) => open.emit(pageId)
export const onOpenKbPage = open.on

/** камера к метке страницы на активной карте; false — на ней метки нет */
export const showPageOnMap = (pageId: string) => show.emit(pageId)
export const onShowPageOnMap = show.on

/** следующий клик по карте ставит метку этой страницы */
export const placePageOnMap = (pageId: string, title: string) => place.emit({ pageId, title })
export const onPlacePageOnMap = place.on

/** перетаскивание страницы из дерева базы знаний */
export const KB_PAGE_MIME = 'text/x-kb-page'
