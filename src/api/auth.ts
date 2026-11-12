import type {
  LoginBody,
  PatchMeBody,
  RegisterBody,
  TokenResponse,
  UserMe,
} from '../types/auth'
import { request } from './http'

/* ---------- Auth ---------- */

export function register(body: RegisterBody): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/register', { method: 'POST', body })
}

export function login(body: LoginBody): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/login', { method: 'POST', body })
}

export function getMe(): Promise<UserMe> {
  return request<UserMe>('/auth/me', { auth: true })
}

export function patchMe(body: PatchMeBody): Promise<UserMe> {
  return request<UserMe>('/auth/me', { method: 'PATCH', body, auth: true })
}

/** Загрузить файл-аватар: PNG, JPEG, GIF или WebP до 10 МБ (400 — не картинка, 413 — слишком большой) */
export function uploadAvatar(file: File): Promise<UserMe> {
  const form = new FormData()
  form.append('file', file)
  return request<UserMe>('/auth/me/avatar', { method: 'POST', body: form, auth: true })
}
