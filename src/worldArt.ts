/**
 * Мир кампании, в книге которого появилась сущность (раса и т.п.), — для
 * фоновых обоев страниц и попапов. Книги и сеттинги грузятся один раз на всё
 * приложение: списки маленькие, а нужны и каталогу, и визарду.
 */
import { useEffect, useState } from 'react'
import { getBooks, getSettings, settingPictureUrl, splitTitle } from './api'
import type { Book, Setting } from './api'

export interface BookWorld {
  /** id сеттинга; null — мир подставлен по умолчанию, ссылки на него не даём */
  id: string | null
  name: string
  art: string
}

interface Worlds {
  books: Map<string, Book>
  settings: Map<string, Setting>
  home: Setting | null
}

let worldsPromise: Promise<Worlds> | null = null

function loadWorlds(): Promise<Worlds> {
  if (!worldsPromise) {
    worldsPromise = Promise.all([getBooks(), getSettings()])
      .then(([books, settings]) => ({
        books: new Map(books.map((b) => [b.id, b])),
        settings: new Map(settings.map((st) => [st.id, st])),
        home: settings.find((st) => splitTitle(st.settings_title).en === 'Forgotten Realms') ?? null,
      }))
      .catch((e: unknown) => {
        // не кэшируем ошибку — следующий вызов попробует снова
        worldsPromise = null
        throw e
      })
  }
  return worldsPromise
}

function toWorld(setting: Setting, linked: boolean): BookWorld {
  return {
    id: linked ? setting.id : null,
    name: splitTitle(setting.settings_title).ru,
    art: settingPictureUrl(setting, 1600, 720),
  }
}

/**
 * Мир книги. У базовых книг (Книга игрока, Воло, Морденкайнен) сеттинг не
 * указан — тогда, если `fallbackHome`, берём Забытые королевства, мир 5e по
 * умолчанию, но без id: это допущение, а не данные.
 */
export function useBookWorld(
  bookId: string | null | undefined,
  { fallbackHome = true }: { fallbackHome?: boolean } = {},
): BookWorld | null {
  const [world, setWorld] = useState<{ key: string; world: BookWorld | null } | null>(null)

  useEffect(() => {
    if (!bookId) return
    let alive = true
    loadWorlds()
      .then(({ books, settings, home }) => {
        const book = books.get(bookId)
        const setting = book?.settings_id ? settings.get(book.settings_id) : undefined
        const next = setting
          ? toWorld(setting, true)
          : book && fallbackHome && home
            ? toWorld(home, false)
            : null
        if (alive) setWorld({ key: bookId, world: next })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [bookId, fallbackHome])

  // ответ для прошлой книги не показываем, пока не пришёл новый
  return bookId && world?.key === bookId ? world.world : null
}
