/**
 * Личный канал: что изменилось в моих комнатах и заявках. Работает там, где сокета
 * комнаты нет, — на странице списка, в том числе пока заявку не приняли.
 *
 * Сообщения не нумеруются, поэтому после каждого подключения список надо перечитать:
 * за время обрыва могло произойти что угодно. Для этого есть onOpen.
 */
import { useEffect, useRef, useState } from 'react'
import { getAccessToken } from '../auth/token'
import { wsBase } from './roomSocket'

export interface RoomsChanged {
  room_id: string
  reason: string
  my_status?: string
  status?: string
  room_name?: string
}

const BACKOFF = [1000, 2000, 4000, 8000, 15000]
const HEARTBEAT_MS = 20000
const PONG_TIMEOUT_MS = 10000

/**
 * @param onChange вызывается и при изменении, и при каждом подключении (без аргумента)
 * @returns открыт ли канал: пока нет, вызывающий может подстраховаться опросом
 */
export function useMyRoomsChannel(onChange: (event?: RoomsChanged) => void): boolean {
  const [open, setOpen] = useState(false)
  const handler = useRef(onChange)
  useEffect(() => {
    handler.current = onChange
  })

  useEffect(() => {
    let stopped = false
    let ws: WebSocket | null = null
    let fails = 0
    let retry: ReturnType<typeof setTimeout> | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let pong: ReturnType<typeof setTimeout> | null = null

    const clearLive = () => {
      if (heartbeat) clearInterval(heartbeat)
      if (pong) clearTimeout(pong)
      heartbeat = pong = null
    }

    const connect = () => {
      const token = getAccessToken()
      if (stopped || !token) return
      const socket = new WebSocket(`${wsBase()}/me/ws`)
      ws = socket
      socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token }))
      socket.onmessage = (e) => {
        let msg: { type?: string; payload?: RoomsChanged }
        try {
          msg = JSON.parse(String(e.data))
        } catch {
          return
        }
        if (msg.type === 'hello') {
          fails = 0
          setOpen(true)
          handler.current()
          heartbeat = setInterval(() => {
            if (socket.readyState !== WebSocket.OPEN) return
            socket.send(JSON.stringify({ type: 'ping' }))
            if (pong) clearTimeout(pong)
            pong = setTimeout(() => socket.close(4000), PONG_TIMEOUT_MS)
          }, HEARTBEAT_MS)
        } else if (msg.type === 'pong') {
          if (pong) clearTimeout(pong)
          pong = null
        } else if (msg.type === 'rooms.changed' && msg.payload) {
          handler.current(msg.payload)
        }
      }
      socket.onclose = (e) => {
        clearLive()
        setOpen(false)
        if (stopped || e.code === 4401) return
        fails += 1
        retry = setTimeout(connect, BACKOFF[Math.min(fails - 1, BACKOFF.length - 1)] + Math.random() * 400)
      }
    }

    connect()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      clearLive()
      if (ws) {
        ws.onclose = ws.onmessage = ws.onopen = null
        ws.close(1000)
      }
    }
  }, [])

  return open
}
