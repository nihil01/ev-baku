import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { SceneController } from './constructionScene'
import './ConstructionHero.css'

type Lang = 'az' | 'en' | 'ru'
type Props = { lang: Lang; active: boolean; onContinue: () => void; onAiSearch: (query: string) => void }
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const copy = {
  az: {
    eyebrow: 'BAKIDA SEÇİLMİŞ KİRAYƏ EVLƏRİ',
    line1: 'Ailən üçün', line2: 'doğru evi', line3: 'Bakıda tap.',
    description: 'Bakıda kirayə evini tap. Sevdiyin rayonu kəşf et, mənzillərə bax və özünə uyğun məkanı seç.',
    continue: 'Evləri kəşf et',
    aiPlaceholder: 'Məsələn: Yasamalda balkonlu, 3 otaqlı ev…', aiButton: 'AI ilə tap', voice: 'Səslə axtar', voiceError: 'Səsli axtarış bu brauzerdə dəstəklənmir',
    note: 'Mənzillər və evlər · Bakı', explore: 'Yeni ünvanına doğru',
    label: 'ŞƏHƏRİN YENİ RİTMİ', loading: 'Şəhər hazırlanır…', fallback: 'Memarlıq eskizi · 3D bu cihazda əlçatan deyil',
  },
  en: {
    eyebrow: 'CURATED RENTAL HOMES IN BAKU',
    line1: 'Find the right', line2: 'home for life', line3: 'in Baku.',
    description: 'Find your rental home in Baku. Explore the neighbourhoods, discover the homes, and choose a place that feels like you.',
    continue: 'Explore homes',
    aiPlaceholder: 'For example: a 3-room home with a balcony in Yasamal…', aiButton: 'Find with AI', voice: 'Search by voice', voiceError: 'Voice search is not supported in this browser',
    note: 'Apartments & houses · Baku', explore: 'Your next address awaits',
    label: 'A CITY IN THE MAKING', loading: 'Building your city…', fallback: 'Architectural sketch · 3D unavailable on this device',
  },
  ru: {
    eyebrow: 'ПРОВЕРЕННЫЕ ДОМА В АРЕНДУ В БАКУ',
    line1: 'Найди дом,', line2: 'в котором хочется', line3: 'жить.',
    description: 'Найди свой дом в аренду в Баку. Исследуй районы, посмотри квартиры и выбери место, в котором хочется остаться.',
    continue: 'Смотреть дома',
    aiPlaceholder: 'Например: трёхкомнатная с балконом в Ясамале…', aiButton: 'Найти с AI', voice: 'Голосовой поиск', voiceError: 'Голосовой поиск не поддерживается браузером',
    note: 'Квартиры и дома · Баку', explore: 'Навстречу новому адресу',
    label: 'НОВЫЙ РИТМ ГОРОДА', loading: 'Строим город…', fallback: 'Архитектурный эскиз · 3D недоступно на устройстве',
  },
}

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12h16m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export default function ConstructionHero({ lang, active, onContinue, onAiSearch }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controller = useRef<SceneController | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [reduced, setReduced] = useState(false)
  const [query, setQuery] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
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

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    if (query.trim()) onAiSearch(query.trim())
  }

  const startVoiceSearch = () => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) return setVoiceError(t.voiceError)
    const recognition = new Recognition()
    recognition.lang = lang === 'az' ? 'az-AZ' : lang === 'ru' ? 'ru-RU' : 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim()
      setQuery(transcript); setVoiceError('')
      if (transcript) onAiSearch(transcript)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    setListening(true)
    recognition.start()
  }

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
        <form className="hero-ai-search" onSubmit={submitSearch}>
          <span className="hero-ai-search__spark" aria-hidden="true">✦</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.aiPlaceholder} aria-label={t.aiPlaceholder} />
          <button type="button" className={listening ? 'listening' : ''} onClick={startVoiceSearch} aria-label={t.voice}>⌁</button>
          <button type="submit" disabled={!query.trim()}>{t.aiButton}<Arrow /></button>
        </form>
        {voiceError && <p className="hero-ai-search__error">{voiceError}</p>}
        <div className="construction-hero__actions">
          <button type="button" className="construction-hero__primary" onClick={onContinue}>{t.continue}<Arrow /></button>
        </div>
        <p className="construction-hero__note"><span aria-hidden="true">⌂</span>{t.note}</p>
      </div>

      <div className="construction-hero__visual">
        <div className="construction-hero__orbit construction-hero__orbit--one" aria-hidden="true" />
        <div className="construction-hero__orbit construction-hero__orbit--two" aria-hidden="true" />
        <div className="construction-hero__visual-frame">
          <div className="construction-hero__halo" aria-hidden="true" />
          <div className="construction-hero__scene" ref={hostRef} aria-hidden="true" />
        </div>
        <div className="construction-hero__badge"><strong>6</strong><span>BAKU<br />DISTRICTS</span></div>
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
