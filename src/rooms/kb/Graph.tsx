/**
 * Граф базы знаний: страницы — узлы, ссылки [[…]] — нити. Раскладка — простая
 * силовая модель (отталкивание, пружины, тяга к центру) без библиотек; цвет
 * узла — по верхней папке, размер — по числу связей. Колесо — масштаб,
 * перетаскивание фона — сдвиг, узел можно тащить, клик открывает страницу.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'

export interface GraphNode {
  id: string
  title: string
  folder: string
  icon?: string
}
export interface GraphEdge {
  from: string
  to: string
}

interface Sim {
  x: number
  y: number
  vx: number
  vy: number
  fixed: boolean
}

const PALETTE = ['#d9a441', '#c8493c', '#5f9e6e', '#6f8fd6', '#a678d6', '#d67aa6', '#4fb3b3', '#c98a52']

export function KnowledgeGraph({ nodes, edges, current, onOpen }: { nodes: GraphNode[]; edges: GraphEdge[]; current: string | null; onOpen: (id: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [, setFrame] = useState(0)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<string | null>(null)
  const sim = useRef(new Map<string, Sim>())
  const drag = useRef<{ id: string | null; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null)

  const folders = useMemo(() => [...new Set(nodes.map((n) => n.folder.split('/')[0] || ''))], [nodes])
  const color = (n: GraphNode) => (n.folder ? PALETTE[folders.indexOf(n.folder.split('/')[0]) % PALETTE.length] : '#b9ad95')
  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of edges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1)
      d.set(e.to, (d.get(e.to) ?? 0) + 1)
    }
    return d
  }, [edges])
  const near = useMemo(() => {
    if (!hover) return null
    const s = new Set([hover])
    for (const e of edges) {
      if (e.from === hover) s.add(e.to)
      if (e.to === hover) s.add(e.from)
    }
    return s
  }, [hover, edges])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // новые узлы — по кругу своей папки; ушедшие — убрать
  useEffect(() => {
    const m = sim.current
    const ids = new Set(nodes.map((n) => n.id))
    for (const id of [...m.keys()]) if (!ids.has(id)) m.delete(id)
    nodes.forEach((n, i) => {
      if (m.has(n.id)) return
      const f = folders.indexOf(n.folder.split('/')[0] || '')
      const a = (f / Math.max(1, folders.length)) * Math.PI * 2 + i * 0.37
      const r = 120 + (i % 7) * 18
      m.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, fixed: false })
    })
  }, [nodes, folders])

  // симуляция: остывает за пару секунд, оживает при перетаскивании
  const heat = useRef(1)
  useEffect(() => {
    let raf = 0
    const step = () => {
      const m = sim.current
      const list = nodes.map((n) => [n.id, m.get(n.id)!] as const).filter(([, s]) => s)
      const alpha = heat.current
      if (alpha > 0.01) {
        for (let i = 0; i < list.length; i++) {
          const a = list[i][1]
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j][1]
            let dx = a.x - b.x
            let dy = a.y - b.y
            let d2 = dx * dx + dy * dy
            if (d2 < 1) {
              dx = Math.random() - 0.5
              dy = Math.random() - 0.5
              d2 = 1
            }
            const f = (2600 / d2) * alpha
            const d = Math.sqrt(d2)
            a.vx += (dx / d) * f
            a.vy += (dy / d) * f
            b.vx -= (dx / d) * f
            b.vy -= (dy / d) * f
          }
        }
        for (const e of edges) {
          const a = m.get(e.from)
          const b = m.get(e.to)
          if (!a || !b) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = (d - 90) * 0.02 * alpha
          a.vx += (dx / d) * f
          a.vy += (dy / d) * f
          b.vx -= (dx / d) * f
          b.vy -= (dy / d) * f
        }
        for (const [, s] of list) {
          s.vx -= s.x * 0.004 * alpha
          s.vy -= s.y * 0.004 * alpha
          if (!s.fixed) {
            s.x += s.vx
            s.y += s.vy
          }
          s.vx *= 0.6
          s.vy *= 0.6
        }
        heat.current *= 0.985
        setFrame((f) => f + 1)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [nodes, edges])
  useEffect(() => {
    heat.current = 1
  }, [nodes.length, edges.length])

  const toWorld = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: (cx - r.left - size.w / 2 - view.x) / view.k, y: (cy - r.top - size.h / 2 - view.y) / view.k }
  }
  const down = (e: RPointerEvent, id: string | null) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { id, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
    if (id) {
      const s = sim.current.get(id)
      if (s) s.fixed = true
      heat.current = Math.max(heat.current, 0.4)
    }
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true
    if (d.id) {
      const s = sim.current.get(d.id)
      if (s) Object.assign(s, toWorld(e.clientX, e.clientY))
      heat.current = Math.max(heat.current, 0.3)
    } else setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }))
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d?.id) return
    const s = sim.current.get(d.id)
    if (s) s.fixed = false
    if (!d.moved) onOpen(d.id)
  }

  const pos = (id: string) => sim.current.get(id) ?? { x: 0, y: 0 }
  return (
    <div
      className="kb-graph"
      ref={wrap}
      onPointerDown={(e) => down(e, null)}
      onPointerMove={move}
      onPointerUp={up}
      onWheel={(e) => setView((v) => ({ ...v, k: Math.max(0.3, Math.min(3, v.k * (e.deltaY < 0 ? 1.12 : 0.89))) }))}
    >
      <svg width={size.w} height={size.h} role="img" aria-label="Граф связей между страницами">
        <defs>
          <radialGradient id="kb-glow">
            <stop offset="0%" stopColor="#fff2c4" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff2c4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${size.w / 2 + view.x} ${size.h / 2 + view.y}) scale(${view.k})`}>
          {edges.map((e, i) => {
            const a = pos(e.from)
            const b = pos(e.to)
            const lit = near && near.has(e.from) && near.has(e.to)
            return <line key={i} className={`kb-edge${lit ? ' is-lit' : near ? ' is-dim' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          })}
          {nodes.map((n) => {
            const p = pos(n.id)
            const r = 5 + Math.min(10, Math.sqrt(degree.get(n.id) ?? 0) * 3)
            const dim = near && !near.has(n.id)
            return (
              <g
                key={n.id}
                className={`kb-node${n.id === current ? ' is-current' : ''}${dim ? ' is-dim' : ''}`}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => down(e, n.id)}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover(null)}
              >
                {n.id === current && <circle r={r * 2.6} fill="url(#kb-glow)" />}
                <circle r={r} fill={color(n)} />
                <text y={r + 13}>{n.icon ? `${n.icon} ` : ''}{n.title}</text>
              </g>
            )
          })}
        </g>
      </svg>
      {nodes.length === 0 && <p className="kb-graph-empty">Создайте страницы и свяжите их ссылками [[…]] — здесь вырастет гроздь</p>}
      <div className="kb-graph-legend">
        {folders.map((f, i) => (
          <span key={f || '—'}>
            <i style={{ background: f ? PALETTE[i % PALETTE.length] : '#b9ad95' }} /> {f || 'без папки'}
          </span>
        ))}
      </div>
    </div>
  )
}
