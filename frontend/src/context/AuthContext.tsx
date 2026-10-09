import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api } from '../lib/api'
import type { User } from '../types/api'

type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: { email: string; password: string; full_name: string; phone?: string }) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (payload: Partial<Pick<User, 'full_name' | 'phone' | 'telegram' | 'whatsapp' | 'show_full_name'>>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me().then(setUser).catch((error) => {
      if (!(error instanceof ApiError) || error.status !== 401) console.error(error)
    }).finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (email, password) => setUser((await api.login(email, password)).user),
    register: async (payload) => setUser((await api.register(payload)).user),
    logout: async () => { await api.logout(); setUser(null) },
    updateProfile: async (payload) => setUser(await api.updateProfile(payload)),
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
