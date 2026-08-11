import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Boxes } from 'lucide-react'

export function CompanySetup() {
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
      const msg = err instanceof Error ? err.message : 'Failed to create company'
      setError(msg)
    }

    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
            <Boxes className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Up Your Company</h1>
          <p className="text-sm text-gray-500">Create your organization to get started</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="input"
                placeholder="e.g. ACME Construction"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Creating...' : 'Create Company'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
