import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { PageHeader, LoadingSpinner, Alert } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { Check, X, Clock, AlertTriangle, CreditCard, FileUp, ArrowUpCircle } from 'lucide-react'
import type { SubscriptionPlan, Feature, PlanFeature, SubscriptionUpgradeRequest } from '@/types'

export function SubscriptionPage() {
  const { t } = useTranslation('subscription')
  const { profile } = useAuth()
  const { info, loading: subLoading } = useSubscription()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([])
  const [pendingRequest, setPendingRequest] = useState<SubscriptionUpgradeRequest | null>(null)
  const [recentRequests, setRecentRequests] = useState<SubscriptionUpgradeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const plansRef = useRef<HTMLDivElement>(null)

  const isAdmin = profile?.role === 'company_admin'

  useEffect(() => {
    async function fetchData() {
      const [planRes, featRes, pfRes, reqRes] = await Promise.all([
        supabase.from('subscription_plans').select('*').order('sort_order'),
        supabase.from('features').select('*').order('category, feature_key'),
        supabase.from('plan_features').select('*'),
        supabase
          .from('subscription_upgrade_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      setPlans((planRes.data ?? []) as SubscriptionPlan[])
      setFeatures((featRes.data ?? []) as Feature[])
      setPlanFeatures((pfRes.data ?? []) as PlanFeature[])

      const allRequests = (reqRes.data ?? []) as SubscriptionUpgradeRequest[]
      setPendingRequest(allRequests.find(r => r.status === 'pending') ?? null)
      setRecentRequests(allRequests.filter(r => r.status !== 'pending'))
      setLoading(false)
    }
    fetchData()
  }, [])

  // Trial countdown calculation
  const trialDaysRemaining = (() => {
    if (!info || info.status !== 'trial' || !info.trial_ends_at) return null
    const now = new Date()
    const ends = new Date(info.trial_ends_at)
    const diffMs = ends.getTime() - now.getTime()
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  })()

  const trialExpired = trialDaysRemaining !== null && trialDaysRemaining <= 0

  const currentPlan = plans.find(p => p.plan_code === info?.plan_code)

  const handleRequestUpgrade = async (planId: string) => {
    if (!isAdmin) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    const { data, error: rpcError } = await supabase.rpc('request_plan_upgrade', {
      p_requested_plan_id: planId,
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    const result = data as { success: boolean; request_id: string | null; error: string | null }
    if (!result.success) {
      setError(result.error ?? t('subscription:errors.submitFailed'))
      setSubmitting(false)
      return
    }

    setSuccess(t('subscription:success.upgradeSubmitted'))
    setSubmitting(false)

    // Refresh requests
    const { data: reqData } = await supabase
      .from('subscription_upgrade_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    const allRequests = (reqData ?? []) as SubscriptionUpgradeRequest[]
    setPendingRequest(allRequests.find(r => r.status === 'pending') ?? null)
    setRecentRequests(allRequests.filter(r => r.status !== 'pending'))
  }

  const handleCancelRequest = async () => {
    if (!pendingRequest) return
    setSubmitting(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('cancel_plan_upgrade', {
      p_request_id: pendingRequest.id,
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    const result = data as { success: boolean; error: string | null }
    if (!result.success) {
      setError(result.error ?? t('subscription:errors.cancelFailed'))
      setSubmitting(false)
      return
    }

    setSuccess(t('subscription:success.cancelled'))
    setPendingRequest(null)
    setSubmitting(false)

    // Refresh
    const { data: reqData } = await supabase
      .from('subscription_upgrade_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    const allRequests = (reqData ?? []) as SubscriptionUpgradeRequest[]
    setRecentRequests(allRequests.filter(r => r.status !== 'pending'))
  }

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  if (subLoading || loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title={t('subscription:title')} subtitle={t('subscription:subtitle')} />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      {/* Trial Countdown Banner */}
      {info && info.status === 'trial' && trialDaysRemaining !== null && (
        <div className={`mb-6 rounded-lg p-4 ${
          trialExpired ? 'bg-red-50 border border-red-200' :
          trialDaysRemaining <= 2 ? 'bg-red-50 border border-red-200' :
          trialDaysRemaining <= 5 ? 'bg-amber-50 border border-amber-200' :
          'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center gap-3">
            {trialExpired ? (
              <AlertTriangle className="h-6 w-6 text-red-600" />
            ) : (
              <Clock className={`h-6 w-6 ${
                trialDaysRemaining <= 2 ? 'text-red-600' :
                trialDaysRemaining <= 5 ? 'text-amber-600' :
                'text-green-600'
              }`} />
            )}
            <div className="flex-1">
              {trialExpired ? (
                <>
                  <p className="font-semibold text-red-800">{t('subscription:trial.expired')}</p>
                  <p className="text-sm text-red-600 mt-1">
                    {t('subscription:trial.expiredMessage')}
                  </p>
                </>
              ) : (
                <>
                  <p className={`font-semibold ${
                    trialDaysRemaining <= 2 ? 'text-red-800' :
                    trialDaysRemaining <= 5 ? 'text-amber-800' :
                    'text-green-800'
                  }`}>
                    {t('subscription:trial.daysRemaining', { count: trialDaysRemaining, days: trialDaysRemaining === 1 ? t('subscription:trial.day') : t('subscription:trial.days') })}
                  </p>
                  <p className={`text-sm mt-1 ${
                    trialDaysRemaining <= 2 ? 'text-red-600' :
                    trialDaysRemaining <= 5 ? 'text-amber-600' :
                    'text-green-600'
                  }`}>
                    {t('subscription:trial.expiresOn', { date: formatDate(info.trial_ends_at) })}
                  </p>
                </>
              )}
            </div>
            {isAdmin && (
              <button onClick={scrollToPlans} className="btn btn-primary btn-sm whitespace-nowrap">
                <ArrowUpCircle className="h-4 w-4" />
                {t('subscription:upgradeNow')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Current Plan Card */}
      {info && (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-6 w-6 text-brand-600" />
              <h2 className="text-lg font-semibold">{t('subscription:currentPlan')}</h2>
            </div>
            <span className={`badge ${
              info.status === 'trial' ? 'badge-blue' :
              info.status === 'active' ? 'badge-green' :
              info.status === 'suspended' ? 'badge-gray' :
              'badge-gray'
            }`}>
              {t(`common:status.${info.status}`)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <p className="text-sm text-gray-500">{t('common:plan.plan')}</p>
              <p className="font-semibold text-lg">{info.plan_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('subscription:maxUsers')}</p>
              <p className="font-semibold text-lg">{info.max_users}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('subscription:activeUsers')}</p>
              <p className="font-semibold text-lg">{info.active_users}</p>
            </div>
            {info.status === 'trial' && info.trial_ends_at && (
              <div>
                <p className="text-sm text-gray-500">{t('subscription:trialEnds')}</p>
                <p className="font-semibold text-lg">{formatDate(info.trial_ends_at)}</p>
              </div>
            )}
            {info.status === 'active' && info.current_period_end && (
              <div>
                <p className="text-sm text-gray-500">{t('subscription:currentPeriodEnds')}</p>
                <p className="font-semibold text-lg">{formatDate(info.current_period_end)}</p>
              </div>
            )}
            {info.suspended_reason && (
              <div className="col-span-2 lg:col-span-4">
                <p className="text-sm text-gray-500">{t('subscription:suspensionReason')}</p>
                <p className="text-sm text-red-600">{info.suspended_reason}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Request Status */}
      {pendingRequest && (
        <div className="card p-5 mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileUp className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800">{t('subscription:pendingRequest')}</p>
                <p className="text-sm text-amber-700 mt-1">
                  {t('subscription:requestedUpgradeTo', {
                    plan: plans.find(p => p.id === pendingRequest.requested_plan_id)?.plan_name ?? t('subscription:unknownPlan'),
                    date: formatDate(pendingRequest.requested_at),
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge badge-blue">{t('subscription:pendingReview')}</span>
              {isAdmin && (
                <button
                  onClick={handleCancelRequest}
                  disabled={submitting}
                  className="btn btn-secondary btn-sm"
                >
                  {t('subscription:cancelRequest')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div ref={plansRef}>
        <h2 className="text-lg font-semibold mb-4">{t('subscription:availablePlans')}</h2>
        <div className="grid gap-4 lg:grid-cols-3 mb-6">
          {plans.filter(p => p.is_active).map(p => {
            const isCurrentPlan = p.plan_code === info?.plan_code
            const isUpgrade = currentPlan ? p.sort_order > currentPlan.sort_order : false
            const planEnabledFeatures = new Set(
              planFeatures
                .filter(pf => pf.plan_id === p.id && pf.is_enabled)
                .map(pf => pf.feature_key)
            )

            return (
              <div
                key={p.id}
                className={`card p-6 relative ${
                  isCurrentPlan ? 'ring-2 ring-brand-500' : ''
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="badge badge-green px-3 py-1 text-xs">{t('subscription:currentPlanBadge')}</span>
                  </div>
                )}
                <h3 className="font-semibold text-lg mb-1">{p.plan_name}</h3>
                <p className="text-sm text-gray-500 mb-4">{p.description ?? t('subscription:noDescription')}</p>
                <div className="space-y-1 text-sm mb-4">
                  <div><span className="text-gray-500">{t('subscription:maxUsers')}:</span> <span className="font-medium">{p.default_max_users}</span></div>
                  {p.trial_duration_days && (
                    <div><span className="text-gray-500">{t('subscription:trialDuration')}:</span> <span className="font-medium">{t('subscription:trialDurationDays', { count: p.trial_duration_days })}</span></div>
                  )}
                </div>

                {/* Feature list */}
                <div className="border-t border-gray-100 pt-4 mb-4">
                  <p className="text-xs font-medium text-gray-700 mb-2">{t('subscription:features')}</p>
                  <div className="space-y-1.5">
                    {features.map(f => {
                      const isEnabled = planEnabledFeatures.has(f.feature_key)
                      return (
                        <div key={f.feature_key} className="flex items-center gap-2 text-xs">
                          {isEnabled ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-gray-300" />
                          )}
                          <span className={isEnabled ? 'text-gray-700' : 'text-gray-400'}>
                            {t(`subscription:featureNames.${f.feature_key}`, { defaultValue: f.feature_name })}
                          </span>
                          <span className={`badge ${f.category === 'core' ? 'badge-blue' : 'badge-gray'} text-xs`}>
                            {t(`subscription:featureCategory.${f.category}`)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Action button */}
                {isCurrentPlan ? (
                  <button disabled className="btn btn-secondary w-full opacity-60 cursor-default">
                    {t('subscription:current')}
                  </button>
                ) : isUpgrade && isAdmin ? (
                  <button
                    onClick={() => handleRequestUpgrade(p.id)}
                    disabled={submitting || !!pendingRequest}
                    className="btn btn-primary w-full"
                  >
                    <ArrowUpCircle className="h-4 w-4" />
                    {pendingRequest ? t('subscription:pendingRequestBtn') : t('subscription:requestUpgrade')}
                  </button>
                ) : isUpgrade && !isAdmin ? (
                  <p className="text-xs text-gray-400 text-center py-2">
                    {t('subscription:contactAdminToUpgrade')}
                  </p>
                ) : (
                  <button disabled className="btn btn-secondary w-full opacity-60 cursor-default">
                    {t('subscription:lowerTier')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Request History */}
      {recentRequests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">{t('subscription:requestHistory')}</h2>
          <div className="card table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('subscription:requestedPlan')}</th>
                  <th>{t('subscription:status')}</th>
                  <th>{t('subscription:requested')}</th>
                  <th>{t('subscription:reviewed')}</th>
                  <th>{t('subscription:notes')}</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map(r => {
                  const reqPlan = plans.find(p => p.id === r.requested_plan_id)
                  return (
                    <tr key={r.id}>
                      <td className="font-medium">{reqPlan?.plan_name ?? t('subscription:unknownPlan')}</td>
                      <td>
                        <span className={`badge ${
                          r.status === 'approved' ? 'badge-green' :
                          r.status === 'rejected' ? 'badge-gray' :
                          'badge-gray'
                        }`}>
                          {t(`common:status.${r.status}`)}
                        </span>
                      </td>
                      <td>{formatDate(r.requested_at)}</td>
                      <td>{r.reviewed_at ? formatDate(r.reviewed_at) : '—'}</td>
                      <td className="text-sm text-gray-600">
                        {r.status === 'rejected' && r.rejection_reason
                          ? r.rejection_reason
                          : r.admin_notes ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
