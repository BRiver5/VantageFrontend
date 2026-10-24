/**
 * Определения способностей движка (`/abilities`) и подписи переменных листа.
 * Кэшируются на уровне модуля: одна и та же способность встречается на листе,
 * в карточке расы и в статье класса.
 */
import { useEffect, useState } from 'react'
import { request } from '../api'

export interface AbilityModifier {
  target: string
  op: string
  value: string
  when?: string | null
}

export interface AbilityCost {
  path: string
  amount: string | number
}

export interface AbilityAction {
  key: string
  label: string
  description?: string | null
  action_economy?: string
  cost?: AbilityCost[]
}

export interface AbilityDeclaration {
  kind: string
  key: string
  label?: string
  max?: string | number | null
  recharge?: { on: string; amount?: string | null }[]
}

export interface AbilityChoice {
  key: string
  min_level?: number
  prompt: { title: string }
}

export interface AbilityDef {
  id?: string
  slug: string
  name: string
  description: string
  summary?: string | null
  tags: string[]
  source_kind?: string | null
  implementation_status: string
  requires?: string | null
  choices: AbilityChoice[]
  declares: AbilityDeclaration[]
  modifiers: AbilityModifier[]
  actions: AbilityAction[]
  listeners: { on: string }[]
  includes?: string[]
}

/** Ссылка источника (класс, раса, черта…) на способность */
export interface AbilityRef {
  slug: string
  level_required?: number
  optional?: boolean
}

const bySlug = new Map<string, Promise<AbilityDef | null>>()
const byTag = new Map<string, Promise<AbilityDef[]>>()

export function getAbility(slug: string): Promise<AbilityDef | null> {
  let p = bySlug.get(slug)
  if (!p) {
    p = request<AbilityDef>(`/abilities/by-slug/${encodeURIComponent(slug)}`).catch(() => null)
    bySlug.set(slug, p)
  }
  return p
}

/** Постранично по 500 (максимум API) — у класса со всеми подклассами их бывает за сотню */
async function fetchByTag(tag: string): Promise<AbilityDef[]> {
  const out: AbilityDef[] = []
  for (let skip = 0; skip < 3000; skip += 500) {
    const page = await request<{ items: AbilityDef[]; total: number }>(
      `/abilities?tag=${encodeURIComponent(tag)}&skip=${skip}&limit=500`,
    )
    out.push(...page.items)
    if (out.length >= page.total || page.items.length === 0) break
  }
  return out
}

/** Все способности с тегом (тег класса — «fighter»); заодно наполняют кэш по slug */
export function getAbilitiesByTag(tag: string): Promise<AbilityDef[]> {
  let p = byTag.get(tag)
  if (!p) {
    p = fetchByTag(tag)
      .then((list) => {
        for (const a of list) if (!bySlug.has(a.slug)) bySlug.set(a.slug, Promise.resolve(a))
        return list
      })
      .catch(() => {
        byTag.delete(tag)
        return []
      })
    byTag.set(tag, p)
  }
  return p
}

/** Определения по списку slug (порядок сохраняется, не найденные пропускаются) */
export function useAbilities(slugs: string[]): { items: AbilityDef[]; loading: boolean } {
  const key = slugs.join('|')
  const [state, setState] = useState<{ key: string; items: AbilityDef[] }>({ key: '', items: [] })
  useEffect(() => {
    if (!key) return
    let alive = true
    Promise.all(key.split('|').map(getAbility)).then((list) => {
      if (alive) setState({ key, items: list.filter((a): a is AbilityDef => !!a) })
    })
    return () => {
      alive = false
    }
  }, [key])
  return { items: state.key === key ? state.items : [], loading: !!key && state.key !== key }
}

export function useAbility(slug: string | null | undefined): AbilityDef | null {
  const { items } = useAbilities(slug ? [slug] : [])
  return items[0] ?? null
}
