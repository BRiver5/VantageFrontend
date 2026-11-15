import type { ScreenNote } from '../../types/rooms'
import { parsePage } from './mdparse'

/** Значок страницы из её текста; у страницы с уровнем limited текста нет */
export const iconOf = (n: { body?: ScreenNote['body'] }) => (n.body != null ? parsePage(n.body).meta.icon : undefined)
