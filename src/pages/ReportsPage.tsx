import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, FeatureGate } from '@/components/ui'
import { Datasheet, readOnlyCell } from '@/components/grid/Datasheet'
import { MobileCardList } from '@/components/grid/MobileCardList'
import { useFeature, FEATURES } from '@/lib/entitlements'
import { formatNumber, cn } from '@/lib/utils'
import { Download, Lock, TrendingUp, DollarSign, LineChart } from 'lucide-react'
import type { Column } from 'react-data-grid'
import type { WarehouseBalance, WorkOrderBalance, ContractorBalance, WOMaterialSummary, MovementDetail } from '@/types'

type ReportTab = 'warehouse' | 'work_order' | 'contractor' | 'wo_summary' | 'advanced'

export function ReportsPage() {
  const { t } = useTranslation('reports')
  const [tab, setTab] = useState<ReportTab>('warehouse')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [whBalances, setWhBalances] = useState<WarehouseBalance[]>([])
  const [woBalances, setWoBalances] = useState<WorkOrderBalance[]>([])
  const [conBalances, setConBalances] = useState<ContractorBalance[]>([])
  const [woSummary, setWoSummary] = useState<WOMaterialSummary[]>([])
  const [advMovements, setAdvMovements] = useState<MovementDetail[]>([])

  const hasExports = useFeature(FEATURES.EXPORTS)
  const hasAdvancedReports =
    useFeature(FEATURES.ADVANCED_REPORTS) ||
    useFeature(FEATURES.TREND_ANALYSIS) ||
    useFeature(FEATURES.COST_BREAKDOWN) ||
    useFeature(FEATURES.FORECASTING)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      if (tab === 'warehouse') {
        const { data } = await supabase.from('v_warehouse_balance').select('*').order('current_balance', { ascending: true }).limit(500)
        setWhBalances((data ?? []) as unknown as WarehouseBalance[])
      } else if (tab === 'work_order') {
        const { data } = await supabase.from('v_work_order_balance').select('*').order('on_hand', { ascending: false }).limit(500)
        setWoBalances((data ?? []) as unknown as WorkOrderBalance[])
      } else if (tab === 'contractor') {
        const { data } = await supabase.from('v_contractor_balance').select('*').order('current_balance', { ascending: false }).limit(500)
        setConBalances((data ?? []) as unknown as ContractorBalance[])
      } else if (tab === 'wo_summary') {
        const { data } = await supabase.from('v_wo_material_summary').select('*').order('work_order_number').limit(1000)
        setWoSummary((data ?? []) as unknown as WOMaterialSummary[])
      } else if (tab === 'advanced') {
        const { data } = await supabase
          .from('v_movement_details')
          .select('*')
          .order('movement_date', { ascending: false })
          .limit(5000)
        setAdvMovements((data ?? []) as unknown as MovementDetail[])
      }
      setLoading(false)
    }
    fetchData()
  }, [tab])

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'warehouse', label: t('reports:tabs.warehouse') },
    { key: 'work_order', label: t('reports:tabs.workOrder') },
    { key: 'contractor', label: t('reports:tabs.contractor') },
    { key: 'wo_summary', label: t('reports:tabs.woSummary') },
    ...(hasAdvancedReports ? [{ key: 'advanced' as ReportTab, label: t('reports:tabs.advanced') }] : []),
  ]

  // ============================================================================
  // Generic filter function — searches all string/number fields
  // ============================================================================
  const filterFn = useCallback((item: unknown) => {
    if (!search) return true
    const q = search.toLowerCase()
    if (typeof item !== 'object' || item === null) return false
    return Object.values(item).some((v) => v != null && String(v).toLowerCase().includes(q))
  }, [search])

  // ============================================================================
  // Number cell renderer with optional red highlight for negatives/zeros
  // ============================================================================
  const numCell = <R,>(key: string, opts?: { redIfZero?: boolean; gray?: boolean }) => {
    return function renderCell({ row }: { row: R }) {
      const val = Number((row as unknown as Record<string, unknown>)[key] ?? 0)
      const cls = opts?.redIfZero && val <= 0 ? 'text-red-600 font-medium' : opts?.gray ? 'text-gray-500' : 'font-medium'
      return <span className={cls}>{formatNumber(val)}</span>
    }
  }

  // ============================================================================
  // Column definitions per tab
  // ============================================================================
  const whColumns: readonly Column<WarehouseBalance>[] = useMemo(() => [
    { key: 'warehouse_code', name: t('reports:columns.warehouse'), width: 120, sortable: true, renderCell: readOnlyCell<WarehouseBalance>(), cellClass: 'whitespace-nowrap' },
    { key: 'item_number', name: t('reports:columns.itemNumber'), width: 120, sortable: true, renderCell: readOnlyCell<WarehouseBalance>(), cellClass: 'font-medium' },
    { key: 'short_description', name: t('reports:columns.description'), width: 240, sortable: true, renderCell: readOnlyCell<WarehouseBalance>() },
    { key: 'uom', name: t('reports:columns.uom'), width: 70, sortable: true, renderCell: readOnlyCell<WarehouseBalance>() },
    { key: 'received', name: t('reports:columns.received'), width: 100, sortable: true, renderCell: numCell<WarehouseBalance>('received') },
    { key: 'issued', name: t('reports:columns.issued'), width: 100, sortable: true, renderCell: numCell<WarehouseBalance>('issued') },
    { key: 'current_balance', name: t('reports:columns.balance'), width: 100, sortable: true, renderCell: numCell<WarehouseBalance>('current_balance', { redIfZero: true }) },
  ], [t])

  const woColumns: readonly Column<WorkOrderBalance>[] = useMemo(() => [
    { key: 'item_number', name: t('reports:columns.itemNumber'), width: 120, sortable: true, renderCell: readOnlyCell<WorkOrderBalance>(), cellClass: 'font-medium' },
    { key: 'short_description', name: t('reports:columns.description'), width: 240, sortable: true, renderCell: readOnlyCell<WorkOrderBalance>() },
    { key: 'uom', name: t('reports:columns.uom'), width: 70, sortable: true, renderCell: readOnlyCell<WorkOrderBalance>() },
    { key: 'issued', name: t('reports:columns.issued'), width: 100, sortable: true, renderCell: numCell<WorkOrderBalance>('issued') },
    { key: 'on_hand', name: t('reports:columns.onHand'), width: 100, sortable: true, renderCell: numCell<WorkOrderBalance>('on_hand') },
    { key: 'consumed', name: t('reports:columns.consumed'), width: 100, sortable: true, renderCell: numCell<WorkOrderBalance>('consumed', { gray: true }) },
  ], [t])

  const conColumns: readonly Column<ContractorBalance>[] = useMemo(() => [
    { key: 'contractor_name', name: t('reports:columns.contractor'), width: 200, sortable: true, renderCell: readOnlyCell<ContractorBalance>() },
    { key: 'item_number', name: t('reports:columns.itemNumber'), width: 120, sortable: true, renderCell: readOnlyCell<ContractorBalance>(), cellClass: 'font-medium' },
    { key: 'short_description', name: t('reports:columns.description'), width: 240, sortable: true, renderCell: readOnlyCell<ContractorBalance>() },
    { key: 'uom', name: t('reports:columns.uom'), width: 70, sortable: true, renderCell: readOnlyCell<ContractorBalance>() },
    { key: 'transferred_in', name: t('reports:columns.transferredIn'), width: 120, sortable: true, renderCell: numCell<ContractorBalance>('transferred_in') },
    { key: 'returned_out', name: t('reports:columns.returned'), width: 100, sortable: true, renderCell: numCell<ContractorBalance>('returned_out') },
    { key: 'current_balance', name: t('reports:columns.balance'), width: 100, sortable: true, renderCell: numCell<ContractorBalance>('current_balance') },
  ], [t])

  const summaryColumns: readonly Column<WOMaterialSummary>[] = useMemo(() => [
    { key: 'work_order_number', name: t('reports:columns.woNumber'), width: 120, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>(), cellClass: 'font-medium' },
    { key: 'item_number', name: t('reports:columns.itemNumber'), width: 120, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>() },
    { key: 'short_description', name: t('reports:columns.description'), width: 240, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>() },
    { key: 'uom', name: t('reports:columns.uom'), width: 70, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>() },
    { key: 'boq_quantity', name: t('reports:columns.boq'), width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('boq_quantity') },
    { key: 'issued_quantity', name: t('reports:columns.issued'), width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('issued_quantity') },
    { key: 'consumed_quantity', name: t('reports:columns.consumed'), width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('consumed_quantity', { gray: true }) },
    { key: 'remaining_quantity', name: t('reports:columns.onHand'), width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('remaining_quantity') },
  ], [t])

  const handleExport = () => {
    if (!hasExports) return
    // Export current tab data as CSV
    let data: Record<string, unknown>[] = []
    let filename = 'report'
    if (tab === 'warehouse') { data = whBalances as unknown as Record<string, unknown>[]; filename = 'warehouse_stock' }
    else if (tab === 'work_order') { data = woBalances as unknown as Record<string, unknown>[]; filename = 'wo_balances' }
    else if (tab === 'contractor') { data = conBalances as unknown as Record<string, unknown>[]; filename = 'contractor_balances' }
    else { data = woSummary as unknown as Record<string, unknown>[]; filename = 'wo_material_summary' }

    if (data.length === 0) return
    const headers = Object.keys(data[0])
    const csv = [
      headers.join(','),
      ...data.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ============================================================================
  // Advanced analytics computations
  // ============================================================================
  const { trend, topMaterials, forecast } = useMemo(() => {
    if (tab !== 'advanced' || advMovements.length === 0) {
      return { trend: [], topMaterials: [], forecast: [] }
    }
    const monthKey = (d: string) => d.slice(0, 7) // YYYY-MM
    const months = Array.from(new Set(advMovements.map((m) => monthKey(m.movement_date)))).sort()

    const trend = months.map((month) => {
      const monthRows = advMovements.filter((m) => monthKey(m.movement_date) === month)
      const sum = (type: string) => monthRows.filter((m) => m.movement_type === type).reduce((a, b) => a + Number(b.quantity), 0)
      return {
        month,
        receipt: sum('RECEIPT'),
        issue: sum('ISSUE'),
        usage: sum('USAGE'),
        transfer: sum('TRANSFER'),
        returnQty: sum('RETURN'),
        adjustment: sum('ADJUSTMENT'),
      }
    })

    const materialTotals: Record<string, { item_number: string; short_description: string; uom: string; total: number }> = {}
    advMovements
      .filter((m) => m.movement_type === 'USAGE' || m.movement_type === 'ISSUE')
      .forEach((m) => {
        const k = `${m.item_number}::${m.short_description}::${m.uom}`
        if (!materialTotals[k]) materialTotals[k] = { item_number: m.item_number, short_description: m.short_description, uom: m.uom, total: 0 }
        materialTotals[k].total += Number(m.quantity)
      })
    const topMaterials = Object.values(materialTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    const last3Months = months.slice(-3)
    const materialMonthly: Record<string, { item_number: string; short_description: string; uom: string; months: Record<string, number> }> = {}
    advMovements
      .filter((m) => m.movement_type === 'USAGE')
      .forEach((m) => {
        const month = monthKey(m.movement_date)
        if (!last3Months.includes(month)) return
        const k = `${m.item_number}::${m.short_description}::${m.uom}`
        if (!materialMonthly[k]) materialMonthly[k] = { item_number: m.item_number, short_description: m.short_description, uom: m.uom, months: {} }
        materialMonthly[k].months[month] = (materialMonthly[k].months[month] ?? 0) + Number(m.quantity)
      })
    const forecast = Object.values(materialMonthly).map((m) => {
      const values = last3Months.map((month) => m.months[month] ?? 0)
      const avg = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1)
      return { ...m, average: avg }
    }).sort((a, b) => b.average - a.average).slice(0, 10)

    return { trend, topMaterials, forecast }
  }, [tab, advMovements])

  const maxTrendValue = useMemo(() => {
    if (trend.length === 0) return 1
    return Math.max(...trend.flatMap((m) => [m.receipt, m.issue, m.usage, m.transfer, m.returnQty, m.adjustment]), 1)
  }, [trend])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('reports:title')}
        subtitle={t('reports:subtitle')}
      />

      {/* Tabs + toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => { setTab(tabItem.key); setSearch('') }}
              className={cn('btn btn-sm', tab === tabItem.key ? 'btn-primary' : 'btn-secondary')}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('reports:search')}
            className="input max-w-xs"
          />
          <FeatureGate feature={FEATURES.EXPORTS} fallback={
            <button disabled className="btn btn-secondary btn-sm opacity-50 cursor-not-allowed" title={t('reports:advanced.lockedMessage')}>
              <Lock className="h-3 w-3" /> {t('common:buttons.export')}
            </button>
          }>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" title={t('reports:exportTooltip')}>
              <Download className="h-3 w-3" /> {t('common:buttons.export')}
            </button>
          </FeatureGate>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
        <div className="card flex-1 overflow-hidden p-0 hidden lg:block">
          {tab === 'warehouse' && (
            <Datasheet<WarehouseBalance>
              columns={whColumns}
              rows={whBalances.filter(filterFn) as WarehouseBalance[]}
              rowKeyGetter={(r) => `${r.warehouse_id}-${r.material_id}`}
              emptyMessage={t('reports:empty.warehouse')}
              rowHeight={34}
            />
          )}
          {tab === 'work_order' && (
            <Datasheet<WorkOrderBalance>
              columns={woColumns}
              rows={woBalances.filter(filterFn) as WorkOrderBalance[]}
              rowKeyGetter={(r) => `${r.work_order_id}-${r.material_id}`}
              emptyMessage={t('reports:empty.workOrder')}
              rowHeight={34}
            />
          )}
          {tab === 'contractor' && (
            <Datasheet<ContractorBalance>
              columns={conColumns}
              rows={conBalances.filter(filterFn) as ContractorBalance[]}
              rowKeyGetter={(r) => `${r.contractor_id}-${r.material_id}`}
              emptyMessage={t('reports:empty.contractor')}
              rowHeight={34}
            />
          )}
          {tab === 'wo_summary' && (
            <Datasheet<WOMaterialSummary>
              columns={summaryColumns}
              rows={woSummary.filter(filterFn) as WOMaterialSummary[]}
              rowKeyGetter={(r) => `${r.work_order_id}-${r.material_id}`}
              emptyMessage={t('reports:empty.woSummary')}
              rowHeight={34}
            />
          )}
          {tab === 'advanced' && (
            <AdvancedReportsPanel
              trend={trend}
              topMaterials={topMaterials}
              forecast={forecast}
              maxTrendValue={maxTrendValue}
            />
          )}
        </div>

        {/* Mobile fallback */}
        <div className="lg:hidden">
          {tab === 'warehouse' && (
            <MobileCardList
              rows={whBalances.filter(filterFn) as unknown as Record<string, unknown>[]}
              rowKey={(r) => `${r.warehouse_id}-${r.material_id}`}
              titleKey="item_number"
              subtitleKey="short_description"
              fields={[
                { key: 'warehouse_code', label: t('reports:columns.warehouse') },
                { key: 'uom', label: t('reports:columns.uom') },
                { key: 'current_balance', label: t('reports:columns.balance'), redIfZero: true },
              ]}
              emptyMessage={t('reports:empty.warehouse')}
            />
          )}
          {tab === 'work_order' && (
            <MobileCardList
              rows={woBalances.filter(filterFn) as unknown as Record<string, unknown>[]}
              rowKey={(r) => `${r.work_order_id}-${r.material_id}`}
              titleKey="item_number"
              subtitleKey="short_description"
              fields={[
                { key: 'uom', label: t('reports:columns.uom') },
                { key: 'on_hand', label: t('reports:columns.onHand') },
                { key: 'consumed', label: t('reports:columns.consumed') },
              ]}
              emptyMessage={t('reports:empty.workOrder')}
            />
          )}
          {tab === 'contractor' && (
            <MobileCardList
              rows={conBalances.filter(filterFn) as unknown as Record<string, unknown>[]}
              rowKey={(r) => `${r.contractor_id}-${r.material_id}`}
              titleKey="item_number"
              subtitleKey="contractor_name"
              fields={[
                { key: 'uom', label: t('reports:columns.uom') },
                { key: 'current_balance', label: t('reports:columns.balance') },
              ]}
              emptyMessage={t('reports:empty.contractor')}
            />
          )}
          {tab === 'wo_summary' && (
            <MobileCardList
              rows={woSummary.filter(filterFn) as unknown as Record<string, unknown>[]}
              rowKey={(r) => `${r.work_order_id}-${r.material_id}`}
              titleKey="work_order_number"
              subtitleKey="short_description"
              fields={[
                { key: 'uom', label: t('reports:columns.uom') },
                { key: 'boq_quantity', label: t('reports:columns.boq') },
                { key: 'remaining_quantity', label: t('reports:columns.onHand') },
              ]}
              emptyMessage={t('reports:empty.woSummary')}
            />
          )}
          {tab === 'advanced' && (
            <AdvancedReportsPanel
              trend={trend}
              topMaterials={topMaterials}
              forecast={forecast}
              maxTrendValue={maxTrendValue}
            />
          )}
        </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// AdvancedReportsPanel — trend, cost breakdown, forecasting
// ============================================================================
interface AdvancedReportsPanelProps {
  trend: { month: string; receipt: number; issue: number; usage: number; transfer: number; returnQty: number; adjustment: number }[]
  topMaterials: { item_number: string; short_description: string; uom: string; total: number }[]
  forecast: { item_number: string; short_description: string; uom: string; average: number }[]
  maxTrendValue: number
}

function AdvancedReportsPanel({ trend, topMaterials, forecast, maxTrendValue }: AdvancedReportsPanelProps) {
  const { t } = useTranslation('reports')
  const typeColors: Record<string, string> = {
    receipt: 'bg-green-500',
    issue: 'bg-blue-500',
    usage: 'bg-yellow-500',
    transfer: 'bg-gray-400',
    returnQty: 'bg-purple-500',
    adjustment: 'bg-red-500',
  }
  const typeLabels: Record<string, string> = {
    receipt: t('reports:advanced.receipt'),
    issue: t('reports:advanced.issue'),
    usage: t('reports:advanced.usage'),
    transfer: t('reports:advanced.transfer'),
    returnQty: t('reports:advanced.return'),
    adjustment: t('reports:advanced.adjustment'),
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      {/* Trend Analysis */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold">{t('reports:advanced.trendTitle')}</h3>
        </div>
        {trend.length === 0 ? (
          <p className="text-sm text-gray-500">{t('reports:advanced.noData')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-xs">
              {Object.keys(typeColors).map((key) => (
                <span key={key} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${typeColors[key]}`} />
                  {typeLabels[key]}
                </span>
              ))}
            </div>
            <div className="space-y-3">
              {trend.map((row) => (
                <div key={row.month}>
                  <div className="text-xs text-gray-500 mb-1">{row.month}</div>
                  <div className="flex h-6 w-full gap-0.5 overflow-hidden rounded">
                    {Object.keys(typeColors).map((key) => {
                      const val = Number((row as Record<string, number | string>)[key] ?? 0)
                      const pct = maxTrendValue > 0 ? (val / maxTrendValue) * 100 : 0
                      return (
                        <div
                          key={key}
                          style={{ width: `${pct}%` }}
                          className={`${typeColors[key]} h-full`}
                          title={`${typeLabels[key]}: ${formatNumber(val)}`}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-1 text-xs text-gray-600 text-right">
                    {formatNumber(row.receipt + row.issue + row.usage + row.transfer + row.returnQty + row.adjustment)} {t('reports:advanced.totalQty')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Cost Breakdown (quantity proxy) */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold">{t('reports:advanced.costTitle')}</h3>
        </div>
        {topMaterials.length === 0 ? (
          <p className="text-sm text-gray-500">{t('reports:advanced.noData')}</p>
        ) : (
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>{t('reports:columns.itemNumber')}</th>
                <th>{t('reports:columns.description')}</th>
                <th className="text-right">{t('reports:advanced.issuedUsed')}</th>
              </tr>
            </thead>
            <tbody>
              {topMaterials.map((m) => (
                <tr key={m.item_number}>
                  <td className="font-medium">{m.item_number}</td>
                  <td className="text-gray-600">{m.short_description}</td>
                  <td className="text-right">{formatNumber(m.total)} {m.uom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-400">{t('reports:advanced.costNote')}</p>
      </section>

      {/* Forecasting */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <LineChart className="h-5 w-5 text-brand-600" />
          <h3 className="font-semibold">{t('reports:advanced.forecastTitle')}</h3>
        </div>
        {forecast.length === 0 ? (
          <p className="text-sm text-gray-500">{t('reports:advanced.noData')}</p>
        ) : (
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>{t('reports:columns.itemNumber')}</th>
                <th>{t('reports:columns.description')}</th>
                <th className="text-right">{t('reports:advanced.avgMonthlyUsage')}</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((m) => (
                <tr key={m.item_number}>
                  <td className="font-medium">{m.item_number}</td>
                  <td className="text-gray-600">{m.short_description}</td>
                  <td className="text-right">{formatNumber(m.average)} {m.uom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-400">{t('reports:advanced.forecastNote')}</p>
      </section>
    </div>
  )
}
