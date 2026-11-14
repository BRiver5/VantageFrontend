/** Типы страниц базы знаний: подписи и поля по умолчанию (сервер — schemas/room_screen.py) */
import type { NpcAttitude, NpcFields, PageType, QuestFields, QuestStatus, ScreenNote, SharedNote, ShopFields } from '../../types/rooms'
import type { EmbedKind } from './mdparse'

export const PAGE_TYPES: { id: PageType; label: string; icon: string }[] = [
  { id: 'page', label: 'Страница', icon: '📄' },
  { id: 'quest', label: 'Квест', icon: '📜' },
  { id: 'npc', label: 'НИП', icon: '🧙' },
  { id: 'shop', label: 'Лавка', icon: '💰' },
]

export const QUEST_STATUS: Record<QuestStatus, string> = { active: 'активен', completed: 'выполнен', failed: 'провален', hidden: 'скрыт' }
export const ATTITUDE: Record<NpcAttitude, string> = { friendly: 'дружелюбен', neutral: 'нейтрален', hostile: 'враждебен', unknown: 'неизвестно' }

export const QUEST_DEFAULT: QuestFields = { status: 'active', objectives: [], rewards: '', giver_page_id: null }
export const NPC_DEFAULT: NpcFields = { portrait: null, attitude: 'unknown', role: '', location_page_id: null, location: '', creature_id: null }
export const SHOP_DEFAULT: ShopFields = { open: false, buy_multiplier: 1, sell_multiplier: 0.5, merchant_page_id: null }

export const pageTypeOf = (n: Pick<ScreenNote, 'page_type'> | Pick<SharedNote, 'page_type'>): PageType => n.page_type ?? 'page'

/** Поля, которые надо записать при смене типа: у нового типа появляются поля по умолчанию */
export function typePatch(note: Pick<ScreenNote, 'quest' | 'npc' | 'shop'>, next: PageType): Partial<ScreenNote> {
  const patch: Partial<ScreenNote> = { page_type: next }
  if (next === 'quest' && !note.quest) patch.quest = QUEST_DEFAULT
  if (next === 'npc' && !note.npc) patch.npc = NPC_DEFAULT
  if (next === 'shop' && !note.shop) patch.shop = SHOP_DEFAULT
  return patch
}

export const newObjectiveId = () => Math.random().toString(36).slice(2, 10)

/** Раздел поиска каталога → вид встраивания */
export const ENTITY_EMBED: Record<string, EmbedKind> = { items: 'item', equipment: 'equipment', creatures: 'creature', spells: 'spell' }
