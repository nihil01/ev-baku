import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { api, listingUrl, mediaUrl } from '../lib/api'
import { formatAzPhone, isValidAzPhone, isValidEmail, normalizeAzPhone } from '../lib/validation'
import { districtCenter, districtLabel, districts } from '../data/mapConfig'
import { useAuth } from '../context/AuthContext'
import HouseLogo from './HouseLogo'
import BrandedLoader from './BrandedLoader'
import LocationPicker from './LocationPicker'
import UiErrorBoundary from './UiErrorBoundary'
import ErrorToast from './ErrorToast'
import type {
  DistrictId,
  AddressSuggestion,
  ChatMessage,
  Conversation,
  ContactMethod,
  Currency,
  Lang,
  Listing,
  ListingMedia,
  ListingPayload,
  MediaType,
  ParkingType,
  PropertyType,
  ServiceFeePayer,
} from '../types/api'
import './AccountAccess.css'

type Props = { lang: Lang; compact?: boolean; onListingsChanged?: () => void; onOverlayChange?: (open: boolean) => void }
type DashboardTab = 'list' | 'new' | 'edit' | 'favorites' | 'chat' | 'profile'
type ListingBooleanField =
  | 'furnished'
  | 'has_elevator'
  | 'has_balcony'
  | 'has_air_conditioning'
  | 'has_heating'
  | 'pets_allowed'
  | 'smoking_allowed'
  | 'utilities_included'
  | 'show_contact_name'

const extra = {
  az: { favorites: 'Seçilmişlər', chat: 'Çat', profile: 'Əlaqələr', telegram: 'Telegram', whatsapp: 'WhatsApp / username', showName: 'Ad və soyadı göstər', currency: 'Valyuta', aznEquivalent: 'AZN ekvivalenti', saved: 'Yadda saxlanıldı', send: 'Göndər', sending: 'Göndərilir…', messagePlaceholder: 'Mesajınızı yazın', listingContext: 'Bu elan haqqında söhbət', openListing: 'Elanı yeni səhifədə aç', unavailableListing: 'Elan hazırda aktiv deyil', noChats: 'Hələ mesaj yoxdur', chooseChat: 'Söhbəti seçin', profileSaved: 'Profil yadda saxlanıldı', discounts: 'Müddətə görə endirim', discountHint: 'İstəyə bağlıdır. Uzunmüddətli kirayə üçün aylıq endirimi təyin edin.', addDiscount: 'Endirim əlavə et', fromMonths: 'Bu aydan', percent: 'Endirim, %', monthlyTotal: 'Aylıq qiymət', removeTier: 'Sil', contactMethod: 'Əlaqə üsulu', contactHint: 'Məxfilik üçün nömrənizi gizlədə və yalnız sayt mesajlarını seçə bilərsiniz.', phoneOnly: 'Yalnız nömrə', phoneOnlyHint: 'Telefon, Telegram və WhatsApp', messagesOnly: 'Yalnız şəxsi mesajlar', messagesOnlyHint: 'Nömrə saytda göstərilmir', both: 'Hər iki üsul', bothHint: 'Birbaşa əlaqə və sayt çatı', savingListing: 'Elan yadda saxlanılır…', watermarking: 'Fotolara zərif EV BAKU nişanı əlavə olunur', publishing: 'Dərc olunur…', archiving: 'Arxivlənir…' },
  en: { favorites: 'Favorites', chat: 'Chat', profile: 'Contacts', telegram: 'Telegram', whatsapp: 'WhatsApp / username', showName: 'Show full name publicly', currency: 'Currency', aznEquivalent: 'AZN equivalent', saved: 'Saved', send: 'Send', sending: 'Sending…', messagePlaceholder: 'Write a message', listingContext: 'Conversation about this home', openListing: 'Open listing in a new tab', unavailableListing: 'This listing is not currently active', noChats: 'No conversations yet', chooseChat: 'Choose a conversation', profileSaved: 'Profile saved', discounts: 'Long-stay discounts', discountHint: 'Optional. Set a lower monthly price for longer leases.', addDiscount: 'Add discount', fromMonths: 'From month', percent: 'Discount, %', monthlyTotal: 'Monthly price', removeTier: 'Remove', contactMethod: 'Contact method', contactHint: 'For privacy, you can hide your number and accept only private messages on the site.', phoneOnly: 'Phone only', phoneOnlyHint: 'Phone, Telegram and WhatsApp', messagesOnly: 'Private messages only', messagesOnlyHint: 'Your number stays hidden', both: 'Both options', bothHint: 'Direct contact and site chat', savingListing: 'Saving your listing…', watermarking: 'Adding a subtle EV BAKU mark to your photos', publishing: 'Publishing…', archiving: 'Archiving…' },
  ru: { favorites: 'Избранное', chat: 'Чат', profile: 'Контакты', telegram: 'Телеграм', whatsapp: 'WhatsApp / username', showName: 'Показывать имя и фамилию', currency: 'Валюта', aznEquivalent: 'Эквивалент в AZN', saved: 'Сохранено', send: 'Отправить', sending: 'Отправляем…', messagePlaceholder: 'Напишите сообщение', listingContext: 'Диалог по этому объявлению', openListing: 'Открыть объявление в новой вкладке', unavailableListing: 'Объявление сейчас не опубликовано', noChats: 'Диалогов пока нет', chooseChat: 'Выберите диалог', profileSaved: 'Профиль сохранён', discounts: 'Скидки за срок аренды', discountHint: 'Необязательно. Укажите скидку на ежемесячный платеж при долгой аренде.', addDiscount: 'Добавить скидку', fromMonths: 'От месяцев', percent: 'Скидка, %', monthlyTotal: 'Цена в месяц', removeTier: 'Удалить', contactMethod: 'Способ связи', contactHint: 'Для конфиденциальности можно скрыть номер и принимать только личные сообщения на сайте.', phoneOnly: 'Только по номеру', phoneOnlyHint: 'Телефон, Telegram и WhatsApp', messagesOnly: 'Только личные сообщения', messagesOnlyHint: 'Номер не показывается на сайте', both: 'И то и другое', bothHint: 'Прямая связь и чат сайта', savingListing: 'Сохраняем объявление…', watermarking: 'Добавляем на фото аккуратный знак EV BAKU', publishing: 'Публикуем…', archiving: 'Архивируем…' },
} as const

const currencySymbol: Record<Currency, string> = { AZN: '₼', USD: '$', EUR: '€', RUB: '₽' }

const validationCopy = {
  az: {
    invalidEmail: 'Düzgün e-poçt ünvanı daxil edin, məsələn name@example.com.',
    invalidPhone: 'Azərbaycan mobil nömrəsini tam daxil edin: +994 50 123 45 67.',
    phoneHint: 'Mobil kodlar: 10, 50, 51, 55, 60, 70, 77 və 99.',
  },
  en: {
    invalidEmail: 'Enter a valid email address, for example name@example.com.',
    invalidPhone: 'Enter a complete Azerbaijani mobile number: +994 50 123 45 67.',
    phoneHint: 'Mobile codes: 10, 50, 51, 55, 60, 70, 77 and 99.',
  },
  ru: {
    invalidEmail: 'Введите корректный email, например name@example.com.',
    invalidPhone: 'Введите полный мобильный номер Азербайджана: +994 50 123 45 67.',
    phoneHint: 'Мобильные коды: 10, 50, 51, 55, 60, 70, 77 и 99.',
  },
} as const

const text = {
  az: {
    login: 'Daxil ol', account: 'Kabinet', signin: 'Hesaba daxil ol', signup: 'Qeydiyyat', email: 'E-poçt', password: 'Şifrə', name: 'Ad və soyad', phone: 'Telefon', noAccount: 'Hesabınız yoxdur?', hasAccount: 'Artıq hesabınız var?', close: 'Bağla', my: 'Elanlarım', add: 'Yeni elan', edit: 'Redaktə et', editing: 'Elanı redaktə et', details: 'Əsas məlumatlar', logout: 'Çıxış', draft: 'Qaralama', published: 'Aktiv', archived: 'Arxiv', publish: 'Dərc et', archive: 'Arxivlə', remove: 'Sil', cancel: 'Ləğv et', empty: 'Hələ elan yaratmamısınız.', title: 'Başlıq', description: 'Təsvir', type: 'Əmlak tipi', district: 'Rayon', address: 'Ünvan', rent: 'Aylıq kirayə', deposit: 'Depozit', area: 'Sahə, m²', rooms: 'Otaq', bedrooms: 'Yataq otağı', bathrooms: 'Hamam', guests: 'Nəfər sayı', floor: 'Mərtəbə', floors: 'Mərtəbə sayı', furnished: 'Əşyalı', lease: 'Minimum kirayə, ay', available: 'Mövcud tarix', coordinates: 'Xəritə koordinatları', amenities: 'İmkanlar və qaydalar', elevator: 'Lift', balcony: 'Balkon', parking: 'Parkinq', ac: 'Kondisioner', heating: 'İstilik', pets: 'Ev heyvanı', smoking: 'Siqaret', utilities: 'Kommunal daxildir', photos: 'Mənzil fotoları', plan: 'Mənzilin planı', video: 'Video', saveDraft: 'Qaralama yarat', createPublish: 'Yarat və dərc et', saveChanges: 'Dəyişiklikləri saxla', saving: 'Yüklənir…', created: 'Elan yaradıldı', updated: 'Elan yeniləndi', error: 'Xəta baş verdi', currentMedia: 'Yüklənmiş media', addMedia: 'Yeni media əlavə et', makeCover: 'Üz qabığı et', cover: 'Üz qabığı', deleteMedia: 'Medianı sil', noMedia: 'Bu bölmədə media yoxdur', publishedHint: 'Dəyişikliklər aktiv elanda dərhal görünəcək.', contact: 'Əlaqə', files: 'fayl', confirmMedia: 'Bu media faylı silinsin?', atLeastPhoto: 'Dərc edilmiş elanda ən azı bir foto qalmalıdır.',
  },
  en: {
    login: 'Sign in', account: 'Dashboard', signin: 'Sign in to your account', signup: 'Create account', email: 'Email', password: 'Password', name: 'Full name', phone: 'Phone', noAccount: 'No account yet?', hasAccount: 'Already registered?', close: 'Close', my: 'My listings', add: 'New listing', edit: 'Edit', editing: 'Edit listing', details: 'Property details', logout: 'Sign out', draft: 'Draft', published: 'Published', archived: 'Archived', publish: 'Publish', archive: 'Archive', remove: 'Delete', cancel: 'Cancel', empty: 'You have not created any listings yet.', title: 'Title', description: 'Description', type: 'Property type', district: 'District', address: 'Address', rent: 'Monthly rent', deposit: 'Deposit', area: 'Area, m²', rooms: 'Rooms', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', guests: 'Maximum guests', floor: 'Floor', floors: 'Total floors', furnished: 'Furnished', lease: 'Minimum lease, months', available: 'Available from', coordinates: 'Map coordinates', amenities: 'Amenities and rules', elevator: 'Elevator', balcony: 'Balcony', parking: 'Parking', ac: 'Air conditioning', heating: 'Heating', pets: 'Pets allowed', smoking: 'Smoking allowed', utilities: 'Utilities included', photos: 'Property photos', plan: 'Floor plans', video: 'Videos', saveDraft: 'Create draft', createPublish: 'Create and publish', saveChanges: 'Save changes', saving: 'Uploading…', created: 'Listing created', updated: 'Listing updated', error: 'Something went wrong', currentMedia: 'Uploaded media', addMedia: 'Add new media', makeCover: 'Set as cover', cover: 'Cover', deleteMedia: 'Delete media', noMedia: 'No media in this section', publishedHint: 'Changes will appear immediately in the published listing.', contact: 'Contact', files: 'files', confirmMedia: 'Delete this media file?', atLeastPhoto: 'A published listing must keep at least one photo.',
  },
  ru: {
    login: 'Войти', account: 'Кабинет', signin: 'Вход в аккаунт', signup: 'Регистрация', email: 'Электронная почта', password: 'Пароль', name: 'Имя и фамилия', phone: 'Телефон', noAccount: 'Ещё нет аккаунта?', hasAccount: 'Уже зарегистрированы?', close: 'Закрыть', my: 'Мои объявления', add: 'Новое объявление', edit: 'Редактировать', editing: 'Редактирование объявления', details: 'Основные данные', logout: 'Выйти', draft: 'Черновик', published: 'Опубликовано', archived: 'В архиве', publish: 'Опубликовать', archive: 'В архив', remove: 'Удалить', cancel: 'Отменить', empty: 'Вы пока не создали ни одного объявления.', title: 'Название', description: 'Описание', type: 'Тип жилья', district: 'Район', address: 'Адрес', rent: 'Аренда в месяц', deposit: 'Депозит', area: 'Площадь, м²', rooms: 'Комнаты', bedrooms: 'Спальни', bathrooms: 'Санузлы', guests: 'Вместимость, человек', floor: 'Этаж', floors: 'Этажей в доме', furnished: 'С мебелью', lease: 'Минимальный срок, месяцев', available: 'Доступно с', coordinates: 'Координаты на карте', amenities: 'Удобства и правила', elevator: 'Лифт', balcony: 'Балкон', parking: 'Парковка', ac: 'Кондиционер', heating: 'Отопление', pets: 'Можно с животными', smoking: 'Можно курить', utilities: 'Коммунальные включены', photos: 'Фотографии квартиры', plan: 'Планировки', video: 'Видео', saveDraft: 'Создать черновик', createPublish: 'Создать и опубликовать', saveChanges: 'Сохранить изменения', saving: 'Загрузка…', created: 'Объявление создано', updated: 'Объявление обновлено', error: 'Произошла ошибка', currentMedia: 'Загруженные материалы', addMedia: 'Добавить новые материалы', makeCover: 'Сделать обложкой', cover: 'Обложка', deleteMedia: 'Удалить файл', noMedia: 'В этом разделе пока ничего нет', publishedHint: 'Изменения сразу появятся в опубликованном объявлении.', contact: 'Контакты', files: 'файлов', confirmMedia: 'Удалить этот медиафайл?', atLeastPhoto: 'В опубликованном объявлении должна остаться хотя бы одна фотография.',
  },
} as const

const propertyLabels: Record<Lang, Record<PropertyType, string>> = {
  az: { studio: 'Studiya', apartment: 'Mənzil', house: 'Ev', villa: 'Villa' },
  en: { studio: 'Studio', apartment: 'Apartment', house: 'House', villa: 'Villa' },
  ru: { studio: 'Студия', apartment: 'Квартира', house: 'Дом', villa: 'Вилла' },
}

const mediaEditorCopy = {
  az: { title: 'Foto və media', editHint: 'Mövcud faylları idarə edin və aşağıdan yenilərini əlavə edin. Yeni fayllar dəyişikliklər saxlanarkən yüklənəcək.', createHint: 'Elan üçün foto, plan və video seçin.', selected: 'Yeni fayllar seçilib', pending: 'Saxladıqdan sonra yüklənəcək', remove: 'Seçimdən sil' },
  en: { title: 'Photos and media', editHint: 'Manage existing files and add new ones below. New files upload when you save changes.', createHint: 'Choose property photos, floor plans, and videos.', selected: 'New files selected', pending: 'Uploads after saving', remove: 'Remove from selection' },
  ru: { title: 'Фотографии и медиа', editHint: 'Управляйте текущими файлами и добавляйте новые ниже. Новые файлы загрузятся при сохранении изменений.', createHint: 'Выберите фотографии квартиры, планировки и видео.', selected: 'Выбраны новые файлы', pending: 'Загрузятся после сохранения', remove: 'Убрать из выбранных' },
} as const

const propertyCostsCopy = {
  az: {
    parkingTitle: 'Parkinq növü', parkingHint: 'Elana uyğun park yeri variantını seçin.', noParking: 'Parkinq yoxdur', surface: 'Yerüstü', underground: 'Yeraltı', bothParking: 'Hər ikisi',
    serviceTitle: 'Aylıq bina xidmətləri', serviceHint: 'Zibilin çıxarılması, lift, mühafizə və binanın ümumi xidməti.', landlord: 'Ev sahibi ödəyir', landlordHint: 'Kirayəçi üçün əlavə aylıq ödəniş yoxdur.', tenant: 'Kirayəçi ödəyir', tenantHint: 'Aylıq xidmət haqqını aşağıda göstərin.', serviceFee: 'Aylıq xidmət haqqı', feeCurrency: 'Məbləğ kirayə valyutasında göstərilir.', feeRequired: 'Kirayəçi ödəyirsə, aylıq xidmət haqqını göstərin.',
  },
  en: {
    parkingTitle: 'Parking type', parkingHint: 'Choose the parking option available for this home.', noParking: 'No parking', surface: 'Surface', underground: 'Underground', bothParking: 'Both types',
    serviceTitle: 'Monthly building services', serviceHint: 'Waste collection, lifts, security, and shared building maintenance.', landlord: 'Landlord pays', landlordHint: 'There is no extra monthly charge for the tenant.', tenant: 'Tenant pays', tenantHint: 'Enter the monthly service charge below.', serviceFee: 'Monthly service charge', feeCurrency: 'The amount uses the rent currency.', feeRequired: 'Enter the monthly service charge when the tenant pays it.',
  },
  ru: {
    parkingTitle: 'Тип парковки', parkingHint: 'Укажите, какая парковка доступна жильцу.', noParking: 'Нет парковки', surface: 'Наземная', underground: 'Подземная', bothParking: 'Оба варианта',
    serviceTitle: 'Ежемесячные услуги дома', serviceHint: 'Вывоз мусора, лифты, охрана и обслуживание общих зон.', landlord: 'Платит арендодатель', landlordHint: 'Для арендатора дополнительной ежемесячной оплаты нет.', tenant: 'Платит арендатор', tenantHint: 'Ниже обязательно укажите ежемесячную стоимость.', serviceFee: 'Стоимость услуг в месяц', feeCurrency: 'Сумма указывается в валюте аренды.', feeRequired: 'Укажите стоимость ежемесячных услуг, если их оплачивает арендатор.',
  },
} as const

function emptyListing(userName = '', phone = '', telegram = '', whatsapp = '', showName = true): ListingPayload {
  const [longitude, latitude] = districtCenter('yasamal')
  return {
    title: '', description: '', property_type: 'apartment', district: 'yasamal', address: '',
    latitude, longitude, monthly_rent: 0,
    rent_currency: 'AZN',
    deposit: null, area_sqm: 0, rooms: 2, bedrooms: 1, bathrooms: 1, max_guests: 2,
    furnished: true, floor: null, total_floors: null, has_elevator: false, has_balcony: false,
    has_parking: false, parking_type: null, has_air_conditioning: false, has_heating: false, pets_allowed: false,
    smoking_allowed: false, utilities_included: false, service_fee_payer: 'landlord', monthly_service_fee: null, minimum_lease_months: 1,
    discount_tiers: [],
    available_from: null, contact_name: userName, contact_phone: phone, contact_method: 'both', show_contact_name: showName,
    contact_telegram: telegram || null, contact_whatsapp: whatsapp || null,
  }
}

function listingPayload(listing: Listing): ListingPayload {
  const {
    id: _id,
    owner_id: _owner,
    status: _status,
    media: _media,
    monthly_rent_azn: _azn,
    nearby_places: _nearby,
    nearby_updated_at: _nearbyUpdated,
    created_at: _created,
    updated_at: _updated,
    published_at: _published,
    contact_phone,
    ...payload
  } = listing
  return { ...payload, contact_phone: contact_phone || '' }
}

export default function AccountAccess({ lang, compact = false, onListingsChanged, onOverlayChange }: Props) {
  const { user, loading, login, register, logout } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const t = text[lang]

  useEffect(() => {
    onOverlayChange?.(authOpen || dashboardOpen)
  }, [authOpen, dashboardOpen, onOverlayChange])
  useEffect(() => () => onOverlayChange?.(false), [onOverlayChange])

  if (loading) return <span className="account-loading" role="status" aria-label={t.saving} />
  const overlay = <AnimatePresence initial={false}>
    {authOpen && <AuthModal lang={lang} onClose={() => setAuthOpen(false)} login={login} register={register} onSuccess={() => { setAuthOpen(false); setDashboardOpen(true) }} />}
    {dashboardOpen && user && <UiErrorBoundary lang={lang} onClose={() => setDashboardOpen(false)}><Dashboard lang={lang} onClose={() => setDashboardOpen(false)} onLogout={async () => { await logout(); setDashboardOpen(false) }} onListingsChanged={onListingsChanged} /></UiErrorBoundary>}
  </AnimatePresence>
  const displayName = user?.full_name.trim().split(/\s+/)[0] || t.account
  return <>
    <button
      type="button"
      className={`account-trigger${compact ? ' compact' : ''}${user ? ' is-authenticated' : ''}`}
      onClick={() => user ? setDashboardOpen(true) : setAuthOpen(true)}
      aria-label={user ? `${t.account}: ${user.full_name}` : t.login}
      aria-haspopup="dialog"
      aria-expanded={user ? dashboardOpen : authOpen}
    >
      <span className="account-trigger__avatar" aria-hidden="true">
        {user ? user.full_name.slice(0, 1).toUpperCase() : <svg viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>}
      </span>
      {!compact && <span className="account-trigger__copy"><strong>{user ? displayName : t.login}</strong><small>{t.account}</small></span>}
      {!compact && <svg className="account-trigger__chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 8 3 3 3-3" /></svg>}
    </button>
    {createPortal(overlay, document.body)}
  </>
}

function AzerbaijaniPhoneField({ label, value, onChange, invalidMessage, hint, required = false, forceInvalid = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  invalidMessage: string
  hint: string
  required?: boolean
  forceInvalid?: boolean
}) {
  const inputId = useId()
  const helpId = `${inputId}-help`
  const errorId = `${inputId}-error`
  const [touched, setTouched] = useState(false)
  const invalid = forceInvalid || ((touched || value.length >= 13) && ((required && !value) || (!!value && !isValidAzPhone(value))))

  return <label className="phone-field" htmlFor={inputId}>
    {label}
    <input
      id={inputId}
      name="phone"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      required={required}
      maxLength={17}
      value={formatAzPhone(value)}
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : helpId}
      onBlur={() => setTouched(true)}
      onChange={(event) => onChange(normalizeAzPhone(event.target.value))}
    />
    {invalid
      ? <small id={errorId} className="field-error" role="alert">{invalidMessage}</small>
      : <small id={helpId} className="field-hint">{hint}</small>}
  </label>
}

function AuthModal({ lang, onClose, login, register, onSuccess }: {
  lang: Lang; onClose: () => void; login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; full_name: string; phone?: string }) => Promise<void>; onSuccess: () => void
}) {
  const t = text[lang]
  const validation = validationCopy[lang]
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [phoneInvalid, setPhoneInvalid] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const cleanEmail = email.trim().toLowerCase()
    setEmailTouched(true)
    const hasInvalidPhone = mode === 'register' && !!phone && !isValidAzPhone(phone)
    setPhoneInvalid(hasInvalidPhone)
    if (!isValidEmail(cleanEmail) || hasInvalidPhone) return
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      if (mode === 'login') await login(cleanEmail, String(data.get('password')))
      else await register({ email: cleanEmail, password: String(data.get('password')), full_name: String(data.get('full_name')), phone })
      onSuccess()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setBusy(false) }
  }
  return <><ErrorToast message={error} lang={lang} onDismiss={() => setError('')} /><motion.div className="account-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .22 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <motion.section className="auth-modal" initial={{ opacity: 0, y: 32, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: .98 }} transition={{ duration: .34, ease: [.22, 1, .36, 1] }}>
      <button type="button" className="account-close" onClick={onClose} aria-label={t.close}>×</button>
      <HouseLogo className="auth-logo" /><p>BAKU · RENTAL ACCOUNT</p><h2>{mode === 'login' ? t.signin : t.signup}</h2>
      <form onSubmit={submit}>
        {mode === 'register' && <><label>{t.name}<input name="full_name" required minLength={2} autoComplete="name" /></label><AzerbaijaniPhoneField label={t.phone} value={phone} onChange={(value) => { setPhone(value); setPhoneInvalid(false) }} invalidMessage={validation.invalidPhone} hint={validation.phoneHint} forceInvalid={phoneInvalid} /></>}
        <label>{t.email}<input name="email" type="email" required autoComplete="email" value={email} aria-invalid={emailTouched && !isValidEmail(email)} aria-describedby={emailTouched && !isValidEmail(email) ? 'auth-email-error' : undefined} onBlur={() => setEmailTouched(true)} onChange={(event) => setEmail(event.target.value)} />{emailTouched && !isValidEmail(email) && <small id="auth-email-error" className="field-error" role="alert">{validation.invalidEmail}</small>}</label>
        <label>{t.password}<input name="password" type="password" required minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        <button type="submit" disabled={busy}>{busy ? t.saving : mode === 'login' ? t.login : t.signup}</button>
      </form>
      <button type="button" className="auth-mode" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setEmailTouched(false); setPhoneInvalid(false) }}>{mode === 'login' ? `${t.noAccount} ${t.signup}` : `${t.hasAccount} ${t.login}`}</button>
    </motion.section>
  </motion.div></>
}

function Dashboard({ lang, onClose, onLogout, onListingsChanged }: { lang: Lang; onClose: () => void; onLogout: () => Promise<void>; onListingsChanged?: () => void }) {
  const { user, updateProfile } = useAuth()
  const t = text[lang]
  const x = extra[lang]
  const validation = validationCopy[lang]
  const mediaText = mediaEditorCopy[lang]
  const propertyCosts = propertyCostsCopy[lang]
  const [tab, setTab] = useState<DashboardTab>('list')
  const [listings, setListings] = useState<Listing[]>([])
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<Listing | null>(null)
  const freshListing = () => emptyListing(user?.full_name, user?.phone || '', user?.telegram || '', user?.whatsapp || '', user?.show_full_name ?? true)
  const [form, setForm] = useState<ListingPayload>(freshListing)
  const [existingMedia, setExistingMedia] = useState<ListingMedia[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [plans, setPlans] = useState<File[]>([])
  const [videos, setVideos] = useState<File[]>([])
  const [publishNow, setPublishNow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ kind: 'publish' | 'archive' | 'delete'; id: string } | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [favorites, setFavorites] = useState<Listing[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSending, setChatSending] = useState(false)
  const [rates, setRates] = useState<Record<Currency, number> | null>(null)
  const [profile, setProfile] = useState({ full_name: user?.full_name || '', phone: user?.phone || '', telegram: user?.telegram || '', whatsapp: user?.whatsapp || '', show_full_name: user?.show_full_name ?? true })
  const [profilePhoneInvalid, setProfilePhoneInvalid] = useState(false)
  const [listingPhoneInvalid, setListingPhoneInvalid] = useState(false)

  useEffect(() => { api.myListings().then(setListings).catch((err) => setError(err.message)) }, [refresh])
  useEffect(() => { api.exchangeRates().then((data) => setRates(data.rates)).catch(() => setRates(null)) }, [])
  useEffect(() => {
    if (tab === 'favorites') api.favorites().then(setFavorites).catch((err) => setError(err.message))
    if (tab === 'chat') api.conversations().then(setConversations).catch((err) => setError(err.message))
  }, [tab])
  useEffect(() => { if (activeConversation) api.messages(activeConversation).then(setChatMessages).catch((err) => setError(err.message)) }, [activeConversation])
  const statuses = useMemo(() => ({ draft: t.draft, published: t.published, archived: t.archived }), [t])
  const activeChat = conversations.find((item) => item.id === activeConversation) || null

  const field = (name: keyof ListingPayload, value: unknown) => setForm((current) => ({ ...current, [name]: value }))
  const setBooleanField = (name: ListingBooleanField, checked: boolean) => {
    setForm((current) => current[name] === checked ? current : { ...current, [name]: checked })
  }
  const setParkingType = (parkingType: ParkingType | null) => {
    setForm((current) => ({ ...current, parking_type: parkingType, has_parking: parkingType !== null }))
  }
  const setServiceFeePayer = (payer: ServiceFeePayer) => {
    setForm((current) => ({
      ...current,
      service_fee_payer: payer,
      monthly_service_fee: payer === 'landlord' ? null : current.monthly_service_fee,
    }))
  }
  const changeDistrict = (value: DistrictId) => {
    const [longitude, latitude] = districtCenter(value)
    setForm((current) => ({ ...current, district: value, longitude, latitude }))
  }
  const addDiscountTier = () => {
    const lastMonths = Math.max(form.minimum_lease_months, ...form.discount_tiers.map((tier) => tier.min_months), 0)
    field('discount_tiers', [...form.discount_tiers, { min_months: Math.min(120, lastMonths + (lastMonths < 6 ? 3 : 6)), discount_percent: 5 }])
  }
  const updateDiscountTier = (index: number, key: 'min_months' | 'discount_percent', value: number) => {
    field('discount_tiers', form.discount_tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, [key]: value } : tier))
  }
  const removeDiscountTier = (index: number) => field('discount_tiers', form.discount_tiers.filter((_, tierIndex) => tierIndex !== index))
  const changeLocation = useCallback((latitude: number, longitude: number) => {
    setForm((current) => ({ ...current, latitude, longitude }))
  }, [])
  const mediaValidationError = lang === 'ru'
    ? 'Файл не поддерживается или превышает допустимый размер.'
    : lang === 'az'
      ? 'Fayl dəstəklənmir və ya icazə verilən ölçüdən böyükdür.'
      : 'The file type is not supported or the file is too large.'
  const clearUploads = () => { setPhotos([]); setPlans([]); setVideos([]) }
  const startCreate = () => {
    setEditing(null); setExistingMedia([]); clearUploads(); setPublishNow(true)
    setForm(freshListing()); setListingPhoneInvalid(false); setMessage(''); setError(''); setTab('new')
  }
  const startEdit = (listing: Listing) => {
    setEditing(listing); setExistingMedia(listing.media); clearUploads(); setPublishNow(false)
    setForm(listingPayload(listing)); setListingPhoneInvalid(false); setMessage(''); setError(''); setTab('edit')
  }
  const finishForm = () => {
    setEditing(null); setExistingMedia([]); clearUploads(); setForm(freshListing()); setTab('list')
  }
  const uploadNewMedia = async (listingId: string) => {
    const existingPhotos = existingMedia.filter((item) => item.media_type === 'image')
    const nextOrder = (type: MediaType) => Math.max(-1, ...existingMedia.filter((item) => item.media_type === type).map((item) => item.sort_order)) + 1
    const uploads = [
      ...photos.map((file, index) => ({ file, type: 'image' as const, cover: !existingPhotos.length && index === 0, order: nextOrder('image') + index })),
      ...plans.map((file, index) => ({ file, type: 'floor_plan' as const, cover: false, order: nextOrder('floor_plan') + index })),
      ...videos.map((file, index) => ({ file, type: 'video' as const, cover: false, order: nextOrder('video') + index })),
    ]
    setUploadProgress({ completed: 0, total: uploads.length })
    for (const [index, upload] of uploads.entries()) {
      const created = await api.uploadMedia(listingId, upload.file, upload.type, upload.cover, upload.order)
      setExistingMedia((current) => [...current, created])
      if (upload.type === 'image') setPhotos((current) => current.filter((file) => file !== upload.file))
      if (upload.type === 'floor_plan') setPlans((current) => current.filter((file) => file !== upload.file))
      if (upload.type === 'video') setVideos((current) => current.filter((file) => file !== upload.file))
      setUploadProgress({ completed: index + 1, total: uploads.length })
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    const phoneRequired = form.contact_method !== 'messages'
    const hasInvalidPhone = (phoneRequired && !form.contact_phone) || (!!form.contact_phone && !isValidAzPhone(form.contact_phone))
    setListingPhoneInvalid(hasInvalidPhone)
    if (hasInvalidPhone) return
    setBusy(true)
    try {
      const hasPhoto = existingMedia.some((item) => item.media_type === 'image') || photos.length > 0
      if (((!editing && publishNow) || editing?.status === 'published') && !hasPhoto) throw new Error(t.atLeastPhoto)
      if (form.service_fee_payer === 'tenant' && (!form.monthly_service_fee || form.monthly_service_fee <= 0)) throw new Error(propertyCosts.feeRequired)

      const saved = editing ? await api.updateListing(editing.id, form) : await api.createListing(form)
      await uploadNewMedia(saved.id)
      if (!editing && publishNow) await api.publishListing(saved.id)
      if (editing && editing.status !== 'published' && publishNow) await api.publishListing(saved.id)

      setMessage(editing ? t.updated : t.created)
      finishForm(); setRefresh((value) => value + 1); onListingsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setBusy(false); setUploadProgress(null) }
  }
  const action = async (kind: 'publish' | 'archive' | 'delete', id: string) => {
    if (pendingAction) return
    if (kind === 'delete' && !window.confirm(lang === 'ru' ? 'Удалить объявление без возможности восстановления?' : lang === 'az' ? 'Elanı bərpa imkanı olmadan silmək?' : 'Delete this listing permanently?')) return
    setPendingAction({ kind, id }); setError('')
    try {
      if (kind === 'publish') {
        const updated = await api.publishListing(id)
        setListings((current) => current.map((listing) => listing.id === id ? updated : listing))
      }
      if (kind === 'archive') {
        const updated = await api.archiveListing(id)
        setListings((current) => current.map((listing) => listing.id === id ? updated : listing))
      }
      if (kind === 'delete') {
        await api.deleteListing(id)
        setListings((current) => current.filter((listing) => listing.id !== id))
      }
      setRefresh((value) => value + 1); onListingsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setPendingAction(null) }
  }
  const removeMedia = async (media: ListingMedia) => {
    if (!window.confirm(t.confirmMedia)) return
    setError('')
    try {
      await api.deleteMedia(media.id)
      setExistingMedia((current) => current.filter((item) => item.id !== media.id))
      setRefresh((value) => value + 1); onListingsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) }
  }
  const makeCover = async (media: ListingMedia) => {
    setError('')
    try {
      await api.setMediaCover(media.id)
      setExistingMedia((current) => current.map((item) => ({ ...item, is_cover: item.id === media.id })))
      setRefresh((value) => value + 1); onListingsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) }
  }
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const hasInvalidPhone = !!profile.phone && !isValidAzPhone(profile.phone)
    setProfilePhoneInvalid(hasInvalidPhone)
    if (hasInvalidPhone) return
    setBusy(true)
    try { await updateProfile(profile); setMessage(x.profileSaved) } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setBusy(false) }
  }
  const sendChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeConversation || chatSending) return
    const formElement = event.currentTarget
    const data = new FormData(formElement); const body = String(data.get('body') || '').trim()
    if (!body) return
    setChatSending(true); setError('')
    try {
      const item = await api.sendMessage(activeConversation, body)
      setChatMessages((current) => [...current, item])
      setConversations((current) => current.map((conversation) => conversation.id === activeConversation ? { ...conversation, last_message: item, updated_at: item.created_at } : conversation))
      formElement.reset()
      formElement.querySelector<HTMLInputElement>('input[name="body"]')?.focus()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setChatSending(false) }
  }

  return <><ErrorToast message={error} lang={lang} onDismiss={() => setError('')} /><motion.div className="account-backdrop dashboard-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .24 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <motion.section className="dashboard" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: .46, ease: [.22, 1, .36, 1] }}>
      {busy && (tab === 'new' || tab === 'edit') && <div className="dashboard-busy"><BrandedLoader label={x.savingListing} detail={uploadProgress?.total ? `${x.watermarking} · ${uploadProgress.completed}/${uploadProgress.total}` : x.watermarking} /></div>}
      <header><div><HouseLogo className="auth-logo" /><div><p>{user?.email}</p><h2>{t.account}</h2></div></div><button type="button" className="account-close" onClick={onClose}>×</button></header>
      <nav><button type="button" className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>{t.my}<b>{listings.length}</b></button><button type="button" className={tab === 'new' ? 'active' : ''} onClick={startCreate}>{t.add}</button>{tab === 'edit' && <button type="button" className="active">{t.editing}</button>}<button type="button" className={tab === 'favorites' ? 'active' : ''} onClick={() => setTab('favorites')}>{x.favorites}</button><button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>{x.chat}</button><button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>{x.profile}</button><button type="button" onClick={onLogout}>{t.logout}</button></nav>
      <main>
        {message && <div className="account-success">{message}</div>}
        {tab === 'list' ? <div className="dashboard-list">{listings.length ? listings.map((listing) => {
          const cover = listing.media.find((media) => media.is_cover) || listing.media.find((media) => media.media_type === 'image')
          const pendingKind = pendingAction?.id === listing.id ? pendingAction.kind : null
          const actionsLocked = pendingAction !== null
          return <article key={listing.id} aria-busy={pendingKind !== null}>{cover ? <img src={mediaUrl(cover.url)} alt="" /> : <div className="dashboard-placeholder">⌂</div>}<div><span className={`status ${listing.status}`}>{statuses[listing.status]}</span><h3>{listing.title}</h3><p>{Number(listing.monthly_rent).toLocaleString()} ₼ · {listing.area_sqm} m²</p><div>{listing.status === 'published' && <a className="edit" href={listingUrl(listing.id)} target="_blank" rel="noopener noreferrer">{x.openListing}</a>}<button type="button" className="edit" disabled={actionsLocked} onClick={() => startEdit(listing)}>{t.edit}</button>{listing.status !== 'published' && <button type="button" className={`listing-status-action${pendingKind === 'publish' ? ' loading' : ''}`} disabled={actionsLocked} aria-busy={pendingKind === 'publish'} onClick={() => action('publish', listing.id)}>{pendingKind === 'publish' ? <><span className="listing-action-spinner" aria-hidden="true" />{x.publishing}</> : t.publish}</button>}{listing.status === 'published' && <button type="button" className={`listing-status-action${pendingKind === 'archive' ? ' loading' : ''}`} disabled={actionsLocked} aria-busy={pendingKind === 'archive'} onClick={() => action('archive', listing.id)}>{pendingKind === 'archive' ? <><span className="listing-action-spinner" aria-hidden="true" />{x.archiving}</> : t.archive}</button>}<button type="button" className="danger" disabled={actionsLocked} onClick={() => action('delete', listing.id)}>{t.remove}</button></div></div></article>
        }) : <div className="dashboard-empty">{t.empty}<button type="button" onClick={startCreate}>{t.add}</button></div>}</div> : tab === 'favorites' ?
        <div className="dashboard-list">{favorites.length ? favorites.map((listing) => { const cover = listing.media.find((item) => item.is_cover) || listing.media.find((item) => item.media_type === 'image'); return <article key={listing.id}>{cover ? <a className="dashboard-listing-image" href={listingUrl(listing.id)} target="_blank" rel="noopener noreferrer"><img src={mediaUrl(cover.url)} alt={listing.title} /></a> : <div className="dashboard-placeholder">⌂</div>}<div><h3><a href={listingUrl(listing.id)} target="_blank" rel="noopener noreferrer">{listing.title}</a></h3><p>{Number(listing.monthly_rent).toLocaleString()} {listing.rent_currency} · {listing.area_sqm} m²</p><div><a className="edit" href={listingUrl(listing.id)} target="_blank" rel="noopener noreferrer">{x.openListing}</a><button type="button" className="danger" onClick={async () => { try { await api.removeFavorite(listing.id); setFavorites((current) => current.filter((item) => item.id !== listing.id)) } catch (err) { setError(err instanceof Error ? err.message : t.error) } }}>{t.remove}</button></div></div></article> }) : <div className="dashboard-empty">{x.favorites}</div>}</div> : tab === 'chat' ?
        <div className="chat-layout"><aside>{conversations.length ? conversations.map((item) => <button type="button" key={item.id} className={activeConversation === item.id ? 'active' : ''} onClick={() => setActiveConversation(item.id)}><b>{item.counterpart_name}</b><span>{item.listing_title}</span><small>{item.last_message?.body || '…'}</small></button>) : <p>{x.noChats}</p>}</aside><section>{activeConversation && activeChat ? <><a className={`chat-property-context${activeChat.listing_status !== 'published' ? ' unavailable' : ''}`} href={activeChat.listing_status === 'published' ? listingUrl(activeChat.listing_id) : undefined} target={activeChat.listing_status === 'published' ? '_blank' : undefined} rel="noopener noreferrer" aria-disabled={activeChat.listing_status !== 'published'}>
          {activeChat.listing_cover_url ? <img src={mediaUrl(activeChat.listing_cover_url)} alt="" /> : <span className="chat-property-placeholder"><HouseLogo /></span>}
          <span className="chat-property-copy"><small>{x.listingContext}</small><b>{activeChat.listing_title}</b><span>{activeChat.listing_address} · {districtLabel(activeChat.listing_district, lang)}</span></span>
          <strong>{Number(activeChat.listing_monthly_rent).toLocaleString()} {currencySymbol[activeChat.listing_rent_currency]}<small>{activeChat.listing_status === 'published' ? x.openListing : x.unavailableListing}</small></strong>
        </a><div className="chat-messages">{chatMessages.map((item) => <div key={item.id} className={item.sender_id === user?.id ? 'mine' : ''}>{item.body}<small>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>)}</div><form onSubmit={sendChat}><input name="body" required maxLength={2000} placeholder={x.messagePlaceholder} aria-label={x.messagePlaceholder} disabled={chatSending} /><button type="submit" disabled={chatSending} aria-busy={chatSending}>{chatSending ? x.sending : x.send}</button></form></> : <div className="dashboard-empty">{x.chooseChat}</div>}</section></div> : tab === 'profile' ?
        <form className="profile-form" onSubmit={saveProfile}><h3>{x.profile}</h3><label>{t.name}<input required value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} /></label><AzerbaijaniPhoneField label={t.phone} value={profile.phone} onChange={(value) => { setProfile({ ...profile, phone: value }); setProfilePhoneInvalid(false) }} invalidMessage={validation.invalidPhone} hint={validation.phoneHint} forceInvalid={profilePhoneInvalid} /><label>{x.telegram}<input placeholder="@username" value={profile.telegram} onChange={(event) => setProfile({ ...profile, telegram: event.target.value })} /></label><label>{x.whatsapp}<input value={profile.whatsapp} onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })} /></label><label className="profile-check"><input type="checkbox" checked={profile.show_full_name} onChange={(event) => setProfile({ ...profile, show_full_name: event.target.checked })} />{x.showName}</label><button type="submit" disabled={busy}>{busy ? t.saving : t.saveChanges}</button></form> :
        <form className="listing-form" onSubmit={submit}>
          {editing && <div className="editing-banner"><div><strong>{t.editing}</strong><span>{editing.status === 'published' ? t.publishedHint : statuses[editing.status]}</span></div><button type="button" onClick={finishForm}>{t.cancel}</button></div>}
          <section><h3>{t.details}</h3><div className="form-grid">
            <label className="wide">{t.title}<input required minLength={5} value={form.title} onChange={(e) => field('title', e.target.value)} /></label>
            <label className="wide">{t.description}<textarea required minLength={20} rows={5} value={form.description} onChange={(e) => field('description', e.target.value)} /></label>
            <label>{t.type}<select value={form.property_type} onChange={(e) => field('property_type', e.target.value as PropertyType)}>{(Object.keys(propertyLabels[lang]) as PropertyType[]).map((value) => <option key={value} value={value}>{propertyLabels[lang][value]}</option>)}</select></label>
            <label>{t.district}<select value={form.district} onChange={(e) => changeDistrict(e.target.value as DistrictId)}>{districts.map((item) => <option key={item.id} value={item.id}>{districtLabel(item.id, lang)}</option>)}</select></label>
            <AddressAutocomplete
              lang={lang}
              label={t.address}
              value={form.address}
              onChange={(address) => field('address', address)}
              onSelect={(suggestion) => setForm((current) => ({
                ...current,
                address: suggestion.label,
                latitude: Number(suggestion.latitude.toFixed(6)),
                longitude: Number(suggestion.longitude.toFixed(6)),
              }))}
            />
            <NumberField label={t.rent} value={form.monthly_rent} onChange={(value) => field('monthly_rent', value)} required />
            <label>{x.currency}<select value={form.rent_currency} onChange={(event) => field('rent_currency', event.target.value as Currency)}>{(['AZN', 'USD', 'EUR', 'RUB'] as Currency[]).map((currency) => <option key={currency}>{currency}</option>)}</select>{rates && <small className="currency-preview">{x.aznEquivalent}: ≈ {(form.monthly_rent / rates[form.rent_currency]).toLocaleString(undefined, { maximumFractionDigits: 2 })} ₼</small>}</label>
            <NumberField label={t.deposit} value={form.deposit || 0} onChange={(value) => field('deposit', value || null)} />
            <NumberField label={t.area} value={form.area_sqm} onChange={(value) => field('area_sqm', value)} required />
            <NumberField label={t.rooms} value={form.rooms} onChange={(value) => field('rooms', value)} />
            <NumberField label={t.bedrooms} value={form.bedrooms} onChange={(value) => field('bedrooms', value)} />
            <NumberField label={t.bathrooms} value={form.bathrooms} onChange={(value) => field('bathrooms', value)} />
            <NumberField label={t.guests} value={form.max_guests} onChange={(value) => field('max_guests', value)} />
            <NumberField label={t.floor} value={form.floor || 0} onChange={(value) => field('floor', value || null)} />
            <NumberField label={t.floors} value={form.total_floors || 0} onChange={(value) => field('total_floors', value || null)} />
            <NumberField label={t.lease} value={form.minimum_lease_months} onChange={(value) => field('minimum_lease_months', value)} />
            <label>{t.available}<input type="date" value={form.available_from || ''} onChange={(e) => field('available_from', e.target.value || null)} /></label>
          </div></section>
          <section className="discount-builder"><div className="discount-builder__heading"><div><h3>{x.discounts}</h3><p>{x.discountHint}</p></div><button type="button" onClick={addDiscountTier}>＋ {x.addDiscount}</button></div>
            {form.discount_tiers.length > 0 && <div className="discount-tier-list">{form.discount_tiers.map((tier, index) => <div className="discount-tier" key={`${index}-${tier.min_months}`}>
              <NumberField label={x.fromMonths} value={tier.min_months} onChange={(value) => updateDiscountTier(index, 'min_months', value)} />
              <NumberField label={x.percent} value={tier.discount_percent} onChange={(value) => updateDiscountTier(index, 'discount_percent', value)} step="0.5" />
              <div className="discount-tier__preview"><span>{x.monthlyTotal}</span><b>{(form.monthly_rent * (1 - tier.discount_percent / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.rent_currency}</b></div>
              <button type="button" className="discount-tier__remove" onClick={() => removeDiscountTier(index)} aria-label={x.removeTier}>×</button>
            </div>)}</div>}
          </section>
          <section><h3>{t.coordinates}</h3><LocationPicker lang={lang} latitude={Number(form.latitude)} longitude={Number(form.longitude)} onChange={changeLocation} /></section>
          <section><h3>{t.amenities}</h3><div className="check-grid">{([
            ['furnished', t.furnished], ['has_elevator', t.elevator], ['has_balcony', t.balcony], ['has_air_conditioning', t.ac], ['has_heating', t.heating], ['pets_allowed', t.pets], ['smoking_allowed', t.smoking], ['utilities_included', t.utilities],
          ] as [ListingBooleanField, string][]).map(([name, label]) => {
            const selected = form[name]
            return <button
              type="button"
              key={name}
              className={selected ? 'active' : ''}
              aria-pressed={selected}
              onClick={() => setBooleanField(name, !selected)}
            ><span aria-hidden="true" />{label}</button>
          })}</div>
            <div className="property-option-group"><div className="property-option-group__heading"><b>{propertyCosts.parkingTitle}</b><p>{propertyCosts.parkingHint}</p></div><div className="property-choice-grid parking-choices">{([
              [null, propertyCosts.noParking], ['surface', propertyCosts.surface], ['underground', propertyCosts.underground], ['both', propertyCosts.bothParking],
            ] as [ParkingType | null, string][]).map(([value, label]) => <button type="button" key={value || 'none'} className={form.parking_type === value ? 'active' : ''} aria-pressed={form.parking_type === value} onClick={() => setParkingType(value)}><i aria-hidden="true">{form.parking_type === value ? '✓' : ''}</i><span>{label}</span></button>)}</div></div>
            <div className="property-option-group service-fee-group"><div className="property-option-group__heading"><b>{propertyCosts.serviceTitle}</b><p>{propertyCosts.serviceHint}</p></div><div className="property-choice-grid">{([
              ['landlord', propertyCosts.landlord, propertyCosts.landlordHint], ['tenant', propertyCosts.tenant, propertyCosts.tenantHint],
            ] as [ServiceFeePayer, string, string][]).map(([value, label, hint]) => <button type="button" key={value} className={form.service_fee_payer === value ? 'active' : ''} aria-pressed={form.service_fee_payer === value} onClick={() => setServiceFeePayer(value)}><i aria-hidden="true">{form.service_fee_payer === value ? '✓' : ''}</i><span><b>{label}</b><small>{hint}</small></span></button>)}</div>
              {form.service_fee_payer === 'tenant' && <div className="service-fee-input"><NumberField label={`${propertyCosts.serviceFee}, ${form.rent_currency}`} value={form.monthly_service_fee || 0} onChange={(value) => field('monthly_service_fee', value || null)} required step="0.01" /><small>{propertyCosts.feeCurrency}</small></div>}
            </div>
          </section>
          <section className="media-editor">
            <header className="media-editor__heading"><div><h3>{mediaText.title}</h3><p>{editing ? mediaText.editHint : mediaText.createHint}</p></div>{editing && <strong>{existingMedia.length}</strong>}</header>
            {editing && <MediaManager media={existingMedia} t={t} onCover={makeCover} onRemove={removeMedia} />}
            <div className="media-inputs"><FileField label={`＋ ${t.photos}`} accept="image/jpeg,image/png,image/webp,image/avif" files={photos} multiple maxBytes={15 * 1024 * 1024} onError={setError} errorMessage={mediaValidationError} onChange={setPhotos} hint="JPG, PNG, WebP · max 15 MB" fileWord={t.files} /><FileField label={`＋ ${t.plan}`} accept="image/jpeg,image/png,image/webp,image/avif" files={plans} multiple maxBytes={15 * 1024 * 1024} onError={setError} errorMessage={mediaValidationError} onChange={setPlans} hint="Image · max 15 MB" fileWord={t.files} /><FileField label={`＋ ${t.video}`} accept="video/mp4,video/webm,video/quicktime" files={videos} multiple maxBytes={100 * 1024 * 1024} onError={setError} errorMessage={mediaValidationError} onChange={setVideos} hint="MP4, WebM · max 100 MB" fileWord={t.files} /></div>
            {(photos.length + plans.length + videos.length) > 0 && <div className="pending-media"><header><div><b>{mediaText.selected}</b><span>{mediaText.pending}</span></div><strong>{photos.length + plans.length + videos.length}</strong></header>{([
              ...photos.map((file) => ({ file, type: 'image' as const, label: t.photos })),
              ...plans.map((file) => ({ file, type: 'floor_plan' as const, label: t.plan })),
              ...videos.map((file) => ({ file, type: 'video' as const, label: t.video })),
            ]).map(({ file, type, label }) => <div key={`${type}-${file.name}-${file.lastModified}`}><span><b>{file.name}</b><small>{label} · {(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" aria-label={`${mediaText.remove}: ${file.name}`} onClick={() => {
              if (type === 'image') setPhotos((current) => current.filter((item) => item !== file))
              if (type === 'floor_plan') setPlans((current) => current.filter((item) => item !== file))
              if (type === 'video') setVideos((current) => current.filter((item) => item !== file))
            }}>×</button></div>)}</div>}
          </section>
          <section className="contact-settings"><h3>{t.contact}</h3><p>{x.contactHint}</p><div className="contact-methods">{([
            ['phone', x.phoneOnly, x.phoneOnlyHint], ['messages', x.messagesOnly, x.messagesOnlyHint], ['both', x.both, x.bothHint],
          ] as [ContactMethod, string, string][]).map(([value, label, hint]) => <label key={value} className={form.contact_method === value ? 'active' : ''}><input type="radio" name="contact_method" value={value} checked={form.contact_method === value} onChange={() => { field('contact_method', value); setListingPhoneInvalid(false) }} /><span><b>{label}</b><small>{hint}</small></span><i>✓</i></label>)}</div><div className="form-grid"><label>{t.name}<input required value={form.contact_name} onChange={(e) => field('contact_name', e.target.value)} /></label><AzerbaijaniPhoneField label={t.phone} value={form.contact_phone} onChange={(value) => { field('contact_phone', value); setListingPhoneInvalid(false) }} invalidMessage={validation.invalidPhone} hint={validation.phoneHint} required={form.contact_method !== 'messages'} forceInvalid={listingPhoneInvalid} /><label>{x.telegram}<input placeholder="@username" value={form.contact_telegram || ''} onChange={(e) => field('contact_telegram', e.target.value || null)} /></label><label>{x.whatsapp}<input value={form.contact_whatsapp || ''} onChange={(e) => field('contact_whatsapp', e.target.value || null)} /></label><label className="wide profile-check"><input type="checkbox" checked={form.show_contact_name} onChange={(event) => setBooleanField('show_contact_name', event.currentTarget.checked)} />{x.showName}</label></div></section>
          <div className="form-submit">{(!editing || editing.status !== 'published') && <label><input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} /><span />{t.createPublish}</label>}<button type="submit" disabled={busy}>{busy ? t.saving : editing ? t.saveChanges : publishNow ? t.createPublish : t.saveDraft}</button></div>
        </form>}
      </main>
    </motion.section>
  </motion.div></>
}

function MediaManager({ media, t, onCover, onRemove }: {
  media: ListingMedia[]
  t: typeof text[Lang]
  onCover: (media: ListingMedia) => void
  onRemove: (media: ListingMedia) => void
}) {
  const sections: Array<{ type: MediaType; label: string }> = [
    { type: 'image', label: t.photos }, { type: 'floor_plan', label: t.plan }, { type: 'video', label: t.video },
  ]
  return <div className="existing-media"><h3>{t.currentMedia}</h3>{sections.map((section) => {
    const items = media.filter((item) => item.media_type === section.type)
    return <div className="existing-media__group" key={section.type}><h4>{section.label}<span>{items.length}</span></h4>{items.length ? <div className="existing-media__grid">{items.map((item) => <article key={item.id}>
      {item.media_type === 'video' ? <video src={mediaUrl(item.url)} preload="metadata" /> : <img src={mediaUrl(item.url)} alt={item.caption || item.original_name} />}
      <div><span title={item.original_name}>{item.original_name}</span><div>{item.media_type === 'image' && (item.is_cover ? <b>{t.cover}</b> : <button type="button" onClick={() => onCover(item)}>{t.makeCover}</button>)}<button type="button" className="danger" onClick={() => onRemove(item)}>{t.deleteMedia}</button></div></div>
    </article>)}</div> : <p>{t.noMedia}</p>}</div>
  })}</div>
}

function FileField({ label, accept, files, multiple, maxBytes, onChange, onError, errorMessage, hint, fileWord }: {
  label: string; accept: string; files: File[]; multiple?: boolean; maxBytes: number; onChange: (files: File[]) => void; onError: (message: string) => void; errorMessage: string; hint: string; fileWord: string
}) {
  return <label>{label}<input type="file" accept={accept} multiple={multiple} onChange={(event) => {
    const selected = Array.from(event.currentTarget.files || [])
    const accepted = new Set(accept.split(','))
    if (selected.some((file) => file.size > maxBytes || !accepted.has(file.type))) {
      event.currentTarget.value = ''
      onError(errorMessage)
      return
    }
    onError('')
    const combined = [...files, ...selected].filter((file, index, all) => all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index)
    onChange(combined)
    event.currentTarget.value = ''
  }} /><span>{files.length ? `${files.length} ${fileWord}` : hint}</span></label>
}

function AddressAutocomplete({ lang, label, value, onChange, onSelect }: {
  lang: Lang
  label: string
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: AddressSuggestion) => void
}) {
  const inputId = useId()
  const menuId = `${inputId}-menu`
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const hint = lang === 'ru'
    ? 'Начните вводить улицу или адрес в Баку'
    : lang === 'az'
      ? 'Bakıda küçə və ya ünvanı yazmağa başlayın'
      : 'Start typing a street or address in Baku'

  useEffect(() => {
    const query = value.trim()
    if (query.length < 3) {
      setItems([])
      setLoading(false)
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      api.addressAutocomplete(query, lang)
        .then((suggestions) => {
          if (!active) return
          setItems(suggestions)
          if (document.activeElement === inputRef.current) setOpen(true)
        })
        .catch(() => { if (active) setItems([]) })
        .finally(() => { if (active) setLoading(false) })
    }, 320)
    return () => { active = false; window.clearTimeout(timer) }
  }, [lang, value])

  return <div className={`wide address-autocomplete${open ? ' is-open' : ''}`}>
    <label htmlFor={inputId}>{label}</label>
    <input
      ref={inputRef}
      id={inputId}
      required
      value={value}
      placeholder={hint}
      autoComplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open && (loading || items.length > 0)}
      aria-controls={menuId}
      onFocus={() => { if (value.trim().length >= 3) setOpen(true) }}
      onChange={(event) => { onChange(event.target.value); setOpen(true) }}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
      onBlur={() => window.setTimeout(() => setOpen(false), 220)}
    />
    {open && (loading || items.length > 0) && <div id={menuId} className="address-autocomplete__menu" role="listbox">
      {loading && <span className="address-autocomplete__loading">…</span>}
      {!loading && items.map((item) => <button
        key={item.place_id}
        type="button"
        role="option"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => { onSelect(item); setItems([]); setOpen(false) }}
      >
        <b>{item.label}</b>
        {item.district && <small>{item.district}</small>}
      </button>)}
    </div>}
  </div>
}

function NumberField({ label, value, onChange, required = false, step = '1' }: { label: string; value: number; onChange: (value: number) => void; required?: boolean; step?: string }) {
  return <label>{label}<input type="number" required={required} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}
