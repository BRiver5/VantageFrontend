import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
  message?: string
  stack?: string
}

/**
 * Подстраховка: если что-то падает при отрисовке — показываем экран с ТЕКСТОМ
 * ошибки (чтобы можно было прочитать/скопировать реальную причину), а не «чёрный
 * экран». Основную причину (расширения, меняющие DOM) лечат notranslate в
 * index.html и src/domGuard.ts.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    const e = error as { message?: string; stack?: string }
    return { hasError: true, message: e?.message, stack: e?.stack }
  }

  componentDidCatch(error: unknown) {
    console.error('Перехвачена ошибка отрисовки:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="crash-screen" role="alert">
          <h1 className="crash-title gold-text">Что-то пошло не так</h1>
          <p className="crash-text">Страница не смогла отрисоваться.</p>
          <button type="button" className="crash-btn" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
          {this.state.message && (
            <pre className="crash-detail">
              {this.state.message}
              {this.state.stack ? `\n\n${this.state.stack}` : ''}
            </pre>
          )}
          <p className="crash-hint">
            Похоже, страницу меняет расширение браузера (переводчик / Grammarly / Dark Reader).
            Скопируй текст ошибки выше и пришли мне — по нему я точно определю причину.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
