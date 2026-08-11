import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert, ActiveBadge } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import type {
  Company, UserProfile, Subscription, SubscriptionPlan,
  SubscriptionAuditLog, Feature,
} from '@/types'

// ============================================================================
// Types
// ============================================================================
interface CompanyFeature {
  feature_key: string
  is_enabled: boolean
}

const roleLabels: Record<string, string> = {
  company_admin: 'Company Admin',
  warehouse_man: 'Warehouse Man',
  inspector: 'Inspector',
  project_control: 'Project Control',
  project_manager: 'Project Manager',
}

// ============================================================================
// Tier badge — informational only, computed from active/max ratio
// ============================================================================
function UtilizationBadge({ pct }: { pct: number }) {
  let tier: 'warning' | 'critical' | 'limit_reached' | 'ok' = 'ok'
  if (pct >= 100) tier = 'limit_reached'
  else if (pct >= 90) tier = 'critical'
  else if (pct >= 80) tier = 'warning'

  const styles: Record<string, string> = {
    ok: 'badge badge-green',
    warning: 'badge badge-yellow',
    critical: 'badge badge-red',
    limit_reached: 'badge badge-red',
  }
  const labels: Record<string, string> = {
    ok: 'Healthy',
    warning: 'Warning',
    critical: 'Critical',
    limit_reached: 'Limit Reached',
  }
  return <span className={styles[tier]}>{labels[tier]}</span>
}

// ============================================================================
// Component
// ============================================================================
export function SuperAdminCompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [company, setCompany] = useState<Company | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [features, setFeatures] = useState<CompanyFeature[]>([])
  const [featureDefs, setFeatureDefs] = useState<Feature[]>([])
  const [auditLog, setAuditLog] = useState<SubscriptionAuditLog[]>([])

  useEffect(() => {
    if (!id) return
    async function fetchData() {
      setLoading(true)
      setError(null)

      // Fetch company, subscription+plan, users, features, audit log in parallel
      const [
        compRes,
        subRes,
        usersRes,
        featuresRes,
        featDefsRes,
        auditRes,
      ] = await Promise.all([
        supabase.from('companies').select('*').eq('id', id).single(),
        supabase
          .from('subscriptions')
          .select('*, subscription_plans(*)')
          .eq('company_id', id)
          .single(),
        supabase
          .from('user_profiles')
          .select('*')
          .eq('company_id', id)
          .order('full_name'),
        supabase.rpc('get_company_features_for', { p_company_id: id }),
        supabase.from('features').select('*').order('category, feature_key'),
        supabase
          .from('subscription_audit_log')
          .select('*')
          .eq('company_id', id)
          .order('performed_at', { ascending: false })
          .limit(50),
      ])

      if (compRes.error) {
        setError(compRes.error.message)
        setLoading(false)
        return
      }

      setCompany(compRes.data as Company)

      if (subRes.data) {
        const subData = subRes.data as Subscription & { subscription_plans?: SubscriptionPlan }
        // Extract the joined plan
        if (subData.subscription_plans) {
          setPlan(subData.subscription_plans)
          delete (subData as Partial<typeof subData>).subscription_plans
        }
        setSubscription(subData as Subscription)
      }

      setUsers((usersRes.data ?? []) as UserProfile[])
      setFeatures((featuresRes.data ?? []) as CompanyFeature[])
      setFeatureDefs((featDefsRes.data ?? []) as Feature[])
      setAuditLog((auditRes.data ?? []) as SubscriptionAuditLog[])

      setLoading(false)
    }
    fetchData()
  }, [id])

  if (loading) return <LoadingSpinner />

  if (error) {
    return (
      <div>
        <PageHeader title="Company Detail" />
        <div className="mb-4"><Alert type="error" message={error} /></div>
        <Link to="/admin/companies" className="btn btn-secondary">
          <ArrowLeft className="h-4 w-4" /> Back to Companies
        </Link>
      </div>
    )
  }

  if (!company) {
    return (
      <div>
        <PageHeader title="Company Detail" />
        <div className="mb-4"><Alert type="error" message="Company not found." /></div>
        <Link to="/admin/companies" className="btn btn-secondary">
          <ArrowLeft className="h-4 w-4" /> Back to Companies
        </Link>
      </div>
    )
  }

  // Calculate effective max users and utilization
  const effectiveMaxUsers = subscription
    ? (subscription.max_users_override && subscription.max_users
        ? subscription.max_users
        : plan?.default_max_users ?? 0)
    : 0
  const activeUserCount = users.filter(u => u.is_active).length
  const utilizationPct = effectiveMaxUsers > 0
    ? Math.round((activeUserCount / effectiveMaxUsers) * 100 * 10) / 10
    : 0

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'trial': return 'badge badge-blue'
      case 'active': return 'badge badge-green'
      case 'suspended': return 'badge badge-red'
      case 'expired': return 'badge badge-gray'
      case 'cancelled': return 'badge badge-gray'
      default: return 'badge badge-gray'
    }
  }

  // Build a map of feature definitions for display
  const featureDefMap = new Map(featureDefs.map(f => [f.feature_key, f]))

  return (
    <div>
      <PageHeader
        title={company.name}
        subtitle="Company Inspection"
        action={
          <Link to="/admin/companies" className="btn btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back to Companies
          </Link>
        }
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overview */}
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Company Overview</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Company ID:</span>
              <span className="font-mono text-xs">{company.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Name:</span>
              <span className="font-medium">{company.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Created:</span>
              <span>{formatDate(company.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total Users:</span>
              <span className="font-medium">{users.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Active Users:</span>
              <span className="font-medium">{activeUserCount}</span>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Subscription</h2>
          {subscription && plan ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Plan:</span>
                <span className="font-medium">{plan.plan_name} ({plan.plan_code})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span className={statusBadgeClass(subscription.status)}>{subscription.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Trial Start:</span>
                <span>{formatDate(subscription.trial_started_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Trial End:</span>
                <span>{formatDate(subscription.trial_ends_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Current Period:</span>
                <span>
                  {formatDate(subscription.current_period_start)} — {formatDate(subscription.current_period_end)}
                </span>
              </div>
              {subscription.suspended_reason && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Suspended Reason:</span>
                  <span className="text-red-600">{subscription.suspended_reason}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No subscription found</p>
          )}
        </div>

        {/* User Limit */}
        <div className="card p-5">
          <h2 className="font-semibold mb-3">User Limit</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Active Users:</span>
              <span className="font-medium">{activeUserCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Users:</span>
              <span className="font-medium">
                {effectiveMaxUsers}
                {subscription?.max_users_override && (
                  <span className="text-xs text-gray-400 ml-1">(override)</span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Utilization:</span>
              <span className="font-medium">{utilizationPct}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Status:</span>
              <UtilizationBadge pct={utilizationPct} />
            </div>
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  utilizationPct >= 100 ? 'bg-red-600' :
                  utilizationPct >= 90 ? 'bg-red-500' :
                  utilizationPct >= 80 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Informational only — does not change subscription limits or user permissions.
            </p>
          </div>
        </div>

        {/* Feature Entitlements */}
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Feature Entitlements</h2>
          {features.length === 0 ? (
            <p className="text-sm text-gray-500">No feature data available</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {features.map(f => {
                const def = featureDefMap.get(f.feature_key)
                return (
                  <div key={f.feature_key} className="flex items-center justify-between text-sm py-1">
                    <div className="flex items-center gap-2">
                      <span>{def?.feature_name ?? f.feature_key}</span>
                      {def && (
                        <span className={`badge ${def.category === 'core' ? 'badge-blue' : 'badge-gray'} text-xs`}>
                          {def.category}
                        </span>
                      )}
                    </div>
                    <span className={f.is_enabled ? 'text-green-600 font-medium' : 'text-gray-400'}>
                      {f.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="card p-5 mt-6">
        <h2 className="font-semibold mb-3">Users ({users.length})</h2>
        {users.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No users in this company</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>{roleLabels[u.role] ?? u.role}</td>
                    <td><ActiveBadge active={u.is_active} /></td>
                    <td>{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit History */}
      <div className="card p-5 mt-6">
        <h2 className="font-semibold mb-3">Audit History</h2>
        {auditLog.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No audit entries for this company</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Old Value</th>
                  <th>New Value</th>
                  <th>Performed By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map(log => (
                  <tr key={log.id}>
                    <td className="font-medium"><span className="badge badge-blue">{log.action}</span></td>
                    <td className="text-xs text-gray-600">
                      {log.old_value ? JSON.stringify(log.old_value) : '—'}
                    </td>
                    <td className="text-xs text-gray-600">
                      {log.new_value ? JSON.stringify(log.new_value) : '—'}
                    </td>
                    <td className="text-xs text-gray-500">
                      {log.performed_by ? `${log.performed_by.slice(0, 8)}...` : 'System'}
                    </td>
                    <td className="whitespace-nowrap text-xs text-gray-600">
                      {formatDateTime(log.performed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
