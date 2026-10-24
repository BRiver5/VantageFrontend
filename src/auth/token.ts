const TOKEN_KEY = 'vantage-access-token'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Токен истёк (обновления нет — 7 дней): API сообщает, AuthProvider выходит */
export const TOKEN_EXPIRED_EVENT = 'vantage:token-expired'
