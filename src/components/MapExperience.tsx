import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Layer,
  Map,
  Marker,
  ScaleControl,
  Source,
  type MapRef,
  type ViewStateChangeEvent,
} from 'react-map-gl/maplibre'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  districtGeo,
  districts,
  type District,
} from '../data/mapConfig'
import { api, mediaUrl } from '../lib/api'
import type { DistrictId, Lang, Listing, PropertyType } from '../types/api'
import AccountAccess from './AccountAccess'
import './MapExperience.css'

type Props = { lang: Lang; onClose: () => void }
type Layout = 'split' | 'map' | 'list'
type Sort = 'recommended' | 'priceAsc' | 'priceDesc' | 'areaDesc'
type PropertyFilter = 'all' | PropertyType
type Bounds = { west: number; south: number; east: number; north: number }

const BAKU_VIEW_BOUNDS: [[number, number], [number, number]] = [
  [49.65, 40.25],
  [50.15, 40.65],
]
const BAKU_MAX_BOUNDS: [number, number, number, number] = [49.65, 40.25, 50.15, 40.65]

const copy = {
  az: {
    search: 'Rayon, yaşayış kompleksi və ya ünvan', back: 'Geri', rent: 'Bakıda kirayə evlər',
    district: 'Rayon', allDistricts: 'Bütün rayonlar', type: 'Ev tipi', allTypes: 'Bütün tiplər',
    apartment: 'Mənzil', house: 'Ev / villa', rooms: 'Otaq', anyRooms: 'İstənilən', price: 'Qiymət',
    min: 'Min.', max: 'Maks.', furnished: 'Əşyalı', anyFurniture: 'Fərqi yoxdur', yes: 'Bəli', no: 'Xeyr',
    clear: 'Təmizlə', split: 'İki hissə', map: 'Xəritə', list: 'Elanlar', found: 'kirayə elanı',
    foundOne: 'kirayə elanı', sort: 'Sıralama', recommended: 'Tövsiyə olunan', cheapest: 'Əvvəl ucuz',
    expensive: 'Əvvəl bahalı', largest: 'Əvvəl böyük', month: '/ay', area: 'm²', view: 'Ətraflı bax',
    save: 'Yadda saxla', unsave: 'Yaddaşdan sil', searchArea: 'Xəritə hərəkət etdikcə axtar',
    noResults: 'Bu seçimə uyğun elan tapılmadı', noResultsText: 'Filtrləri dəyişin və ya ümumi xəritəyə qayıdın.',
    reset: 'Bütün elanları göstər', zoomIn: 'Yaxınlaşdır', zoomOut: 'Uzaqlaşdır', overview: 'Bütün Bakı',
    available: 'Uzunmüddətli kirayə', details: 'Elan haqqında', photos: 'Foto', source: 'Elan sahibi ilə əlaqə',
    sourceNote: 'Qiymət və mövcudluğu birbaşa elan sahibi ilə dəqiqləşdirin.', close: 'Bağla', prev: 'Əvvəlki foto', next: 'Növbəti foto', studio: 'Studiya', villa: 'Villa',
    resultMap: 'xəritədə', selectedHome: 'Seçilmiş elan', filters: 'Filtrlər', results: 'Nəticələr',
  },
  en: {
    search: 'District, residence, or address', back: 'Back', rent: 'Baku homes for rent',
    district: 'District', allDistricts: 'All districts', type: 'Home type', allTypes: 'All types',
    apartment: 'Apartment', house: 'House / villa', rooms: 'Rooms', anyRooms: 'Any', price: 'Price',
    min: 'Min.', max: 'Max.', furnished: 'Furnished', anyFurniture: 'Any', yes: 'Yes', no: 'No',
    clear: 'Clear', split: 'Split', map: 'Map', list: 'Listings', found: 'rentals', foundOne: 'rental',
    sort: 'Sort', recommended: 'Recommended', cheapest: 'Price: low to high',
    expensive: 'Price: high to low', largest: 'Largest first', month: '/mo', area: 'm²', view: 'View details',
    save: 'Save home', unsave: 'Remove saved home', searchArea: 'Search as I move the map',
    noResults: 'No rentals match this search', noResultsText: 'Change the filters or return to the full Baku view.',
    reset: 'Show all rentals', zoomIn: 'Zoom in', zoomOut: 'Zoom out', overview: 'All Baku',
    available: 'Long-term rental', details: 'Listing details', photos: 'Photo', source: 'Contact the owner',
    sourceNote: 'Confirm the current price and availability directly with the owner.', close: 'Close', prev: 'Previous photo', next: 'Next photo', studio: 'Studio', villa: 'Villa',
    resultMap: 'on map', selectedHome: 'Selected rental', filters: 'Filters', results: 'Results',
  },
  ru: {
    search: 'Район, жилой комплекс или адрес', back: 'Назад', rent: 'Аренда жилья в Баку',
    district: 'Район', allDistricts: 'Все районы', type: 'Тип жилья', allTypes: 'Все типы',
    apartment: 'Квартира', house: 'Дом / вилла', rooms: 'Комнаты', anyRooms: 'Любое', price: 'Цена',
    min: 'От', max: 'До', furnished: 'Мебель', anyFurniture: 'Неважно', yes: 'С мебелью', no: 'Без мебели',
    clear: 'Сбросить', split: 'Разделить', map: 'Карта', list: 'Объявления', found: 'объявлений',
    foundOne: 'объявление', sort: 'Сортировка', recommended: 'Рекомендуемые', cheapest: 'Сначала дешевле',
    expensive: 'Сначала дороже', largest: 'Сначала просторнее', month: '/мес', area: 'м²', view: 'Подробнее',
    save: 'Сохранить', unsave: 'Удалить из избранного', searchArea: 'Искать при движении карты',
    noResults: 'По этим параметрам ничего не найдено', noResultsText: 'Измените фильтры или вернитесь к общему виду Баку.',
    reset: 'Показать все объявления', zoomIn: 'Приблизить', zoomOut: 'Отдалить', overview: 'Весь Баку',
    available: 'Долгосрочная аренда', details: 'Об объявлении', photos: 'Фото', source: 'Связаться с владельцем',
    sourceNote: 'Уточните актуальную цену и доступность напрямую у владельца.', close: 'Закрыть', prev: 'Предыдущее фото', next: 'Следующее фото', studio: 'Студия', villa: 'Вилла',
    resultMap: 'на карте', selectedHome: 'Выбранное жильё', filters: 'Фильтры', results: 'Результаты',
  },
} as const

const districtNames: Record<Lang, Record<string, string>> = {
  az: { sabail: 'Səbail', yasamal: 'Yasamal', nasimi: 'Nəsimi', narimanov: 'Nərimanov', khatai: 'Xətai', nizami: 'Nizami' },
  en: { sabail: 'Sabail', yasamal: 'Yasamal', nasimi: 'Nasimi', narimanov: 'Narimanov', khatai: 'Khatai', nizami: 'Nizami' },
  ru: { sabail: 'Сабаиль', yasamal: 'Ясамал', nasimi: 'Насими', narimanov: 'Нариманов', khatai: 'Хатаи', nizami: 'Низами' },
}

const fillLayer = {
  id: 'district-tint', type: 'fill',
  paint: { 'fill-color': '#2f765c', 'fill-opacity': 0.045 },
} as const

const outlineLayer = {
  id: 'district-outline', type: 'line',
  paint: { 'line-color': '#397a5a', 'line-width': 1.15, 'line-opacity': 0.32, 'line-dasharray': [3, 2] },
} as const

const buildingsLayer = {
  id: 'buildings-3d', source: 'carto', 'source-layer': 'building', type: 'fill-extrusion', minzoom: 13.8,
  paint: {
    'fill-extrusion-color': '#d2d8cf',
    'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.8, 0, 15, ['coalesce', ['get', 'render_height'], 12]],
    'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
    'fill-extrusion-opacity': 0.82,
    'fill-extrusion-vertical-gradient': true,
  },
} as const

function Icon({ name }: { name: 'search' | 'heart' | 'map' | 'list' | 'split' | 'close' | 'arrow' | 'home' }) {
  const path = {
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    heart: <path d="M20.8 4.8a5.4 5.4 0 0 0-7.6 0L12 6l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z" />,
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" /><path d="M8 3v15M16 6v15" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    split: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  }[name]
  return <svg viewBox="0 0 24 24" aria-hidden="true">{path}</svg>
}

function money(value: number) {
  return new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 0 }).format(value)
}

function safeSaved(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('ev-saved') || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}

function insideBounds(listing: Listing, bounds: Bounds | null) {
  if (!bounds) return true
  const lng = Number(listing.longitude)
  const lat = Number(listing.latitude)
  return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north
}

function coverFor(listing: Listing) {
  return listing.media.find((item) => item.is_cover) || listing.media.find((item) => item.media_type === 'image')
}

export default function MapExperience({ lang, onClose }: Props) {
  const t = copy[lang]
  const mapRef = useRef<MapRef | null>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})
  const [layout, setLayout] = useState<Layout>('split')
  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('all')
  const [propertyType, setPropertyType] = useState<PropertyFilter>('all')
  const [roomCount, setRoomCount] = useState('all')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [furnished, setFurnished] = useState('all')
  const [sort, setSort] = useState<Sort>('recommended')
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null)
  const [syncToMap, setSyncToMap] = useState(true)
  const [tilted, setTilted] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [listingsError, setListingsError] = useState('')
  const [listingsVersion, setListingsVersion] = useState(0)
  const [selectedListing, setSelectedListing] = useState<string | null>(null)
  const [detailListing, setDetailListing] = useState<Listing | null>(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [saved, setSaved] = useState<string[]>(safeSaved)

  const localizedDistrict = useCallback((value: District | string) => (
    districtNames[lang][typeof value === 'string' ? value : value.id]
  ), [lang])

  useEffect(() => {
    setListingsLoading(true)
    api.listings(new URLSearchParams({ page_size: '100', sort: 'newest' }))
      .then((result) => { setListings(result.items); setListingsError('') })
      .catch((error) => setListingsError(error instanceof Error ? error.message : 'API unavailable'))
      .finally(() => setListingsLoading(false))
  }, [listingsVersion])

  const baseResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(lang)
    const minimum = Number(minPrice) || 0
    const maximum = Number(maxPrice) || Number.POSITIVE_INFINITY

    return listings.filter((listing) => {
      const searchable = `${listing.title} ${listing.address} ${listing.description} ${localizedDistrict(listing.district)}`.toLocaleLowerCase(lang)
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (district === 'all' || listing.district === district)
        && (propertyType === 'all' || listing.property_type === propertyType)
        && (roomCount === 'all' || listing.rooms >= Number(roomCount))
        && Number(listing.monthly_rent) >= minimum
        && Number(listing.monthly_rent) <= maximum
        && (furnished === 'all' || listing.furnished === (furnished === 'yes'))
    })
  }, [district, furnished, lang, listings, localizedDistrict, maxPrice, minPrice, propertyType, query, roomCount])

  const visibleResults = useMemo(() => {
    const bounded = syncToMap && layout !== 'list'
      ? baseResults.filter((listing) => insideBounds(listing, mapBounds))
      : baseResults
    return [...bounded].sort((a, b) => {
      if (sort === 'priceAsc') return Number(a.monthly_rent) - Number(b.monthly_rent)
      if (sort === 'priceDesc') return Number(b.monthly_rent) - Number(a.monthly_rent)
      if (sort === 'areaDesc') return Number(b.area_sqm) - Number(a.area_sqm)
      return Date.parse(b.published_at || b.created_at) - Date.parse(a.published_at || a.created_at)
    })
  }, [baseResults, layout, mapBounds, sort, syncToMap])

  const resultLabel = visibleResults.length === 1 ? t.foundOne : t.found

  const mapPadding = useCallback(() => {
    if (layout === 'split' && window.innerWidth > 800) return { top: 120, right: 40, bottom: 70, left: 40 }
    return { top: 145, right: 55, bottom: 80, left: 55 }
  }, [layout])

  const fitListings = useCallback((items: Listing[], animate = true) => {
    if (!mapRef.current || !items.length) return
    const bounds = new maplibregl.LngLatBounds()
    items.forEach((listing) => bounds.extend([Number(listing.longitude), Number(listing.latitude)]))
    mapRef.current.fitBounds(bounds, {
      padding: mapPadding(),
      maxZoom: items.length === 1 ? 15.3 : 13.4,
      pitch: tilted ? 42 : 0,
      bearing: tilted ? -12 : 0,
      duration: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 800 : 0,
    })
  }, [mapPadding, tilted])

  const showOverview = useCallback((animate = true) => {
    setSelectedListing(null)
    setMapBounds(null)
    if (!mapRef.current) return
    mapRef.current.fitBounds(BAKU_VIEW_BOUNDS, {
      padding: mapPadding(), maxZoom: 11.35, pitch: tilted ? 38 : 0, bearing: tilted ? -12 : 0,
      duration: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 800 : 0,
    })
  }, [mapPadding, tilted])

  const selectDistrict = (id: string) => {
    setDistrict(id)
    setSelectedListing(null)
    if (id === 'all') showOverview()
    else {
      const districtListings = listings.filter((listing) => listing.district === id)
      if (districtListings.length) fitListings(districtListings)
      else {
        const center = districts.find((item) => item.id === id)?.center
        if (center) mapRef.current?.flyTo({ center, zoom: 13, duration: 600 })
      }
    }
  }

  const focusListing = useCallback((listing: Listing, openDetail = false) => {
    setSelectedListing(listing.id)
    if (layout !== 'list') {
      mapRef.current?.flyTo({
        center: [Number(listing.longitude), Number(listing.latitude)],
        zoom: 15.25,
        pitch: tilted ? 48 : 0,
        bearing: tilted ? -14 : 0,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
      })
    }
    if (layout !== 'map') {
      requestAnimationFrame(() => cardRefs.current[listing.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
    if (openDetail) {
      setGalleryIndex(0)
      setDetailListing(listing)
    }
  }, [layout, tilted])

  const clearFilters = () => {
    setQuery('')
    setDistrict('all')
    setPropertyType('all')
    setRoomCount('all')
    setMinPrice('')
    setMaxPrice('')
    setFurnished('all')
    setSort('recommended')
    showOverview()
  }

  const updateBounds = (event: ViewStateChangeEvent) => {
    if (!syncToMap) return
    const bounds = event.target.getBounds()
    setMapBounds({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() })
  }

  const changeLayout = (next: Layout) => {
    setLayout(next)
    requestAnimationFrame(() => {
      mapRef.current?.resize()
      if (next !== 'list' && baseResults.length) fitListings(baseResults, false)
    })
  }

  const toggleSaved = (id: string) => {
    setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  useEffect(() => {
    try { localStorage.setItem('ev-saved', JSON.stringify(saved)) } catch { /* Storage may be disabled. */ }
  }, [saved])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') detailListing ? setDetailListing(null) : onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [detailListing, onClose])

  const detailMedia = detailListing
    ? [...detailListing.media].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    : []
  const activeMedia = detailMedia[galleryIndex] || detailMedia[0]

  return <motion.section
    className={`search-experience view-${layout}`}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: .35 }}
  >
    <header className="search-header">
      <button type="button" className="search-brand" onClick={onClose} aria-label={t.back}>
        <span>ev<i>.</i></span><b>BAKU</b>
      </button>
      <label className="search-box">
        <Icon name="search" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
        {query && <button type="button" onClick={() => setQuery('')} aria-label={t.clear}><Icon name="close" /></button>}
      </label>
      <div className="layout-switcher" aria-label="Layout">
        <button type="button" className={layout === 'split' ? 'active' : ''} onClick={() => changeLayout('split')}><Icon name="split" /><span>{t.split}</span></button>
        <button type="button" className={layout === 'map' ? 'active' : ''} onClick={() => changeLayout('map')}><Icon name="map" /><span>{t.map}</span></button>
        <button type="button" className={layout === 'list' ? 'active' : ''} onClick={() => changeLayout('list')}><Icon name="list" /><span>{t.list}</span></button>
      </div>
      <AccountAccess lang={lang} compact onListingsChanged={() => setListingsVersion((value) => value + 1)} />
      <button type="button" className="search-back" onClick={onClose}><span>{t.back}</span><Icon name="close" /></button>
    </header>

    <div className="filter-bar">
      <span className="filter-bar__label">{t.filters}</span>
      <label><span>{t.district}</span><select value={district} onChange={(event) => selectDistrict(event.target.value)}>
        <option value="all">{t.allDistricts}</option>
        {districts.map((item) => <option key={item.id} value={item.id}>{localizedDistrict(item)}</option>)}
      </select></label>
      <label><span>{t.type}</span><select value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyFilter)}>
        <option value="all">{t.allTypes}</option><option value="studio">{t.studio}</option><option value="apartment">{t.apartment}</option><option value="house">{t.house}</option><option value="villa">{t.villa}</option>
      </select></label>
      <label><span>{t.rooms}</span><select value={roomCount} onChange={(event) => setRoomCount(event.target.value)}>
        <option value="all">{t.anyRooms}</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option>
      </select></label>
      <div className="price-filter"><span>{t.price}</span><input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ''))} placeholder={t.min} /><i>—</i><input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ''))} placeholder={t.max} /><b>₼</b></div>
      <label><span>{t.furnished}</span><select value={furnished} onChange={(event) => setFurnished(event.target.value)}>
        <option value="all">{t.anyFurniture}</option><option value="yes">{t.yes}</option><option value="no">{t.no}</option>
      </select></label>
      <button type="button" className="clear-filters" onClick={clearFilters}>{t.clear}</button>
    </div>

    <div className="search-workspace">
      <section className="search-map-pane" aria-label={t.map}>
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          workerUrl={workerUrl}
          mapStyle="/map-style.json"
          initialViewState={{ longitude: 49.867, latitude: 40.389, zoom: 11.15, pitch: 38, bearing: -12 }}
          maxBounds={BAKU_MAX_BOUNDS}
          minZoom={10.3}
          maxZoom={18}
          renderWorldCopies={false}
          attributionControl={{ compact: true }}
          reuseMaps
          onLoad={() => { setLoaded(true); showOverview(false) }}
          onMoveEnd={updateBounds}
        >
          <Source id="district-data" type="geojson" data={districtGeo as GeoJSON.FeatureCollection}>
            <Layer {...(fillLayer as any)} />
            <Layer {...(outlineLayer as any)} />
          </Source>
          <Layer {...(buildingsLayer as any)} />
          <ScaleControl position="bottom-left" unit="metric" />

          {visibleResults.map((listing) => {
            const active = selectedListing === listing.id
            return <Marker key={listing.id} longitude={Number(listing.longitude)} latitude={Number(listing.latitude)} anchor="bottom">
              <button type="button" className={`price-marker${active ? ' active' : ''}`} onClick={(event) => {
                event.stopPropagation()
                focusListing(listing)
              }}>
                {money(Number(listing.monthly_rent))} ₼
              </button>
            </Marker>
          })}
        </Map>

        {!loaded && <div className="map-loading"><span /></div>}
        <div className="map-result-count"><strong>{visibleResults.length}</strong> {resultLabel} {t.resultMap}</div>
        <label className="move-search"><input type="checkbox" checked={syncToMap} onChange={(event) => {
          setSyncToMap(event.target.checked)
          if (!event.target.checked) setMapBounds(null)
        }} /><span />{t.searchArea}</label>
        <div className="map-tools">
          <button type="button" onClick={() => mapRef.current?.zoomIn({ duration: 220 })} aria-label={t.zoomIn}>+</button>
          <button type="button" onClick={() => mapRef.current?.zoomOut({ duration: 220 })} aria-label={t.zoomOut}>−</button>
          <button type="button" onClick={() => showOverview()} aria-label={t.overview}><Icon name="home" /></button>
          <button type="button" className="tilt-button" onClick={() => {
            const next = !tilted
            setTilted(next)
            mapRef.current?.easeTo({ pitch: next ? 45 : 0, bearing: next ? -12 : 0, duration: 500 })
          }}>{tilted ? '2D' : '3D'}</button>
        </div>

        <AnimatePresence>
          {layout === 'map' && selectedListing && (() => {
            const listing = listings.find((item) => item.id === selectedListing)
            if (!listing) return null
            const cover = coverFor(listing)
            return <motion.article className="map-selected-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
              {cover ? <img src={mediaUrl(cover.url)} alt="" /> : <div className="listing-image-placeholder"><Icon name="home" /></div>}
              <div><span>{t.selectedHome}</span><b>{money(Number(listing.monthly_rent))} ₼ <small>{t.month}</small></b><p>{listing.rooms} {t.rooms.toLowerCase()} · {listing.area_sqm} {t.area}</p></div>
              <button type="button" onClick={() => focusListing(listing, true)}>{t.view}<Icon name="arrow" /></button>
            </motion.article>
          })()}
        </AnimatePresence>
      </section>

      <section className="results-pane" aria-label={t.results}>
        <div className="results-heading">
          <div><span>BAKU · RENTALS</span><h1>{t.rent}</h1><p><strong>{visibleResults.length}</strong> {resultLabel}</p></div>
          <label><span>{t.sort}</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="recommended">{t.recommended}</option><option value="priceAsc">{t.cheapest}</option>
            <option value="priceDesc">{t.expensive}</option><option value="areaDesc">{t.largest}</option>
          </select></label>
        </div>

        {listingsLoading ? <div className="results-loading"><span /></div> : visibleResults.length ? <div className="listing-grid">
          {visibleResults.map((listing) => {
            const cover = coverFor(listing)
            const isSaved = saved.includes(listing.id)
            const active = selectedListing === listing.id
            return <article
              key={listing.id}
              ref={(node) => { cardRefs.current[listing.id] = node }}
              className={`listing-card${active ? ' active' : ''}`}
              onMouseEnter={() => setSelectedListing(listing.id)}
              onMouseLeave={() => { if (selectedListing !== listing.id) setSelectedListing(null) }}
              onClick={() => focusListing(listing)}
            >
              <button type="button" className="listing-card__image" onClick={(event) => { event.stopPropagation(); focusListing(listing, true) }}>
                {cover ? <img src={mediaUrl(cover.url)} alt={`${listing.title}, ${listing.address}`} loading="lazy" /> : <span className="listing-image-placeholder"><Icon name="home" /></span>}
                <span>{t.available}</span>
              </button>
              <button type="button" className={`listing-save${isSaved ? ' active' : ''}`} aria-label={isSaved ? t.unsave : t.save} onClick={(event) => { event.stopPropagation(); toggleSaved(listing.id) }}>
                <Icon name="heart" />
              </button>
              <div className="listing-card__body">
                <div className="listing-price"><b>{money(Number(listing.monthly_rent))} ₼</b><span>{t.month}</span></div>
                <h2>{listing.title}</h2>
                <p>{listing.address} · {localizedDistrict(listing.district)}</p>
                <div className="listing-facts"><b>{listing.rooms}<small>{t.rooms}</small></b><b>{listing.area_sqm}<small>{t.area}</small></b><b>{listing.furnished ? t.yes : t.no}<small>{t.furnished}</small></b></div>
                <button type="button" className="listing-details" onClick={(event) => { event.stopPropagation(); focusListing(listing, true) }}>{t.view}<Icon name="arrow" /></button>
              </div>
            </article>
          })}
        </div> : <div className="empty-results">
          <span><Icon name="search" /></span><h2>{t.noResults}</h2><p>{listingsError || t.noResultsText}</p><button type="button" onClick={clearFilters}>{t.reset}</button>
        </div>}
      </section>
    </div>

    <AnimatePresence>
      {detailListing && <motion.div className="listing-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => {
        if (event.target === event.currentTarget) setDetailListing(null)
      }}>
        <motion.article className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-modal-title" initial={{ opacity: 0, y: 28, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: .99 }}>
          <header><div><span>{t.available}</span><b>{localizedDistrict(detailListing.district)} · Bakı</b></div><button type="button" onClick={() => setDetailListing(null)} aria-label={t.close}><Icon name="close" /></button></header>
          <div className="listing-modal__content">
            <div className="listing-modal__gallery">
              {activeMedia ? activeMedia.media_type === 'video'
                ? <video src={mediaUrl(activeMedia.url)} controls playsInline />
                : <img src={mediaUrl(activeMedia.url)} alt={activeMedia.caption || detailListing.title} />
                : <div className="listing-image-placeholder"><Icon name="home" /></div>}
              {detailMedia.length > 1 && <>
                <button type="button" className="previous" aria-label={t.prev} onClick={() => setGalleryIndex((galleryIndex - 1 + detailMedia.length) % detailMedia.length)}>‹</button>
                <button type="button" className="next" aria-label={t.next} onClick={() => setGalleryIndex((galleryIndex + 1) % detailMedia.length)}>›</button>
                <span>{galleryIndex + 1} / {detailMedia.length}</span>
              </>}
            </div>
            <div className="listing-modal__info">
              <div className="listing-modal__title"><div><span>{t.details}</span><h2 id="listing-modal-title">{detailListing.title}</h2><p>{detailListing.address}</p></div><button type="button" className={saved.includes(detailListing.id) ? 'active' : ''} onClick={() => toggleSaved(detailListing.id)} aria-label={saved.includes(detailListing.id) ? t.unsave : t.save}><Icon name="heart" /></button></div>
              <div className="modal-price"><b>{money(Number(detailListing.monthly_rent))} ₼</b><span>{t.month}</span></div>
              <div className="modal-facts"><div><b>{detailListing.rooms}</b><span>{t.rooms}</span></div><div><b>{detailListing.area_sqm} {t.area}</b><span>{['house', 'villa'].includes(detailListing.property_type) ? t.house : t.apartment}</span></div><div><b>{detailListing.furnished ? t.yes : t.no}</b><span>{t.furnished}</span></div></div>
              <p className="modal-description">{detailListing.description}</p>
              <div className="modal-source"><p>{t.sourceNote}<br /><b>{detailListing.contact_name}</b></p><a href={`tel:${detailListing.contact_phone}`}><span>{t.source}</span><b>{detailListing.contact_phone}</b><Icon name="arrow" /></a></div>
            </div>
          </div>
        </motion.article>
      </motion.div>}
    </AnimatePresence>
  </motion.section>
}
