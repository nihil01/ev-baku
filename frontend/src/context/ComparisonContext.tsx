import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Listing } from '../types/api'

const STORAGE_KEY = 'ev-compare-listings'
const MAX_ITEMS = 4

type ComparisonContextValue = {
  items: Listing[]
  maxItems: number
  isCompared: (id: string) => boolean
  toggle: (listing: Listing) => 'added' | 'removed' | 'full'
  remove: (id: string) => void
  clear: () => void
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null)

function storedItems(): Listing[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : []
  } catch {
    return []
  }
}

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Listing[]>(storedItems)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* Private mode may block storage. */ }
  }, [items])

  const value = useMemo<ComparisonContextValue>(() => ({
    items,
    maxItems: MAX_ITEMS,
    isCompared: (id) => items.some((item) => item.id === id),
    toggle: (listing) => {
      if (items.some((item) => item.id === listing.id)) {
        setItems((current) => current.filter((item) => item.id !== listing.id))
        return 'removed'
      }
      if (items.length >= MAX_ITEMS) return 'full'
      setItems((current) => [...current, listing])
      return 'added'
    },
    remove: (id) => setItems((current) => current.filter((item) => item.id !== id)),
    clear: () => setItems([]),
  }), [items])

  return <ComparisonContext.Provider value={value}>{children}</ComparisonContext.Provider>
}

export function useComparison() {
  const value = useContext(ComparisonContext)
  if (!value) throw new Error('useComparison must be used inside ComparisonProvider')
  return value
}
