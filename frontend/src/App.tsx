import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import '@fontsource-variable/manrope'
import 'maplibre-gl/dist/maplibre-gl.css'
import ConstructionHero from './components/ConstructionHero'
import AccountAccess from './components/AccountAccess'
import HouseLogo from './components/HouseLogo'
import BrandedLoader from './components/BrandedLoader'
import LandingListings from './components/LandingListings'
import LandlordProfile from './components/LandlordProfile'
import PropertyComparison from './components/PropertyComparison'
import { listingUrl } from './lib/api'
import { startAvailabilityNotificationScheduler } from './lib/availabilityNotifications'
import type { AiSearchResponse, Lang } from './types/api'
import './App.css'

const languages: Lang[] = ['az', 'en', 'ru']
const MapExperience = lazy(() => import('./components/MapExperience'))

function initialLanguage(): Lang {
  const stored = localStorage.getItem('ev-lang')
  return languages.includes(stored as Lang) ? stored as Lang : 'az'
}

function listingFromUrl() {
  return new URLSearchParams(window.location.search).get('listing')?.trim() || null
}

function landlordFromUrl() {
  return new URLSearchParams(window.location.search).get('landlord')?.trim() || null
}

function mapFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('view') === 'map' || Boolean(params.get('listing')?.trim()) || Boolean(params.get('landlord')?.trim())
}

function homeUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('view')
  url.searchParams.delete('listing')
  url.searchParams.delete('landlord')
  return url.toString()
}

function mapUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'map')
  url.searchParams.delete('listing')
  url.searchParams.delete('landlord')
  return url.toString()
}

function landlordUrl(landlordId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'map')
  url.searchParams.set('landlord', landlordId)
  url.searchParams.delete('listing')
  return url.toString()
}

export default function App() {
  const directListingId = useRef(listingFromUrl()).current
  const [lang, setLang] = useState<Lang>(initialLanguage)
  const [mapOpen, setMapOpen] = useState(mapFromUrl)
  const [aiQuery, setAiQuery] = useState('')
  const [initialAiResults, setInitialAiResults] = useState<AiSearchResponse | null>(null)
  const [initialListingId, setInitialListingId] = useState<string | null>(directListingId)
  const [landlordId, setLandlordId] = useState<string | null>(() => landlordFromUrl())
  const [mapTransition, setMapTransition] = useState<{ x: number; y: number; radius: number } | null>(null)
  const transitionStartedAt = useRef(0)
  const openTimer = useRef<number | null>(null)
  const finishTimer = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    localStorage.setItem('ev-lang', lang)
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    document.body.style.overflow = mapOpen || mapTransition ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mapOpen, mapTransition])

  useEffect(() => () => {
    if (openTimer.current) window.clearTimeout(openTimer.current)
    if (finishTimer.current) window.clearTimeout(finishTimer.current)
  }, [])

  useEffect(() => startAvailabilityNotificationScheduler(), [])

  useEffect(() => {
    const syncRoute = () => {
      const listingId = listingFromUrl()
      setInitialListingId(listingId)
      setLandlordId(landlordFromUrl())
      setMapOpen(mapFromUrl())
      setMapTransition(null)
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  const openMap = useCallback((query = '', origin?: { x: number; y: number }, listingId: string | null = null, aiResults: AiSearchResponse | null = null) => {
    if (mapOpen || mapTransition) return
    if (listingId) window.history.pushState({ evRoute: 'listing', evReturn: 'landing' }, '', listingUrl(listingId))
    else window.history.pushState({ evRoute: 'map' }, '', mapUrl())
    setAiQuery(query)
    setInitialAiResults(aiResults)
    setInitialListingId(listingId)
    if (reduceMotion) {
      setMapOpen(true)
      return
    }
    const x = origin?.x ?? window.innerWidth / 2
    const y = origin?.y ?? window.innerHeight / 2
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 32
    transitionStartedAt.current = performance.now()
    setMapTransition({ x, y, radius })
    openTimer.current = window.setTimeout(() => setMapOpen(true), 320)
    finishTimer.current = window.setTimeout(() => setMapTransition(null), 7000)
  }, [mapOpen, mapTransition, reduceMotion])

  const openListing = useCallback((listingId: string, origin?: { x: number; y: number }) => {
    setLandlordId(null)
    if (!mapOpen && !mapTransition) {
      openMap('', origin, listingId)
      return
    }
    window.history.pushState({ evRoute: 'listing', evReturn: 'map' }, '', listingUrl(listingId))
    setInitialListingId(listingId)
  }, [mapOpen, mapTransition, openMap])

  const openLandlord = useCallback((id: string) => {
    window.history.pushState({ evRoute: 'landlord' }, '', landlordUrl(id))
    setLandlordId(id)
  }, [])

  const closeLandlord = useCallback(() => {
    if (window.history.state?.evRoute === 'landlord') {
      window.history.back()
      return
    }
    window.history.replaceState({}, '', mapUrl())
    setLandlordId(null)
  }, [])

  const closeListing = useCallback(() => {
    if (window.history.state?.evRoute === 'listing') {
      window.history.back()
      return
    }
    window.history.replaceState({}, '', mapUrl())
    setInitialListingId(null)
    setLandlordId(null)
  }, [])

  const closeMap = useCallback(() => {
    if (window.history.state?.evRoute === 'map') {
      window.history.back()
      return
    }
    window.history.replaceState({}, '', homeUrl())
    setMapTransition(null)
    setMapOpen(false)
    setInitialListingId(null)
    setInitialAiResults(null)
  }, [])

  const finishMapTransition = useCallback(() => {
    if (!mapTransition) return
    const remaining = Math.max(0, 920 - (performance.now() - transitionStartedAt.current))
    if (finishTimer.current) window.clearTimeout(finishTimer.current)
    finishTimer.current = window.setTimeout(() => setMapTransition(null), remaining)
  }, [mapTransition])

  return <MotionConfig reducedMotion="user">
    <header className="site-header">
      <a className="site-brand" href="#top" aria-label="ev. Baku">
        <HouseLogo className="site-logo" />
        <span className="site-brand__wordmark"><b>EV BAKU</b></span>
      </a>
      <div className="site-header__actions">
        <div className="site-languages" aria-label="Language">
          {languages.map((item) => <button
            type="button"
            key={item}
            className={lang === item ? 'active' : ''}
            aria-pressed={lang === item}
            onClick={() => setLang(item)}
          >{item.toUpperCase()}</button>)}
        </div>
        <AccountAccess lang={lang} onOpenListing={openListing} onOpenLandlord={openLandlord} />
      </div>
    </header>

    <main id="top">
      <ConstructionHero
        lang={lang}
        onContinue={(origin) => openMap('', origin)}
        onAiSearch={(query, origin, results) => openMap(query, origin, null, results || null)}
      />
      <LandingListings
        lang={lang}
        onExplore={(origin) => openMap('', origin)}
        onListingOpen={openListing}
      />
    </main>

    <AnimatePresence mode="wait">
      {mapOpen && <Suspense key="rental-map" fallback={<div className="map-chunk-loader"><BrandedLoader label={lang === 'ru' ? 'Открываем карту Баку…' : lang === 'az' ? 'Bakı xəritəsi açılır…' : 'Opening the Baku map…'} /></div>}>
        <MapExperience lang={lang} initialAiQuery={aiQuery} initialAiResults={initialAiResults || undefined} initialListingId={initialListingId || undefined} onReady={finishMapTransition} onListingOpen={openListing} onLandlordOpen={openLandlord} onListingClose={closeListing} onClose={closeMap} />
      </Suspense>}
    </AnimatePresence>

    <AnimatePresence>{landlordId && <LandlordProfile landlordId={landlordId} lang={lang} onClose={closeLandlord} onOpenListing={openListing} />}</AnimatePresence>
    <PropertyComparison lang={lang} onOpenListing={openListing} />

    <AnimatePresence>
      {mapTransition && <motion.div
        className="map-entry-transition"
        initial={{ clipPath: `circle(8px at ${mapTransition.x}px ${mapTransition.y}px)` }}
        animate={{ clipPath: `circle(${mapTransition.radius}px at ${mapTransition.x}px ${mapTransition.y}px)` }}
        exit={{ opacity: 0 }}
        transition={{ clipPath: { duration: .48, ease: [.76, 0, .24, 1] }, opacity: { duration: .24 } }}
      >
        <motion.div className="map-entry-transition__loader" initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .34, duration: .28 }}>
          <BrandedLoader label={lang === 'ru' ? 'Открываем карту Баку…' : lang === 'az' ? 'Bakı xəritəsi açılır…' : 'Opening the Baku map…'} />
          <span>{lang === 'ru' ? 'Собираем дома и районы в одном месте' : lang === 'az' ? 'Evləri və rayonları bir yerdə toplayırıq' : 'Bringing homes and neighbourhoods together'}</span>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </MotionConfig>
}
