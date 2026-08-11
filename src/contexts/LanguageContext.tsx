import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import i18n, { type Language, DEFAULT_LANGUAGE } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { setLocale } from '@/lib/utils'

// ============================================================================
// LanguageContext — manages active language (EN/AR) + RTL direction
// ----------------------------------------------------------------------------
// Storage strategy:
//   - localStorage('infraflow-lang') — always, for auth/setup pages
//   - user_profiles.preferred_language — when logged in, syncs across devices
// ============================================================================

interface LanguageContextValue {
  lang: Language
  dir: 'ltr' | 'rtl'
  setLang: (lang: Language) => void
  toggleLang: () => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const detected = i18n.language?.split('-')[0] as Language
    return detected === 'ar' ? 'ar' : DEFAULT_LANGUAGE
  })

  const dir: 'ltr' | 'rtl' = lang === 'ar' ? 'rtl' : 'ltr'

  // Apply language change to i18next + <html dir> + localStorage
  const applyLanguage = useCallback((newLang: Language) => {
    i18n.changeLanguage(newLang)
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = newLang
    localStorage.setItem('infraflow-lang', newLang)
    setLocale(newLang)
  }, [])

  // Sync user_profiles.preferred_language to DB (best-effort, no error blocking)
  const syncToProfile = useCallback(async (newLang: Language) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.user) {
        await supabase
          .from('user_profiles')
          .update({ preferred_language: newLang })
          .eq('id', sessionData.session.user.id)
      }
    } catch {
      // Silent fail — localStorage is the primary store
    }
  }, [])

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang)
    applyLanguage(newLang)
    syncToProfile(newLang)
  }, [applyLanguage, syncToProfile])

  const toggleLang = useCallback(() => {
    setLang(lang === 'en' ? 'ar' : 'en')
  }, [lang, setLang])

  // On mount: apply initial dir to <html> + set locale for formatting
  useEffect(() => {
    document.documentElement.dir = dir
    document.documentElement.lang = lang
    setLocale(lang)
  }, [dir, lang])

  // Listen for i18n language changes (e.g., from LanguageDetector)
  useEffect(() => {
    const handler = (lng: string) => {
      const newLang = lng.split('-')[0] as Language
      if (newLang === 'ar' || newLang === 'en') {
        setLangState(newLang)
        document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
        document.documentElement.lang = newLang
      }
    }
    i18n.on('languageChanged', handler)
    return () => { i18n.off('languageChanged', handler) }
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
