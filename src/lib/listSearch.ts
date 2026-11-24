/**
 * Состояние списка каталога (поиск, фильтры, сортировка, лист) в адресе записи:
 * /spells/ID?class=колдун&sort=-name. Страница записи им не пользуется, но несёт
 * с собой, чтобы ссылка «назад» вернула список таким, каким его оставили.
 */

/** Параметры самой записи — к списку не относятся */
const RECORD_PARAMS = ['ed', 'open', 'subclass'] as const

/** Параметры списка из адреса: строка с «?» или пустая */
export function listSearch(search: string | URLSearchParams): string {
  const params = new URLSearchParams(search)
  for (const key of RECORD_PARAMS) params.delete(key)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
