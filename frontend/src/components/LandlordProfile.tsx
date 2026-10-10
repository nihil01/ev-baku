import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { useAuth } from '../context/AuthContext'
import { useComparison } from '../context/ComparisonContext'
import { districtLabel } from '../data/mapConfig'
import { api, mediaUrl } from '../lib/api'
import type { LandlordProfile as LandlordProfileData, Lang, Listing } from '../types/api'
import BrandedLoader from './BrandedLoader'
import ErrorToast from './ErrorToast'
import HouseLogo from './HouseLogo'
import { CompareIcon } from './PropertyComparison'
import './LandlordProfile.css'

type Props = { landlordId: string; lang: Lang; onClose: () => void; onOpenListing: (listingId: string) => void }

const copy = {
  az: { back: 'Xəritəyə qayıt', since: 'EV BAKU-da', rating: 'Reytinq', listings: 'Aktiv elanlar', reviews: 'Rəylər', about: 'Haqqında', noAbout: 'Ev sahibi hələ özü haqqında məlumat əlavə etməyib.', noListings: 'Hazırda aktiv elan yoxdur.', noReviews: 'Hələ rəy yoxdur. İlk rəyi siz yazın.', reviewTitle: 'Ev sahibi haqqında rəy', reviewHint: 'Ünsiyyət və elan məlumatlarının dəqiqliyi barədə yazın.', signIn: 'Rəy yazmaq üçün hesabınıza daxil olun.', yourRating: 'Qiymətiniz', body: 'Rəy', bodyPlaceholder: 'Təcrübənizi ən azı 10 simvolla təsvir edin…', publish: 'Rəyi dərc et', sending: 'Göndərilir…', delete: 'Sil', view: 'Elana bax', compare: 'Müqayisə et', compared: 'Müqayisədə', compareFull: 'Müqayisədə maksimum 4 elan ola bilər.', month: '/ay', loading: 'Profil yüklənir…', error: 'Profili yükləmək mümkün olmadı.' },
  en: { back: 'Back to map', since: 'On EV BAKU since', rating: 'Rating', listings: 'Active listings', reviews: 'Reviews', about: 'About', noAbout: 'The landlord has not added an introduction yet.', noListings: 'No active listings right now.', noReviews: 'No reviews yet. Be the first to share one.', reviewTitle: 'Review this landlord', reviewHint: 'Tell others about communication and listing accuracy.', signIn: 'Sign in to leave a review.', yourRating: 'Your rating', body: 'Review', bodyPlaceholder: 'Describe your experience in at least 10 characters…', publish: 'Publish review', sending: 'Publishing…', delete: 'Delete', view: 'View listing', compare: 'Compare', compared: 'Compared', compareFull: 'You can compare up to 4 listings.', month: '/mo', loading: 'Loading profile…', error: 'Could not load this profile.' },
  ru: { back: 'Назад к карте', since: 'На EV BAKU с', rating: 'Рейтинг', listings: 'Активные объявления', reviews: 'Отзывы', about: 'О себе', noAbout: 'Арендодатель пока не рассказал о себе.', noListings: 'Сейчас нет активных объявлений.', noReviews: 'Отзывов пока нет. Можно стать первым.', reviewTitle: 'Отзыв об арендодателе', reviewHint: 'Расскажите об общении и соответствии объявления реальности.', signIn: 'Войдите в аккаунт, чтобы оставить отзыв.', yourRating: 'Ваша оценка', body: 'Отзыв', bodyPlaceholder: 'Опишите опыт минимум в 10 символах…', publish: 'Опубликовать', sending: 'Публикуем…', delete: 'Удалить', view: 'Открыть объявление', compare: 'Сравнить', compared: 'В сравнении', compareFull: 'Можно сравнить не больше 4 объявлений.', month: '/мес', loading: 'Загружаем профиль…', error: 'Не удалось загрузить профиль.' },
} as const

function coverFor(listing: Listing) {
  return listing.media.find((item) => item.media_type === 'image' && item.is_cover)
    || listing.media.find((item) => item.media_type === 'image')
}

function Star({ filled = false }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
}

export default function LandlordProfile({ landlordId, lang, onClose, onOpenListing }: Props) {
  const [profile, setProfile] = useState<LandlordProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rating, setRating] = useState(5)
  const [sending, setSending] = useState(false)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const { user } = useAuth()
  const comparison = useComparison()
  const t = copy[lang]

  const load = useCallback(() => {
    setLoading(true)
    api.landlordProfile(landlordId).then(setProfile).catch((reason) => setError(reason instanceof Error ? reason.message : t.error)).finally(() => setLoading(false))
  }, [landlordId, t.error])

  useEffect(load, [load])
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = String(new FormData(form).get('body') || '').trim()
    setSending(true)
    try {
      await api.createLandlordReview(landlordId, rating, body)
      form.reset(); setRating(5); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.error) }
    finally { setSending(false) }
  }

  return <motion.section className="landlord-profile" aria-labelledby="landlord-profile-name" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
    <ErrorToast message={error} lang={lang} onDismiss={() => setError('')} />
    <header className="landlord-profile__bar"><button ref={closeRef} type="button" onClick={onClose}>← <span>{t.back}</span></button><span><HouseLogo />EV BAKU</span></header>
    {loading ? <div className="landlord-profile__loading"><BrandedLoader label={t.loading} /></div> : profile && <div className="landlord-profile__body">
      <section className="landlord-hero">
        <div className="landlord-avatar" aria-hidden="true">{profile.display_name.trim().slice(0, 1).toUpperCase()}</div>
        <div className="landlord-identity"><span>VERIFIED LANDLORD</span><h1 id="landlord-profile-name">{profile.display_name}</h1><p>{t.since} {new Date(profile.created_at).toLocaleDateString(lang, { month: 'long', year: 'numeric' })}</p></div>
        <div className="landlord-score"><b>{profile.rating?.toFixed(1) || '—'}</b><div>{[1, 2, 3, 4, 5].map((star) => <Star key={star} filled={star <= Math.round(profile.rating || 0)} />)}</div><span>{profile.reviews_count} · {t.reviews.toLowerCase()}</span></div>
      </section>

      <div className="landlord-profile__columns">
        <main>
          <section className="landlord-about"><span>{t.about}</span><p>{profile.bio || t.noAbout}</p></section>
          <section className="landlord-listings"><header><div><span>PORTFOLIO</span><h2>{t.listings}</h2></div><b>{profile.listings.length}</b></header>
            {profile.listings.length ? <div>{profile.listings.map((listing) => { const cover = coverFor(listing); const selected = comparison.isCompared(listing.id); return <article key={listing.id}>
              <button type="button" className="landlord-listing__open" onClick={() => onOpenListing(listing.id)} aria-label={`${t.view}: ${listing.title}`} />
              {cover ? <img src={mediaUrl(cover.url)} alt={listing.title} /> : <span className="landlord-listing__placeholder"><HouseLogo /></span>}
              <div><small>{districtLabel(listing.district, lang)}</small><h3>{listing.title}</h3><p>{listing.rooms} · {listing.area_sqm} m²</p><b>{Number(listing.monthly_rent).toLocaleString()} {listing.rent_currency} <small>{t.month}</small></b></div>
              <button type="button" className={`landlord-listing__compare${selected ? ' active' : ''}`} aria-pressed={selected} onClick={() => { const result = comparison.toggle(listing); if (result === 'full') setError(t.compareFull) }}><CompareIcon />{selected ? t.compared : t.compare}</button>
            </article> })}</div> : <p className="landlord-empty">{t.noListings}</p>}
          </section>
        </main>

        <aside className="landlord-reviews">
          <header><div><span>COMMUNITY</span><h2>{t.reviews}</h2></div><b>{profile.reviews_count}</b></header>
          {user && user.id !== profile.id && !profile.reviews.some((item) => item.author_id === user.id) && <form onSubmit={submitReview}>
            <h3>{t.reviewTitle}</h3><p>{t.reviewHint}</p><fieldset><legend>{t.yourRating}</legend>{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={star <= rating ? 'active' : ''} onClick={() => setRating(star)} aria-label={`${star}/5`} aria-pressed={star === rating}><Star filled={star <= rating} /></button>)}</fieldset>
            <label>{t.body}<textarea name="body" required minLength={10} maxLength={1200} rows={4} placeholder={t.bodyPlaceholder} /></label><button type="submit" disabled={sending}>{sending ? t.sending : t.publish}</button>
          </form>}
          {!user && <p className="landlord-signin">{t.signIn}</p>}
          <div className="landlord-review-list">{profile.reviews.length ? profile.reviews.map((review) => <article key={review.id}><header><span>{review.author_name.slice(0, 1).toUpperCase()}</span><div><b>{review.author_name}</b><small>{new Date(review.created_at).toLocaleDateString(lang)}</small></div><strong>{review.rating.toFixed(1)} <Star filled /></strong></header><p>{review.body}</p>{user?.id === review.author_id && <button type="button" onClick={async () => { try { await api.deleteLandlordReview(profile.id, review.id); load() } catch (reason) { setError(reason instanceof Error ? reason.message : t.error) } }}>{t.delete}</button>}</article>) : <p className="landlord-empty">{t.noReviews}</p>}</div>
        </aside>
      </div>
    </div>}
  </motion.section>
}
