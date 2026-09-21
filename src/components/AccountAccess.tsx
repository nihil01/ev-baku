import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { api, mediaUrl } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type {
  DistrictId,
  AddressSuggestion,
  ChatMessage,
  Conversation,
  Currency,
  Lang,
  Listing,
  ListingMedia,
  ListingPayload,
  MediaType,
  PropertyType,
} from '../types/api'
import './AccountAccess.css'

type Props = { lang: Lang; compact?: boolean; onListingsChanged?: () => void }
type DashboardTab = 'list' | 'new' | 'edit' | 'favorites' | 'chat' | 'profile'
const LocationPicker = lazy(() => import('./LocationPicker'))

const extra = {
  az: { favorites: 'Seçilmişlər', chat: 'Çat', profile: 'Əlaqələr', telegram: 'Telegram', whatsapp: 'WhatsApp / username', showName: 'Ad və soyadı göstər', currency: 'Valyuta', aznEquivalent: 'AZN ekvivalenti', saved: 'Yadda saxlanıldı', send: 'Göndər', noChats: 'Hələ mesaj yoxdur', chooseChat: 'Söhbəti seçin', profileSaved: 'Profil yadda saxlanıldı' },
  en: { favorites: 'Favorites', chat: 'Chat', profile: 'Contacts', telegram: 'Telegram', whatsapp: 'WhatsApp / username', showName: 'Show full name publicly', currency: 'Currency', aznEquivalent: 'AZN equivalent', saved: 'Saved', send: 'Send', noChats: 'No conversations yet', chooseChat: 'Choose a conversation', profileSaved: 'Profile saved' },
  ru: { favorites: 'Избранное', chat: 'Чат', profile: 'Контакты', telegram: 'Телеграм', whatsapp: 'WhatsApp / username', showName: 'Показывать имя и фамилию', currency: 'Валюта', aznEquivalent: 'Эквивалент в AZN', saved: 'Сохранено', send: 'Отправить', noChats: 'Диалогов пока нет', chooseChat: 'Выберите диалог', profileSaved: 'Профиль сохранён' },
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

const districtCenters: Record<DistrictId, [number, number]> = {
  sabail: [49.83, 40.35], yasamal: [49.803, 40.386], nasimi: [49.839, 40.388],
  narimanov: [49.861, 40.407], khatai: [49.905, 40.379], nizami: [49.928, 40.415],
}

const districtLabels: Record<Lang, Record<DistrictId, string>> = {
  az: { sabail: 'Səbail', yasamal: 'Yasamal', nasimi: 'Nəsimi', narimanov: 'Nərimanov', khatai: 'Xətai', nizami: 'Nizami' },
  en: { sabail: 'Sabail', yasamal: 'Yasamal', nasimi: 'Nasimi', narimanov: 'Narimanov', khatai: 'Khatai', nizami: 'Nizami' },
  ru: { sabail: 'Сабаиль', yasamal: 'Ясамал', nasimi: 'Насими', narimanov: 'Нариманов', khatai: 'Хатаи', nizami: 'Низами' },
}

const propertyLabels: Record<Lang, Record<PropertyType, string>> = {
  az: { studio: 'Studiya', apartment: 'Mənzil', house: 'Ev', villa: 'Villa' },
  en: { studio: 'Studio', apartment: 'Apartment', house: 'House', villa: 'Villa' },
  ru: { studio: 'Студия', apartment: 'Квартира', house: 'Дом', villa: 'Вилла' },
}

function emptyListing(userName = '', phone = '', telegram = '', whatsapp = '', showName = true): ListingPayload {
  return {
    title: '', description: '', property_type: 'apartment', district: 'yasamal', address: '',
    latitude: districtCenters.yasamal[1], longitude: districtCenters.yasamal[0], monthly_rent: 0,
    rent_currency: 'AZN',
    deposit: null, area_sqm: 0, rooms: 2, bedrooms: 1, bathrooms: 1, max_guests: 2,
    furnished: true, floor: null, total_floors: null, has_elevator: false, has_balcony: false,
    has_parking: false, has_air_conditioning: false, has_heating: false, pets_allowed: false,
    smoking_allowed: false, utilities_included: false, minimum_lease_months: 1,
    available_from: null, contact_name: userName, contact_phone: phone, show_contact_name: showName,
    contact_telegram: telegram || null, contact_whatsapp: whatsapp || null,
  }
}

function listingPayload(listing: Listing): ListingPayload {
  const { id: _id, owner_id: _owner, status: _status, media: _media, monthly_rent_azn: _azn, created_at: _created, updated_at: _updated, published_at: _published, ...payload } = listing
  return payload
}

export default function AccountAccess({ lang, compact = false, onListingsChanged }: Props) {
  const { user, loading, login, register, logout } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const t = text[lang]

  if (loading) return <span className="account-loading" />
  return <>
    <button type="button" className={`account-trigger${compact ? ' compact' : ''}`} onClick={() => user ? setDashboardOpen(true) : setAuthOpen(true)}>
      <span>{user ? user.full_name.slice(0, 1).toUpperCase() : '○'}</span>{compact ? '' : user ? t.account : t.login}
    </button>
    <AnimatePresence>
      {authOpen && <AuthModal lang={lang} onClose={() => setAuthOpen(false)} login={login} register={register} onSuccess={() => { setAuthOpen(false); setDashboardOpen(true) }} />}
      {dashboardOpen && user && <Dashboard lang={lang} onClose={() => setDashboardOpen(false)} onLogout={async () => { await logout(); setDashboardOpen(false) }} onListingsChanged={onListingsChanged} />}
    </AnimatePresence>
  </>
}

function AuthModal({ lang, onClose, login, register, onSuccess }: {
  lang: Lang; onClose: () => void; login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; full_name: string; phone?: string }) => Promise<void>; onSuccess: () => void
}) {
  const t = text[lang]
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try {
      if (mode === 'login') await login(String(data.get('email')), String(data.get('password')))
      else await register({ email: String(data.get('email')), password: String(data.get('password')), full_name: String(data.get('full_name')), phone: String(data.get('phone') || '') })
      onSuccess()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setBusy(false) }
  }
  return <motion.div className="account-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <motion.section className="auth-modal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
      <button type="button" className="account-close" onClick={onClose} aria-label={t.close}>×</button>
      <div className="auth-logo">ev<span>.</span></div><p>BAKU · RENTAL ACCOUNT</p><h2>{mode === 'login' ? t.signin : t.signup}</h2>
      <form onSubmit={submit}>
        {mode === 'register' && <><label>{t.name}<input name="full_name" required minLength={2} autoComplete="name" /></label><label>{t.phone}<input name="phone" autoComplete="tel" /></label></>}
        <label>{t.email}<input name="email" type="email" required autoComplete="email" /></label>
        <label>{t.password}<input name="password" type="password" required minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <div className="account-error">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? t.saving : mode === 'login' ? t.login : t.signup}</button>
      </form>
      <button type="button" className="auth-mode" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? `${t.noAccount} ${t.signup}` : `${t.hasAccount} ${t.login}`}</button>
    </motion.section>
  </motion.div>
}

function Dashboard({ lang, onClose, onLogout, onListingsChanged }: { lang: Lang; onClose: () => void; onLogout: () => Promise<void>; onListingsChanged?: () => void }) {
  const { user, updateProfile } = useAuth()
  const t = text[lang]
  const x = extra[lang]
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
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [favorites, setFavorites] = useState<Listing[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [rates, setRates] = useState<Record<Currency, number> | null>(null)
  const [profile, setProfile] = useState({ full_name: user?.full_name || '', phone: user?.phone || '', telegram: user?.telegram || '', whatsapp: user?.whatsapp || '', show_full_name: user?.show_full_name ?? true })

  useEffect(() => { api.myListings().then(setListings).catch((err) => setError(err.message)) }, [refresh])
  useEffect(() => { api.exchangeRates().then((data) => setRates(data.rates)).catch(() => setRates(null)) }, [])
  useEffect(() => {
    if (tab === 'favorites') api.favorites().then(setFavorites).catch((err) => setError(err.message))
    if (tab === 'chat') api.conversations().then(setConversations).catch((err) => setError(err.message))
  }, [tab])
  useEffect(() => { if (activeConversation) api.messages(activeConversation).then(setChatMessages).catch((err) => setError(err.message)) }, [activeConversation])
  const statuses = useMemo(() => ({ draft: t.draft, published: t.published, archived: t.archived }), [t])

  const field = (name: keyof ListingPayload, value: unknown) => setForm((current) => ({ ...current, [name]: value }))
  const toggle = (name: keyof ListingPayload) => field(name, !form[name])
  const changeDistrict = (value: DistrictId) => {
    const [longitude, latitude] = districtCenters[value]
    setForm((current) => ({ ...current, district: value, longitude, latitude }))
  }
  const clearUploads = () => { setPhotos([]); setPlans([]); setVideos([]) }
  const startCreate = () => {
    setEditing(null); setExistingMedia([]); clearUploads(); setPublishNow(true)
    setForm(freshListing()); setMessage(''); setError(''); setTab('new')
  }
  const startEdit = (listing: Listing) => {
    setEditing(listing); setExistingMedia(listing.media); clearUploads(); setPublishNow(false)
    setForm(listingPayload(listing)); setMessage(''); setError(''); setTab('edit')
  }
  const finishForm = () => {
    setEditing(null); setExistingMedia([]); clearUploads(); setForm(freshListing()); setTab('list')
  }
  const uploadNewMedia = async (listingId: string) => {
    const existingPhotos = existingMedia.filter((item) => item.media_type === 'image')
    const nextOrder = (type: MediaType) => Math.max(-1, ...existingMedia.filter((item) => item.media_type === type).map((item) => item.sort_order)) + 1
    for (const [index, photo] of photos.entries()) await api.uploadMedia(listingId, photo, 'image', !existingPhotos.length && index === 0, nextOrder('image') + index)
    for (const [index, plan] of plans.entries()) await api.uploadMedia(listingId, plan, 'floor_plan', false, nextOrder('floor_plan') + index)
    for (const [index, video] of videos.entries()) await api.uploadMedia(listingId, video, 'video', false, nextOrder('video') + index)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const hasPhoto = existingMedia.some((item) => item.media_type === 'image') || photos.length > 0
      if (((!editing && publishNow) || editing?.status === 'published') && !hasPhoto) throw new Error(t.atLeastPhoto)

      const saved = editing ? await api.updateListing(editing.id, form) : await api.createListing(form)
      await uploadNewMedia(saved.id)
      if (!editing && publishNow) await api.publishListing(saved.id)
      if (editing && editing.status !== 'published' && publishNow) await api.publishListing(saved.id)

      setMessage(editing ? t.updated : t.created)
      finishForm(); setRefresh((value) => value + 1); onListingsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setBusy(false) }
  }
  const action = async (kind: 'publish' | 'archive' | 'delete', id: string) => {
    setError('')
    try {
      if (kind === 'delete' && !window.confirm(lang === 'ru' ? 'Удалить объявление без возможности восстановления?' : lang === 'az' ? 'Elanı bərpa imkanı olmadan silmək?' : 'Delete this listing permanently?')) return
      if (kind === 'publish') await api.publishListing(id)
      if (kind === 'archive') await api.archiveListing(id)
      if (kind === 'delete') await api.deleteListing(id)
      setRefresh((value) => value + 1); onListingsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : t.error) }
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
    event.preventDefault(); setBusy(true); setError('')
    try { await updateProfile(profile); setMessage(x.profileSaved) } catch (err) { setError(err instanceof Error ? err.message : t.error) } finally { setBusy(false) }
  }
  const sendChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeConversation) return
    const data = new FormData(event.currentTarget); const body = String(data.get('body') || '').trim()
    if (!body) return
    try { const item = await api.sendMessage(activeConversation, body); setChatMessages((current) => [...current, item]); event.currentTarget.reset() } catch (err) { setError(err instanceof Error ? err.message : t.error) }
  }

  return <motion.div className="account-backdrop dashboard-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section className="dashboard" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ ease: [0.22, 1, 0.36, 1], duration: .45 }}>
      <header><div><div className="auth-logo">ev<span>.</span></div><div><p>{user?.email}</p><h2>{t.account}</h2></div></div><button type="button" className="account-close" onClick={onClose}>×</button></header>
      <nav><button type="button" className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>{t.my}<b>{listings.length}</b></button><button type="button" className={tab === 'new' ? 'active' : ''} onClick={startCreate}>{t.add}</button>{tab === 'edit' && <button type="button" className="active">{t.editing}</button>}<button type="button" className={tab === 'favorites' ? 'active' : ''} onClick={() => setTab('favorites')}>{x.favorites}</button><button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>{x.chat}</button><button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>{x.profile}</button><button type="button" onClick={onLogout}>{t.logout}</button></nav>
      <main>
        {error && <div className="account-error">{error}</div>}{message && <div className="account-success">{message}</div>}
        {tab === 'list' ? <div className="dashboard-list">{listings.length ? listings.map((listing) => {
          const cover = listing.media.find((media) => media.is_cover) || listing.media.find((media) => media.media_type === 'image')
          return <article key={listing.id}>{cover ? <img src={mediaUrl(cover.url)} alt="" /> : <div className="dashboard-placeholder">⌂</div>}<div><span className={`status ${listing.status}`}>{statuses[listing.status]}</span><h3>{listing.title}</h3><p>{Number(listing.monthly_rent).toLocaleString()} ₼ · {listing.area_sqm} m²</p><div><button type="button" className="edit" onClick={() => startEdit(listing)}>{t.edit}</button>{listing.status !== 'published' && <button type="button" onClick={() => action('publish', listing.id)}>{t.publish}</button>}{listing.status === 'published' && <button type="button" onClick={() => action('archive', listing.id)}>{t.archive}</button>}<button type="button" className="danger" onClick={() => action('delete', listing.id)}>{t.remove}</button></div></div></article>
        }) : <div className="dashboard-empty">{t.empty}<button type="button" onClick={startCreate}>{t.add}</button></div>}</div> : tab === 'favorites' ?
        <div className="dashboard-list">{favorites.length ? favorites.map((listing) => { const cover = listing.media.find((item) => item.is_cover) || listing.media.find((item) => item.media_type === 'image'); return <article key={listing.id}>{cover ? <img src={mediaUrl(cover.url)} alt="" /> : <div className="dashboard-placeholder">⌂</div>}<div><h3>{listing.title}</h3><p>{Number(listing.monthly_rent).toLocaleString()} {listing.rent_currency} · {listing.area_sqm} m²</p><div><button type="button" className="danger" onClick={async () => { await api.removeFavorite(listing.id); setFavorites((current) => current.filter((item) => item.id !== listing.id)) }}>{t.remove}</button></div></div></article> }) : <div className="dashboard-empty">{x.favorites}</div>}</div> : tab === 'chat' ?
        <div className="chat-layout"><aside>{conversations.length ? conversations.map((item) => <button type="button" key={item.id} className={activeConversation === item.id ? 'active' : ''} onClick={() => setActiveConversation(item.id)}><b>{item.counterpart_name}</b><span>{item.listing_title}</span><small>{item.last_message?.body || '…'}</small></button>) : <p>{x.noChats}</p>}</aside><section>{activeConversation ? <><div className="chat-messages">{chatMessages.map((item) => <div key={item.id} className={item.sender_id === user?.id ? 'mine' : ''}>{item.body}<small>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>)}</div><form onSubmit={sendChat}><input name="body" required maxLength={2000} /><button type="submit">{x.send}</button></form></> : <div className="dashboard-empty">{x.chooseChat}</div>}</section></div> : tab === 'profile' ?
        <form className="profile-form" onSubmit={saveProfile}><h3>{x.profile}</h3><label>{t.name}<input required value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} /></label><label>{t.phone}<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label><label>{x.telegram}<input placeholder="@username" value={profile.telegram} onChange={(event) => setProfile({ ...profile, telegram: event.target.value })} /></label><label>{x.whatsapp}<input value={profile.whatsapp} onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })} /></label><label className="profile-check"><input type="checkbox" checked={profile.show_full_name} onChange={(event) => setProfile({ ...profile, show_full_name: event.target.checked })} />{x.showName}</label><button type="submit" disabled={busy}>{busy ? t.saving : t.saveChanges}</button></form> :
        <form className="listing-form" onSubmit={submit}>
          {editing && <div className="editing-banner"><div><strong>{t.editing}</strong><span>{editing.status === 'published' ? t.publishedHint : statuses[editing.status]}</span></div><button type="button" onClick={finishForm}>{t.cancel}</button></div>}
          <section><h3>{t.details}</h3><div className="form-grid">
            <label className="wide">{t.title}<input required minLength={5} value={form.title} onChange={(e) => field('title', e.target.value)} /></label>
            <label className="wide">{t.description}<textarea required minLength={20} rows={5} value={form.description} onChange={(e) => field('description', e.target.value)} /></label>
            <label>{t.type}<select value={form.property_type} onChange={(e) => field('property_type', e.target.value as PropertyType)}>{(Object.keys(propertyLabels[lang]) as PropertyType[]).map((value) => <option key={value} value={value}>{propertyLabels[lang][value]}</option>)}</select></label>
            <label>{t.district}<select value={form.district} onChange={(e) => changeDistrict(e.target.value as DistrictId)}>{(Object.keys(districtLabels[lang]) as DistrictId[]).map((value) => <option key={value} value={value}>{districtLabels[lang][value]}</option>)}</select></label>
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
          <section><h3>{t.coordinates}</h3><Suspense fallback={<div className="location-loading">{t.saving}</div>}><LocationPicker lang={lang} latitude={Number(form.latitude)} longitude={Number(form.longitude)} onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} /></Suspense></section>
          <section><h3>{t.amenities}</h3><div className="check-grid">{([
            ['furnished', t.furnished], ['has_elevator', t.elevator], ['has_balcony', t.balcony], ['has_parking', t.parking], ['has_air_conditioning', t.ac], ['has_heating', t.heating], ['pets_allowed', t.pets], ['smoking_allowed', t.smoking], ['utilities_included', t.utilities],
          ] as [keyof ListingPayload, string][]).map(([name, label]) => <label key={name}><input type="checkbox" checked={Boolean(form[name])} onChange={() => toggle(name)} /><span />{label}</label>)}</div></section>
          {editing && <MediaManager media={existingMedia} t={t} onCover={makeCover} onRemove={removeMedia} />}
          <section><h3>{t.addMedia}</h3><div className="media-inputs"><FileField label={t.photos} accept="image/jpeg,image/png,image/webp,image/avif" files={photos} multiple onChange={setPhotos} hint="JPG, PNG, WebP · max 15 MB" fileWord={t.files} /><FileField label={t.plan} accept="image/jpeg,image/png,image/webp,image/avif" files={plans} multiple onChange={setPlans} hint="Image · max 15 MB" fileWord={t.files} /><FileField label={t.video} accept="video/mp4,video/webm,video/quicktime" files={videos} multiple onChange={setVideos} hint="MP4, WebM · max 100 MB" fileWord={t.files} /></div></section>
          <section><h3>{t.contact}</h3><div className="form-grid"><label>{t.name}<input required value={form.contact_name} onChange={(e) => field('contact_name', e.target.value)} /></label><label>{t.phone}<input required value={form.contact_phone} onChange={(e) => field('contact_phone', e.target.value)} /></label><label>{x.telegram}<input placeholder="@username" value={form.contact_telegram || ''} onChange={(e) => field('contact_telegram', e.target.value || null)} /></label><label>{x.whatsapp}<input value={form.contact_whatsapp || ''} onChange={(e) => field('contact_whatsapp', e.target.value || null)} /></label><label className="wide profile-check"><input type="checkbox" checked={form.show_contact_name} onChange={() => toggle('show_contact_name')} />{x.showName}</label></div></section>
          <div className="form-submit">{(!editing || editing.status !== 'published') && <label><input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} /><span />{t.createPublish}</label>}<button type="submit" disabled={busy}>{busy ? t.saving : editing ? t.saveChanges : publishNow ? t.createPublish : t.saveDraft}</button></div>
        </form>}
      </main>
    </motion.section>
  </motion.div>
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
  return <section className="existing-media"><h3>{t.currentMedia}</h3>{sections.map((section) => {
    const items = media.filter((item) => item.media_type === section.type)
    return <div className="existing-media__group" key={section.type}><h4>{section.label}<span>{items.length}</span></h4>{items.length ? <div className="existing-media__grid">{items.map((item) => <article key={item.id}>
      {item.media_type === 'video' ? <video src={mediaUrl(item.url)} preload="metadata" /> : <img src={mediaUrl(item.url)} alt={item.caption || item.original_name} />}
      <div><span title={item.original_name}>{item.original_name}</span><div>{item.media_type === 'image' && (item.is_cover ? <b>{t.cover}</b> : <button type="button" onClick={() => onCover(item)}>{t.makeCover}</button>)}<button type="button" className="danger" onClick={() => onRemove(item)}>{t.deleteMedia}</button></div></div>
    </article>)}</div> : <p>{t.noMedia}</p>}</div>
  })}</section>
}

function FileField({ label, accept, files, multiple, onChange, hint, fileWord }: {
  label: string; accept: string; files: File[]; multiple?: boolean; onChange: (files: File[]) => void; hint: string; fileWord: string
}) {
  return <label>{label}<input type="file" accept={accept} multiple={multiple} onChange={(event) => onChange(Array.from(event.target.files || []))} /><span>{files.length ? `${files.length} ${fileWord}` : hint}</span></label>
}

function AddressAutocomplete({ lang, label, value, onChange, onSelect }: {
  lang: Lang
  label: string
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: AddressSuggestion) => void
}) {
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
        .then((suggestions) => { if (active) setItems(suggestions) })
        .catch(() => { if (active) setItems([]) })
        .finally(() => { if (active) setLoading(false) })
    }, 320)
    return () => { active = false; window.clearTimeout(timer) }
  }, [lang, value])

  return <label className="wide address-autocomplete">
    {label}
    <input
      required
      value={value}
      placeholder={hint}
      autoComplete="off"
      onFocus={() => setOpen(true)}
      onChange={(event) => { onChange(event.target.value); setOpen(true) }}
      onBlur={() => window.setTimeout(() => setOpen(false), 160)}
    />
    {open && (loading || items.length > 0) && <div className="address-autocomplete__menu" role="listbox">
      {loading && <span className="address-autocomplete__loading">…</span>}
      {!loading && items.map((item) => <button
        key={item.place_id}
        type="button"
        role="option"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onSelect(item); setItems([]); setOpen(false) }}
      >
        <b>{item.label}</b>
        {item.district && <small>{item.district}</small>}
      </button>)}
    </div>}
  </label>
}

function NumberField({ label, value, onChange, required = false, step = '1' }: { label: string; value: number; onChange: (value: number) => void; required?: boolean; step?: string }) {
  return <label>{label}<input type="number" required={required} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}
