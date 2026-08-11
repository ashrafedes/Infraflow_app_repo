import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { Company, Subscription, SubscriptionPlan } from '@/types'

interface CompanyWithSub extends Company {
  plan_code?: string
  plan_name?: string
  status?: string
  trial_ends_at?: string | null
  active_users?: number
}

export function SuperAdminCompanies() {
  const { t } = useTranslation('superAdmin')
  const [companies, setCompanies] = useState<CompanyWithSub[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const [compRes, subRes, plansRes] = await Promise.all([
        supabase.from('companies').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('subscriptions').select('*').limit(1000),
        supabase.from('subscription_plans').select('*').limit(100),
      ])

      if (compRes.error) { setError(compRes.error.message); setLoading(false); return }

      const subs = (subRes.data ?? []) as Subscription[]
      const plans = (plansRes.data ?? []) as SubscriptionPlan[]
      const planMap = new Map(plans.map(p => [p.id, p]))

      const enriched = ((compRes.data ?? []) as Company[]).map(c => {
        const sub = subs.find(s => s.company_id === c.id)
        const plan = sub ? planMap.get(sub.plan_id) : undefined
        return {
          ...c,
          plan_code: plan?.plan_code,
          plan_name: plan?.plan_name,
          status: sub?.status,
          trial_ends_at: sub?.trial_ends_at,
        } as CompanyWithSub
      })

      setCompanies(enriched)
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title={t('companies.title')} subtitle={t('companies.subtitle')} />
      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      <div className="card table-container">
        <table className="table">
          <thead>
            <tr>
              <th>{t('companies.columns.company')}</th>
              <th>{t('companies.columns.plan')}</th>
              <th>{t('companies.columns.status')}</th>
              <th>{t('companies.columns.trialEnds')}</th>
              <th>{t('companies.columns.created')}</th>
              <th className="text-right">{t('companies.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => (
              <tr key={c.id}>
                <td className="font-medium">
                  <Link to={`/admin/companies/${c.id}`} className="text-brand-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td>{c.plan_name ?? '—'}</td>
                <td>
                  <span className={`badge ${
                    c.status === 'trial' ? 'badge-blue' :
                    c.status === 'active' ? 'badge-green' :
                    c.status === 'suspended' ? 'badge-gray' : 'badge-gray'
                  }`}>
                    {c.status ? t(`common:status.${c.status}`) : '—'}
                  </span>
                </td>
                <td>{c.trial_ends_at ? formatDate(c.trial_ends_at) : '—'}</td>
                <td>{formatDate(c.created_at)}</td>
                <td className="text-right">
                  <Link
                    to={`/admin/companies/${c.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    {t('common:buttons.view')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
