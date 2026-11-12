import { createContext, useContext } from 'react'
import type { ScreenNote } from '../../types/rooms'

/* ---------- хранилище ---------- */

export interface KnowledgeApi {
  notes: ScreenNote[] | null
  error: string | null
  isOpen: boolean
  current: string | null
  /** открыть базу (и страницу) */
  open: (id?: string | null) => void
  close: () => void
  create: (body: Partial<ScreenNote>) => Promise<ScreenNote | null>
  /** force — без проверки ревизии: «оставить мою» после конфликта */
  update: (id: string, patch: Partial<ScreenNote>, force?: boolean) => Promise<void>
  /** несколько заметок разом: всё или ничего */
  updateMany: (items: (Partial<ScreenNote> & { id: string })[]) => Promise<void>
  remove: (id: string) => Promise<void>
  setCurrent: (id: string | null) => void
}

export const Ctx = createContext<KnowledgeApi | null>(null)

export const useKnowledge = () => useContext(Ctx)

export const norm = (s: string) => s.trim().toLowerCase()

/** Страницу поменяли в другой вкладке: сервер отказал по ревизии */
export class NoteConflict extends Error {
  constructor() {
    super('Страницу изменили в другой вкладке')
  }
}
