import { BRAND_LOGO_URL } from './api'
import type { Lang, Listing } from '../types/api'

const STORAGE_KEY = 'ev-availability-reminders'
const CHANGE_EVENT = 'ev:availability-reminders-changed'
const MAX_DELAY = 24 * 60 * 60 * 1000

type AvailabilityReminder = {
  listingId: string
  title: string
  availableFrom: string
  lang: Lang
  notifiedAt: string | null
}

export type AvailabilitySubscriptionResult = 'subscribed' | 'denied' | 'unsupported'

function readReminders(): AvailabilityReminder[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is AvailabilityReminder => Boolean(
      item
      && typeof item === 'object'
      && typeof (item as AvailabilityReminder).listingId === 'string'
      && typeof (item as AvailabilityReminder).title === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test((item as AvailabilityReminder).availableFrom),
    ))
  } catch {
    return []
  }
}

function writeReminders(reminders: AvailabilityReminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function notificationTime(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 9, 0, 0, 0).getTime()
}

const notificationCopy = {
  az: { title: 'Mənzil artıq mövcuddur', body: (name: string) => `${name} üçün kirayə tarixi başlayıb.` },
  en: { title: 'This home is now available', body: (name: string) => `${name} is now available to rent.` },
  ru: { title: 'Квартира уже доступна', body: (name: string) => `Объявление «${name}» теперь доступно для аренды.` },
} as const

function showNotification(reminder: AvailabilityReminder) {
  const copy = notificationCopy[reminder.lang]
  const notification = new Notification(copy.title, {
    body: copy.body(reminder.title),
    icon: BRAND_LOGO_URL,
    tag: `availability-${reminder.listingId}`,
  })
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}

export function hasAvailabilityReminder(listingId: string, availableFrom?: string | null) {
  return readReminders().some((item) => (
    item.listingId === listingId
    && !item.notifiedAt
    && (!availableFrom || item.availableFrom === availableFrom)
  ))
}

export async function subscribeToAvailability(listing: Listing, lang: Lang): Promise<AvailabilitySubscriptionResult> {
  if (!('Notification' in window)) return 'unsupported'
  let permission = Notification.permission
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission()
    } catch {
      return 'denied'
    }
  }
  if (permission !== 'granted') return 'denied'
  if (!listing.available_from) return 'unsupported'

  const reminders = readReminders().filter((item) => item.listingId !== listing.id)
  reminders.push({
    listingId: listing.id,
    title: listing.title,
    availableFrom: listing.available_from,
    lang,
    notifiedAt: null,
  })
  writeReminders(reminders)
  return 'subscribed'
}

export function removeAvailabilityReminder(listingId: string) {
  writeReminders(readReminders().filter((item) => item.listingId !== listingId))
}

export function startAvailabilityNotificationScheduler() {
  let timer = 0

  const schedule = () => {
    window.clearTimeout(timer)
    const reminders = readReminders()
    const now = Date.now()
    let changed = false

    if ('Notification' in window && Notification.permission === 'granted') {
      reminders.forEach((reminder) => {
        if (!reminder.notifiedAt && notificationTime(reminder.availableFrom) <= now) {
          showNotification(reminder)
          reminder.notifiedAt = new Date().toISOString()
          changed = true
        }
      })
    }

    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
    const nextTime = reminders
      .filter((item) => !item.notifiedAt)
      .map((item) => notificationTime(item.availableFrom))
      .filter((value) => value > now)
      .sort((left, right) => left - right)[0]
    const delay = nextTime ? Math.min(Math.max(nextTime - now, 1000), MAX_DELAY) : MAX_DELAY
    timer = window.setTimeout(schedule, delay)
  }

  window.addEventListener(CHANGE_EVENT, schedule)
  window.addEventListener('storage', schedule)
  schedule()
  return () => {
    window.clearTimeout(timer)
    window.removeEventListener(CHANGE_EVENT, schedule)
    window.removeEventListener('storage', schedule)
  }
}
