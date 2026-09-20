import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import '@fontsource-variable/manrope'
import 'maplibre-gl/dist/maplibre-gl.css'
import ConstructionHero from './components/ConstructionHero'
import AccountAccess from './components/AccountAccess'
import type { Lang } from './types/api'
import './App.css'

const languages: Lang[] = ['az', 'en', 'ru']
const MapExperience = lazy(() => import('./components/MapExperience'))

function initialLanguage(): Lang {
  const stored = localStorage.getItem('ev-lang')
  return languages.includes(stored as Lang) ? stored as Lang : 'az'
}

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLanguage)
  const [mapOpen, setMapOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('ev-lang', lang)
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    document.body.style.overflow = mapOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mapOpen])

  return <>
    <header className="site-header">
      <a className="site-brand" href="#top" aria-label="ev. Baku">
        <span className="site-logo">ev<i>.</i></span>
        <b>Baku rental discovery</b>
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
        <AccountAccess lang={lang} />
      </div>
    </header>

    <main id="top">
      <ConstructionHero lang={lang} active={!mapOpen} onContinue={() => setMapOpen(true)} />
    </main>

    <AnimatePresence mode="wait">
      {mapOpen && <Suspense key="rental-map" fallback={<div className="map-chunk-loader" role="status"><span /></div>}>
        <MapExperience lang={lang} onClose={() => setMapOpen(false)} />
      </Suspense>}
    </AnimatePresence>
  </>
}
