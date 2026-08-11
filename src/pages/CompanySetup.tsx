import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export function CompanySetup() {
  const { t } = useTranslation('auth')
  const { refreshProfile } = useAuth()
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Use SECURITY DEFINER function to create company + update profile
      const { error: setupError } = await supabase
        .rpc('setup_company', { p_company_name: companyName })

      if (setupError) throw setupError

      await refreshProfile()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth:failedToCreateCompany')
      setError(msg)
    }

    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gray-900">
            <img src="/logo.png" alt="InfraFlow" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('auth:companySetup')}</h1>
          <p className="text-sm text-gray-500">{t('auth:setupCompany')}</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t('auth:companyName')}</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="input"
                placeholder={t('auth:companyNamePlaceholder')}
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? t('common:buttons.creating') : t('auth:createCompany')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
