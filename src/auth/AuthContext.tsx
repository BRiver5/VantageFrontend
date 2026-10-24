import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import {
  ApiError,
  getMe,
  login as apiLogin,
  patchMe,
  register as apiRegister,
  type LoginBody,
  type PatchMeBody,
  type RegisterBody,
  type UserMe,
} from '../api'
import { clearAccessToken, getAccessToken, setAccessToken, TOKEN_EXPIRED_EVENT } from './token'

type AuthContextValue = {
  user: UserMe | null
  token: string | null
  ready: boolean
  login: (body: LoginBody) => Promise<UserMe>
  register: (body: RegisterBody) => Promise<UserMe>
  logout: () => void
  refreshMe: () => Promise<UserMe | null>
  updateMe: (body: PatchMeBody) => Promise<UserMe>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null)
  const [token, setToken] = useState<string | null>(() => getAccessToken())
  const [ready, setReady] = useState(false)

  const refreshMe = useCallback(async () => {
    const t = getAccessToken()
    if (!t) {
      setUser(null)
      setToken(null)
      return null
    }
    try {
      const me = await getMe()
      setUser(me)
      setToken(t)
      return me
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearAccessToken()
        setUser(null)
        setToken(null)
      }
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (getAccessToken()) {
        await refreshMe()
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshMe])

  const login = useCallback(async (body: LoginBody) => {
    const res = await apiLogin(body)
    setAccessToken(res.access_token)
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const register = useCallback(async (body: RegisterBody) => {
    const res = await apiRegister(body)
    setAccessToken(res.access_token)
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    clearAccessToken()
    setToken(null)
    setUser(null)
  }, [])

  // любой запрос получил 401 с токеном — сессия кончилась, снова вход
  useEffect(() => {
    window.addEventListener(TOKEN_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(TOKEN_EXPIRED_EVENT, logout)
  }, [logout])

  const updateMe = useCallback(async (body: PatchMeBody) => {
    const me = await patchMe(body)
    setUser(me)
    return me
  }, [])

  const value = useMemo(
    () => ({ user, token, ready, login, register, logout, refreshMe, updateMe }),
    [user, token, ready, login, register, logout, refreshMe, updateMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    return (
      <div className="auth-gate">
        <p className="muted">Проверяем сессию…</p>
      </div>
    )
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <>{children}</>
}
