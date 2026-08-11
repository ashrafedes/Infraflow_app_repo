import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'

export function AuthPage() {
  const { t } = useTranslation('auth')
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'signup') {
      const { error } = await signUp(email, password, fullName)
      if (error) {
        setError(error)
      } else {
        // Auto-confirm emails are enabled on the backend, so sign in immediately
        const { error: signInError } = await signIn(email, password)
        if (signInError) {
          setError(signInError)
        }
      }
    } else {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error)
      }
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
          <h1 className="text-2xl font-bold text-gray-900">{t('auth:title')}</h1>
          <p className="text-sm text-gray-500">{t('auth:tagline')}</p>
        </div>

        <div className="card p-6">
          <div className="mb-6 flex gap-2 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t('auth:signin')}
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t('auth:register')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">{t('auth:fullName')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input"
                  required
                />
              </div>
            )}
            <div>
              <label className="label">{t('auth:email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('auth:password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? t('common:buttons.pleaseWait') : mode === 'signin' ? t('auth:signin') : t('auth:createAccount')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
