import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert } from '@/components/ui'
import { formatNumber, formatDateTime } from '@/lib/utils'
import {
  Building2, CheckCircle, Clock, Zap, Crown, PauseCircle,
  AlertTriangle, Users, TrendingUp, FileUp,
} from 'lucide-react'

// ============================================================================
// Types — mirror the JSONB shape returned by get_platform_kpis() RPC
// ============================================================================
interface CompanyNearLimit {
  company_id: string
  name: string
  active_users: number
  max_users: number
  pct: number
  tier: 'warning' | 'critical' | 'limit_reached' | null
}

interface RecentChange {
  id: string
  company_id: string
  company_name: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  performed_by: string | null
  performed_at: string
}

interface PlatformKpis {
  total_companies: number
  active_companies: number
  free_trials: number
  basic_companies: number
  premium_companies: number
  suspended_companies: number
  expiring_trials: number
  total_active_users: number
  companies_near_user_limit: CompanyNearLimit[]
  recent_subscription_changes: RecentChange[]
}

// ============================================================================
// Tier badge — renders the server-provided tier only; no client-side calc
// ============================================================================
function TierBadge({ tier }: { tier: CompanyNearLimit['tier'] }) {
  if (!tier) return <span className="badge badge-gray">—</span>
  const styles: Record<string, string> = {
    warning: 'badge badge-yellow',
    critical: 'badge badge-red',
    limit_reached: 'badge badge-red',
  }
  const labels: Record<string, string> = {
    warning: 'Warning',
    critical: 'Critical',
    limit_reached: 'Limit Reached',
  }
  return <span className={styles[tier]}>{labels[tier]}</span>
}

// ============================================================================
// Component
// ============================================================================
export function SuperAdminDashboard() {
  const [kpis, setKpis] = useState<PlatformKpis | null>(null)
  const [pendingUpgrades, setPendingUpgrades] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchKpis() {
      const [kpiRes, reqRes] = await Promise.all([
        supabase.rpc('get_platform_kpis'),
        supabase
          .from('subscription_upgrade_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ])
      if (kpiRes.error) {
        setError(kpiRes.error.message)
      } else if (kpiRes.data) {
        setKpis(kpiRes.data as PlatformKpis)
      }
      setPendingUpgrades(reqRes.count ?? 0)
      setLoading(false)
    }
    fetchKpis()
  }, [])

  if (loading) return <LoadingSpinner />

  if (error) {
    return (
      <div>
        <PageHeader title="Super Admin Dashboard" subtitle="Platform overview" />
        <div className="mb-4"><Alert type="error" message={error} /></div>
      </div>
    )
  }

  if (!kpis) {
    return (
      <div>
        <PageHeader title="Super Admin Dashboard" subtitle="Platform overview" />
        <div className="mb-4"><Alert type="error" message="Failed to load platform KPIs." /></div>
      </div>
    )
  }

  const statCards = [
    { label: 'Total Companies',      value: kpis.total_companies,      icon: Building2,     color: 'text-blue-600' },
    { label: 'Active Companies',     value: kpis.active_companies,     icon: CheckCircle,   color: 'text-green-600' },
    { label: 'Free Trials',          value: kpis.free_trials,          icon: Clock,         color: 'text-blue-600' },
    { label: 'Basic Companies',      value: kpis.basic_companies,      icon: Zap,           color: 'text-gray-600' },
    { label: 'Premium Companies',    value: kpis.premium_companies,    icon: Crown,         color: 'text-purple-600' },
    { label: 'Expiring Trials',      value: kpis.expiring_trials,      icon: AlertTriangle, color: 'text-yellow-600' },
    { label: 'Suspended Companies',  value: kpis.suspended_companies,  icon: PauseCircle,   color: 'text-red-600' },
    { label: 'Total Active Users',   value: kpis.total_active_users,   icon: Users,         color: 'text-indigo-600' },
  ]

  const pendingCard = {
    label: 'Pending Upgrade Requests',
    value: pendingUpgrades,
    icon: FileUp,
    color: 'text-amber-600',
  }

  return (
    <div>
      <PageHeader title="Super Admin Dashboard" subtitle="Platform overview" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{formatNumber(stat.value)}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
            </div>
          </div>
        ))}
        {/* Pending Upgrade Requests — clickable */}
        <Link to="/admin/subscription-requests" className="card p-5 hover:ring-2 hover:ring-brand-300 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{pendingCard.label}</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(pendingCard.value)}</p>
            </div>
            <pendingCard.icon className={`h-8 w-8 ${pendingCard.color}`} />
          </div>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Companies Approaching User Limit */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Companies Approaching User Limit</h2>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          {kpis.companies_near_user_limit.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No companies are near their user limit
            </p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="text-right">Active</th>
                    <th className="text-right">Max</th>
                    <th className="text-right">Utilization</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.companies_near_user_limit.map((c) => (
                    <tr key={c.company_id}>
                      <td className="font-medium">
                        <Link
                          to={`/admin/companies/${c.company_id}`}
                          className="text-brand-600 hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="text-right">{c.active_users}</td>
                      <td className="text-right">{c.max_users}</td>
                      <td className="text-right font-medium">{c.pct}%</td>
                      <td><TierBadge tier={c.tier} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Subscription Changes */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Subscription Changes</h2>
            <Link to="/admin/audit-log" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {kpis.recent_subscription_changes.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No subscription changes recorded
            </p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Action</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.recent_subscription_changes.map((ch) => (
                    <tr key={ch.id}>
                      <td className="font-medium">
                        <Link
                          to={`/admin/companies/${ch.company_id}`}
                          className="text-brand-600 hover:underline"
                        >
                          {ch.company_name}
                        </Link>
                      </td>
                      <td><span className="badge badge-blue">{ch.action}</span></td>
                      <td className="whitespace-nowrap text-xs text-gray-600">
                        {formatDateTime(ch.performed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
