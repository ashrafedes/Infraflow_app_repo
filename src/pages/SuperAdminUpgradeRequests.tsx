import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert, Modal } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { Check, X } from 'lucide-react'
import type { SubscriptionUpgradeRequest } from '@/types'

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all'

interface EnrichedRequest extends SubscriptionUpgradeRequest {
  company_name?: string
  current_plan_name?: string
  requested_plan_name?: string
  requested_by_email?: string
}

export function SuperAdminUpgradeRequests() {
  const [requests, setRequests] = useState<EnrichedRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('pending')
  const [actionRequest, setActionRequest] = useState<EnrichedRequest | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    const [reqRes, planRes, compRes] = await Promise.all([
      supabase
        .from('subscription_upgrade_requests')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('subscription_plans').select('*').order('sort_order'),
      supabase.from('companies').select('id, name') as unknown as Promise<{ data: { id: string; name: string }[] | null }>,
    ])

    if (reqRes.error) {
      setError(reqRes.error.message)
      setLoading(false)
      return
    }

    const planMap = new Map((planRes.data ?? []).map((p: { id: string; plan_name: string }) => [p.id, p]))
    const compMap = new Map((compRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))

    // Fetch requester emails from user_profiles
    const requesterIds = ((reqRes.data ?? []) as SubscriptionUpgradeRequest[])
      .map(r => r.requested_by)
      .filter(Boolean)
    let emailMap = new Map<string, string>()
    if (requesterIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, email')
        .in('id', requesterIds)
      emailMap = new Map((profiles ?? []).map((p: { id: string; email: string }) => [p.id, p.email]))
    }

    const enriched = ((reqRes.data ?? []) as SubscriptionUpgradeRequest[]).map(r => {
      const currentPlan = planMap.get(r.current_plan_id)
      const requestedPlan = planMap.get(r.requested_plan_id)
      return {
        ...r,
        company_name: compMap.get(r.company_id),
        current_plan_name: currentPlan?.plan_name,
        requested_plan_name: requestedPlan?.plan_name,
        requested_by_email: emailMap.get(r.requested_by),
      } as EnrichedRequest
    })

    setRequests(enriched)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filtered = requests.filter(r => {
    if (filter === 'all') return true
    return r.status === filter
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length

  const openAction = (req: EnrichedRequest, type: 'approve' | 'reject') => {
    setActionRequest(req)
    setActionType(type)
    setAdminNotes('')
    setRejectionReason('')
    setError(null)
    setSuccess(null)
  }

  const closeAction = () => {
    setActionRequest(null)
    setActionType(null)
    setAdminNotes('')
    setRejectionReason('')
  }

  const handleAction = async () => {
    if (!actionRequest || !actionType) return
    setSubmitting(true)
    setError(null)

    if (actionType === 'approve') {
      const { data, error: rpcError } = await supabase.rpc('approve_plan_upgrade', {
        p_request_id: actionRequest.id,
        p_admin_notes: adminNotes || null,
      })

      if (rpcError) {
        setError(rpcError.message)
        setSubmitting(false)
        return
      }

      const result = data as { success: boolean; error: string | null; new_plan_code: string }
      if (!result.success) {
        setError(result.error ?? 'Failed to approve request')
        setSubmitting(false)
        return
      }

      setSuccess(`Request approved. Plan changed to ${result.new_plan_code}.`)
    } else {
      const { data, error: rpcError } = await supabase.rpc('reject_plan_upgrade', {
        p_request_id: actionRequest.id,
        p_rejection_reason: rejectionReason,
      })

      if (rpcError) {
        setError(rpcError.message)
        setSubmitting(false)
        return
      }

      const result = data as { success: boolean; error: string | null }
      if (!result.success) {
        setError(result.error ?? 'Failed to reject request')
        setSubmitting(false)
        return
      }

      setSuccess('Request rejected.')
    }

    setSubmitting(false)
    closeAction()
    fetchData()
  }

  if (loading) return <LoadingSpinner />

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: requests.filter(r => r.status === 'pending').length },
    { key: 'approved', label: 'Approved', count: requests.filter(r => r.status === 'approved').length },
    { key: 'rejected', label: 'Rejected', count: requests.filter(r => r.status === 'rejected').length },
    { key: 'all', label: 'All', count: requests.length },
  ]

  return (
    <div>
      <PageHeader
        title="Upgrade Requests"
        subtitle="Review company plan upgrade requests"
        action={pendingCount > 0 ? (
          <span className="badge badge-blue">{pendingCount} pending</span>
        ) : undefined}
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`btn btn-sm ${
              filter === tab.key ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Requests table */}
      <div className="card table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Current Plan</th>
              <th>Requested Plan</th>
              <th>Requested By</th>
              <th>Requested Date</th>
              <th>Status</th>
              <th>Reviewed</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">
                  No {filter !== 'all' ? filter : ''} upgrade requests
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr
                  key={r.id}
                  className={r.status === 'pending' ? 'bg-amber-50' : ''}
                >
                  <td className="font-medium">{r.company_name ?? '—'}</td>
                  <td>{r.current_plan_name ?? '—'}</td>
                  <td className="font-medium">{r.requested_plan_name ?? '—'}</td>
                  <td className="text-sm">{r.requested_by_email ?? '—'}</td>
                  <td>{formatDate(r.requested_at)}</td>
                  <td>
                    <span className={`badge ${
                      r.status === 'pending' ? 'badge-blue' :
                      r.status === 'approved' ? 'badge-green' :
                      r.status === 'rejected' ? 'badge-gray' :
                      'badge-gray'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="text-sm">
                    {r.reviewed_at ? formatDate(r.reviewed_at) : '—'}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {r.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => openAction(r, 'approve')}
                          className="btn btn-primary btn-sm mr-2"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => openAction(r, 'reject')}
                          className="btn btn-danger btn-sm"
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {r.status === 'rejected' && r.rejection_reason
                          ? `Reason: ${r.rejection_reason}`
                          : r.admin_notes ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Approve Modal */}
      <Modal
        open={!!actionRequest && actionType === 'approve'}
        onClose={closeAction}
        title="Approve Upgrade Request"
      >
        {actionRequest && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div><span className="text-gray-500">Company:</span> <span className="font-medium">{actionRequest.company_name}</span></div>
              <div><span className="text-gray-500">Current Plan:</span> <span className="font-medium">{actionRequest.current_plan_name}</span></div>
              <div><span className="text-gray-500">Requested Plan:</span> <span className="font-medium">{actionRequest.requested_plan_name}</span></div>
              <div><span className="text-gray-500">Requested By:</span> <span className="font-medium">{actionRequest.requested_by_email}</span></div>
            </div>
            <div>
              <label className="label">Admin Notes (optional)</label>
              <textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                className="input"
                rows={3}
                placeholder="Internal notes about this approval..."
              />
            </div>
            {error && <Alert type="error" message={error} />}
            <div className="flex justify-end gap-3">
              <button onClick={closeAction} className="btn btn-secondary">Cancel</button>
              <button
                onClick={handleAction}
                disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? 'Approving...' : 'Approve Upgrade'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={!!actionRequest && actionType === 'reject'}
        onClose={closeAction}
        title="Reject Upgrade Request"
      >
        {actionRequest && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div><span className="text-gray-500">Company:</span> <span className="font-medium">{actionRequest.company_name}</span></div>
              <div><span className="text-gray-500">Current Plan:</span> <span className="font-medium">{actionRequest.current_plan_name}</span></div>
              <div><span className="text-gray-500">Requested Plan:</span> <span className="font-medium">{actionRequest.requested_plan_name}</span></div>
            </div>
            <div>
              <label className="label">Rejection Reason (required)</label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                className="input"
                rows={3}
                placeholder="Explain why this request is being rejected..."
              />
            </div>
            {error && <Alert type="error" message={error} />}
            <div className="flex justify-end gap-3">
              <button onClick={closeAction} className="btn btn-secondary">Cancel</button>
              <button
                onClick={handleAction}
                disabled={submitting || !rejectionReason.trim()}
                className="btn btn-danger"
              >
                {submitting ? 'Rejecting...' : 'Reject Request'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
