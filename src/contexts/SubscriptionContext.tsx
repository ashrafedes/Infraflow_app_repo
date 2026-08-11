import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { SubscriptionInfo } from '@/types'

interface SubscriptionContextValue {
  info: SubscriptionInfo | null
  loading: boolean
  hasFeature: (key: string) => boolean
  refresh: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [info, setInfo] = useState<SubscriptionInfo | null>(null)
  const [features, setFeatures] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const fetchSubscription = async () => {
    if (!profile?.company_id) {
      setInfo(null)
      setFeatures(new Set())
      setLoading(false)
      return
    }

    const [infoRes, featuresRes] = await Promise.all([
      supabase.rpc('get_subscription_info'),
      supabase.rpc('get_company_features'),
    ])

    if (infoRes.data) {
      setInfo(infoRes.data as SubscriptionInfo)
    }

    if (featuresRes.data) {
      const enabled = new Set(
        (featuresRes.data as { feature_key: string; is_enabled: boolean }[])
          .filter((f) => f.is_enabled)
          .map((f) => f.feature_key)
      )
      setFeatures(enabled)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchSubscription()
  }, [profile?.company_id])

  const hasFeature = (key: string): boolean => {
    return features.has(key)
  }

  return (
    <SubscriptionContext.Provider value={{ info, loading, hasFeature, refresh: fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider')
  return ctx
}
