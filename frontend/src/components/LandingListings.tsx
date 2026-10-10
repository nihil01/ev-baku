import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { districtLabel } from '../data/mapConfig'
import { api, listingUrl, mediaUrl } from '../lib/api'
import type { Lang, Listing } from '../types/api'
import { useComparison } from '../context/ComparisonContext'
import { CompareIcon } from './PropertyComparison'
import './LandingListings.css'

type Point = { x: number; y: number }
type Props = {
  lang: Lang
  onExplore: (origin: Point) => void
  onListingOpen: (listingId: string, origin: Point) => void
}

const copy = {
  az: { eyebrow: 'YENİ ELANLAR', title: 'Bakıda yaşamaq üçün yerlər', description: 'Son əlavə olunan evlərə bax və tam seçimi xəritədə kəşf et.', all: 'Bütün evlərə bax', details: 'Elana bax', rooms: 'otaq', month: '/ay', loading: 'Elanlar yüklənir', empty: 'Hələ dərc olunmuş elan yoxdur.', retry: 'Yenidən yoxla', error: 'Elanları yükləmək mümkün olmadı.', compare: 'Müqayisə et', compared: 'Müqayisədə' },
  en: { eyebrow: 'FRESH LISTINGS', title: 'Places made for life in Baku', description: 'Browse the newest homes, then explore the full collection on the map.', all: 'Explore all homes', details: 'View home', rooms: 'rooms', month: '/mo', loading: 'Loading listings', empty: 'No published listings yet.', retry: 'Try again', error: 'Listings could not be loaded.', compare: 'Compare', compared: 'Compared' },
  ru: { eyebrow: 'СВЕЖИЕ ОБЪЯВЛЕНИЯ', title: 'Места для жизни в Баку', description: 'Посмотри последние добавленные дома, а всю подборку исследуй на карте.', all: 'Смотреть все дома', details: 'Открыть объявление', rooms: 'комн.', month: '/мес', loading: 'Загружаем объявления', empty: 'Опубликованных объявлений пока нет.', retry: 'Попробовать снова', error: 'Не удалось загрузить объявления.', compare: 'Сравнить', compared: 'В сравнении' },
} as const

const currencySymbol = { AZN: '₼', USD: '$', EUR: '€', RUB: '₽' } as const

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
}

function HomePlaceholder() {
  return <span className="landing-listing__placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" /></svg></span>
}

function origin(element: HTMLElement): Point {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export default function LandingListings({ lang, onExplore, onListingOpen }: Props) {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const comparison = useComparison()
  const t = copy[lang]

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.listings(new URLSearchParams({ page_size: '6', sort: 'newest' }))
      .then((result) => { if (active) setListings(result.items) })
      .catch(() => { if (active) setError(t.error) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload, t.error])

  return <section className="landing-listings" id="fresh-listings" aria-labelledby="fresh-listings-title">
    <div className="landing-listings__heading">
      <div><span>{t.eyebrow}</span><h2 id="fresh-listings-title">{t.title}</h2><p>{t.description}</p></div>
      <button type="button" onClick={(event) => onExplore(origin(event.currentTarget))}>{t.all}<Arrow /></button>
    </div>

    {loading && <div className="landing-listings__skeleton" role="status" aria-label={t.loading}>{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>}
    {!loading && error && <div className="landing-listings__empty"><p>{error}</p><button type="button" onClick={() => setReload((value) => value + 1)}>{t.retry}</button></div>}
    {!loading && !error && listings.length === 0 && <div className="landing-listings__empty"><p>{t.empty}</p></div>}

    {!loading && !error && listings.length > 0 && <div className="landing-listings__grid">
      {listings.map((listing, index) => {
        const cover = listing.media.find((item) => item.is_cover && item.media_type === 'image') || listing.media.find((item) => item.media_type === 'image')
        const compared = comparison.isCompared(listing.id)
        return <motion.article key={listing.id} className={`landing-listing${index === 0 ? ' landing-listing--featured' : ''}`} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ delay: Math.min(index * .045, .2), duration: .42 }}>
          <button type="button" className={`landing-listing__compare${compared ? ' active' : ''}`} disabled={!compared && comparison.items.length >= comparison.maxItems} aria-pressed={compared} onClick={() => comparison.toggle(listing)}><CompareIcon /><span>{compared ? t.compared : t.compare}</span></button>
          <a className="landing-listing__button" href={listingUrl(listing.id)} onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            onListingOpen(listing.id, origin(event.currentTarget))
          }} aria-label={`${t.details}: ${listing.title}`}>
            <span className="landing-listing__visual">
              {cover ? <img src={mediaUrl(cover.url)} alt="" loading="lazy" decoding="async" /> : <HomePlaceholder />}
              <span className="landing-listing__district">{districtLabel(listing.district, lang)}</span>
            </span>
            <span className="landing-listing__body">
              <span className="landing-listing__price"><b>{new Intl.NumberFormat(lang === 'az' ? 'az-AZ' : lang === 'ru' ? 'ru-RU' : 'en-GB', { maximumFractionDigits: 0 }).format(Number(listing.monthly_rent))} {currencySymbol[listing.rent_currency]}</b><small>{t.month}</small></span>
              <strong>{listing.title}</strong>
              <span className="landing-listing__address">{listing.address}</span>
              <span className="landing-listing__facts"><span>{listing.rooms} {t.rooms}</span><span>{listing.area_sqm} m²</span><span className="landing-listing__more">{t.details}<Arrow /></span></span>
            </span>
          </a>
        </motion.article>
      })}
    </div>}
  </section>
}
