import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = { failed: boolean; message: string }

export default class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const diagnostic = `${error.name}: ${error.message}\n${error.stack || ''}\n${info.componentStack || ''}`
    try { localStorage.setItem('ev-last-ui-error', diagnostic) } catch { /* Storage may be disabled. */ }
    console.error('Application render failure', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="root-error" role="alert">
      <section>
        <span>EV BAKU</span>
        <h1>Интерфейс необходимо обновить</h1>
        <p>Браузер загрузил несовместимые версии модулей. Ваш аккаунт и объявления не повреждены.</p>
        <button type="button" onClick={() => window.location.reload()}>Обновить страницу</button>
        {this.state.message && <small>{this.state.message}</small>}
      </section>
    </main>
  }
}
