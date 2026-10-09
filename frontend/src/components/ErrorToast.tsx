import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Lang } from '../types/api'
import './ErrorToast.css'

const copy = {
  az: { title: 'Nəsə alınmadı', hint: 'Məlumatları yoxlayın və yenidən cəhd edin.', close: 'Bildirişi bağla' },
  en: { title: 'Something went wrong', hint: 'Check the details and try again.', close: 'Dismiss notification' },
  ru: { title: 'Что-то пошло не так', hint: 'Проверьте данные и попробуйте ещё раз.', close: 'Закрыть уведомление' },
} as const

type Props = {
  message: string
  lang: Lang
  onDismiss: () => void
  duration?: number
}

export default function ErrorToast({ message, lang, onDismiss, duration = 5000 }: Props) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => dismissRef.current(), duration)
    return () => window.clearTimeout(timer)
  }, [duration, message])

  if (typeof document === 'undefined') return null
  const t = copy[lang]
  const style = { '--toast-duration': `${duration}ms` } as CSSProperties

  return createPortal(
    <div className="error-toast-layer">
      <AnimatePresence initial={false}>
        {message && <motion.aside
          key={message}
          className="error-toast"
          role="alert"
          aria-atomic="true"
          style={style}
          initial={{ opacity: 0, x: 28, scale: .96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: .98 }}
          transition={{ duration: .3, ease: [.22, 1, .36, 1] }}
        >
          <div className="error-toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 8v4.5M12 16h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M10.3 3.8 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.8a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="error-toast__copy">
            <strong>{t.title}</strong>
            <p>{message}</p>
            <span>{t.hint}</span>
          </div>
          <button type="button" className="error-toast__close" onClick={onDismiss} aria-label={t.close}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <i className="error-toast__progress" aria-hidden="true" />
        </motion.aside>}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
