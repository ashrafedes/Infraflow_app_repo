import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'
import type { UserProfile, UserRole } from '@/types'

async function checkSuperAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc('is_super_admin')
  return data === true
}

// Sync user's preferred_language from profile to i18next + localStorage
function syncLanguageFromProfile(profile: UserProfile | null) {
  if (profile?.preferred_language) {
    const lang = profile.preferred_language
    localStorage.setItem('infraflow-lang', lang)
    i18n.changeLanguage(lang)
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  isSuperAdmin: boolean
  loading: boolean
  needsCompanySetup: boolean
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      // Could be a super admin with no user_profiles row
      const sa = await checkSuperAdmin()
      setIsSuperAdmin(sa)
      if (sa) return null
      console.error('Error fetching profile:', error)
      return null
    }
    setIsSuperAdmin(false)
    return data as UserProfile
  }

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id)
      setProfile(p)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setProfile(p)
        syncLanguageFromProfile(p)
      }

      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          const p = await fetchProfile(session.user.id)
          setProfile(p)
          syncLanguageFromProfile(p)
        } else {
          setProfile(null)
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    return { error: error?.message ?? null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setIsSuperAdmin(false)
    setUser(null)
    setSession(null)
  }

  const needsCompanySetup = !isSuperAdmin && !profile?.company_id

  return (
    <AuthContext.Provider
      value={{ session, user, profile, isSuperAdmin, loading, needsCompanySetup, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useRole(): UserRole | null {
  const { profile } = useAuth()
  return profile?.role ?? null
}

export function isAdmin(): boolean {
  const { profile } = useAuth()
  return profile?.role === 'company_admin'
}
