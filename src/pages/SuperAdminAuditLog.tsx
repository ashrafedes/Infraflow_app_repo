import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert } from '@/components/ui'
import { formatDateTime } from '@/lib/utils'
import type { SubscriptionAuditLog, Company } from '@/types'

// ============================================================================
// Types
// ============================================================================
interface AuditLogWithCompany extends SubscriptionAuditLog {
  company_name?: string
}

const PAGE_SIZE = 50

// ============================================================================
// Component
// ============================================================================
export function SuperAdminAuditLog() {
  const { t } = useTranslation('superAdmin')
  const [logs, setLogs] = useState<AuditLogWithCompany[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  // Filters
  const [searchCompany, setSearchCompany] = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterCompanyId, setFilterCompanyId] = useState('all')

  const fetchLogs = useCallback(async (offset: number, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)

    let query = supabase
      .from('subscription_audit_log')
      .select('*')
      .order('performed_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (filterCompanyId !== 'all') {
      query = query.eq('company_id', filterCompanyId)
    }

    if (filterAction !== 'all') {
      query = query.eq('action', filterAction)
    }

    const { data, error: fetchErr } = await query

    if (fetchErr) {
      setError(fetchErr.message)
      if (!append) setLoading(false)
      setLoadingMore(false)
      return
    }

    const newLogs = (data ?? []) as SubscriptionAuditLog[]

    // Fetch company names for these logs
    const companyIds = [...new Set(newLogs.map(l => l.company_id))]
    const { data: compData } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds)

    const compMap = new Map((compData ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))

    const enriched = newLogs.map(l => ({
      ...l,
      company_name: compMap.get(l.company_id),
    })) as AuditLogWithCompany[]

    // Apply client-side company name search filter
    const filtered = searchCompany
      ? enriched.filter(l => (l.company_name ?? '').toLowerCase().includes(searchCompany.toLowerCase()))
      : enriched

    if (append) {
      setLogs(prev => [...prev, ...filtered])
    } else {
      setLogs(filtered)
    }

    setHasMore(newLogs.length === PAGE_SIZE)
    setLoading(false)
    setLoadingMore(false)
  }, [filterAction, filterCompanyId, searchCompany])

  // Fetch companies for the filter dropdown
  useEffect(() => {
    async function fetchCompanies() {
      const { data } = await supabase.from('companies').select('id, name').order('name')
      setCompanies((data ?? []) as Company[])
    }
    fetchCompanies()
  }, [])

  // Fetch logs when filters change
  useEffect(() => {
    fetchLogs(0, false)
  }, [fetchLogs])

  const handleLoadMore = () => {
    fetchLogs(logs.length, true)
  }

  // Collect unique action types from loaded logs for the action filter
  const actionTypes = ['all', 'plan_changed', 'user_limit_changed', 'trial_expired', 'status_changed']

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title={t('auditLog.title')} subtitle={t('auditLog.subtitle')} />
      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">{t('auditLog.filters.company')}</label>
            <select
              value={filterCompanyId}
              onChange={e => setFilterCompanyId(e.target.value)}
              className="input"
            >
              <option value="all">{t('auditLog.filters.allCompanies')}</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('auditLog.filters.actionType')}</label>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="input"
            >
              {actionTypes.map(a => (
                <option key={a} value={a}>
                  {a === 'all' ? t('auditLog.filters.allActions') : a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('auditLog.filters.searchCompany')}</label>
            <input
              type="text"
              value={searchCompany}
              onChange={e => setSearchCompany(e.target.value)}
              placeholder={t('auditLog.filters.searchPlaceholder')}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card table-container">
        <table className="table">
          <thead>
            <tr>
              <th>{t('auditLog.columns.company')}</th>
              <th>{t('auditLog.columns.action')}</th>
              <th>{t('auditLog.columns.oldValue')}</th>
              <th>{t('auditLog.columns.newValue')}</th>
              <th>{t('auditLog.columns.performedBy')}</th>
              <th>{t('auditLog.columns.when')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-8">
                  {t('auditLog.empty')}
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id}>
                  <td className="font-medium">
                    <Link
                      to={`/admin/companies/${log.company_id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {log.company_name ?? log.company_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td><span className="badge badge-blue">{log.action}</span></td>
                  <td className="text-xs text-gray-600">
                    {log.old_value ? JSON.stringify(log.old_value) : '—'}
                  </td>
                  <td className="text-xs text-gray-600">
                    {log.new_value ? JSON.stringify(log.new_value) : '—'}
                  </td>
                  <td className="text-xs text-gray-500">
                    {log.performed_by
                      ? `${log.performed_by.slice(0, 8)}...`
                      : t('auditLog.system')}
                  </td>
                  <td className="whitespace-nowrap text-xs text-gray-600">
                    {formatDateTime(log.performed_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {hasMore && logs.length > 0 && (
        <div className="mt-4 text-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="btn btn-secondary"
          >
            {loadingMore ? t('common:buttons.loading') : t('common:buttons.loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
