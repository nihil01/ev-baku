import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  bakuMaxBounds,
  bakuViewBounds,
  districtBounds,
  districtGeo,
  districtLabel,
  districts,
  type District,
} from '../data/mapConfig'
import { api, ApiError, MAP_STYLE_URL, mediaUrl } from '../lib/api'
import {
  hasAvailabilityReminder,
  removeAvailabilityReminder,
  subscribeToAvailability,
} from '../lib/availabilityNotifications'
import type { AiSearchResponse, Currency, DistrictId, Lang, Listing, NearbyPlace, PropertyType } from '../types/api'
import AccountAccess from './AccountAccess'
import HouseLogo from './HouseLogo'
import BrandedLoader from './BrandedLoader'
import ErrorToast from './ErrorToast'
import { useAuth } from '../context/AuthContext'
import './MapExperience.css'

type Props = { lang: Lang; initialAiQuery?: string; initialAiResults?: AiSearchResponse; initialListingId?: string; onReady?: () => void; onClose: () => void }
type Layout = 'split' | 'map' | 'list'
type Sort = 'recommended' | 'priceAsc' | 'priceDesc' | 'areaDesc'
type PropertyFilter = 'all' | PropertyType
type Bounds = { west: number; south: number; east: number; north: number }
type NearbyGroupKey = 'groceries' | 'food' | 'healthcare' | 'education' | 'transport' | 'parks' | 'shopping' | 'services'
type NearbyAmenityKey = 'hospital' | 'pharmacy' | 'school' | 'university' | 'groceries' | 'shopping' | 'restaurant' | 'transport' | 'park'

const currencySymbol: Record<Currency, string> = { AZN: '₼', USD: '$', EUR: '€', RUB: '₽' }
const detailExtra = {
  az: { nearby: 'Yaxınlıqda', distance: 'm', chat: 'Sahibinə yaz', send: 'Göndər', message: 'Mesajınız', owner: 'Elan sahibi', loginChat: 'Mesaj üçün hesaba daxil olun', converted: 'AZN ilə', telegram: 'Telegram', whatsapp: 'WhatsApp', backToMap: 'Xəritəyə qayıt', aiSearching: 'AI uyğun evləri axtarır…', aiSemantic: 'AI nəticələri', aiText: 'Mətn üzrə nəticələr', currency: 'Valyuta', discountPolicy: 'Uzunmüddətli kirayə endirimi', leaseTerm: 'Kirayə müddəti', monthlyWithDiscount: 'Endirimli aylıq qiymət', groups: { groceries: 'Marketlər', food: 'Restoran və kafelər', healthcare: 'Tibb və apteklər', education: 'Təhsil', transport: 'Metro və nəqliyyat', parks: 'Parklar', shopping: 'Ticarət mərkəzləri', services: 'Digər yerlər' } },
  en: { nearby: 'Nearby', distance: 'm', chat: 'Message owner', send: 'Send', message: 'Your message', owner: 'Property owner', loginChat: 'Sign in to send a message', converted: 'in AZN', telegram: 'Telegram', whatsapp: 'WhatsApp', backToMap: 'Back to map', aiSearching: 'AI is matching homes…', aiSemantic: 'AI matches', aiText: 'Text matches', currency: 'Currency', discountPolicy: 'Long-stay discount', leaseTerm: 'Lease term', monthlyWithDiscount: 'Discounted monthly price', groups: { groceries: 'Groceries', food: 'Restaurants & cafés', healthcare: 'Healthcare', education: 'Education', transport: 'Metro & transport', parks: 'Parks', shopping: 'Shopping centres', services: 'Other places' } },
  ru: { nearby: 'Рядом с домом', distance: 'м', chat: 'Написать владельцу', send: 'Отправить', message: 'Ваше сообщение', owner: 'Владелец объявления', loginChat: 'Войдите, чтобы написать', converted: 'в AZN', telegram: 'Телеграм', whatsapp: 'WhatsApp', backToMap: 'Вернуться к карте', aiSearching: 'AI подбирает подходящие квартиры…', aiSemantic: 'AI-подборка', aiText: 'Поиск по тексту', currency: 'Валюта', discountPolicy: 'Скидка за длительную аренду', leaseTerm: 'Срок аренды', monthlyWithDiscount: 'Цена в месяц со скидкой', groups: { groceries: 'Магазины', food: 'Рестораны и кафе', healthcare: 'Медицина и аптеки', education: 'Образование', transport: 'Метро и транспорт', parks: 'Парки', shopping: 'Торговые центры', services: 'Другие места' } },
} as const

const contactPrivacyCopy = {
  az: 'Sahib nömrəsini gizlədib və yalnız sayt daxilində şəxsi mesajları qəbul edir.',
  en: 'The owner keeps their number private and accepts messages through the site only.',
  ru: 'Владелец скрыл номер и принимает только личные сообщения на сайте.',
} as const

const nearbyCopy = {
  az: { infrastructure: 'Vacib yerlər yaxınlıqda', description: 'Evdən 1,6 km radiusda gündəlik həyat üçün əsas məkanlar.', notNearby: '1,6 km radiusda tapılmadı', loading: 'Yaxınlıqdakı yerlər axtarılır…', empty: 'Bu ünvana yaxın yerlər tapılmadı.', retry: 'Yenidən yoxla', found: 'yer tapıldı', amenities: { hospital: 'Xəstəxana və klinika', pharmacy: 'Aptek', school: 'Məktəb', university: 'Universitet', groceries: 'Market', shopping: 'Ticarət mərkəzi', restaurant: 'Restoran və kafe', transport: 'Metro və dayanacaq', park: 'Park və istirahət' } },
  en: { infrastructure: 'Important places nearby', description: 'Everyday essentials within 1.6 km of the home.', notNearby: 'Not found within 1.6 km', loading: 'Finding places nearby…', empty: 'No nearby places were found for this address.', retry: 'Try again', found: 'places found', amenities: { hospital: 'Hospital & clinic', pharmacy: 'Pharmacy', school: 'School', university: 'University', groceries: 'Grocery store', shopping: 'Shopping centre', restaurant: 'Restaurant & café', transport: 'Metro & bus stop', park: 'Park & leisure' } },
  ru: { infrastructure: 'Важные места рядом', description: 'Всё необходимое для жизни в радиусе 1,6 км от дома.', notNearby: 'Не найдено в радиусе 1,6 км', loading: 'Ищем места поблизости…', empty: 'Рядом с этим адресом места пока не найдены.', retry: 'Попробовать снова', found: 'мест найдено', amenities: { hospital: 'Больница и клиника', pharmacy: 'Аптека', school: 'Школа', university: 'Университет', groceries: 'Продуктовый магазин', shopping: 'Торговый центр', restaurant: 'Ресторан и кафе', transport: 'Метро и остановка', park: 'Парк и отдых' } },
} as const

const availabilityCopy = {
  az: { title: 'Hələ mövcud deyil', text: 'Bu ev {date} tarixindən kirayə üçün açılacaq.', notify: 'Mövcud olduqda bildir', active: 'Bildiriş aktivdir · ləğv et', subscribed: 'Brauzer bildirişi aktivləşdirildi.', cancelled: 'Bildiriş ləğv edildi.', denied: 'Brauzer bildirişlərinə icazə verilməyib.', unsupported: 'Bu brauzer bildirişləri dəstəkləmir.' },
  en: { title: 'Not available yet', text: 'This home will become available on {date}.', notify: 'Notify me when available', active: 'Notification on · cancel', subscribed: 'Browser notification enabled.', cancelled: 'Notification cancelled.', denied: 'Browser notifications are not permitted.', unsupported: 'This browser does not support notifications.' },
  ru: { title: 'Пока недоступна', text: 'Квартира освободится {date}.', notify: 'Уведомить, когда доступна', active: 'Уведомление включено · отменить', subscribed: 'Уведомление браузера включено.', cancelled: 'Уведомление отменено.', denied: 'Браузер не разрешил уведомления.', unsupported: 'Этот браузер не поддерживает уведомления.' },
} as const

const guestSearchCopy = {
  az: { remaining: 'pulsuz axtarış qalıb', limit: '5 pulsuz axtarış bitdi. Davam etmək üçün hesaba daxil olun.' },
  en: { remaining: 'free searches left', limit: 'Your 5 free searches are used. Sign in to continue.' },
  ru: { remaining: 'бесплатных поисков осталось', limit: '5 бесплатных поисков закончились. Войдите, чтобы продолжить.' },
} as const

const nearbyGroupOrder: NearbyGroupKey[] = ['groceries', 'food', 'healthcare', 'education', 'transport', 'parks', 'shopping', 'services']
const nearbyGroupIcon: Record<NearbyGroupKey, NearbyAmenityKey> = { groceries: 'groceries', food: 'restaurant', healthcare: 'hospital', education: 'university', transport: 'transport', parks: 'park', shopping: 'shopping', services: 'pharmacy' }
const nearbyAmenityOrder: NearbyAmenityKey[] = ['hospital', 'pharmacy', 'school', 'university', 'groceries', 'shopping', 'restaurant', 'transport', 'park']
const nearbyAmenityPrefixes: Record<NearbyAmenityKey, string[]> = {
  hospital: ['healthcare.hospital', 'healthcare.clinic_or_praxis'],
  pharmacy: ['healthcare.pharmacy', 'commercial.health_and_beauty.pharmacy'],
  school: ['education.school', 'childcare.kindergarten'],
  university: ['education.university'],
  groceries: ['commercial.supermarket', 'commercial.convenience'],
  shopping: ['commercial.shopping_mall'],
  restaurant: ['catering.restaurant', 'catering.cafe', 'catering.fast_food'],
  transport: ['public_transport.subway', 'public_transport.bus'],
  park: ['leisure.park', 'leisure.playground'],
}

const nearbyExtraPrefixes = {
  services: ['entertainment.cinema', 'service.financial.atm', 'tourism'],
}

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
    reset: 'Bütün elanları göstər', zoomIn: 'Yaxınlaşdır', zoomOut: 'Uzaqlaşdır', overview: 'Bütün Bakı', clearDistrict: 'Rayon seçimini sil',
    available: 'Uzunmüddətli kirayə', details: 'Elan haqqında', photos: 'Foto', source: 'Elan sahibi ilə əlaqə',
    sourceNote: 'Qiymət və mövcudluğu birbaşa elan sahibi ilə dəqiqləşdirin.', close: 'Bağla', prev: 'Əvvəlki foto', next: 'Növbəti foto', studio: 'Studiya', villa: 'Villa',
    resultMap: 'xəritədə', selectedHome: 'Seçilmiş elan', filters: 'Filtrlər', results: 'Nəticələr',
    features: 'İmkanlar', rules: 'Yaşayış qaydaları', propertyFacts: 'Əmlak haqqında', bedrooms: 'Yataq otağı',
    bathrooms: 'Hamam', guests: 'Maks. qonaq', floor: 'Mərtəbə', lease: 'Minimum kirayə', months: 'ay',
    deposit: 'Depozit', noDeposit: 'Depozitsiz', availableFrom: 'Mövcud tarix', notSpecified: 'Göstərilməyib',
    elevator: 'Lift', balcony: 'Balkon', parking: 'Parkinq', ac: 'Kondisioner', heating: 'İstilik',
    utilities: 'Kommunal daxildir', petsAllowed: 'Ev heyvanı olar', petsNotAllowed: 'Ev heyvanı olmaz',
    smokingAllowed: 'Siqaret çəkmək olar', smokingNotAllowed: 'Siqaret çəkmək olmaz', included: 'Var', notIncluded: 'Yoxdur',
    floorPlans: 'Planlaşdırma', videos: 'Video baxış', noPhotos: 'Foto əlavə edilməyib', expandPhoto: 'Fotonu böyüt',
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
    reset: 'Show all rentals', zoomIn: 'Zoom in', zoomOut: 'Zoom out', overview: 'All Baku', clearDistrict: 'Clear district selection',
    available: 'Long-term rental', details: 'Listing details', photos: 'Photo', source: 'Contact the owner',
    sourceNote: 'Confirm the current price and availability directly with the owner.', close: 'Close', prev: 'Previous photo', next: 'Next photo', studio: 'Studio', villa: 'Villa',
    resultMap: 'on map', selectedHome: 'Selected rental', filters: 'Filters', results: 'Results',
    features: 'Amenities', rules: 'House rules', propertyFacts: 'Property details', bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms', guests: 'Max guests', floor: 'Floor', lease: 'Minimum lease', months: 'months',
    deposit: 'Deposit', noDeposit: 'No deposit', availableFrom: 'Available from', notSpecified: 'Not specified',
    elevator: 'Elevator', balcony: 'Balcony', parking: 'Parking', ac: 'Air conditioning', heating: 'Heating',
    utilities: 'Utilities included', petsAllowed: 'Pets allowed', petsNotAllowed: 'No pets',
    smokingAllowed: 'Smoking allowed', smokingNotAllowed: 'No smoking', included: 'Included', notIncluded: 'Not included',
    floorPlans: 'Floor plans', videos: 'Video tours', noPhotos: 'No property photos', expandPhoto: 'Enlarge photo',
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
    reset: 'Показать все объявления', zoomIn: 'Приблизить', zoomOut: 'Отдалить', overview: 'Весь Баку', clearDistrict: 'Снять выбор района',
    available: 'Долгосрочная аренда', details: 'Об объявлении', photos: 'Фото', source: 'Связаться с владельцем',
    sourceNote: 'Уточните актуальную цену и доступность напрямую у владельца.', close: 'Закрыть', prev: 'Предыдущее фото', next: 'Следующее фото', studio: 'Студия', villa: 'Вилла',
    resultMap: 'на карте', selectedHome: 'Выбранное жильё', filters: 'Фильтры', results: 'Результаты',
    features: 'Удобства', rules: 'Правила проживания', propertyFacts: 'О квартире', bedrooms: 'Спальни',
    bathrooms: 'Санузлы', guests: 'Макс. гостей', floor: 'Этаж', lease: 'Минимальный срок', months: 'месяцев',
    deposit: 'Депозит', noDeposit: 'Без депозита', availableFrom: 'Доступно с', notSpecified: 'Не указано',
    elevator: 'Лифт', balcony: 'Балкон', parking: 'Парковка', ac: 'Кондиционер', heating: 'Отопление',
    utilities: 'Коммунальные включены', petsAllowed: 'Можно с животными', petsNotAllowed: 'Без животных',
    smokingAllowed: 'Можно курить', smokingNotAllowed: 'Курить нельзя', included: 'Есть', notIncluded: 'Нет',
    floorPlans: 'Планировки', videos: 'Видеообзор', noPhotos: 'Фотографии не добавлены', expandPhoto: 'Увеличить фотографию',
  },
} as const

const fillLayer = {
  id: 'district-tint', type: 'fill',
  paint: { 'fill-color': '#2f765c', 'fill-opacity': 0.045 },
} as const

const outlineLayer = {
  id: 'district-outline', type: 'line',
  paint: { 'line-color': '#397a5a', 'line-width': 1.15, 'line-opacity': 0.32, 'line-dasharray': [3, 2] },
} as const

const selectedDistrictFillLayer = {
  id: 'selected-district-fill', type: 'fill',
  paint: { 'fill-color': '#1d7655', 'fill-opacity': 0.26 },
} as const

const selectedDistrictOutlineLayer = {
  id: 'selected-district-outline', type: 'line',
  paint: { 'line-color': '#0f5a40', 'line-width': 3, 'line-opacity': 0.9 },
} as const

// The base style's opaque water fill acts as a coastline mask. Keeping district
// layers immediately below it hides OSM administrative waters without duplicating
// or approximating Baku's detailed shoreline in the client bundle.
const districtLayerBeforeId = 'water'

const buildingsLayer = {
  id: 'buildings-3d', source: 'openmaptiles', 'source-layer': 'building', type: 'fill-extrusion', minzoom: 13.8,
  paint: {
    'fill-extrusion-color': '#d2d8cf',
    'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.8, 0, 15, ['coalesce', ['get', 'render_height'], 12]],
    'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
    'fill-extrusion-opacity': 0.82,
    'fill-extrusion-vertical-gradient': true,
  },
} as const

function Icon({ name }: { name: 'search' | 'heart' | 'map' | 'list' | 'split' | 'close' | 'arrow' | 'home' | 'expand' }) {
  const path = {
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    heart: <path d="M20.8 4.8a5.4 5.4 0 0 0-7.6 0L12 6l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z" />,
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" /><path d="M8 3v15M16 6v15" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    split: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="m3 8 5-5m8 0 5 5M3 16l5 5m8 0 5-5" /></>,
  }[name]
  return <svg viewBox="0 0 24 24" aria-hidden="true">{path}</svg>
}

function money(value: number) {
  return new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 0 }).format(value)
}

function localizedDate(value: string | null, lang: Lang, fallback: string) {
  if (!value) return fallback
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const locale = lang === 'az' ? 'az-AZ' : lang === 'ru' ? 'ru-RU' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day))
}

function localDateKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function telegramUrl(value: string) { return `https://t.me/${value.replace(/^@/, '')}` }
function whatsappUrl(value: string) { return `https://wa.me/${value.replace(/\D/g, '')}` }

function placeMatches(place: NearbyPlace, prefixes: string[]) {
  return [place.category, ...place.categories].some((category) => prefixes.some((prefix) => category.startsWith(prefix)))
}

function nearbyGroupFor(place: NearbyPlace): NearbyGroupKey {
  if (placeMatches(place, nearbyAmenityPrefixes.shopping)) return 'shopping'
  if (placeMatches(place, nearbyAmenityPrefixes.groceries)) return 'groceries'
  if (placeMatches(place, nearbyAmenityPrefixes.restaurant)) return 'food'
  if (placeMatches(place, [...nearbyAmenityPrefixes.hospital, ...nearbyAmenityPrefixes.pharmacy])) return 'healthcare'
  if (placeMatches(place, [...nearbyAmenityPrefixes.school, ...nearbyAmenityPrefixes.university])) return 'education'
  if (placeMatches(place, nearbyAmenityPrefixes.transport)) return 'transport'
  if (placeMatches(place, nearbyAmenityPrefixes.park)) return 'parks'
  return 'services'
}

function nearbyHighlightsFor(listing: Listing) {
  const places = listing.nearby_places || []
  const highlights: Array<{ key: NearbyAmenityKey; place: NearbyPlace }> = []
  for (const key of nearbyAmenityOrder) {
    const place = places
      .filter((item) => placeMatches(item, nearbyAmenityPrefixes[key]))
      .sort((a, b) => a.distance_meters - b.distance_meters)[0]
    if (place) highlights.push({ key, place })
  }
  return highlights.sort((a, b) => a.place.distance_meters - b.place.distance_meters).slice(0, 3)
}

function nearbyDistance(distance: number, meterLabel: string) {
  if (distance >= 1000) return `${(distance / 1000).toFixed(distance < 2000 ? 1 : 0)} km`
  return `${distance} ${meterLabel}`
}

function NearbyIcon({ type }: { type: NearbyAmenityKey }) {
  const common = { stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {type === 'hospital' && <><path d="M5 20V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V20M3 20h18" {...common} /><path d="M12 8v6M9 11h6" {...common} /></>}
    {type === 'pharmacy' && <><path d="M7 4h10v16H7z" {...common} /><path d="M12 8v8M9 12h6" {...common} /></>}
    {type === 'school' && <><path d="m3 10 9-5 9 5-9 5-9-5Z" {...common} /><path d="M7 13.2V17c2.8 2 7.2 2 10 0v-3.8M21 10v6" {...common} /></>}
    {type === 'university' && <><path d="m3 9 9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" {...common} /></>}
    {type === 'groceries' && <><path d="M4 8h16l-1.2 11H5.2L4 8Z" {...common} /><path d="M8 8a4 4 0 0 1 8 0" {...common} /></>}
    {type === 'shopping' && <><path d="M4 9h16v11H4V9Z" {...common} /><path d="m3 9 2-5h14l2 5M8 20v-6h4v6M4 9c1 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0" {...common} /></>}
    {type === 'restaurant' && <><path d="M7 3v7M4.5 3v4A2.5 2.5 0 0 0 7 9.5 2.5 2.5 0 0 0 9.5 7V3M7 10v11M16 3v18M16 3c3 1 4 4 4 7h-4" {...common} /></>}
    {type === 'transport' && <><rect x="5" y="3" width="14" height="16" rx="3" {...common} /><path d="M8 7h8M8 13h.01M16 13h.01M8 19l-1.5 2M16 19l1.5 2" {...common} /></>}
    {type === 'park' && <><path d="M12 21v-8M8 17h8M12 3c-4 2-6 5-6 8 0 3 2.5 5 6 5s6-2 6-5c0-3-2-6-6-8Z" {...common} /></>}
  </svg>
}

export default function MapExperience({ lang, initialAiQuery = '', initialAiResults, initialListingId, onReady, onClose }: Props) {
  const t = copy[lang]
  const x = detailExtra[lang]
  const nearbyText = nearbyCopy[lang]
  const availabilityText = availabilityCopy[lang]
  const { user } = useAuth()
  const mapRef = useRef<MapRef | null>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})
  const galleryTriggerRef = useRef<HTMLButtonElement | null>(null)
  const lightboxRef = useRef<HTMLDivElement | null>(null)
  const lightboxCloseRef = useRef<HTMLButtonElement | null>(null)
  const initialListingOpenedRef = useRef<string | null>(null)
  const [layout, setLayout] = useState<Layout>('split')
  const [query, setQuery] = useState('')
  const [aiResults, setAiResults] = useState<Listing[] | null>(null)
  const [aiMode, setAiMode] = useState<'semantic' | 'text' | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [guestQuota, setGuestQuota] = useState<{ remaining: number; limit: number } | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(() => (localStorage.getItem('ev-currency') as Currency) || 'AZN')
  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number> | null>(null)
  const [district, setDistrict] = useState<'all' | DistrictId>('all')
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
  const [toastError, setToastError] = useState('')
  const [listingsVersion, setListingsVersion] = useState(0)
  const [selectedListing, setSelectedListing] = useState<string | null>(null)
  const [detailListing, setDetailListing] = useState<Listing | null>(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [photoZoomed, setPhotoZoomed] = useState(false)
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbyError, setNearbyError] = useState('')
  const [nearbyReload, setNearbyReload] = useState(0)
  const [saved, setSaved] = useState<string[]>(safeSaved)
  const [chatStatus, setChatStatus] = useState('')
  const [leaseMonths, setLeaseMonths] = useState(1)
  const [availabilitySubscribed, setAvailabilitySubscribed] = useState(false)
  const [availabilityStatus, setAvailabilityStatus] = useState('')

  const localizedDistrict = useCallback((value: District | string) => (
    districtLabel((typeof value === 'string' ? value : value.id) as DistrictId, lang)
  ), [lang])

  useEffect(() => {
    setListingsLoading(true)
    api.listings(new URLSearchParams({ page_size: '100', sort: 'newest' }))
      .then((result) => { setListings(result.items); setListingsError(''); setToastError('') })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'API unavailable'
        setListingsError(message); setToastError(message)
      })
      .finally(() => setListingsLoading(false))
  }, [listingsVersion])

  useEffect(() => { api.exchangeRates().then((data) => setExchangeRates(data.rates)).catch(() => setExchangeRates(null)) }, [])
  useEffect(() => { localStorage.setItem('ev-currency', displayCurrency) }, [displayCurrency])
  useEffect(() => { if (loaded) onReady?.() }, [loaded, onReady])

  const runAiSearch = useCallback(async (value: string) => {
    const clean = value.trim()
    if (!clean) return
    setAiBusy(true); setQuery(clean)
    try {
      const result = await api.aiSearch(clean)
      setAiResults(result.items); setAiMode(result.mode); setListingsError(''); setToastError('')
      setGuestQuota(result.guest_requests_remaining === null || result.guest_request_limit === null ? null : { remaining: result.guest_requests_remaining, limit: result.guest_request_limit })
    } catch (error) {
      const message = error instanceof ApiError && error.status === 429 ? guestSearchCopy[lang].limit : error instanceof Error ? error.message : 'AI search unavailable'
      setAiResults([]); setAiMode(null); setListingsError(message); setToastError(message)
    } finally { setAiBusy(false) }
  }, [lang])

  useEffect(() => {
    if (initialAiResults) {
      setQuery(initialAiResults.query)
      setAiResults(initialAiResults.items)
      setAiMode(initialAiResults.mode)
      setGuestQuota(initialAiResults.guest_requests_remaining === null || initialAiResults.guest_request_limit === null ? null : { remaining: initialAiResults.guest_requests_remaining, limit: initialAiResults.guest_request_limit })
      return
    }
    if (initialAiQuery) void runAiSearch(initialAiQuery)
  }, [initialAiQuery, initialAiResults, runAiSearch])

  useEffect(() => {
    if (!initialListingId || initialListingOpenedRef.current === initialListingId) return
    const listing = listings.find((item) => item.id === initialListingId)
    if (!listing) return
    initialListingOpenedRef.current = initialListingId
    setGalleryIndex(0)
    setDetailListing(listing)
  }, [initialListingId, listings])

  useEffect(() => {
    const fallback = window.setTimeout(() => setLoaded(true), 2800)
    return () => window.clearTimeout(fallback)
  }, [])

  useEffect(() => {
    if (!user) return
    api.favorites().then((items) => setSaved(items.map((item) => item.id))).catch(() => undefined)
  }, [user])

  useEffect(() => {
    setChatStatus('')
    setAvailabilityStatus('')
    setNearbyError('')
    setPhotoZoomed(false)
    setAvailabilitySubscribed(Boolean(
      detailListing && hasAvailabilityReminder(detailListing.id, detailListing.available_from),
    ))
    if (detailListing) {
      setLeaseMonths(detailListing.minimum_lease_months)
    }
  }, [detailListing])

  useEffect(() => {
    const listingId = detailListing?.id
    if (!listingId) return
    let active = true
    setNearbyLoading(true)
    setNearbyError('')
    api.nearbyPlaces(listingId, lang)
      .then((places) => {
        if (!active) return
        const updatedAt = new Date().toISOString()
        setDetailListing((current) => current?.id === listingId ? { ...current, nearby_places: places, nearby_updated_at: updatedAt } : current)
        setListings((current) => current.map((item) => item.id === listingId ? { ...item, nearby_places: places, nearby_updated_at: updatedAt } : item))
        setAiResults((current) => current?.map((item) => item.id === listingId ? { ...item, nearby_places: places, nearby_updated_at: updatedAt } : item) || current)
      })
      .catch((error) => {
        if (!active) return
        const message = error instanceof Error ? error.message : nearbyText.empty
        setNearbyError(message)
        setToastError(message)
      })
      .finally(() => { if (active) setNearbyLoading(false) })
    return () => { active = false }
  }, [detailListing?.id, lang, nearbyReload, nearbyText.empty])

  const priceFor = useCallback((listing: Listing) => {
    if (!exchangeRates) return { value: Number(listing.monthly_rent), currency: listing.rent_currency }
    return { value: Number(listing.monthly_rent_azn) * exchangeRates[displayCurrency], currency: displayCurrency }
  }, [displayCurrency, exchangeRates])

  const nearby = useMemo(() => detailListing?.nearby_places || [], [detailListing])
  const nearbyGroups = useMemo(() => {
    const grouped = new globalThis.Map<NearbyGroupKey, NearbyPlace[]>()
    nearby.forEach((place) => {
      const key = nearbyGroupFor(place)
      grouped.set(key, [...(grouped.get(key) || []), place])
    })
    return nearbyGroupOrder
      .map((key) => ({ key, places: (grouped.get(key) || []).slice(0, 3) }))
      .filter((group) => group.places.length > 0)
  }, [nearby])
  const nearbyAmenities = useMemo(() => nearbyAmenityOrder.map((key) => ({
    key,
    place: nearby.filter((place) => placeMatches(place, nearbyAmenityPrefixes[key]))
      .sort((left, right) => left.distance_meters - right.distance_meters)[0] || null,
  })), [nearby])
  const detailNearbyHighlights = useMemo(
    () => detailListing ? nearbyHighlightsFor(detailListing) : [],
    [detailListing],
  )

  const baseResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(lang)
    const displayRate = exchangeRates?.[displayCurrency] || 1
    const minimum = (Number(minPrice) || 0) / displayRate
    const maximum = maxPrice ? Number(maxPrice) / displayRate : Number.POSITIVE_INFINITY

    return (aiResults ?? listings).filter((listing) => {
      const searchable = `${listing.title} ${listing.address} ${listing.description} ${localizedDistrict(listing.district)}`.toLocaleLowerCase(lang)
      return (aiResults !== null || !normalizedQuery || searchable.includes(normalizedQuery))
        && (district === 'all' || listing.district === district)
        && (propertyType === 'all' || listing.property_type === propertyType)
        && (roomCount === 'all' || listing.rooms >= Number(roomCount))
        && Number(listing.monthly_rent_azn) >= minimum
        && Number(listing.monthly_rent_azn) <= maximum
        && (furnished === 'all' || listing.furnished === (furnished === 'yes'))
    })
  }, [aiResults, district, displayCurrency, exchangeRates, furnished, lang, listings, localizedDistrict, maxPrice, minPrice, propertyType, query, roomCount])

  const visibleResults = useMemo(() => {
    const bounded = syncToMap && layout !== 'list'
      ? baseResults.filter((listing) => insideBounds(listing, mapBounds))
      : baseResults
    return [...bounded].sort((a, b) => {
      if (sort === 'priceAsc') return Number(a.monthly_rent_azn) - Number(b.monthly_rent_azn)
      if (sort === 'priceDesc') return Number(b.monthly_rent_azn) - Number(a.monthly_rent_azn)
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
    mapRef.current.fitBounds(bakuViewBounds, {
      padding: mapPadding(), maxZoom: 10.6, pitch: tilted ? 32 : 0, bearing: tilted ? -8 : 0,
      duration: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 800 : 0,
    })
  }, [mapPadding, tilted])

  const selectDistrict = (id: string, toggleIfActive = false) => {
    const requestedDistrict = id === 'all' ? 'all' : id as DistrictId
    const nextDistrict = toggleIfActive && requestedDistrict === district ? 'all' : requestedDistrict
    setDistrict(nextDistrict)
    setSelectedListing(null)
    setMapBounds(null)
    if (nextDistrict === 'all') showOverview()
    else {
      const bounds = districtBounds(nextDistrict)
      mapRef.current?.fitBounds(bounds, {
        padding: mapPadding(),
        maxZoom: 13.4,
        pitch: tilted ? 38 : 0,
        bearing: tilted ? -10 : 0,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750,
      })
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
    setAiResults(null); setAiMode(null)
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

  const toggleSaved = async (id: string) => {
    const wasSaved = saved.includes(id)
    setSaved((current) => wasSaved ? current.filter((item) => item !== id) : [...current, id])
    if (user) {
      try { if (wasSaved) await api.removeFavorite(id); else await api.addFavorite(id) }
      catch (error) {
        setSaved((current) => wasSaved ? [...current, id] : current.filter((item) => item !== id))
        setToastError(error instanceof Error ? error.message : (lang === 'ru' ? 'Не удалось обновить избранное.' : lang === 'az' ? 'Seçilmişləri yeniləmək mümkün olmadı.' : 'Could not update favorites.'))
      }
    }
  }

  useEffect(() => {
    try { localStorage.setItem('ev-saved', JSON.stringify(saved)) } catch { /* Storage may be disabled. */ }
  }, [saved])

  const sendOwnerMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detailListing || !user) return setChatStatus(x.loginChat)
    const form = event.currentTarget
    const body = String(new FormData(form).get('message') || '').trim()
    if (!body) return
    try {
      const conversation = await api.startConversation(detailListing.id)
      await api.sendMessage(conversation.id, body)
      form.reset(); setChatStatus(lang === 'ru' ? 'Сообщение отправлено' : lang === 'az' ? 'Mesaj göndərildi' : 'Message sent')
    } catch (error) {
      setChatStatus('')
      setToastError(error instanceof Error ? error.message : (lang === 'ru' ? 'Не удалось отправить сообщение.' : lang === 'az' ? 'Mesajı göndərmək mümkün olmadı.' : 'Could not send the message.'))
    }
  }

  const toggleAvailabilityNotification = async () => {
    if (!detailListing?.available_from) return
    if (availabilitySubscribed) {
      removeAvailabilityReminder(detailListing.id)
      setAvailabilitySubscribed(false)
      setAvailabilityStatus(availabilityText.cancelled)
      return
    }
    const result = await subscribeToAvailability(detailListing, lang)
    if (result === 'subscribed') {
      setAvailabilitySubscribed(true)
      setAvailabilityStatus(availabilityText.subscribed)
    } else {
      setAvailabilityStatus(result === 'denied' ? availabilityText.denied : availabilityText.unsupported)
    }
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (photoZoomed) return
      if (event.key === 'Escape') detailListing ? setDetailListing(null) : onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [detailListing, onClose, photoZoomed])

  const detailPhotos = detailListing
    ? detailListing.media.filter((item) => item.media_type === 'image').sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    : []
  const detailPlans = detailListing
    ? detailListing.media.filter((item) => item.media_type === 'floor_plan').sort((a, b) => a.sort_order - b.sort_order)
    : []
  const detailVideos = detailListing
    ? detailListing.media.filter((item) => item.media_type === 'video').sort((a, b) => a.sort_order - b.sort_order)
    : []
  const activePhoto = detailPhotos[galleryIndex] || detailPhotos[0]

  useEffect(() => {
    if (!photoZoomed) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => lightboxCloseRef.current?.focus())
    const handleLightboxKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPhotoZoomed(false)
        return
      }
      if (event.key === 'ArrowLeft' && detailPhotos.length > 1) {
        event.preventDefault()
        setGalleryIndex((current) => (current - 1 + detailPhotos.length) % detailPhotos.length)
        return
      }
      if (event.key === 'ArrowRight' && detailPhotos.length > 1) {
        event.preventDefault()
        setGalleryIndex((current) => (current + 1) % detailPhotos.length)
        return
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(lightboxRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') || [])
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleLightboxKey)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleLightboxKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [detailPhotos.length, photoZoomed])
  const isUnavailable = Boolean(detailListing?.available_from && detailListing.available_from > localDateKey())
  const featureItems = detailListing ? [
    [t.furnished, detailListing.furnished],
    [t.elevator, detailListing.has_elevator],
    [t.balcony, detailListing.has_balcony],
    [t.parking, detailListing.has_parking],
    [t.ac, detailListing.has_air_conditioning],
    [t.heating, detailListing.has_heating],
    [t.utilities, detailListing.utilities_included],
  ] as const : []
  const activeDiscount = detailListing
    ? [...detailListing.discount_tiers].sort((a, b) => b.min_months - a.min_months).find((tier) => leaseMonths >= tier.min_months)
    : undefined
  const detailDisplayPrice = detailListing ? priceFor(detailListing) : null

  return <motion.section
    className={`search-experience view-${layout}`}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: .35 }}
  >
    <ErrorToast message={toastError} lang={lang} onDismiss={() => setToastError('')} />
    <motion.header className="search-header" initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .12, duration: .42 }}>
      <button type="button" className="search-brand" onClick={onClose} aria-label={t.back}>
        <HouseLogo /><b>EV BAKU</b>
      </button>
      <form className="search-box" onSubmit={(event) => { event.preventDefault(); void runAiSearch(query) }}>
        <Icon name="search" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
        {query && <button type="submit" className="ai-search-submit" aria-label="AI search">✦</button>}
      </form>
      <div className="layout-switcher" aria-label="Layout">
        <button type="button" className={layout === 'split' ? 'active' : ''} onClick={() => changeLayout('split')}><Icon name="split" /><span>{t.split}</span></button>
        <button type="button" className={layout === 'map' ? 'active' : ''} onClick={() => changeLayout('map')}><Icon name="map" /><span>{t.map}</span></button>
        <button type="button" className={layout === 'list' ? 'active' : ''} onClick={() => changeLayout('list')}><Icon name="list" /><span>{t.list}</span></button>
      </div>
      <AccountAccess lang={lang} compact onListingsChanged={() => setListingsVersion((value) => value + 1)} />
      <button type="button" className="search-back" onClick={onClose}><span>{t.back}</span><Icon name="close" /></button>
    </motion.header>

    <motion.div className="filter-bar" initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .2, duration: .44 }}>
      <div className="filter-bar__top">
        <span className="filter-bar__label">{t.filters}</span>
        <div className="filter-controls">
          <label className="district-select"><span>{t.district}</span><select value={district} onChange={(event) => selectDistrict(event.target.value)} aria-label={t.district}>
            <option value="all">{t.allDistricts} · {listings.length}</option>
            {districts.map((item) => {
              const count = listings.filter((listing) => listing.district === item.id).length
              return <option key={item.id} value={item.id}>{districtLabel(item.id, lang)} · {count}</option>
            })}
          </select></label>
          <label><span>{t.type}</span><select value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyFilter)}>
            <option value="all">{t.allTypes}</option><option value="studio">{t.studio}</option><option value="apartment">{t.apartment}</option><option value="house">{t.house}</option><option value="villa">{t.villa}</option>
          </select></label>
          <label><span>{t.rooms}</span><select value={roomCount} onChange={(event) => setRoomCount(event.target.value)}>
            <option value="all">{t.anyRooms}</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option>
          </select></label>
          <div className="price-filter"><span>{t.price}</span><input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ''))} placeholder={t.min} aria-label={`${t.min}, ${displayCurrency}`} /><i>—</i><input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ''))} placeholder={t.max} aria-label={`${t.max}, ${displayCurrency}`} /><b title={displayCurrency}>{currencySymbol[displayCurrency]}</b></div>
          <label><span>{t.furnished}</span><select value={furnished} onChange={(event) => setFurnished(event.target.value)}>
            <option value="all">{t.anyFurniture}</option><option value="yes">{t.yes}</option><option value="no">{t.no}</option>
          </select></label>
          <div className="currency-filter" role="group" aria-label={x.currency}><span>{x.currency}</span>{(['AZN', 'USD', 'EUR', 'RUB'] as Currency[]).map((item) => <button type="button" key={item} className={displayCurrency === item ? 'active' : ''} aria-pressed={displayCurrency === item} onClick={() => setDisplayCurrency(item)}>{item}</button>)}</div>
          <button type="button" className="clear-filters" onClick={clearFilters}>{t.clear}</button>
        </div>
      </div>
    </motion.div>

    <div className="search-workspace">
      <section className="search-map-pane" aria-label={t.map}>
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          workerUrl={workerUrl}
          mapStyle={MAP_STYLE_URL}
          initialViewState={{ longitude: 49.867, latitude: 40.389, zoom: 11.15, pitch: 38, bearing: -12 }}
          maxBounds={bakuMaxBounds}
          minZoom={8.4}
          maxZoom={18}
          renderWorldCopies={false}
          attributionControl={{ compact: true }}
          reuseMaps
          onLoad={() => { setLoaded(true); showOverview(false) }}
          onStyleData={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          onMoveEnd={updateBounds}
          interactiveLayerIds={['district-tint']}
          onClick={(event) => {
            const clickedWater = event.target.getLayer('water')
              && event.target.queryRenderedFeatures(event.point, { layers: ['water'] }).length > 0
            if (clickedWater) {
              if (district !== 'all') selectDistrict('all')
              return
            }
            const id = event.features?.[0]?.properties?.id
            if (typeof id === 'string') selectDistrict(id, true)
          }}
        >
          <Source id="district-data" type="geojson" data={districtGeo as GeoJSON.FeatureCollection}>
            <Layer {...(fillLayer as any)} beforeId={districtLayerBeforeId} />
            <Layer {...(outlineLayer as any)} beforeId={districtLayerBeforeId} />
            <Layer {...(selectedDistrictFillLayer as any)} beforeId={districtLayerBeforeId} filter={['==', ['get', 'id'], district]} />
            <Layer {...(selectedDistrictOutlineLayer as any)} beforeId={districtLayerBeforeId} filter={['==', ['get', 'id'], district]} />
          </Source>
          <Layer {...(buildingsLayer as any)} />
          <ScaleControl position="bottom-left" unit="metric" />

          {baseResults.map((listing) => {
            const active = selectedListing === listing.id
            return <Marker key={listing.id} longitude={Number(listing.longitude)} latitude={Number(listing.latitude)} anchor="bottom">
              <button type="button" className={`price-marker${active ? ' active' : ''}`} onClick={(event) => {
                event.stopPropagation()
                focusListing(listing)
              }} aria-label={`${listing.title}: ${Number(listing.latitude).toFixed(5)}, ${Number(listing.longitude).toFixed(5)}`}>
                <Icon name="home" /><span>{money(priceFor(listing).value)} {currencySymbol[priceFor(listing).currency]}</span>
              </button>
            </Marker>
          })}
        </Map>

        {!loaded && <div className="map-loading"><BrandedLoader compact label={lang === 'ru' ? 'Загружаем карту…' : lang === 'az' ? 'Xəritə yüklənir…' : 'Loading the map…'} /></div>}
        <div className="map-result-count"><strong>{visibleResults.length}</strong> {resultLabel} {t.resultMap}</div>
        <AnimatePresence>
          {district !== 'all' && <motion.button
            type="button"
            className="map-district-selection"
            initial={{ opacity: 0, y: -7, scale: .97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: .97 }}
            transition={{ duration: .18 }}
            onClick={() => selectDistrict('all')}
            aria-label={`${t.clearDistrict}: ${localizedDistrict(district)}`}
            title={t.clearDistrict}
          >
            <span><small>{t.district}</small><b>{localizedDistrict(district)}</b></span>
            <i aria-hidden="true">×</i>
          </motion.button>}
        </AnimatePresence>
        <label className="move-search"><input type="checkbox" checked={syncToMap} onChange={(event) => {
          setSyncToMap(event.target.checked)
          if (!event.target.checked) setMapBounds(null)
        }} /><span />{t.searchArea}</label>
        <div className="map-tools">
          <button type="button" onClick={() => mapRef.current?.zoomIn({ duration: 220 })} aria-label={t.zoomIn}>+</button>
          <button type="button" onClick={() => mapRef.current?.zoomOut({ duration: 220 })} aria-label={t.zoomOut}>−</button>
          <button type="button" onClick={() => selectDistrict('all')} aria-label={t.overview}><Icon name="home" /></button>
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
              <div><span>{t.selectedHome}</span><b>{money(priceFor(listing).value)} {currencySymbol[priceFor(listing).currency]} <small>{t.month}</small></b><p>{listing.rooms} {t.rooms.toLowerCase()} · {listing.area_sqm} {t.area}</p><small className="listing-coordinates">⌖ {Number(listing.latitude).toFixed(5)}, {Number(listing.longitude).toFixed(5)}</small></div>
              <button type="button" onClick={() => focusListing(listing, true)}>{t.view}<Icon name="arrow" /></button>
            </motion.article>
          })()}
        </AnimatePresence>
      </section>

      <section className="results-pane" aria-label={t.results}>
        <div className="results-heading">
          <div><span>{aiBusy ? x.aiSearching : aiMode ? (aiMode === 'semantic' ? x.aiSemantic : x.aiText) : 'BAKU · RENTALS'}{guestQuota && ` · ${guestQuota.remaining}/${guestQuota.limit} ${guestSearchCopy[lang].remaining}`}</span><h1>{t.rent}</h1><p><strong>{visibleResults.length}</strong> {resultLabel}</p></div>
          <label><span>{t.sort}</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="recommended">{t.recommended}</option><option value="priceAsc">{t.cheapest}</option>
            <option value="priceDesc">{t.expensive}</option><option value="areaDesc">{t.largest}</option>
          </select></label>
        </div>

        {listingsLoading ? <div className="results-loading"><BrandedLoader compact label={lang === 'ru' ? 'Подбираем объявления…' : lang === 'az' ? 'Elanlar seçilir…' : 'Finding homes…'} /></div> : visibleResults.length ? <div className="listing-grid">
          {visibleResults.map((listing) => {
            const cover = coverFor(listing)
            const isSaved = saved.includes(listing.id)
            const active = selectedListing === listing.id
            const nearbyHighlights = nearbyHighlightsFor(listing)
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
                <div className="listing-price"><b>{money(priceFor(listing).value)} {currencySymbol[priceFor(listing).currency]}</b><span>{t.month}</span>{listing.discount_tiers.length > 0 && <em>−{Math.max(...listing.discount_tiers.map((tier) => tier.discount_percent))}%</em>}</div>
                <h2>{listing.title}</h2>
                <p>{listing.address} · {localizedDistrict(listing.district)}</p>
                <div className="listing-facts"><b>{listing.rooms}<small>{t.rooms}</small></b><b>{listing.area_sqm}<small>{t.area}</small></b><b>{listing.furnished ? t.yes : t.no}<small>{t.furnished}</small></b></div>
                {nearbyHighlights.length > 0 && <div className="listing-nearby" aria-label={nearbyText.infrastructure}>
                  {nearbyHighlights.map(({ key, place }) => <div key={`${key}-${place.place_id}`}>
                    <i><NearbyIcon type={key} /></i>
                    <span><b title={place.name}>{place.name}</b><small>{nearbyText.amenities[key]}</small></span>
                    <strong>{nearbyDistance(place.distance_meters, x.distance)}</strong>
                  </div>)}
                </div>}
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
      {detailListing && <motion.div className="listing-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.article className="listing-modal" aria-labelledby="listing-modal-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
          <header><div><span>{t.available}</span><b>{localizedDistrict(detailListing.district)} · Bakı</b></div><button type="button" className="listing-page-back" onClick={() => setDetailListing(null)} aria-label={x.backToMap}>← <span>{x.backToMap}</span></button></header>
          <div className="listing-modal__content">
            <div className="listing-modal__visuals">
              <div className="listing-modal__gallery">
                {activePhoto
                  ? <button ref={galleryTriggerRef} type="button" className="gallery-expand" onClick={() => setPhotoZoomed(true)} aria-label={t.expandPhoto}>
                    <img src={mediaUrl(activePhoto.url)} alt={activePhoto.caption || detailListing.title} />
                    <span className="gallery-expand__hint" aria-hidden="true"><Icon name="expand" />{t.expandPhoto}</span>
                  </button>
                  : <div className="listing-image-placeholder"><Icon name="home" /><span>{t.noPhotos}</span></div>}
                {detailPhotos.length > 1 && <>
                  <button type="button" className="gallery-nav previous" aria-label={t.prev} onClick={() => setGalleryIndex((galleryIndex - 1 + detailPhotos.length) % detailPhotos.length)}>‹</button>
                  <button type="button" className="gallery-nav next" aria-label={t.next} onClick={() => setGalleryIndex((galleryIndex + 1) % detailPhotos.length)}>›</button>
                  <span className="gallery-count">{galleryIndex + 1} / {detailPhotos.length}</span>
                </>}
              </div>
              {detailPhotos.length > 1 && <div className="modal-photo-strip">{detailPhotos.map((photo, index) => <button type="button" key={photo.id} className={index === galleryIndex ? 'active' : ''} onClick={() => setGalleryIndex(index)}><img src={mediaUrl(photo.url)} alt={photo.caption || `${detailListing.title} ${index + 1}`} /></button>)}</div>}
              {detailPlans.length > 0 && <section className="modal-media-section"><h3>{t.floorPlans}<span>{detailPlans.length}</span></h3><div className="modal-plan-grid">{detailPlans.map((plan) => <a key={plan.id} href={mediaUrl(plan.url)} target="_blank" rel="noreferrer"><img src={mediaUrl(plan.url)} alt={plan.caption || t.floorPlans} /></a>)}</div></section>}
              {detailVideos.length > 0 && <section className="modal-media-section"><h3>{t.videos}<span>{detailVideos.length}</span></h3><div className="modal-video-list">{detailVideos.map((video) => <video key={video.id} src={mediaUrl(video.url)} controls playsInline preload="metadata" />)}</div></section>}
            </div>
            <div className="listing-modal__info">
              <div className="listing-modal__title"><div><span>{t.details}</span><h2 id="listing-modal-title">{detailListing.title}</h2><p>{detailListing.address}</p></div><button type="button" className={saved.includes(detailListing.id) ? 'active' : ''} onClick={() => toggleSaved(detailListing.id)} aria-label={saved.includes(detailListing.id) ? t.unsave : t.save}><Icon name="heart" /></button></div>
              <div className="modal-price"><b>{detailDisplayPrice && money(detailDisplayPrice.value)} {detailDisplayPrice && currencySymbol[detailDisplayPrice.currency]}</b><span>{t.month}</span>{detailListing.rent_currency !== displayCurrency && <small>{money(Number(detailListing.monthly_rent))} {currencySymbol[detailListing.rent_currency]} · original</small>}</div>
              <div className="modal-facts"><div><b>{detailListing.rooms}</b><span>{t.rooms}</span></div><div><b>{detailListing.area_sqm} {t.area}</b><span>{['house', 'villa'].includes(detailListing.property_type) ? t.house : t.apartment}</span></div><div><b>{detailListing.furnished ? t.yes : t.no}</b><span>{t.furnished}</span></div></div>
              {detailNearbyHighlights.length > 0 && <div className="nearby-glance" aria-label={nearbyText.infrastructure}>
                <span>{x.nearby}</span>
                <div>{detailNearbyHighlights.map(({ key, place }) => <article key={`${key}-${place.place_id}`}>
                  <i><NearbyIcon type={key} /></i>
                  <span><b>{nearbyText.amenities[key]}</b><small>{place.name}</small></span>
                  <strong>{nearbyDistance(place.distance_meters, x.distance)}</strong>
                </article>)}</div>
              </div>}
              {isUnavailable && detailListing.available_from && <div className="availability-alert"><div><i>◷</i><span><b>{availabilityText.title}</b><small>{availabilityText.text.replace('{date}', localizedDate(detailListing.available_from, lang, detailListing.available_from))}</small></span></div><button type="button" className={availabilitySubscribed ? 'active' : ''} onClick={() => void toggleAvailabilityNotification()}>{availabilitySubscribed ? availabilityText.active : availabilityText.notify}</button>{availabilityStatus && <p>{availabilityStatus}</p>}</div>}
              <p className="modal-description">{detailListing.description}</p>

              <section className="modal-detail-section"><h3>{t.propertyFacts}</h3><div className="modal-property-grid">
                <div><span>{t.bedrooms}</span><b>{detailListing.bedrooms}</b></div>
                <div><span>{t.bathrooms}</span><b>{detailListing.bathrooms}</b></div>
                <div><span>{t.guests}</span><b>{detailListing.max_guests}</b></div>
                <div><span>{t.floor}</span><b>{detailListing.floor ?? '—'}{detailListing.total_floors ? ` / ${detailListing.total_floors}` : ''}</b></div>
                <div><span>{t.lease}</span><b>{detailListing.minimum_lease_months} {t.months}</b></div>
                <div><span>{t.deposit}</span><b>{detailListing.deposit ? `${money(Number(detailListing.deposit))} ${currencySymbol[detailListing.rent_currency]}` : t.noDeposit}</b></div>
                <div className="wide"><span>{t.availableFrom}</span><b>{localizedDate(detailListing.available_from, lang, t.notSpecified)}</b></div>
              </div></section>

              {detailListing.discount_tiers.length > 0 && <section className="modal-detail-section lease-discount"><h3>{x.discountPolicy}</h3>
                <div className="lease-discount__controls"><label><span>{x.leaseTerm}</span><select value={leaseMonths} onChange={(event) => setLeaseMonths(Number(event.target.value))}>{Array.from({ length: Math.max(36, ...detailListing.discount_tiers.map((tier) => tier.min_months)) }, (_, index) => index + 1).filter((months) => months >= detailListing.minimum_lease_months).map((months) => <option key={months} value={months}>{months} {t.months}</option>)}</select></label>
                  <div><span>{x.monthlyWithDiscount}</span><b>{detailDisplayPrice && money(detailDisplayPrice.value * (1 - Number(activeDiscount?.discount_percent || 0) / 100))} {detailDisplayPrice && currencySymbol[detailDisplayPrice.currency]}</b>{activeDiscount && <em>−{activeDiscount.discount_percent}%</em>}</div>
                </div>
                <div className="lease-discount__tiers">{detailListing.discount_tiers.map((tier) => <span key={tier.min_months}>{tier.min_months}+ {t.months}<b>−{tier.discount_percent}%</b></span>)}</div>
              </section>}

              <section className="modal-detail-section"><h3>{t.features}</h3><div className="modal-feature-grid">{featureItems.map(([label, enabled]) => <div key={label} className={enabled ? 'enabled' : 'disabled'}><i>{enabled ? '✓' : '—'}</i><span>{label}</span><b>{enabled ? t.included : t.notIncluded}</b></div>)}</div></section>

              <section className="modal-detail-section nearby-section">
                <header className="nearby-section__heading">
                  <div><span>{x.nearby}</span><h3>{nearbyText.infrastructure}</h3><p>{nearbyText.description}</p></div>
                  <strong className={nearbyLoading ? 'loading' : ''}>{nearbyLoading ? nearbyText.loading : `${nearby.length} ${nearbyText.found}`}</strong>
                </header>

                {nearbyLoading && nearby.length === 0 ? <div className="nearby-skeleton" role="status" aria-label={nearbyText.loading}>
                  {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
                </div> : <>
                  <div className="nearby-amenity-grid">{nearbyAmenities.map((item) => <div key={item.key} className={item.place ? 'available' : 'missing'}>
                    <i><NearbyIcon type={item.key} /></i>
                    <span><b>{nearbyText.amenities[item.key]}</b><small>{item.place?.name || nearbyText.notNearby}</small></span>
                    <strong>{item.place ? `${item.place.distance_meters} ${x.distance}` : '—'}</strong>
                  </div>)}</div>

                  {nearbyError && <div className="nearby-empty"><p>{nearbyError}</p><button type="button" onClick={() => setNearbyReload((value) => value + 1)}>{nearbyText.retry}</button></div>}
                  {!nearbyError && !nearbyLoading && nearby.length === 0 && <div className="nearby-empty"><p>{nearbyText.empty}</p><button type="button" onClick={() => setNearbyReload((value) => value + 1)}>{nearbyText.retry}</button></div>}

                  {nearbyGroups.length > 0 && <div className="nearby-groups">{nearbyGroups.map((group) => <section className="nearby-group" key={group.key}>
                    <h4><i><NearbyIcon type={nearbyGroupIcon[group.key]} /></i>{x.groups[group.key]}<span>{group.places.length}</span></h4>
                    <div>{group.places.map((place) => <article key={place.place_id}><span><b>{place.name}</b><small>{place.address || place.category.replaceAll('.', ' · ')}</small></span><strong>{place.distance_meters} {x.distance}</strong></article>)}</div>
                  </section>)}</div>}
                </>}
              </section>
              <section className="modal-detail-section"><h3>{t.rules}</h3><div className="modal-rules">
                <div className={detailListing.pets_allowed ? 'allowed' : 'denied'}><i>{detailListing.pets_allowed ? '✓' : '×'}</i><span>{detailListing.pets_allowed ? t.petsAllowed : t.petsNotAllowed}</span></div>
                <div className={detailListing.smoking_allowed ? 'allowed' : 'denied'}><i>{detailListing.smoking_allowed ? '✓' : '×'}</i><span>{detailListing.smoking_allowed ? t.smokingAllowed : t.smokingNotAllowed}</span></div>
              </div></section>

              <div className="modal-source"><p>{t.sourceNote}<br /><b>{detailListing.show_contact_name ? detailListing.contact_name : x.owner}</b></p>{detailListing.contact_method !== 'messages' && detailListing.contact_phone ? <><a href={`tel:${detailListing.contact_phone}`}><span>{t.source}</span><b>{detailListing.contact_phone}</b><Icon name="arrow" /></a>{detailListing.contact_telegram && <a href={telegramUrl(detailListing.contact_telegram)} target="_blank" rel="noreferrer"><span>{x.telegram}</span><b>{detailListing.contact_telegram}</b><Icon name="arrow" /></a>}{detailListing.contact_whatsapp && <a href={whatsappUrl(detailListing.contact_whatsapp)} target="_blank" rel="noreferrer"><span>{x.whatsapp}</span><b>{detailListing.contact_whatsapp}</b><Icon name="arrow" /></a>}</> : <div className="modal-source__privacy"><i>●</i><span>{contactPrivacyCopy[lang]}</span></div>}</div>
              {user?.id !== detailListing.owner_id && detailListing.contact_method !== 'phone' && <form className="owner-chat" onSubmit={sendOwnerMessage}><h3>{x.chat}</h3><div><input name="message" maxLength={2000} required placeholder={x.message} /><button type="submit">{x.send}</button></div>{chatStatus && <p>{chatStatus}</p>}</form>}
            </div>
          </div>
        </motion.article>
      </motion.div>}
    </AnimatePresence>

    <AnimatePresence>
      {photoZoomed && activePhoto && detailListing && <motion.div
        ref={lightboxRef}
        className="photo-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`${t.photos}: ${detailListing.title}`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onMouseDown={(event) => { if (event.target === event.currentTarget) setPhotoZoomed(false) }}
      >
        <motion.img
          key={activePhoto.id}
          src={mediaUrl(activePhoto.url)}
          alt={activePhoto.caption || detailListing.title}
          initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }}
          transition={{ duration: .2 }}
        />
        <button ref={lightboxCloseRef} type="button" className="photo-lightbox__close" onClick={() => setPhotoZoomed(false)} aria-label={t.close}><Icon name="close" /><span>{t.close}</span></button>
        {detailPhotos.length > 1 && <>
          <button type="button" className="photo-lightbox__nav previous" aria-label={t.prev} onClick={() => setGalleryIndex((current) => (current - 1 + detailPhotos.length) % detailPhotos.length)}>‹</button>
          <button type="button" className="photo-lightbox__nav next" aria-label={t.next} onClick={() => setGalleryIndex((current) => (current + 1) % detailPhotos.length)}>›</button>
          <span className="photo-lightbox__count" aria-live="polite">{galleryIndex + 1} / {detailPhotos.length}</span>
        </>}
      </motion.div>}
    </AnimatePresence>
  </motion.section>
}
