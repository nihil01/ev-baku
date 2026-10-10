import { useEffect, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import ErrorToast from './ErrorToast'
import { api, apiUrl, ApiError, type LandingVideo } from '../lib/api'
import type { AiSearchResponse } from '../types/api'
import './ConstructionHero.css'

type Lang = 'az' | 'en' | 'ru'
type TransitionOrigin = { x: number; y: number }
type Props = { lang: Lang; onContinue: (origin: TransitionOrigin) => void; onAiSearch: (query: string, origin: TransitionOrigin, results?: AiSearchResponse) => void }
type VoiceState = 'idle' | 'recording' | 'processing'

const copy = {
  az: {
    eyebrow: 'BAKI · EVİNİ ŞƏHƏRİN İÇİNDƏ TAP',
    line1: 'Şəhəri hiss et.', line2: 'Öz evini tap.',
    description: 'Bakının ən sevilən rayonlarında uzunmüddətli kirayə evləri. Xəritədə kəşf et, müqayisə et və birbaşa sahibinə yaz.',
    continue: 'Xəritədə evlərə bax',
    aiPlaceholder: 'Məsələn: Yasamalda balkonlu, 3 otaqlı ev…', aiButton: 'AI ilə tap', voice: 'Səslə axtar', voiceError: 'Bu brauzer səs yazısını dəstəkləmir', recording: 'Danışın · bitirmək üçün yenidən basın', processing: 'Səs tanınır…', micDenied: 'Mikrofona girişə icazə verilmədi', emptyVoice: 'Səs yazısı boşdur, yenidən cəhd edin', guestLimit: '5 pulsuz axtarış bitdi. Davam etmək üçün hesaba daxil olun.',
    note: 'Real ünvanlar · rahat axtarış · birbaşa əlaqə',
    scroll: 'Yeni elanları kəşf et', pause: 'Videonu dayandır', play: 'Videonu oynat', loading: 'Bakı görüntüsü yüklənir', videoError: 'Video yüklənmədi',
    statOne: '14 ərazi', statTwo: 'Canlı xəritə', statThree: 'Birbaşa əlaqə',
  },
  en: {
    eyebrow: 'BAKU · FIND YOUR PLACE IN THE CITY',
    line1: 'Feel the city.', line2: 'Find your home.',
    description: 'Long-term rentals across Baku’s most loved neighbourhoods. Explore on the map, compare homes, and message owners directly.',
    continue: 'Explore homes on map',
    aiPlaceholder: 'For example: a 3-room home with a balcony in Yasamal…', aiButton: 'Find with AI', voice: 'Search by voice', voiceError: 'Audio recording is not supported in this browser', recording: 'Speak now · tap again to finish', processing: 'Recognizing speech…', micDenied: 'Microphone access was not allowed', emptyVoice: 'The recording is empty. Please try again.', guestLimit: 'Your 5 free searches are used. Sign in to continue.',
    note: 'Real addresses · effortless search · direct contact',
    scroll: 'Discover fresh listings', pause: 'Pause video', play: 'Play video', loading: 'Loading the Baku view', videoError: 'Video could not be loaded',
    statOne: '14 areas', statTwo: 'Live map', statThree: 'Direct contact',
  },
  ru: {
    eyebrow: 'БАКУ · НАЙДИ СВОЁ МЕСТО В ГОРОДЕ',
    line1: 'Почувствуй город.', line2: 'Найди свой дом.',
    description: 'Долгосрочная аренда в любимых районах Баку. Исследуй карту, сравнивай квартиры и пиши владельцам напрямую.',
    continue: 'Смотреть дома на карте',
    aiPlaceholder: 'Например: трёхкомнатная с балконом в Ясамале…', aiButton: 'Найти с AI', voice: 'Голосовой поиск', voiceError: 'Браузер не поддерживает запись звука', recording: 'Говорите · нажмите ещё раз, чтобы закончить', processing: 'Распознаём речь…', micDenied: 'Доступ к микрофону не разрешён', emptyVoice: 'Запись пустая. Попробуйте ещё раз.', guestLimit: '5 бесплатных поисков закончились. Войдите, чтобы продолжить.',
    note: 'Реальные адреса · удобный поиск · прямая связь',
    scroll: 'Смотреть свежие объявления', pause: 'Остановить видео', play: 'Включить видео', loading: 'Загружаем вид на Баку', videoError: 'Видео не загрузилось',
    statOne: '14 локаций', statTwo: 'Живая карта', statThree: 'Прямая связь',
  },
} as const

function Icon({ name }: { name: 'arrow' | 'spark' | 'mic' | 'pause' | 'play' | 'scroll' }) {
  const path = {
    arrow: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
    spark: <><path d="M12 2c.7 5.1 3.2 7.6 8 8-4.8.4-7.3 2.9-8 8-.7-5.1-3.2-7.6-8-8 4.8-.4 7.3-2.9 8-8Z" /><path d="M19 16c.25 1.8 1.15 2.7 3 3-1.85.3-2.75 1.2-3 3-.25-1.8-1.15-2.7-3-3 1.85-.3 2.75-1.2 3-3Z" /></>,
    mic: <><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    pause: <><path d="M9 7v10M15 7v10" /></>,
    play: <path d="m9 7 8 5-8 5V7Z" />,
    scroll: <><path d="M12 4v15M7 14l5 5 5-5" /></>,
  }[name]
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{path}</svg>
}

export default function ConstructionHero({ lang, onContinue, onAiSearch }: Props) {
  const heroRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const searchRef = useRef<HTMLFormElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const voiceTimerRef = useRef<number | null>(null)
  const voiceMountedRef = useRef(true)
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceError, setVoiceError] = useState('')
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [videoSource, setVideoSource] = useState<LandingVideo | null>(null)
  const [userPaused, setUserPaused] = useState(Boolean(reduceMotion))
  const [videoPlaying, setVideoPlaying] = useState(false)
  const t = copy[lang]

  useEffect(() => {
    voiceMountedRef.current = true
    return () => {
      voiceMountedRef.current = false
      if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current)
      const recorder = recorderRef.current
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    let active = true
    api.landingVideos()
      .then((videos) => {
        if (!active) return
        const playable = videos.filter((video) => {
          const probe = document.createElement('video')
          return !video.content_type || probe.canPlayType(video.content_type) !== ''
        })
        if (!playable.length) {
          setVideoFailed(true)
          return
        }
        setVideoSource(playable[Math.floor(Math.random() * playable.length)])
      })
      .catch(() => {
        if (active) setVideoFailed(true)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!reduceMotion) return
    setUserPaused(true)
    videoRef.current?.pause()
  }, [reduceMotion])

  useEffect(() => {
    const hero = heroRef.current
    const video = videoRef.current
    if (!hero || !video || videoFailed || !videoSource) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || userPaused) video.pause()
      else void video.play().catch(() => setVideoPlaying(false))
    }, { threshold: .16 })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [userPaused, videoFailed, videoSource])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const rect = searchRef.current?.getBoundingClientRect()
    if (query.trim()) onAiSearch(query.trim(), { x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2, y: (rect?.top || 0) + (rect?.height || 0) / 2 })
  }

  const buttonOrigin = (element: HTMLButtonElement): TransitionOrigin => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const toggleVideo = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      setUserPaused(false)
      void video.play().catch(() => setVideoPlaying(false))
    } else {
      setUserPaused(true)
      video.pause()
    }
  }

  const searchOrigin = (): TransitionOrigin => {
    const rect = searchRef.current?.getBoundingClientRect()
    return {
      x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
      y: (rect?.top || 0) + (rect?.height || 0) / 2,
    }
  }

  const stopVoiceStream = () => {
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current)
    voiceTimerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const startVoiceSearch = async () => {
    if (voiceState === 'processing') return
    if (voiceState === 'recording') {
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError(t.voiceError)
      return
    }

    setVoiceError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      streamRef.current = stream
      recorderRef.current = recorder
      voiceChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) voiceChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stopVoiceStream()
        if (voiceMountedRef.current) {
          setVoiceState('idle')
          setVoiceError(t.voiceError)
        }
      }
      recorder.onstop = async () => {
        stopVoiceStream()
        if (!voiceMountedRef.current) return
        setVoiceState('processing')
        const recording = new Blob(voiceChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
        if (!recording.size) {
          setVoiceError(t.emptyVoice)
          setVoiceState('idle')
          return
        }
        try {
          const result = await api.voiceSearch(recording, lang)
          if (!voiceMountedRef.current) return
          setQuery(result.query)
          setVoiceError('')
          onAiSearch(result.query, searchOrigin(), result)
        } catch (error) {
          if (!voiceMountedRef.current) return
          setVoiceError(error instanceof ApiError && error.status === 429 ? t.guestLimit : error instanceof Error ? error.message : t.voiceError)
        } finally {
          if (voiceMountedRef.current) setVoiceState('idle')
        }
      }
      setVoiceState('recording')
      recorder.start(250)
      voiceTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 12_000)
    } catch (error) {
      stopVoiceStream()
      setVoiceState('idle')
      setVoiceError(error instanceof DOMException && error.name === 'NotAllowedError' ? t.micDenied : t.voiceError)
    }
  }

  return <section ref={heroRef} className={`construction-hero${videoReady ? ' video-ready' : ''}${videoFailed ? ' video-failed' : ''}`} aria-labelledby="hero-heading">
    <ErrorToast message={voiceError} lang={lang} onDismiss={() => setVoiceError('')} />
    <div className="construction-hero__media" aria-hidden="true">
      {!videoFailed && videoSource && <video
        key={videoSource.filename}
        ref={videoRef}
        muted
        loop
        playsInline
        autoPlay={!reduceMotion}
        preload="metadata"
        tabIndex={-1}
        onLoadedData={() => setVideoReady(true)}
        onCanPlay={() => setVideoReady(true)}
        onPlay={() => setVideoPlaying(true)}
        onPause={() => setVideoPlaying(false)}
        onError={() => { setVideoFailed(true); setVideoReady(false) }}
      >
        <source src={apiUrl(`/landing-videos/${encodeURIComponent(videoSource.filename)}`)} type={videoSource.content_type} />
      </video>}
    </div>
    <div className="construction-hero__scrim" aria-hidden="true" />
    {!videoReady && !videoFailed && <div className="construction-hero__video-status" role="status"><i />{t.loading}</div>}
    {videoFailed && <div className="construction-hero__video-status" role="status">{t.videoError}</div>}

    <motion.div className="construction-hero__copy" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .68, ease: [.22, 1, .36, 1] }}>
      <div className="construction-hero__eyebrow"><span />{t.eyebrow}</div>
      <h1 id="hero-heading"><span>{t.line1}</span><span className="construction-hero__accent">{t.line2}</span></h1>
      <p className="construction-hero__description">{t.description}</p>

      <form className="hero-ai-search" ref={searchRef} onSubmit={submitSearch}>
        <span className="hero-ai-search__spark"><Icon name="spark" /></span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.aiPlaceholder} aria-label={t.aiPlaceholder} />
        <button type="button" className={voiceState} onClick={() => void startVoiceSearch()} disabled={voiceState === 'processing'} aria-label={voiceState === 'recording' ? t.recording : t.voice} aria-pressed={voiceState === 'recording'} title={voiceState === 'recording' ? t.recording : t.voice}><Icon name="mic" /></button>
        <button type="submit" disabled={!query.trim()}>{t.aiButton}<Icon name="arrow" /></button>
      </form>
      {voiceState !== 'idle' && <div className={`hero-ai-search__voice-status ${voiceState}`} role="status" aria-live="polite"><i />{voiceState === 'recording' ? t.recording : t.processing}</div>}

      <div className="construction-hero__actions">
        <button type="button" className="construction-hero__primary" onClick={(event) => onContinue(buttonOrigin(event.currentTarget))}>
          <span>{t.continue}</span><Icon name="arrow" /><i aria-hidden="true" />
        </button>
        <p>{t.note}</p>
      </div>
    </motion.div>

    {!videoFailed && videoSource && <button type="button" className="construction-hero__video-control" onClick={toggleVideo} aria-label={videoPlaying ? t.pause : t.play} title={videoPlaying ? t.pause : t.play}>
      <Icon name={videoPlaying ? 'pause' : 'play'} /><span>{videoPlaying ? t.pause : t.play}</span>
    </button>}

    <a className="construction-hero__scroll" href="#fresh-listings"><Icon name="scroll" /><span>{t.scroll}</span></a>
  </section>
}
