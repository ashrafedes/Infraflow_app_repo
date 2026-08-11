import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert, Modal } from '@/components/ui'
import type { SubscriptionPlan, Feature, PlanFeature } from '@/types'

export function SuperAdminPlans() {
  const { t } = useTranslation('superAdmin')
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editPlan, setEditPlan] = useState<SubscriptionPlan | null>(null)
  const [editForm, setEditForm] = useState({
    plan_name: '',
    description: '',
    default_max_users: '5',
    is_active: true,
  })

  const fetchData = async () => {
    setLoading(true)
    const [planRes, featRes, pfRes] = await Promise.all([
      supabase.from('subscription_plans').select('*').order('sort_order').limit(100),
      supabase.from('features').select('*').order('category, feature_key').limit(100),
      supabase.from('plan_features').select('*').limit(500),
    ])

    if (planRes.error) { setError(planRes.error.message); setLoading(false); return }

    setPlans((planRes.data ?? []) as SubscriptionPlan[])
    setFeatures((featRes.data ?? []) as Feature[])
    setPlanFeatures((pfRes.data ?? []) as PlanFeature[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleEdit = (p: SubscriptionPlan) => {
    setEditPlan(p)
    setEditForm({
      plan_name: p.plan_name,
      description: p.description ?? '',
      default_max_users: p.default_max_users.toString(),
      is_active: p.is_active,
    })
  }

  const handleSave = async () => {
    if (!editPlan) return
    setError(null)

    const { error: updateErr } = await supabase
      .from('subscription_plans')
      .update({
        plan_name: editForm.plan_name,
        description: editForm.description || null,
        default_max_users: parseInt(editForm.default_max_users) || 5,
        is_active: editForm.is_active,
      })
      .eq('id', editPlan.id)

    if (updateErr) { setError(updateErr.message); return }
    setEditPlan(null)
    fetchData()
  }

  const toggleFeature = async (planId: string, featureKey: string, currentEnabled: boolean) => {
    const existing = planFeatures.find(pf => pf.plan_id === planId && pf.feature_key === featureKey)

    if (existing) {
      const { error } = await supabase
        .from('plan_features')
        .update({ is_enabled: !currentEnabled })
        .eq('id', existing.id)
      if (error) { setError(error.message); return }
    } else {
      const { error } = await supabase
        .from('plan_features')
        .insert({ plan_id: planId, feature_key: featureKey, is_enabled: !currentEnabled })
      if (error) { setError(error.message); return }
    }

    fetchData()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title={t('plans.title')} subtitle={t('plans.subtitle')} />
      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      {/* Plans list */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        {plans.map(p => (
          <div key={p.id} className="card p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">{p.plan_name}</h3>
              <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>
                {p.is_active ? t('plans.active') : t('plans.inactive')}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{p.description ?? t('plans.noDescription')}</p>
            <div className="space-y-1 text-sm">
              <div><span className="text-gray-500">{t('plans.code')}:</span> <span className="font-mono">{p.plan_code}</span></div>
              <div><span className="text-gray-500">{t('plans.maxUsers')}:</span> {p.default_max_users}</div>
              {p.trial_duration_days && <div><span className="text-gray-500">{t('plans.trial')}:</span> {p.trial_duration_days} {t('plans.days')}</div>}
              {p.is_system_plan && <div><span className="text-gray-500">{t('plans.systemPlan')}</span></div>}
            </div>
            <div className="mt-4">
              <button onClick={() => handleEdit(p)} className="btn btn-secondary btn-sm">{t('plans.editPlan')}</button>
            </div>

            {/* Feature toggles */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-700 mb-2">{t('plans.features.title')}</p>
              <div className="space-y-1">
                {features.map(f => {
                  const pf = planFeatures.find(x => x.plan_id === p.id && x.feature_key === f.feature_key)
                  const isEnabled = pf?.is_enabled ?? false
                  return (
                    <label key={f.feature_key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleFeature(p.id, f.feature_key, isEnabled)}
                      />
                      <span>{f.feature_name}</span>
                      <span className={`badge ${f.category === 'core' ? 'badge-blue' : 'badge-gray'} text-xs`}>{f.category}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Plan Modal */}
      <Modal open={!!editPlan} onClose={() => setEditPlan(null)} title={t('plans.modal.editTitle')}>
        <div className="space-y-4">
          <div>
            <label className="label">{t('plans.columns.name')}</label>
            <input value={editForm.plan_name} onChange={e => setEditForm({ ...editForm, plan_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('plans.features.description')}</label>
            <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="input" rows={2} />
          </div>
          <div>
            <label className="label">{t('plans.defaultMaxUsers')}</label>
            <input type="number" value={editForm.default_max_users} onChange={e => setEditForm({ ...editForm, default_max_users: e.target.value })} className="input" min="1" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="plan_active" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} />
            <label htmlFor="plan_active" className="text-sm">{t('plans.active')}</label>
          </div>
          {error && <Alert type="error" message={error} />}
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditPlan(null)} className="btn btn-secondary">{t('common:buttons.cancel')}</button>
            <button onClick={handleSave} className="btn btn-primary">{t('common:buttons.save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
