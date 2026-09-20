import type { Listing, ListingMedia, ListingPage, ListingPayload, User } from '../types/api'

const API_BASE = 'http://localhost:8000/api/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function cookie(name: string) {
  const item = document.cookie.split('; ').find((value) => value.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.split('=').slice(1).join('=')) : ''
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = cookie('ev_csrf')
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (Array.isArray(body.detail)) message = body.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(', ')
    } catch { /* Keep generic error. */ }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  me: () => request<User>('/auth/me'),
  login: (email: string, password: string) => request<{ user: User; csrf_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (payload: { email: string; password: string; full_name: string; phone?: string }) => request<{ user: User; csrf_token: string }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  listings: (params: URLSearchParams) => request<ListingPage>(`/listings?${params}`),
  myListings: () => request<Listing[]>('/me/listings'),
  createListing: (payload: ListingPayload) => request<Listing>('/listings', { method: 'POST', body: JSON.stringify(payload) }),
  updateListing: (id: string, payload: Partial<ListingPayload>) => request<Listing>(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  publishListing: (id: string) => request<Listing>(`/listings/${id}/publish`, { method: 'POST' }),
  archiveListing: (id: string) => request<Listing>(`/listings/${id}/archive`, { method: 'POST' }),
  deleteListing: (id: string) => request<{ message: string }>(`/listings/${id}`, { method: 'DELETE' }),
  uploadMedia: (listingId: string, file: File, mediaType: 'image' | 'floor_plan' | 'video', isCover = false, order = 0) => {
    const body = new FormData()
    body.append('file', file)
    body.append('media_type', mediaType)
    body.append('is_cover', String(isCover))
    body.append('sort_order', String(order))
    return request<ListingMedia>(`/listings/${listingId}/media`, { method: 'POST', body })
  },
}

export function mediaUrl(url: string) {
  if (/^https?:\/\//.test(url)) return url
  const root = API_BASE.replace(/\/api\/v1\/?$/, '')
  return `${root}${url}`
}
