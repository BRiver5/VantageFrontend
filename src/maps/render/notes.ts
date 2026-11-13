/** Метки на карте: значок в круге с цветом и подпись. «Видна всегда» рисуется поверх темноты */
import { glyphOf } from '../notes/icons'
import type { MapNote, MapSound } from '../layers/types'
import type { Pt } from '../types'
import type { View } from './types'

export function drawNotes(ctx: CanvasRenderingContext2D, notes: readonly MapNote[], v: View, opts: { aboveFog: boolean; selected?: string | null; isDm: boolean }) {
  for (const n of notes) {
    if (n.always_visible !== opts.aboveFog) continue
    const r = n.size / 2
    const tint = n.tint || '#f5d06a'
    ctx.save()
    ctx.globalAlpha = opts.isDm && n.hidden ? 0.5 : 1
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 6 / v.k
    ctx.fillStyle = 'rgba(26, 17, 11, 0.85)'
    ctx.beginPath()
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = opts.selected === n.id ? '#78c8ff' : tint
    ctx.lineWidth = Math.max(2 / v.k, r * 0.12)
    if (opts.isDm && n.hidden) ctx.setLineDash([4 / v.k, 4 / v.k])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `${Math.round(r * 1.1)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = tint
    ctx.fillText(glyphOf(n.icon), n.x, n.y + r * 0.05)
    const label = n.label || (opts.isDm ? n.page_title ?? '' : '')
    if (label) {
      const fs = Math.max(11 / v.k, Math.min(r * 0.7, 22))
      ctx.font = `600 ${fs}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      ctx.lineWidth = fs * 0.28
      ctx.strokeStyle = 'rgba(10, 6, 3, 0.9)'
      ctx.strokeText(label, n.x, n.y + r + 3 / v.k)
      ctx.fillStyle = '#f3e6c8'
      ctx.fillText(label, n.x, n.y + r + 3 / v.k)
    }
    ctx.restore()
  }
}

/** метка под курсором: последняя нарисованная сверху */
export function noteAt(notes: readonly MapNote[], p: Pt, k: number): MapNote | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]
    if (Math.hypot(n.x - p.x, n.y - p.y) <= Math.max(n.size / 2, 10 / k)) return n
  }
  return null
}

/** значки звуков местности (мастеру): радиус пунктиром, слушатель — кружок */
export function drawSoundMarkers(ctx: CanvasRenderingContext2D, sounds: readonly MapSound[], ppf: number, v: View, selected: string | null | undefined, listener: Pt | null | undefined) {
  for (const s of sounds) {
    ctx.save()
    ctx.globalAlpha = s.enabled ? 1 : 0.4
    ctx.strokeStyle = selected === s.id ? '#78c8ff' : '#8fd3c7'
    ctx.setLineDash([5 / v.k, 6 / v.k])
    ctx.lineWidth = 1.4 / v.k
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.radius_ft * ppf, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#1a2a28'
    ctx.lineWidth = (selected === s.id ? 3 : 1.6) / v.k
    ctx.beginPath()
    ctx.arc(s.x, s.y, 11 / v.k, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#8fd3c7'
    ctx.font = `${13 / v.k}px system-ui, "Segoe UI Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', s.x, s.y)
    ctx.restore()
  }
  if (listener) {
    ctx.save()
    ctx.strokeStyle = '#8fd3c7'
    ctx.lineWidth = 2 / v.k
    ctx.beginPath()
    ctx.arc(listener.x, listener.y, 7 / v.k, 0, Math.PI * 2)
    ctx.moveTo(listener.x - 11 / v.k, listener.y)
    ctx.lineTo(listener.x + 11 / v.k, listener.y)
    ctx.moveTo(listener.x, listener.y - 11 / v.k)
    ctx.lineTo(listener.x, listener.y + 11 / v.k)
    ctx.stroke()
    ctx.restore()
  }
}

export function soundAt(sounds: readonly MapSound[], p: Pt, k: number): MapSound | null {
  for (let i = sounds.length - 1; i >= 0; i--) if (Math.hypot(sounds[i].x - p.x, sounds[i].y - p.y) <= 13 / k) return sounds[i]
  return null
}
