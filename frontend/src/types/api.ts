export type Lang = 'az' | 'en' | 'ru'
export type DistrictId =
    | 'sabail' | 'yasamal' | 'nizami'
    | 'narimanov' | 'khatai' | 'nasimi'
    | 'binagadi' | 'sabunchu' | 'surakhani'
    | 'qaradag' | 'khazar' | 'pirallahi'
    | 'khirdalan' | 'sumgait'
export type PropertyType = 'studio' | 'apartment' | 'house' | 'villa'
export type ListingStatus = 'draft' | 'published' | 'archived'
export type MediaType = 'image' | 'floor_plan' | 'video'
export type Currency = 'AZN' | 'USD' | 'EUR' | 'RUB'
export type ContactMethod = 'phone' | 'messages' | 'both'
export type ParkingType = 'surface' | 'underground' | 'both'
export type ServiceFeePayer = 'landlord' | 'tenant'
export type DiscountTier = { min_months: number; discount_percent: number }

export type User = {
  id: string
  email: string
  full_name: string
  phone: string | null
  telegram: string | null
  whatsapp: string | null
  show_full_name: boolean
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
  rent_currency: Currency
  monthly_rent_azn: number
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
  parking_type: ParkingType | null
  has_air_conditioning: boolean
  has_heating: boolean
  pets_allowed: boolean
  smoking_allowed: boolean
  utilities_included: boolean
  service_fee_payer: ServiceFeePayer
  monthly_service_fee: number | null
  minimum_lease_months: number
  discount_tiers: DiscountTier[]
  available_from: string | null
  nearby_places: NearbyPlace[] | null
  nearby_updated_at: string | null
  contact_name: string
  contact_phone: string | null
  contact_method: ContactMethod
  show_contact_name: boolean
  contact_telegram: string | null
  contact_whatsapp: string | null
  media: ListingMedia[]
  created_at: string
  updated_at: string
  published_at: string | null
}

export type ListingPage = { items: Listing[]; total: number; page: number; page_size: number }
export type AiSearchResponse = {
  items: Listing[]
  total: number
  query: string
  mode: 'semantic' | 'text'
  answer: string
  guest_requests_remaining: number | null
  guest_request_limit: number | null
}
export type ExchangeRates = {
  base: 'AZN'
  rates: Record<Currency, number>
  provider: string
  updated_at: string | null
}

export type ListingPayload = Omit<Listing,
  'id' | 'owner_id' | 'status' | 'media' | 'monthly_rent_azn' | 'nearby_places' | 'nearby_updated_at' | 'created_at' | 'updated_at' | 'published_at' | 'contact_phone'
> & { contact_phone: string }

export type NearbyPlace = {
  place_id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  distance_meters: number
  categories: string[]
  category: string
}

export type AddressSuggestion = {
  place_id: string
  label: string
  street: string | null
  house_number: string | null
  district: string | null
  latitude: number
  longitude: number
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export type Conversation = {
  id: string
  listing_id: string
  listing_title: string
  listing_address: string
  listing_district: DistrictId
  listing_monthly_rent: number
  listing_rent_currency: Currency
  listing_cover_url: string | null
  listing_status: ListingStatus
  counterpart_name: string
  counterpart_id: string
  updated_at: string
  last_message: ChatMessage | null
}
