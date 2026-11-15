export type UserRole = 'user' | 'admin'
export type Locale = 'ru' | 'en'
export type CharacterVisibility = 'private' | 'unlisted' | 'public'

export type DicePreferences = {
  body_color: string
  accent_color: string
  number_color: string
}

/** Доступность, общая для всех устройств человека (настройки «Мой профиль») */
export type InterfacePreferences = {
  reduce_motion: boolean
  photosensitive: boolean
}

export type UserPreferences = {
  dice: DicePreferences
  locale: Locale
  default_character_visibility: CharacterVisibility
  /** нет у старых ответов сервера — тогда значения по умолчанию */
  interface?: InterfacePreferences
}

export type UserMe = {
  id: string
  email: string
  nickname: string
  display_name: string
  avatar_url: string | null
  /** показывать картинку своего персонажа (только в /auth/me) */
  avatar_character_id?: string | null
  bio: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
  preferences: UserPreferences
}

export type PublicUser = {
  id: string
  nickname: string
  display_name: string
  avatar_url: string | null
  bio: string
}

export type TokenResponse = {
  access_token: string
  token_type: string
  user: UserMe
}

export type RegisterBody = {
  email: string
  password: string
  nickname: string
  display_name: string
}

export type LoginBody = {
  email: string
  password: string
}

export type PatchMeBody = {
  display_name?: string
  avatar_url?: string | null
  avatar_character_id?: string | null
  bio?: string
  /** частичное обновление на любой глубине: остальные поля сервер не трогает */
  preferences?: Partial<Omit<UserPreferences, 'dice' | 'interface'>> & {
    dice?: Partial<DicePreferences>
    interface?: Partial<InterfacePreferences>
  }
}

export const DEFAULT_DICE_PREFERENCES: DicePreferences = {
  body_color: '#1a1a2e',
  accent_color: '#e94560',
  number_color: '#ffffff',
}
