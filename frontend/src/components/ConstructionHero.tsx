import { useRef, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import ErrorToast from './ErrorToast'
import './ConstructionHero.css'

type Lang = 'az' | 'en' | 'ru'
type TransitionOrigin = { x: number; y: number }
type Props = { lang: Lang; onContinue: (origin: TransitionOrigin) => void; onAiSearch: (query: string, origin: TransitionOrigin) => void }
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
    label: 'ŞƏHƏRİN YENİ RİTMİ',
  },
  en: {
    eyebrow: 'CURATED RENTAL HOMES IN BAKU',
    line1: 'Find the right', line2: 'home for life', line3: 'in Baku.',
    description: 'Find your rental home in Baku. Explore the neighbourhoods, discover the homes, and choose a place that feels like you.',
    continue: 'Explore homes',
    aiPlaceholder: 'For example: a 3-room home with a balcony in Yasamal…', aiButton: 'Find with AI', voice: 'Search by voice', voiceError: 'Voice search is not supported in this browser',
    note: 'Apartments & houses · Baku', explore: 'Your next address awaits',
    label: 'A CITY IN THE MAKING',
  },
  ru: {
    eyebrow: 'ПРОВЕРЕННЫЕ ДОМА В АРЕНДУ В БАКУ',
    line1: 'Найди дом,', line2: 'в котором хочется', line3: 'жить.',
    description: 'Найди свой дом в аренду в Баку. Исследуй районы, посмотри квартиры и выбери место, в котором хочется остаться.',
    continue: 'Смотреть дома',
    aiPlaceholder: 'Например: трёхкомнатная с балконом в Ясамале…', aiButton: 'Найти с AI', voice: 'Голосовой поиск', voiceError: 'Голосовой поиск не поддерживается браузером',
    note: 'Квартиры и дома · Баку', explore: 'Навстречу новому адресу',
    label: 'НОВЫЙ РИТМ ГОРОДА',
  },
}

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12h16m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function StaticCityIllustration() {
  return <svg className="construction-hero__city" viewBox="0 0 620 620" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="city-sky" x1="110" y1="84" x2="510" y2="548" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F9E3A4" />
        <stop offset=".48" stopColor="#C8DDD0" />
        <stop offset="1" stopColor="#91BDC1" />
      </linearGradient>
      <linearGradient id="city-glass" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#7EA8A1" />
        <stop offset="1" stopColor="#4C7C73" />
      </linearGradient>
    </defs>
    <circle cx="310" cy="310" r="294" fill="url(#city-sky)" />
    <circle cx="188" cy="145" r="68" fill="#FFF6DE" fillOpacity=".7" />
    <path d="M58 466 310 356l252 110-252 108L58 466Z" fill="#DDE6DA" />
    <path d="m87 462 223-91 223 91-223 91-223-91Z" stroke="#F8F5E9" strokeWidth="5" />
    <path d="M310 371v182M87 462l223 91 223-91" stroke="#C1D2C7" strokeWidth="3" />
    <g stroke="#F8F5E9" strokeWidth="5" strokeLinejoin="round">
      <path d="m145 435 77-31v-176l-77 25v182Z" fill="#EDEBDD" />
      <path d="m222 404 72 30V251l-72-23v176Z" fill="#B6CBC0" />
      <path d="m222 228 72 23-77 25-72-23 77-25Z" fill="#FFF9E8" />
      <path d="m294 434 91-37V148l-91 29v257Z" fill="#E8E6D8" />
      <path d="m385 397 89 37V177l-89-29v249Z" fill="url(#city-glass)" />
      <path d="m385 148 89 29-91 30-89-30 91-29Z" fill="#FFF8E4" />
      <path d="m407 453 59-24V309l-59 19v125Z" fill="#EDEBDD" />
      <path d="m466 429 55 23V327l-55-18v120Z" fill="#8EB2AA" />
      <path d="m466 309 55 18-59 20-55-19 59-19Z" fill="#FFF8E4" />
    </g>
    <g stroke="#F8F5E9" strokeWidth="4" opacity=".92">
      {[270, 301, 332, 363].map((y) => <path key={`left-${y}`} d={`m145 ${y} 77-25 72 23`} />)}
      {[216, 252, 288, 324, 360].map((y) => <path key={`tower-${y}`} d={`m294 ${y} 91-29 89 29`} />)}
      {[350, 383, 416].map((y) => <path key={`right-${y}`} d={`m407 ${y} 59-19 55 18`} />)}
      <path d="M222 247v157M385 168v229M466 328v101" />
    </g>
    <g fill="#557E67">
      <circle cx="130" cy="455" r="17" /><circle cx="494" cy="464" r="19" /><circle cx="367" cy="493" r="14" />
    </g>
    <g stroke="#8A6A50" strokeWidth="5"><path d="M130 455v39M494 464v35M367 493v26" /></g>
  </svg>
}

export default function ConstructionHero({ lang, onContinue, onAiSearch }: Props) {
  const searchRef = useRef<HTMLFormElement>(null)
  const [query, setQuery] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const t = copy[lang]

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const rect = searchRef.current?.getBoundingClientRect()
    if (query.trim()) onAiSearch(query.trim(), { x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2, y: (rect?.top || 0) + (rect?.height || 0) / 2 })
  }

  const buttonOrigin = (element: HTMLButtonElement): TransitionOrigin => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
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
      const rect = searchRef.current?.getBoundingClientRect()
      if (transcript) onAiSearch(transcript, { x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2, y: (rect?.top || 0) + (rect?.height || 0) / 2 })
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    setListening(true)
    recognition.start()
  }

  return (
    <section className="construction-hero" aria-labelledby="hero-heading">
      <ErrorToast message={voiceError} lang={lang} onDismiss={() => setVoiceError('')} />
      <div className="construction-hero__color-cloud construction-hero__color-cloud--amber" aria-hidden="true" />
      <div className="construction-hero__color-cloud construction-hero__color-cloud--blue" aria-hidden="true" />
      <motion.div className="construction-hero__copy" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease: [.22, 1, .36, 1] }}>
        <div className="construction-hero__eyebrow"><span />{t.eyebrow}</div>
        <h1 id="hero-heading">
          <span>{t.line1}</span>
          <span>{t.line2}</span>
          <span className="construction-hero__accent">{t.line3}</span>
        </h1>
        <p className="construction-hero__description">{t.description}</p>
        <form className="hero-ai-search" ref={searchRef} onSubmit={submitSearch}>
          <span className="hero-ai-search__spark" aria-hidden="true">✦</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.aiPlaceholder} aria-label={t.aiPlaceholder} />
          <button type="button" className={listening ? 'listening' : ''} onClick={startVoiceSearch} aria-label={t.voice}>⌁</button>
          <button type="submit" disabled={!query.trim()}>{t.aiButton}<Arrow /></button>
        </form>
        <div className="construction-hero__actions">
          <button type="button" className="construction-hero__primary" onClick={(event) => onContinue(buttonOrigin(event.currentTarget))}><span>{t.continue}</span><Arrow /><i aria-hidden="true" /></button>
        </div>
        <p className="construction-hero__note"><span aria-hidden="true">⌂</span>{t.note}</p>
      </motion.div>

      <motion.div className="construction-hero__visual" initial={{ opacity: 0, scale: .88, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: .12, duration: .9, ease: [.22, 1, .36, 1] }}>
        <div className="construction-hero__orbit construction-hero__orbit--one" aria-hidden="true" />
        <div className="construction-hero__orbit construction-hero__orbit--two" aria-hidden="true" />
        <div className="construction-hero__visual-frame">
          <div className="construction-hero__halo" aria-hidden="true" />
          <StaticCityIllustration />
        </div>
      </motion.div>

      <div className="construction-hero__footer">
        <span className="construction-hero__footer-note"><span className="construction-hero__scroll" aria-hidden="true">↓</span>{t.explore}</span>
      </div>
    </section>
  )
}
