import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  lang: 'az' | 'en' | 'ru'
  onClose: () => void
}

type State = { failed: boolean }

const copy = {
  az: { title: 'Kabineti göstərmək mümkün olmadı', text: 'Daxil etdiyiniz məlumatları qorumaq üçün səhifəni yeniləyin və yenidən cəhd edin.', close: 'Kabineti bağla' },
  en: { title: 'The dashboard could not be displayed', text: 'Refresh the page and try again. The rest of the website is still available.', close: 'Close dashboard' },
  ru: { title: 'Не удалось отобразить кабинет', text: 'Обновите страницу и попробуйте ещё раз. Остальная часть сайта продолжает работать.', close: 'Закрыть кабинет' },
} as const

export default class UiErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard render failure', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const t = copy[this.props.lang]
    return <div className="account-backdrop dashboard-error-boundary" role="alert">
      <section><h2>{t.title}</h2><p>{t.text}</p><button type="button" onClick={this.props.onClose}>{t.close}</button></section>
    </div>
  }
}
