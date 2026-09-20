import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { api, mediaUrl } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { DistrictId, Lang, Listing, ListingPayload, PropertyType } from '../types/api'
import './AccountAccess.css'

type Props = { lang: Lang; compact?: boolean; onListingsChanged?: () => void }

const text = {
  az: { login: 'Daxil ol', account: 'Kabinet', signin: 'Hesaba daxil ol', signup: 'Qeydiyyat', email: 'E-poçt', password: 'Şifrə', name: 'Ad və soyad', phone: 'Telefon', noAccount: 'Hesabınız yoxdur?', hasAccount: 'Artıq hesabınız var?', close: 'Bağla', my: 'Elanlarım', add: 'Yeni elan', details: 'Əsas məlumatlar', logout: 'Çıxış', draft: 'Qaralama', published: 'Aktiv', archived: 'Arxiv', publish: 'Dərc et', archive: 'Arxivlə', remove: 'Sil', empty: 'Hələ elan yaratmamısınız.', title: 'Başlıq', description: 'Təsvir', type: 'Əmlak tipi', district: 'Rayon', address: 'Ünvan', rent: 'Aylıq kirayə', deposit: 'Depozit', area: 'Sahə, m²', rooms: 'Otaq', bedrooms: 'Yataq otağı', bathrooms: 'Hamam', guests: 'Nəfər sayı', floor: 'Mərtəbə', floors: 'Mərtəbə sayı', furnished: 'Əşyalı', lease: 'Minimum kirayə, ay', available: 'Mövcud tarix', coordinates: 'Xəritə koordinatları', amenities: 'İmkanlar', elevator: 'Lift', balcony: 'Balkon', parking: 'Parkinq', ac: 'Kondisioner', heating: 'İstilik', pets: 'Ev heyvanı', smoking: 'Siqaret', utilities: 'Kommunal daxildir', photos: 'Mənzil fotoları', plan: 'Mənzilin planı', video: 'Video', saveDraft: 'Qaralama yarat', createPublish: 'Yarat və dərc et', saving: 'Yüklənir…', created: 'Elan yaradıldı', error: 'Xəta baş verdi' },
  en: { login: 'Sign in', account: 'Dashboard', signin: 'Sign in to your account', signup: 'Create account', email: 'Email', password: 'Password', name: 'Full name', phone: 'Phone', noAccount: 'No account yet?', hasAccount: 'Already registered?', close: 'Close', my: 'My listings', add: 'New listing', details: 'Property details', logout: 'Sign out', draft: 'Draft', published: 'Published', archived: 'Archived', publish: 'Publish', archive: 'Archive', remove: 'Delete', empty: 'You have not created any listings yet.', title: 'Title', description: 'Description', type: 'Property type', district: 'District', address: 'Address', rent: 'Monthly rent', deposit: 'Deposit', area: 'Area, m²', rooms: 'Rooms', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', guests: 'Maximum guests', floor: 'Floor', floors: 'Total floors', furnished: 'Furnished', lease: 'Minimum lease, months', available: 'Available from', coordinates: 'Map coordinates', amenities: 'Amenities', elevator: 'Elevator', balcony: 'Balcony', parking: 'Parking', ac: 'Air conditioning', heating: 'Heating', pets: 'Pets allowed', smoking: 'Smoking allowed', utilities: 'Utilities included', photos: 'Property photos', plan: 'Floor plan', video: 'Video', saveDraft: 'Create draft', createPublish: 'Create and publish', saving: 'Uploading…', created: 'Listing created', error: 'Something went wrong' },
  ru: { login: 'Войти', account: 'Кабинет', signin: 'Вход в аккаунт', signup: 'Регистрация', email: 'Электронная почта', password: 'Пароль', name: 'Имя и фамилия', phone: 'Телефон', noAccount: 'Ещё нет аккаунта?', hasAccount: 'Уже зарегистрированы?', close: 'Закрыть', my: 'Мои объявления', add: 'Новое объявление', details: 'Основные данные', logout: 'Выйти', draft: 'Черновик', published: 'Опубликовано', archived: 'В архиве', publish: 'Опубликовать', archive: 'В архив', remove: 'Удалить', empty: 'Вы пока не создали ни одного объявления.', title: 'Название', description: 'Описание', type: 'Тип жилья', district: 'Район', address: 'Адрес', rent: 'Аренда в месяц', deposit: 'Депозит', area: 'Площадь, м²', rooms: 'Комнаты', bedrooms: 'Спальни', bathrooms: 'Санузлы', guests: 'Вместимость, человек', floor: 'Этаж', floors: 'Этажей в доме', furnished: 'С мебелью', lease: 'Минимальный срок, месяцев', available: 'Доступно с', coordinates: 'Координаты на карте', amenities: 'Удобства', elevator: 'Лифт', balcony: 'Балкон', parking: 'Парковка', ac: 'Кондиционер', heating: 'Отопление', pets: 'Можно с животными', smoking: 'Можно курить', utilities: 'Коммунальные включены', photos: 'Фотографии квартиры', plan: 'План квартиры', video: 'Видео', saveDraft: 'Создать черновик', createPublish: 'Создать и опубликовать', saving: 'Загрузка…', created: 'Объявление создано', error: 'Произошла ошибка' },
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

function emptyListing(userName = '', phone = ''): ListingPayload {
  return {
    title: '', description: '', property_type: 'apartment', district: 'yasamal', address: '',
    latitude: districtCenters.yasamal[1], longitude: districtCenters.yasamal[0], monthly_rent: 0,
    deposit: null, area_sqm: 0, rooms: 2, bedrooms: 1, bathrooms: 1, max_guests: 2,
    furnished: true, floor: null, total_floors: null, has_elevator: false, has_balcony: false,
    has_parking: false, has_air_conditioning: false, has_heating: false, pets_allowed: false,
    smoking_allowed: false, utilities_included: false, minimum_lease_months: 1,
    available_from: null, contact_name: userName, contact_phone: phone,
  }
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
  const { user } = useAuth()
  const t = text[lang]
  const [tab, setTab] = useState<'list' | 'new'>('list')
  const [listings, setListings] = useState<Listing[]>([])
  const [refresh, setRefresh] = useState(0)
  const [form, setForm] = useState<ListingPayload>(() => emptyListing(user?.full_name, user?.phone || ''))
  const [photos, setPhotos] = useState<File[]>([])
  const [plan, setPlan] = useState<File | null>(null)
  const [video, setVideo] = useState<File | null>(null)
  const [publishNow, setPublishNow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { api.myListings().then(setListings).catch((err) => setError(err.message)) }, [refresh])
  const statuses = useMemo(() => ({ draft: t.draft, published: t.published, archived: t.archived }), [t])

  const field = (name: keyof ListingPayload, value: unknown) => setForm((current) => ({ ...current, [name]: value }))
  const toggle = (name: keyof ListingPayload) => field(name, !form[name])
  const changeDistrict = (value: DistrictId) => {
    const [longitude, latitude] = districtCenters[value]
    setForm((current) => ({ ...current, district: value, longitude, latitude }))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (publishNow && !photos.length) {
        throw new Error(lang === 'ru' ? 'Для публикации добавьте хотя бы одну фотографию' : lang === 'az' ? 'Dərc etmək üçün ən azı bir foto əlavə edin' : 'Add at least one photo before publishing')
      }
      const created = await api.createListing(form)
      for (const [index, photo] of photos.entries()) await api.uploadMedia(created.id, photo, 'image', index === 0, index)
      if (plan) await api.uploadMedia(created.id, plan, 'floor_plan', false, 100)
      if (video) await api.uploadMedia(created.id, video, 'video', false, 200)
      if (publishNow) await api.publishListing(created.id)
      setMessage(t.created); setForm(emptyListing(user?.full_name, user?.phone || '')); setPhotos([]); setPlan(null); setVideo(null)
      setRefresh((value) => value + 1); onListingsChanged?.(); setTab('list')
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

  return <motion.div className="account-backdrop dashboard-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section className="dashboard" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ ease: [0.22, 1, 0.36, 1], duration: .45 }}>
      <header><div><div className="auth-logo">ev<span>.</span></div><div><p>{user?.email}</p><h2>{t.account}</h2></div></div><button type="button" className="account-close" onClick={onClose}>×</button></header>
      <nav><button type="button" className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>{t.my}<b>{listings.length}</b></button><button type="button" className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>{t.add}</button><button type="button" onClick={onLogout}>{t.logout}</button></nav>
      <main>
        {error && <div className="account-error">{error}</div>}{message && <div className="account-success">{message}</div>}
        {tab === 'list' ? <div className="dashboard-list">{listings.length ? listings.map((listing) => {
          const cover = listing.media.find((media) => media.is_cover) || listing.media.find((media) => media.media_type === 'image')
          return <article key={listing.id}>{cover ? <img src={mediaUrl(cover.url)} alt="" /> : <div className="dashboard-placeholder">⌂</div>}<div><span className={`status ${listing.status}`}>{statuses[listing.status]}</span><h3>{listing.title}</h3><p>{Number(listing.monthly_rent).toLocaleString()} ₼ · {listing.area_sqm} m²</p><div>{listing.status !== 'published' && <button type="button" onClick={() => action('publish', listing.id)}>{t.publish}</button>}{listing.status === 'published' && <button type="button" onClick={() => action('archive', listing.id)}>{t.archive}</button>}<button type="button" className="danger" onClick={() => action('delete', listing.id)}>{t.remove}</button></div></div></article>
        }) : <div className="dashboard-empty">{t.empty}<button type="button" onClick={() => setTab('new')}>{t.add}</button></div>}</div> :
        <form className="listing-form" onSubmit={submit}>
          <section><h3>{t.details}</h3><div className="form-grid">
            <label className="wide">{t.title}<input required minLength={5} value={form.title} onChange={(e) => field('title', e.target.value)} /></label>
            <label className="wide">{t.description}<textarea required minLength={20} rows={5} value={form.description} onChange={(e) => field('description', e.target.value)} /></label>
            <label>{t.type}<select value={form.property_type} onChange={(e) => field('property_type', e.target.value as PropertyType)}>{(Object.keys(propertyLabels[lang]) as PropertyType[]).map((value) => <option key={value} value={value}>{propertyLabels[lang][value]}</option>)}</select></label>
            <label>{t.district}<select value={form.district} onChange={(e) => changeDistrict(e.target.value as DistrictId)}>{(Object.keys(districtLabels[lang]) as DistrictId[]).map((value) => <option key={value} value={value}>{districtLabels[lang][value]}</option>)}</select></label>
            <label className="wide">{t.address}<input required value={form.address} onChange={(e) => field('address', e.target.value)} /></label>
            <NumberField label={t.rent} value={form.monthly_rent} onChange={(value) => field('monthly_rent', value)} required />
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
          <section><h3>{t.coordinates}</h3><div className="form-grid"><NumberField label="Latitude" value={form.latitude} step="0.000001" onChange={(value) => field('latitude', value)} /><NumberField label="Longitude" value={form.longitude} step="0.000001" onChange={(value) => field('longitude', value)} /></div></section>
          <section><h3>{t.amenities}</h3><div className="check-grid">{([
            ['furnished', t.furnished], ['has_elevator', t.elevator], ['has_balcony', t.balcony], ['has_parking', t.parking], ['has_air_conditioning', t.ac], ['has_heating', t.heating], ['pets_allowed', t.pets], ['smoking_allowed', t.smoking], ['utilities_included', t.utilities],
          ] as [keyof ListingPayload, string][]).map(([name, label]) => <label key={name}><input type="checkbox" checked={Boolean(form[name])} onChange={() => toggle(name)} /><span />{label}</label>)}</div></section>
          <section><h3>Media</h3><div className="media-inputs"><label>{t.photos}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []))} /><span>{photos.length ? `${photos.length} files` : 'JPG, PNG, WebP · max 15 MB'}</span></label><label>{t.plan}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setPlan(e.target.files?.[0] || null)} /><span>{plan?.name || 'Image · max 15 MB'}</span></label><label>{t.video}<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setVideo(e.target.files?.[0] || null)} /><span>{video?.name || 'MP4, WebM · max 100 MB'}</span></label></div></section>
          <section><h3>Contact</h3><div className="form-grid"><label>{t.name}<input required value={form.contact_name} onChange={(e) => field('contact_name', e.target.value)} /></label><label>{t.phone}<input required value={form.contact_phone} onChange={(e) => field('contact_phone', e.target.value)} /></label></div></section>
          <div className="form-submit"><label><input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} /><span />{t.createPublish}</label><button type="submit" disabled={busy}>{busy ? t.saving : publishNow ? t.createPublish : t.saveDraft}</button></div>
        </form>}
      </main>
    </motion.section>
  </motion.div>
}

function NumberField({ label, value, onChange, required = false, step = '1' }: { label: string; value: number; onChange: (value: number) => void; required?: boolean; step?: string }) {
  return <label>{label}<input type="number" required={required} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}
