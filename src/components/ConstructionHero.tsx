import { useEffect, useRef, useState } from 'react'
import type { SceneController } from './constructionScene'
import './ConstructionHero.css'

type Lang = 'az' | 'en' | 'ru'
type Props = { lang: Lang; active: boolean; onContinue: () => void }

const copy = {
  az: {
    eyebrow: 'BAKI · YAŞAMAQ ÜÇÜN YENİ BAXIŞ',
    line1: 'Şəhər böyüyür.', line2: 'Sənin hekayən', line3: 'burada başlayır.',
    description: 'Bakıda kirayə evini tap. Sevdiyin rayonu kəşf et, mənzillərə bax və özünə uyğun məkanı seç.',
    continue: 'Davam et',
    note: 'Mənzillər və evlər · Bakı', explore: 'Yeni ünvanına doğru',
    label: 'ŞƏHƏRİN YENİ RİTMİ', loading: 'Şəhər hazırlanır…', fallback: 'Memarlıq eskizi · 3D bu cihazda əlçatan deyil',
  },
  en: {
    eyebrow: 'BAKU · A NEW PERSPECTIVE ON LIVING',
    line1: 'A city growing.', line2: 'A new chapter.', line3: 'A place for you.',
    description: 'Find your rental home in Baku. Explore the neighbourhoods, discover the homes, and choose a place that feels like you.',
    continue: 'Continue',
    note: 'Apartments & houses · Baku', explore: 'Your next address awaits',
    label: 'A CITY IN THE MAKING', loading: 'Building your city…', fallback: 'Architectural sketch · 3D unavailable on this device',
  },
  ru: {
    eyebrow: 'БАКУ · НОВЫЙ ВЗГЛЯД НА ЖИЗНЬ',
    line1: 'Город растёт.', line2: 'Твоя история', line3: 'начинается здесь.',
    description: 'Найди свой дом в аренду в Баку. Исследуй районы, посмотри квартиры и выбери место, в котором хочется остаться.',
    continue: 'Продолжить',
    note: 'Квартиры и дома · Баку', explore: 'Навстречу новому адресу',
    label: 'НОВЫЙ РИТМ ГОРОДА', loading: 'Строим город…', fallback: 'Архитектурный эскиз · 3D недоступно на устройстве',
  },
}

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12h16m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export default function ConstructionHero({ lang, active, onContinue }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controller = useRef<SceneController | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [reduced, setReduced] = useState(false)
  const t = copy[lang]

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let cancelled = false
    // Three.js is a separate chunk: the heading and buttons render immediately.
    import('./constructionScene').then(({ createConstructionScene }) => {
      if (cancelled || !hostRef.current) return
      try {
        controller.current = createConstructionScene(hostRef.current, () => {})
        setStatus('ready')
      } catch {
        hostRef.current.replaceChildren()
        setStatus('fallback')
      }
    }).catch(() => { if (!cancelled) setStatus('fallback') })
    return () => {
      cancelled = true
      controller.current?.dispose()
      controller.current = null
    }
  }, [])

  useEffect(() => {
    controller.current?.setReducedMotion(reduced)
    controller.current?.setPaused(!active)
  }, [active, reduced, status])

  return (
    <section className="construction-hero" aria-labelledby="hero-heading">
      <div className="construction-hero__copy">
        <div className="construction-hero__eyebrow"><span />{t.eyebrow}</div>
        <h1 id="hero-heading">
          <span>{t.line1}</span>
          <span>{t.line2}</span>
          <span className="construction-hero__accent">{t.line3}</span>
        </h1>
        <p className="construction-hero__description">{t.description}</p>
        <div className="construction-hero__actions">
          <button type="button" className="construction-hero__primary" onClick={onContinue}>{t.continue}<Arrow /></button>
        </div>
        <p className="construction-hero__note"><span aria-hidden="true">⌂</span>{t.note}</p>
      </div>

      <div className="construction-hero__visual">
        <div className="construction-hero__halo" aria-hidden="true" />
        <div className="construction-hero__scene" ref={hostRef} aria-hidden="true" />
        {status !== 'ready' && <div className="construction-hero__fallback" role="status">
          <svg viewBox="0 0 260 360" fill="none" aria-hidden="true">
            <path d="m45 305 85 35 90-38V100l-90-35-85 35v205Z" fill="#dde5dc" />
            <path d="m130 340 90-38V100l-90 32v208Z" fill="#9ebbb3" />
            {Array.from({ length: 15 }, (_, i) => <path key={i} d={`m45 ${108 + i * 13} 85 32 90-32`} stroke="#f4f5ef" strokeWidth="3" />)}
            <path d="M130 340V132m-85-32 85 32 90-32M80 310V114m95 206V116" stroke="#f4f5ef" strokeWidth="3" />
          </svg>
          <span>{status === 'loading' ? t.loading : t.fallback}</span>
        </div>}
      </div>

      <div className="construction-hero__footer">
        <span className="construction-hero__footer-note"><span className="construction-hero__scroll" aria-hidden="true">↓</span>{t.explore}</span>
        <span className="construction-hero__footer-label">{t.label}<i />BAKU, AZ</span>
      </div>
    </section>
  )
}
