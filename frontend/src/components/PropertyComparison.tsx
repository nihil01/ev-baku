import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { districtLabel } from '../data/mapConfig'
import { mediaUrl } from '../lib/api'
import { useComparison } from '../context/ComparisonContext'
import type { Lang, Listing } from '../types/api'
import './PropertyComparison.css'

type Props = { lang: Lang; onOpenListing: (listingId: string) => void }
type Row = { label: string; value: (listing: Listing) => string }

const text = {
  az: { compare: 'Müqayisə et', selected: 'mənzil seçilib', hint: 'Müqayisə üçün ən azı 2 elan seçin', clear: 'Hamısını sil', close: 'Bağla', title: 'Mənzillərin müqayisəsi', subtitle: 'Əsas xüsusiyyətləri yan-yana yoxlayın', open: 'Elana bax', remove: 'Müqayisədən sil', differs: 'Fərqlənir', yes: 'Bəli', no: 'Xeyr', none: 'Göstərilməyib', month: 'ay', owner: 'Ev sahibi', tenant: 'Kirayəçi' },
  en: { compare: 'Compare', selected: 'homes selected', hint: 'Select at least 2 listings to compare', clear: 'Clear all', close: 'Close', title: 'Compare homes', subtitle: 'Review every important detail side by side', open: 'View listing', remove: 'Remove from comparison', differs: 'Different', yes: 'Yes', no: 'No', none: 'Not specified', month: 'months', owner: 'Landlord', tenant: 'Tenant' },
  ru: { compare: 'Сравнить', selected: 'объекта выбрано', hint: 'Выберите минимум 2 объявления', clear: 'Очистить', close: 'Закрыть', title: 'Сравнение недвижимости', subtitle: 'Все важные параметры рядом — различия подсвечены', open: 'Открыть объявление', remove: 'Убрать из сравнения', differs: 'Отличается', yes: 'Да', no: 'Нет', none: 'Не указано', month: 'месяцев', owner: 'Арендодатель', tenant: 'Арендатор' },
} as const

const labels = {
  az: ['Qiymət / ay', 'Ünvan', 'Rayon', 'Ev tipi', 'Sahə', 'Otaqlar', 'Yataq otaqları', 'Hamam', 'Mərtəbə', 'Əşyalı', 'Lift', 'Balkon', 'Parkinq', 'Kondisioner', 'İstilik', 'Kommunal daxildir', 'Heyvanlar', 'Siqaret', 'Minimum müddət', 'Depozit', 'Bina xidmətləri', 'Mövcuddur', 'Yaxın yerlər', 'Maksimum qonaq', 'Müddət endirimləri'],
  en: ['Price / month', 'Address', 'District', 'Property type', 'Area', 'Rooms', 'Bedrooms', 'Bathrooms', 'Floor', 'Furnished', 'Elevator', 'Balcony', 'Parking', 'Air conditioning', 'Heating', 'Utilities included', 'Pets', 'Smoking', 'Minimum lease', 'Deposit', 'Building services', 'Available from', 'Places nearby', 'Maximum guests', 'Long-stay discounts'],
  ru: ['Цена / месяц', 'Адрес', 'Район', 'Тип жилья', 'Площадь', 'Комнаты', 'Спальни', 'Санузлы', 'Этаж', 'Мебель', 'Лифт', 'Балкон', 'Парковка', 'Кондиционер', 'Отопление', 'Коммунальные включены', 'Животные', 'Курение', 'Минимальный срок', 'Депозит', 'Услуги дома', 'Доступно с', 'Места рядом', 'Максимум гостей', 'Скидки за срок'],
} as const

const propertyNames = {
  az: { studio: 'Studiya', apartment: 'Mənzil', house: 'Ev', villa: 'Villa' },
  en: { studio: 'Studio', apartment: 'Apartment', house: 'House', villa: 'Villa' },
  ru: { studio: 'Студия', apartment: 'Квартира', house: 'Дом', villa: 'Вилла' },
} as const

const parkingNames = {
  az: { surface: 'Yerüstü', underground: 'Yeraltı', both: 'Yerüstü və yeraltı' },
  en: { surface: 'Surface', underground: 'Underground', both: 'Surface and underground' },
  ru: { surface: 'Наземная', underground: 'Подземная', both: 'Наземная и подземная' },
} as const

function coverFor(listing: Listing) {
  return listing.media.find((item) => item.media_type === 'image' && item.is_cover)
    || listing.media.find((item) => item.media_type === 'image')
}

export default function PropertyComparison({ lang, onOpenListing }: Props) {
  const { items, remove, clear } = useComparison()
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const pageRef = useRef<HTMLElement | null>(null)
  const c = text[lang]
  const yn = (value: boolean) => value ? c.yes : c.no
  const rows = useMemo<Row[]>(() => {
    const l = labels[lang]
    return [
      { label: l[0], value: (x) => `${Number(x.monthly_rent).toLocaleString()} ${x.rent_currency}` },
      { label: l[1], value: (x) => x.address },
      { label: l[2], value: (x) => districtLabel(x.district, lang) },
      { label: l[3], value: (x) => propertyNames[lang][x.property_type] },
      { label: l[4], value: (x) => `${x.area_sqm} m²` },
      { label: l[5], value: (x) => String(x.rooms) },
      { label: l[6], value: (x) => String(x.bedrooms) },
      { label: l[7], value: (x) => String(x.bathrooms) },
      { label: l[8], value: (x) => x.floor === null ? c.none : `${x.floor}${x.total_floors ? ` / ${x.total_floors}` : ''}` },
      { label: l[9], value: (x) => yn(x.furnished) },
      { label: l[10], value: (x) => yn(x.has_elevator) },
      { label: l[11], value: (x) => yn(x.has_balcony) },
      { label: l[12], value: (x) => !x.has_parking ? c.no : x.parking_type ? parkingNames[lang][x.parking_type] : c.yes },
      { label: l[13], value: (x) => yn(x.has_air_conditioning) },
      { label: l[14], value: (x) => yn(x.has_heating) },
      { label: l[15], value: (x) => yn(x.utilities_included) },
      { label: l[16], value: (x) => yn(x.pets_allowed) },
      { label: l[17], value: (x) => yn(x.smoking_allowed) },
      { label: l[18], value: (x) => `${x.minimum_lease_months} ${c.month}` },
      { label: l[19], value: (x) => x.deposit === null ? c.none : `${Number(x.deposit).toLocaleString()} ${x.rent_currency}` },
      { label: l[20], value: (x) => x.service_fee_payer === 'landlord' ? c.owner : `${c.tenant}${x.monthly_service_fee ? ` · ${Number(x.monthly_service_fee).toLocaleString()} ${x.rent_currency}` : ''}` },
      { label: l[21], value: (x) => x.available_from ? new Date(`${x.available_from}T00:00:00`).toLocaleDateString(lang) : c.none },
      { label: l[22], value: (x) => x.nearby_places?.length ? x.nearby_places.slice(0, 5).map((place) => place.name).join(', ') : c.none },
      { label: l[23], value: (x) => String(x.max_guests) },
      { label: l[24], value: (x) => x.discount_tiers.length ? x.discount_tiers.map((tier) => `${tier.min_months}+ ${c.month}: −${tier.discount_percent}%`).join(' · ') : c.none },
    ]
  }, [c, lang])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return setOpen(false)
      if (event.key !== 'Tab') return
      const controls = Array.from(pageRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]') || [])
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus() }
  }, [open])

  if (!items.length) return null
  return <>
    <motion.aside className="comparison-dock" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} aria-label={c.compare}>
      <div className="comparison-dock__stack" aria-hidden="true">{items.slice(0, 3).map((item) => { const cover = coverFor(item); return cover ? <img key={item.id} src={mediaUrl(cover.url)} alt="" /> : <span key={item.id} /> })}</div>
      <div><b>{items.length} {c.selected}</b><span>{items.length < 2 ? c.hint : items.map((item) => item.title).join(' · ')}</span></div>
      <button type="button" className="comparison-dock__clear" onClick={clear}>{c.clear}</button>
      <button type="button" className="comparison-dock__open" disabled={items.length < 2} onClick={() => setOpen(true)}>
        <CompareIcon />{c.compare}<span>{items.length}</span>
      </button>
    </motion.aside>

    <AnimatePresence>{open && <motion.div className="comparison-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section ref={pageRef} className="comparison-page" role="dialog" aria-modal="true" aria-labelledby="comparison-title" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>
        <header><div><span>EV BAKU · {items.length}/4</span><h2 id="comparison-title">{c.title}</h2><p>{c.subtitle}</p></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={c.close}>×</button></header>
        <div className="comparison-scroll">
          <div className="comparison-grid" style={{ '--homes': items.length } as React.CSSProperties}>
            <div className="comparison-corner"><span>{c.compare}</span><b>{items.length} / 4</b></div>
            {items.map((listing) => { const cover = coverFor(listing); return <article className="comparison-home" key={listing.id}>
              <button type="button" className="comparison-remove" onClick={() => { remove(listing.id); if (items.length === 2) setOpen(false) }} aria-label={`${c.remove}: ${listing.title}`}>×</button>
              {cover ? <img src={mediaUrl(cover.url)} alt={listing.title} /> : <div className="comparison-placeholder"><CompareIcon /></div>}
              <h3>{listing.title}</h3><p>{listing.address}</p>
              <button type="button" className="comparison-view" onClick={() => { setOpen(false); onOpenListing(listing.id) }}>{c.open}</button>
            </article> })}
            {rows.map((row) => {
              const values = items.map(row.value)
              const differs = new Set(values).size > 1
              return <div className={`comparison-row${differs ? ' is-different' : ''}`} key={row.label}>
                <div className="comparison-label"><span>{row.label}</span>{differs && <small>{c.differs}</small>}</div>
                {values.map((value, index) => <div className="comparison-value" key={`${items[index].id}-${row.label}`}>{value}</div>)}
              </div>
            })}
          </div>
        </div>
      </motion.section>
    </motion.div>}</AnimatePresence>
  </>
}

export function CompareIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h12M8 5l3-3M8 5l3 3M16 19H4m12 0-3-3m3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
