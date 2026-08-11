import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader, LoadingSpinner, FeatureGate, LockedState } from '@/components/ui'
import { FEATURES } from '@/lib/entitlements'
import { formatNumber, formatDate } from '@/lib/utils'
import { ArrowLeftRight, Package, ClipboardList, AlertTriangle, TrendingUp, FileBarChart, Boxes } from 'lucide-react'
import type { MovementDetail, WarehouseBalance } from '@/types'

export function Dashboard() {
  const { t } = useTranslation('dashboard')
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [recentMovements, setRecentMovements] = useState<MovementDetail[]>([])
  const [warehouseBalances, setWarehouseBalances] = useState<WarehouseBalance[]>([])
  const [stats, setStats] = useState({ workOrders: 0, materials: 0, movements: 0, lowStock: 0 })

  useEffect(() => {
    async function fetchData() {
      const [movements, balances, woCount, matCount, mvCount] = await Promise.all([
        supabase
          .from('v_movement_details')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('v_warehouse_balance')
          .select('*')
          .order('current_balance', { ascending: true })
          .limit(10),
        supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('materials').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('material_movements').select('id', { count: 'exact', head: true }),
      ])

      setRecentMovements((movements.data ?? []) as MovementDetail[])
      setWarehouseBalances((balances.data ?? []) as WarehouseBalance[])
      setStats({
        workOrders: woCount.count ?? 0,
        materials: matCount.count ?? 0,
        movements: mvCount.count ?? 0,
        lowStock: (balances.data ?? []).filter((b: { current_balance: number }) => b.current_balance <= 0).length,
      })
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <LoadingSpinner />

  const statCards = [
    { label: t('dashboard:stats.activeWorkOrders'), value: stats.workOrders, icon: ClipboardList, color: 'text-blue-600' },
    { label: t('dashboard:stats.activeMaterials'), value: stats.materials, icon: Package, color: 'text-green-600' },
    { label: t('dashboard:stats.totalMovements'), value: stats.movements, icon: ArrowLeftRight, color: 'text-purple-600' },
    { label: t('dashboard:stats.lowStock'), value: stats.lowStock, icon: AlertTriangle, color: 'text-red-600' },
  ]

  return (
    <div>
      <PageHeader title={t('dashboard:title')} subtitle={t('dashboard:welcome', { name: profile?.full_name })} />

      {/* Stats */}
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
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Movements */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t('dashboard:sections.recentMovements')}</h2>
            <Link to="/movements" className="text-sm text-brand-600 hover:underline">{t('dashboard:sections.viewAll')}</Link>
          </div>
          {recentMovements.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{t('dashboard:empty.noMovements')}</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('dashboard:columns.number')}</th>
                    <th>{t('dashboard:columns.date')}</th>
                    <th>{t('dashboard:columns.type')}</th>
                    <th>{t('dashboard:columns.item')}</th>
                    <th className="text-right">{t('dashboard:columns.qty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMovements.slice(0, 8).map((m) => (
                    <tr key={m.line_id}>
                      <td className="font-medium">{m.movement_number}</td>
                      <td>{formatDate(m.movement_date)}</td>
                      <td><span className="badge badge-blue">{m.movement_type}</span></td>
                      <td className="whitespace-nowrap">{m.item_number}</td>
                      <td className="text-right">{formatNumber(m.quantity)} {m.uom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Low Stock */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t('dashboard:sections.warehouseStock')}</h2>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          {warehouseBalances.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{t('dashboard:empty.noStock')}</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('dashboard:columns.item')}</th>
                    <th>{t('common:labels.warehouse')}</th>
                    <th className="text-right">{t('dashboard:columns.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseBalances.map((b) => (
                    <tr key={`${b.warehouse_id}-${b.material_id}`}>
                      <td className="whitespace-nowrap">{b.item_number}</td>
                      <td>{b.warehouse_code}</td>
                      <td className={`text-right font-medium ${b.current_balance <= 0 ? 'text-red-600' : ''}`}>
                        {formatNumber(b.current_balance)} {b.uom}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex gap-3 flex-wrap">
        <Link to="/movements/new" className="btn btn-primary">
          <ArrowLeftRight className="h-4 w-4" />
          {t('dashboard:quickActions.newMovement')}
        </Link>
        <Link to="/work-orders" className="btn btn-secondary">
          <ClipboardList className="h-4 w-4" />
          {t('dashboard:quickActions.workOrders')}
        </Link>
        <Link to="/materials" className="btn btn-secondary">
          <Boxes className="h-4 w-4" />
          {t('dashboard:quickActions.materials')}
        </Link>
        <Link to="/reports" className="btn btn-secondary">
          <FileBarChart className="h-4 w-4" />
          {t('dashboard:quickActions.reports')}
        </Link>
      </div>

      {/* Advanced Dashboard (entitlement-gated) */}
      <div className="mt-6">
        <FeatureGate feature={FEATURES.ADVANCED_DASHBOARD} fallback={
          <LockedState feature="advanced_dashboard" message={t('dashboard:advanced.lockedMessage')} />
        }>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{t('dashboard:sections.advancedAnalytics')}</h2>
              <TrendingUp className="h-5 w-5 text-brand-600" />
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs text-gray-500">{t('dashboard:advanced.movementTrend')}</p>
                <p className="text-lg font-semibold mt-1">{formatNumber(stats.movements)} {t('dashboard:advanced.total')}</p>
                <div className="mt-2 flex items-end gap-1 h-12">
                  {[3, 5, 2, 7, 4, 6, 8, 5, 3, 6].map((h, i) => (
                    <div key={i} className="flex-1 bg-brand-200 rounded-t" style={{ height: `${h * 10}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs text-gray-500">{t('dashboard:advanced.stockValue')}</p>
                <p className="text-lg font-semibold mt-1">—</p>
                <p className="text-xs text-gray-400 mt-2">{t('dashboard:advanced.enableStockValue')}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs text-gray-500">{t('dashboard:advanced.woUtilization')}</p>
                <p className="text-lg font-semibold mt-1">{formatNumber(stats.workOrders)} {t('dashboard:advanced.active')}</p>
                <p className="text-xs text-gray-400 mt-2">{t('dashboard:advanced.enableUtilization')}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs text-gray-500">{t('dashboard:advanced.lowStockAlerts')}</p>
                <p className="text-lg font-semibold mt-1 text-red-600">{formatNumber(stats.lowStock)} {t('dashboard:advanced.items')}</p>
                <p className="text-xs text-gray-400 mt-2">{t('dashboard:advanced.enableReorder')}</p>
              </div>
            </div>
          </div>
        </FeatureGate>
      </div>
    </div>
  )
}
