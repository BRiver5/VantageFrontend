import type { UploadResponse } from '../types/rooms'
import { ApiError, request } from './http'

/** Размер картинок в ответе: сервер подменяет ссылки на уменьшенные копии */
export type ImageQuality = 'high' | 'medium' | 'low'

/* ---------- Картинки ---------- */

/**
 * Загрузить картинку в хранилище (PNG, JPEG, GIF, WebP, SVG). В сущности
 * сохраняют `url` из ответа; уменьшенные копии сервер делает сам.
 */
export function uploadMedia(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadResponse>('/media/upload', { method: 'POST', body: form, auth: true }).catch((e: unknown) => {
    throw uploadError(e)
  })
}

/** Понятный текст ошибки загрузки: сервер проверяет содержимое и размер файла */
export function uploadError(e: unknown): unknown {
  if (!(e instanceof ApiError)) return e
  if (e.status === 413) return new ApiError('Файл больше 20 МБ', 413, e.body)
  if (e.status === 400) return new ApiError('Это не картинка: подойдут PNG, JPEG, GIF, WebP или SVG без скриптов', 400, e.body)
  return e
}

/**
 * Адрес нужного размера для картинки нашего хранилища. Нужен там, где `quality`
 * не работает, — в событиях WebSocket адреса всегда исходные. Чужие сайты, SVG и
 * уже уменьшенные копии не трогаем.
 */
export function imageVariant(url: string, quality: ImageQuality): string {
  const own = /\/media\/[^?#]+\.(png|jpe?g|gif|webp)$/i.test(url)
  const already = /\.(medium|low)\.webp$/i.test(url)
  return quality === 'high' || !own || already ? url : `${url}.${quality}.webp`
}

/** Плейсхолдер dnd.su вместо настоящей картинки */
export function realImage(urls: string[] | null | undefined): string | null {
  const u = urls?.find((x) => x && !x.includes('thumbnail'))
  return u ?? null
}

/**
 * Наши вырезанные фигуры лежат в `/media/`. Всё остальное (галерея dnd.su) —
 * картинка с фоном: её нельзя ставить «в полный рост», только в рамку.
 */
export function isFramedArt(src: string | null | undefined): boolean {
  return !!src && !src.includes('/media/')
}
