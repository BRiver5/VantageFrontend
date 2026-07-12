import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

async function waitForPaint() {
  if (document.fonts?.ready) await document.fonts.ready
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

interface RouteReadyGateProps {
  children: ReactNode
}

/** Не показываем страницу, пока шрифты и первый кадр не готовы — убирает чёрный экран при переходах. */
export default function RouteReadyGate({ children }: RouteReadyGateProps) {
  const { pathname } = useLocation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    setReady(false)

    waitForPaint().then(() => {
      if (alive) setReady(true)
    })

    return () => {
      alive = false
    }
  }, [pathname])

  return (
    <>
      {!ready && (
        <div className="page-boot" role="status" aria-live="polite" aria-busy="true">
          <p className="page-boot-text">Листаем кодекс…</p>
        </div>
      )}
      <div className={`page-routes${ready ? ' is-ready' : ' is-pending'}`} aria-hidden={!ready}>
        {children}
      </div>
    </>
  )
}
