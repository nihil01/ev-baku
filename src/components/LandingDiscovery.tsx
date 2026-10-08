import { useEffect, useState, type MouseEvent } from 'react'
import { motion } from 'motion/react'
import { api, mediaUrl } from '../lib/api'
import { districtLabel } from '../data/mapConfig'
import type { Lang, Listing } from '../types/api'
import HouseLogo from './HouseLogo'
import './LandingDiscovery.css'

type Props = { lang: Lang; onExplore: (origin: { x: number; y: number }) => void }

const copy = {
  az: { eyebrow: 'YENİ ELANLAR', title: 'Bakıya bir az da', accent: 'rəng qat.', description: 'Şəhərin fərqli ritmlərindən seçilmiş evlər. Xəritədə məhəlləni hiss et, sonra öz ünvanını seç.', all: 'Bütün evlər', month: '/ ay', rooms: 'otaq', area: 'm²', available: 'Kirayə verilir', footer: 'Bakıda kirayə evi tapmağın daha canlı yolu.', explore: 'Kəşf et', product: 'Məhsul', homes: 'Evlər', search: 'AI axtarış', districts: 'Rayonlar', city: 'Şəhər', location: 'Bakı, Azərbaycan', rights: 'EV BAKU · Şəhərdə öz yerini tap.' },
  en: { eyebrow: 'FRESH LISTINGS', title: 'Add a little more', accent: 'colour to Baku.', description: 'Curated homes from the city’s different rhythms. Feel the neighbourhood on the map, then choose your address.', all: 'See all homes', month: '/ month', rooms: 'rooms', area: 'm²', available: 'Available now', footer: 'A more vivid way to find a rental home in Baku.', explore: 'Explore', product: 'Product', homes: 'Homes', search: 'AI search', districts: 'Districts', city: 'City', location: 'Baku, Azerbaijan', rights: 'EV BAKU · Find your place in the city.' },
  ru: { eyebrow: 'СВЕЖИЕ ОБЪЯВЛЕНИЯ', title: 'Добавим Баку', accent: 'немного цвета.', description: 'Отобранные дома с разным ритмом города. Почувствуйте район на карте, а затем выберите свой адрес.', all: 'Смотреть все дома', month: '/ месяц', rooms: 'комн.', area: 'м²', available: 'Доступно сейчас', footer: 'Более живой способ найти дом в аренду в Баку.', explore: 'Исследовать', product: 'Продукт', homes: 'Дома', search: 'AI-поиск', districts: 'Районы', city: 'Город', location: 'Баку, Азербайджан', rights: 'EV BAKU · Найдите своё место в городе.' },
} as const

const districtFallback = {
  az: [
    ['01', 'Səbail', 'Dəniz, tarix və şəhərin mərkəzi'],
    ['02', 'Yasamal', 'Parklar, universitetlər və rahat ritm'],
    ['03', 'Xətai', 'Yeni memarlıq və sahil həyatı'],
    ['04', 'Nərimanov', 'Hərəkətin mərkəzində gündəlik həyat'],
  ],
  en: [
    ['01', 'Sabail', 'The sea, history and the heart of the city'],
    ['02', 'Yasamal', 'Parks, universities and an easy rhythm'],
    ['03', 'Khatai', 'New architecture and waterfront living'],
    ['04', 'Narimanov', 'Everyday life at the centre of movement'],
  ],
  ru: [
    ['01', 'Сабаиль', 'Море, история и самое сердце города'],
    ['02', 'Ясамал', 'Парки, университеты и спокойный ритм'],
    ['03', 'Хатаи', 'Новая архитектура и жизнь у воды'],
    ['04', 'Нариманов', 'Городская жизнь в центре движения'],
  ],
} as const
const currency = { AZN: '₼', USD: '$', EUR: '€', RUB: '₽' }

function origin(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export default function LandingDiscovery({ lang, onExplore }: Props) {
  const t = copy[lang]
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listings(new URLSearchParams({ page_size: '4', sort: 'newest' }))
      .then((result) => setListings(result.items.slice(0, 4)))
      .catch(() => setListings([]))
      .finally(() => setLoading(false))
  }, [])

  return <>
    <section className="landing-discovery" id="featured" aria-labelledby="featured-title">
      <div className="landing-discovery__shape landing-discovery__shape--one" aria-hidden="true" />
      <div className="landing-discovery__shape landing-discovery__shape--two" aria-hidden="true" />
      <motion.header initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .65 }}>
        <div><span>{t.eyebrow}</span><h2 id="featured-title">{t.title}<br /><em>{t.accent}</em></h2></div>
        <div><p>{t.description}</p><button type="button" onClick={(event) => onExplore(origin(event))}>{t.all}<span aria-hidden="true">↗</span></button></div>
      </motion.header>

      <div className="landing-listings" aria-live="polite">
        {loading ? Array.from({ length: 4 }, (_, index) => <div className="landing-listing landing-listing--skeleton" key={index}><span /><i /><i /></div>) : <>{listings.map((listing, index) => {
          const cover = listing.media.find((item) => item.is_cover && item.media_type === 'image') || listing.media.find((item) => item.media_type === 'image')
          return <motion.button type="button" className="landing-listing" key={listing.id} onClick={(event) => onExplore(origin(event))} initial={{ opacity: .55, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06, duration: .55 }}>
            <span className="landing-listing__visual">{cover ? <img src={mediaUrl(cover.url)} alt={`${listing.title}, ${listing.address}`} loading="lazy" /> : <span className="landing-listing__placeholder"><HouseLogo /></span>}<b>{t.available}</b><i aria-hidden="true">↗</i></span>
            <span className="landing-listing__body"><small>{districtLabel(listing.district, lang)} · BAKU</small><strong>{listing.title}</strong><span>{listing.rooms} {t.rooms} · {listing.area_sqm} {t.area}</span><b>{Number(listing.monthly_rent).toLocaleString()} {currency[listing.rent_currency]} <small>{t.month}</small></b></span>
          </motion.button>
        })}{districtFallback[lang].slice(0, Math.max(0, 4 - listings.length)).map(([number, name, mood], index) => <motion.button type="button" className="landing-district" key={name} onClick={(event) => onExplore(origin(event))} initial={{ opacity: .55, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (listings.length + index) * .06 }}>
          <small>{number} · BAKU</small><strong>{name}</strong><span>{mood}</span><i aria-hidden="true">↗</i>
        </motion.button>)}</>}
      </div>
    </section>

    <footer className="site-footer">
      <div className="site-footer__lead"><HouseLogo /><h2>{t.footer}</h2><button type="button" onClick={(event) => onExplore(origin(event))}>{t.explore}<span aria-hidden="true">→</span></button></div>
      <div className="site-footer__links"><div><span>{t.product}</span><button type="button" onClick={(event) => onExplore(origin(event))}>{t.homes}</button><a href="#top">{t.search}</a><a href="#featured">{t.districts}</a></div><div><span>{t.city}</span><p>{t.location}</p><p>40.4093° N<br />49.8671° E</p></div></div>
      <div className="site-footer__bottom"><b>EV BAKU</b><span>{t.rights}</span><a href="#top" aria-label="Back to top">↑</a></div>
    </footer>
  </>
}
