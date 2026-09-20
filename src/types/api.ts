export type Lang = 'az' | 'en' | 'ru'
export type DistrictId = 'sabail' | 'yasamal' | 'nasimi' | 'narimanov' | 'khatai' | 'nizami'
export type PropertyType = 'studio' | 'apartment' | 'house' | 'villa'
export type ListingStatus = 'draft' | 'published' | 'archived'
export type MediaType = 'image' | 'floor_plan' | 'video'

export type User = {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: 'user' | 'admin'
  created_at: string
}

export type ListingMedia = {
  id: string
  media_type: MediaType
  url: string
  content_type: string
  size_bytes: number
  original_name: string
  caption: string | null
  sort_order: number
  is_cover: boolean
}

export type Listing = {
  id: string
  owner_id: string
  status: ListingStatus
  title: string
  description: string
  property_type: PropertyType
  district: DistrictId
  address: string
  latitude: number
  longitude: number
  monthly_rent: number
  deposit: number | null
  area_sqm: number
  rooms: number
  bedrooms: number
  bathrooms: number
  max_guests: number
  furnished: boolean
  floor: number | null
  total_floors: number | null
  has_elevator: boolean
  has_balcony: boolean
  has_parking: boolean
  has_air_conditioning: boolean
  has_heating: boolean
  pets_allowed: boolean
  smoking_allowed: boolean
  utilities_included: boolean
  minimum_lease_months: number
  available_from: string | null
  contact_name: string
  contact_phone: string
  media: ListingMedia[]
  created_at: string
  updated_at: string
  published_at: string | null
}

export type ListingPage = { items: Listing[]; total: number; page: number; page_size: number }

export type ListingPayload = Omit<Listing,
  'id' | 'owner_id' | 'status' | 'media' | 'created_at' | 'updated_at' | 'published_at'
>
