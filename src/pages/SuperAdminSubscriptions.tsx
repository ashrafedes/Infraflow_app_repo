import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader, LoadingSpinner, Alert, Modal } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'
import type { Subscription, SubscriptionPlan, SubscriptionAuditLog } from '@/types'

interface SubWithDetails extends Subscription {
  company_name?: string
  plan_code?: string
  plan_name?: string
}

export function SuperAdminSubscriptions() {
  const { t } = useTranslation('superAdmin')
  const { user } = useAuth()
  const [subs, setSubs] = useState<SubWithDetails[]>([])
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editSub, setEditSub] = useState<SubWithDetails | null>(null)
  const [auditLog, setAuditLog] = useState<SubscriptionAuditLog[]>([])
  const [showAudit, setShowAudit] = useState<SubWithDetails | null>(null)
  const [editForm, setEditForm] = useState({
    plan_id: '',
    status: '',
    max_users_override: false,
    max_users: '',
    suspended_reason: '',
    current_period_end: '',
  })
  const [renewSub, setRenewSub] = useState<SubWithDetails | null>(null)
  const [renewYears, setRenewYears] = useState(1)
  const [renewing, setRenewing] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    const [subRes, planRes, compRes] = await Promise.all([
      supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('subscription_plans').select('*').order('sort_order').limit(100),
      supabase.from('companies').select('id, name').limit(1000) as unknown as Promise<{ data: { id: string; name: string }[] | null }>,
    ])

    if (subRes.error) { setError(subRes.error.message); setLoading(false); return }

    const planMap = new Map((planRes.data ?? []).map((p: SubscriptionPlan) => [p.id, p]))
    const compMap = new Map((compRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))

    const enriched = ((subRes.data ?? []) as Subscription[]).map(s => {
      const plan = planMap.get(s.plan_id)
      return {
        ...s,
        company_name: compMap.get(s.company_id),
        plan_code: plan?.plan_code,
        plan_name: plan?.plan_name,
      } as SubWithDetails
    })

    setSubs(enriched)
    setPlans((planRes.data ?? []) as SubscriptionPlan[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleEdit = (s: SubWithDetails) => {
    setEditSub(s)
    setEditForm({
      plan_id: s.plan_id,
      status: s.status,
      max_users_override: s.max_users_override,
      max_users: s.max_users?.toString() ?? '',
      suspended_reason: s.suspended_reason ?? '',
      current_period_end: s.current_period_end ? s.current_period_end.slice(0, 10) : '',
    })
  }

  const handleSave = async () => {
    if (!editSub) return
    setError(null)

    const updates: Record<string, unknown> = {
      plan_id: editForm.plan_id,
      status: editForm.status,
      max_users_override: editForm.max_users_override,
      max_users: editForm.max_users_override && editForm.max_users ? parseInt(editForm.max_users) : null,
    }

    if (editForm.status === 'suspended') {
      updates.suspended_at = new Date().toISOString()
      updates.suspended_reason = editForm.suspended_reason || null
    } else {
      updates.suspended_at = null
      updates.suspended_reason = null
    }

    // Period end — only for active subscriptions
    if (editForm.status === 'active') {
      updates.current_period_end = editForm.current_period_end
        ? new Date(editForm.current_period_end).toISOString()
        : null
    }

    const oldPlan = plans.find(p => p.id === editSub.plan_id)
    const newPlan = plans.find(p => p.id === editForm.plan_id)

    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', editSub.id)

    if (updateErr) { setError(updateErr.message); return }

    // Audit log
    await supabase.from('subscription_audit_log').insert({
      company_id: editSub.company_id,
      action: oldPlan?.plan_code !== newPlan?.plan_code ? 'plan_changed' : 'user_limit_changed',
      old_value: {
        plan_code: oldPlan?.plan_code,
        status: editSub.status,
        max_users_override: editSub.max_users_override,
        max_users: editSub.max_users,
      },
      new_value: {
        plan_code: newPlan?.plan_code,
        status: editForm.status,
        max_users_override: editForm.max_users_override,
        max_users: updates.max_users,
      },
      performed_by: user?.id ?? null,
    })

    setEditSub(null)
    fetchData()
  }

  const handleViewAudit = async (s: SubWithDetails) => {
    setShowAudit(s)
    const { data } = await supabase
      .from('subscription_audit_log')
      .select('*')
      .eq('company_id', s.company_id)
      .order('performed_at', { ascending: false })
      .limit(50)
    setAuditLog((data ?? []) as SubscriptionAuditLog[])
  }

  const handleRenew = async () => {
    if (!renewSub) return
    setRenewing(true)
    setError(null)

    // Compute new period end:
    // If current_period_end is in the future, extend from it.
    // If it's in the past or null, extend from now.
    const now = new Date()
    const currentEnd = renewSub.current_period_end ? new Date(renewSub.current_period_end) : null
    const baseDate = currentEnd && currentEnd > now ? currentEnd : now
    const newEnd = new Date(baseDate)
    newEnd.setFullYear(newEnd.getFullYear() + renewYears)

    const updates: Record<string, unknown> = {
      current_period_end: newEnd.toISOString(),
      status: 'active',
      suspended_at: null,
      suspended_reason: null,
    }

    // If period_start is null, set it to now
    if (!renewSub.current_period_start) {
      updates.current_period_start = now.toISOString()
    }

    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', renewSub.id)

    if (updateErr) { setError(updateErr.message); setRenewing(false); return }

    // Audit log
    await supabase.from('subscription_audit_log').insert({
      company_id: renewSub.company_id,
      action: 'renewed',
      old_value: {
        current_period_end: renewSub.current_period_end,
        status: renewSub.status,
      },
      new_value: {
        current_period_end: newEnd.toISOString(),
        years: renewYears,
        status: 'active',
      },
      performed_by: user?.id ?? null,
    })

    setRenewing(false)
    setRenewSub(null)
    setRenewYears(1)
    fetchData()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title={t('subscriptions.title')} subtitle={t('subscriptions.subtitle')} />
      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="card table-container">
        <table className="table">
          <thead>
            <tr>
              <th>{t('subscriptions.columns.company')}</th>
              <th>{t('subscriptions.columns.plan')}</th>
              <th>{t('subscriptions.columns.status')}</th>
              <th>{t('subscriptions.columns.maxUsers')}</th>
              <th>{t('subscriptions.columns.trialEnds')}</th>
              <th>{t('subscription:currentPeriodEnds')}</th>
              <th>{t('subscriptions.columns.created')}</th>
              <th className="text-right">{t('subscriptions.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {subs.map(s => (
              <tr key={s.id}>
                <td className="font-medium">{s.company_name ?? '—'}</td>
                <td>{s.plan_name ?? '—'}</td>
                <td>
                  <span className={`badge ${
                    s.status === 'trial' ? 'badge-blue' :
                    s.status === 'active' ? 'badge-green' :
                    s.status === 'suspended' ? 'badge-gray' : 'badge-gray'
                  }`}>{t(`common:status.${s.status}`)}</span>
                </td>
                <td>
                  {s.max_users_override ? `${s.max_users} (${t('subscriptions.override')})` : `${plans.find(p => p.id === s.plan_id)?.default_max_users ?? '—'} (${t('subscriptions.plan')})`}
                </td>
                <td>{s.trial_ends_at ? formatDate(s.trial_ends_at) : '—'}</td>
                <td>{s.current_period_end ? formatDate(s.current_period_end) : '—'}</td>
                <td>{formatDate(s.created_at)}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={() => handleEdit(s)} className="btn btn-secondary btn-sm mr-2">{t('common:buttons.edit')}</button>
                  <button
                    onClick={() => { setRenewSub(s); setRenewYears(1) }}
                    className="btn btn-primary btn-sm mr-2"
                    title={t('subscriptions.renew')}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('subscriptions.renew')}
                  </button>
                  <button onClick={() => handleViewAudit(s)} className="btn btn-secondary btn-sm">{t('common:buttons.audit')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      <Modal open={!!editSub} onClose={() => setEditSub(null)} title={t('subscriptions.modal.editTitle')} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">{t('subscriptions.columns.plan')}</label>
            <select
              value={editForm.plan_id}
              onChange={e => setEditForm({ ...editForm, plan_id: e.target.value })}
              className="input"
            >
              {plans.map(p => <option key={p.id} value={p.id}>{p.plan_name} ({p.plan_code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('subscriptions.columns.status')}</label>
            <select
              value={editForm.status}
              onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              className="input"
            >
              <option value="trial">{t('common:status.trial')}</option>
              <option value="active">{t('common:status.active')}</option>
              <option value="suspended">{t('common:status.suspended')}</option>
              <option value="expired">{t('common:status.expired')}</option>
              <option value="cancelled">{t('common:status.cancelled')}</option>
            </select>
          </div>
          {editForm.status === 'active' && (
            <div>
              <label className="label">{t('subscription:currentPeriodEnds')}</label>
              <input
                type="date"
                value={editForm.current_period_end}
                onChange={e => setEditForm({ ...editForm, current_period_end: e.target.value })}
                className="input"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="max_users_override"
              checked={editForm.max_users_override}
              onChange={e => setEditForm({ ...editForm, max_users_override: e.target.checked })}
            />
            <label htmlFor="max_users_override" className="text-sm">{t('subscriptions.overrideMaxUsers')}</label>
          </div>
          {editForm.max_users_override && (
            <div>
              <label className="label">{t('subscriptions.columns.maxUsers')}</label>
              <input
                type="number"
                value={editForm.max_users}
                onChange={e => setEditForm({ ...editForm, max_users: e.target.value })}
                className="input"
                min="1"
              />
            </div>
          )}
          {editForm.status === 'suspended' && (
            <div>
              <label className="label">{t('subscriptions.suspensionReason')}</label>
              <input
                type="text"
                value={editForm.suspended_reason}
                onChange={e => setEditForm({ ...editForm, suspended_reason: e.target.value })}
                className="input"
                placeholder={t('subscriptions.suspensionReasonPlaceholder')}
              />
            </div>
          )}
          {error && <Alert type="error" message={error} />}
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditSub(null)} className="btn btn-secondary">{t('common:buttons.cancel')}</button>
            <button onClick={handleSave} className="btn btn-primary">{t('common:buttons.save')}</button>
          </div>
        </div>
      </Modal>

      {/* Renew Modal */}
      <Modal open={!!renewSub} onClose={() => setRenewSub(null)} title={t('subscriptions.modal.renewTitle')} size="md">
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">{t('subscriptions.columns.company')}</span>
              <span className="font-medium">{renewSub?.company_name ?? '—'}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">{t('subscriptions.columns.plan')}</span>
              <span className="font-medium">{renewSub?.plan_name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('subscription:currentPeriodEnds')}</span>
              <span className="font-medium">{renewSub?.current_period_end ? formatDate(renewSub.current_period_end) : '—'}</span>
            </div>
          </div>
          <div>
            <label className="label">{t('subscriptions.renewYears')}</label>
            <select
              value={renewYears}
              onChange={e => setRenewYears(parseInt(e.target.value))}
              className="input"
            >
              <option value={1}>1 {t('subscriptions.year')}</option>
              <option value={2}>2 {t('subscriptions.years')}</option>
              <option value={3}>3 {t('subscriptions.years')}</option>
              <option value={5}>5 {t('subscriptions.years')}</option>
            </select>
          </div>
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
            {t('subscriptions.renewPreview', {
              date: (() => {
                const now = new Date()
                const currentEnd = renewSub?.current_period_end ? new Date(renewSub.current_period_end) : null
                const baseDate = currentEnd && currentEnd > now ? currentEnd : now
                const newEnd = new Date(baseDate)
                newEnd.setFullYear(newEnd.getFullYear() + renewYears)
                return formatDate(newEnd.toISOString())
              })(),
            })}
          </div>
          {error && <Alert type="error" message={error} />}
          <div className="flex justify-end gap-3">
            <button onClick={() => setRenewSub(null)} className="btn btn-secondary">{t('common:buttons.cancel')}</button>
            <button onClick={handleRenew} disabled={renewing} className="btn btn-primary">
              <RefreshCw className="h-4 w-4" />
              {renewing ? t('subscriptions.renewing') : t('subscriptions.renew')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit Log Modal */}
      <Modal open={!!showAudit} onClose={() => setShowAudit(null)} title={`${t('subscriptions.modal.auditTitle')} — ${showAudit?.company_name ?? ''}`} size="xl">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>{t('subscriptions.audit.action')}</th><th>{t('subscriptions.audit.oldValue')}</th><th>{t('subscriptions.audit.newValue')}</th><th>{t('subscriptions.audit.when')}</th></tr>
            </thead>
            <tbody>
              {auditLog.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-gray-500 py-8">{t('subscriptions.empty')}</td></tr>
              ) : auditLog.map(log => (
                <tr key={log.id}>
                  <td className="font-medium">{log.action}</td>
                  <td className="text-xs text-gray-600">{log.old_value ? JSON.stringify(log.old_value) : '—'}</td>
                  <td className="text-xs text-gray-600">{log.new_value ? JSON.stringify(log.new_value) : '—'}</td>
                  <td className="whitespace-nowrap">{formatDateTime(log.performed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}
