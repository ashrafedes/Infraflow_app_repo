import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader, LoadingSpinner, Alert, Modal } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { Subscription, SubscriptionPlan, SubscriptionAuditLog } from '@/types'

interface SubWithDetails extends Subscription {
  company_name?: string
  plan_code?: string
  plan_name?: string
}

export function SuperAdminSubscriptions() {
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
  })

  const fetchData = async () => {
    setLoading(true)
    const [subRes, planRes, compRes] = await Promise.all([
      supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
      supabase.from('subscription_plans').select('*').order('sort_order'),
      supabase.from('companies').select('id, name') as unknown as Promise<{ data: { id: string; name: string }[] | null }>,
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

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Subscriptions" subtitle="Manage company subscriptions" />
      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="card table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Max Users</th>
              <th>Trial Ends</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
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
                  }`}>{s.status}</span>
                </td>
                <td>
                  {s.max_users_override ? `${s.max_users} (override)` : `${plans.find(p => p.id === s.plan_id)?.default_max_users ?? '—'} (plan)`}
                </td>
                <td>{s.trial_ends_at ? formatDate(s.trial_ends_at) : '—'}</td>
                <td>{formatDate(s.created_at)}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={() => handleEdit(s)} className="btn btn-secondary btn-sm mr-2">Edit</button>
                  <button onClick={() => handleViewAudit(s)} className="btn btn-secondary btn-sm">Audit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      <Modal open={!!editSub} onClose={() => setEditSub(null)} title="Edit Subscription" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Plan</label>
            <select
              value={editForm.plan_id}
              onChange={e => setEditForm({ ...editForm, plan_id: e.target.value })}
              className="input"
            >
              {plans.map(p => <option key={p.id} value={p.id}>{p.plan_name} ({p.plan_code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              value={editForm.status}
              onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              className="input"
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="max_users_override"
              checked={editForm.max_users_override}
              onChange={e => setEditForm({ ...editForm, max_users_override: e.target.checked })}
            />
            <label htmlFor="max_users_override" className="text-sm">Override max users</label>
          </div>
          {editForm.max_users_override && (
            <div>
              <label className="label">Max Users</label>
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
              <label className="label">Suspension Reason</label>
              <input
                type="text"
                value={editForm.suspended_reason}
                onChange={e => setEditForm({ ...editForm, suspended_reason: e.target.value })}
                className="input"
                placeholder="Reason for suspension"
              />
            </div>
          )}
          {error && <Alert type="error" message={error} />}
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditSub(null)} className="btn btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn btn-primary">Save</button>
          </div>
        </div>
      </Modal>

      {/* Audit Log Modal */}
      <Modal open={!!showAudit} onClose={() => setShowAudit(null)} title={`Audit Log — ${showAudit?.company_name ?? ''}`} size="xl">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Action</th><th>Old Value</th><th>New Value</th><th>When</th></tr>
            </thead>
            <tbody>
              {auditLog.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-gray-500 py-8">No audit entries</td></tr>
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
