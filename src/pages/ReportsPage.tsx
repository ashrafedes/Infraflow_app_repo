import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, FeatureGate, LockedState } from '@/components/ui'
import { Datasheet, readOnlyCell } from '@/components/grid/Datasheet'
import { MobileCardList } from '@/components/grid/MobileCardList'
import { useFeature, FEATURES } from '@/lib/entitlements'
import { formatNumber, cn } from '@/lib/utils'
import { Download, Lock } from 'lucide-react'
import type { Column } from 'react-data-grid'
import type { WarehouseBalance, WorkOrderBalance, ContractorBalance, WOMaterialSummary } from '@/types'

type ReportTab = 'warehouse' | 'work_order' | 'contractor' | 'wo_summary'

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('warehouse')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [whBalances, setWhBalances] = useState<WarehouseBalance[]>([])
  const [woBalances, setWoBalances] = useState<WorkOrderBalance[]>([])
  const [conBalances, setConBalances] = useState<ContractorBalance[]>([])
  const [woSummary, setWoSummary] = useState<WOMaterialSummary[]>([])

  const hasExports = useFeature(FEATURES.EXPORTS)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      if (tab === 'warehouse') {
        const { data } = await supabase.from('v_warehouse_balance').select('*').order('current_balance', { ascending: true })
        setWhBalances((data ?? []) as unknown as WarehouseBalance[])
      } else if (tab === 'work_order') {
        const { data } = await supabase.from('v_work_order_balance').select('*').order('on_hand', { ascending: false })
        setWoBalances((data ?? []) as unknown as WorkOrderBalance[])
      } else if (tab === 'contractor') {
        const { data } = await supabase.from('v_contractor_balance').select('*').order('current_balance', { ascending: false })
        setConBalances((data ?? []) as unknown as ContractorBalance[])
      } else if (tab === 'wo_summary') {
        const { data } = await supabase.from('v_wo_material_summary').select('*').order('work_order_number')
        setWoSummary((data ?? []) as unknown as WOMaterialSummary[])
      }
      setLoading(false)
    }
    fetchData()
  }, [tab])

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'warehouse', label: 'Warehouse Stock' },
    { key: 'work_order', label: 'Work Order Balances' },
    { key: 'contractor', label: 'Contractor Balances' },
    { key: 'wo_summary', label: 'WO Material Summary' },
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
    { key: 'warehouse_code', name: 'Warehouse', width: 120, sortable: true, renderCell: readOnlyCell<WarehouseBalance>(), cellClass: 'whitespace-nowrap' },
    { key: 'item_number', name: 'Item #', width: 120, sortable: true, renderCell: readOnlyCell<WarehouseBalance>(), cellClass: 'font-medium' },
    { key: 'short_description', name: 'Description', width: 240, sortable: true, renderCell: readOnlyCell<WarehouseBalance>() },
    { key: 'uom', name: 'UOM', width: 70, sortable: true, renderCell: readOnlyCell<WarehouseBalance>() },
    { key: 'received', name: 'Received', width: 100, sortable: true, renderCell: numCell<WarehouseBalance>('received') },
    { key: 'issued', name: 'Issued', width: 100, sortable: true, renderCell: numCell<WarehouseBalance>('issued') },
    { key: 'current_balance', name: 'Balance', width: 100, sortable: true, renderCell: numCell<WarehouseBalance>('current_balance', { redIfZero: true }) },
  ], [])

  const woColumns: readonly Column<WorkOrderBalance>[] = useMemo(() => [
    { key: 'item_number', name: 'Item #', width: 120, sortable: true, renderCell: readOnlyCell<WorkOrderBalance>(), cellClass: 'font-medium' },
    { key: 'short_description', name: 'Description', width: 240, sortable: true, renderCell: readOnlyCell<WorkOrderBalance>() },
    { key: 'uom', name: 'UOM', width: 70, sortable: true, renderCell: readOnlyCell<WorkOrderBalance>() },
    { key: 'issued', name: 'Issued', width: 100, sortable: true, renderCell: numCell<WorkOrderBalance>('issued') },
    { key: 'on_hand', name: 'On-Hand', width: 100, sortable: true, renderCell: numCell<WorkOrderBalance>('on_hand') },
    { key: 'consumed', name: 'Consumed', width: 100, sortable: true, renderCell: numCell<WorkOrderBalance>('consumed', { gray: true }) },
  ], [])

  const conColumns: readonly Column<ContractorBalance>[] = useMemo(() => [
    { key: 'contractor_name', name: 'Contractor', width: 200, sortable: true, renderCell: readOnlyCell<ContractorBalance>() },
    { key: 'item_number', name: 'Item #', width: 120, sortable: true, renderCell: readOnlyCell<ContractorBalance>(), cellClass: 'font-medium' },
    { key: 'short_description', name: 'Description', width: 240, sortable: true, renderCell: readOnlyCell<ContractorBalance>() },
    { key: 'uom', name: 'UOM', width: 70, sortable: true, renderCell: readOnlyCell<ContractorBalance>() },
    { key: 'transferred_in', name: 'Transferred In', width: 120, sortable: true, renderCell: numCell<ContractorBalance>('transferred_in') },
    { key: 'returned_out', name: 'Returned', width: 100, sortable: true, renderCell: numCell<ContractorBalance>('returned_out') },
    { key: 'current_balance', name: 'Balance', width: 100, sortable: true, renderCell: numCell<ContractorBalance>('current_balance') },
  ], [])

  const summaryColumns: readonly Column<WOMaterialSummary>[] = useMemo(() => [
    { key: 'work_order_number', name: 'WO #', width: 120, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>(), cellClass: 'font-medium' },
    { key: 'item_number', name: 'Item #', width: 120, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>() },
    { key: 'short_description', name: 'Description', width: 240, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>() },
    { key: 'uom', name: 'UOM', width: 70, sortable: true, renderCell: readOnlyCell<WOMaterialSummary>() },
    { key: 'boq_quantity', name: 'BOQ', width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('boq_quantity') },
    { key: 'issued_quantity', name: 'Issued', width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('issued_quantity') },
    { key: 'consumed_quantity', name: 'Consumed', width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('consumed_quantity', { gray: true }) },
    { key: 'remaining_quantity', name: 'On-Hand', width: 100, sortable: true, renderCell: numCell<WOMaterialSummary>('remaining_quantity') },
  ], [])

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

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Reports"
        subtitle="Inventory balances and material summaries — click column headers to sort"
      />

      {/* Tabs + toolbar */}
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSearch('') }}
              className={cn('btn btn-sm', tab === t.key ? 'btn-primary' : 'btn-secondary')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="input max-w-xs"
          />
          <FeatureGate feature={FEATURES.EXPORTS} fallback={
            <button disabled className="btn btn-secondary btn-sm opacity-50 cursor-not-allowed" title="Export requires a higher plan">
              <Lock className="h-3 w-3" /> Export
            </button>
          }>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" title="Export current tab as CSV">
              <Download className="h-3 w-3" /> Export CSV
            </button>
          </FeatureGate>
        </div>
      </div>

      {/* Advanced reports tab (gated) */}
      <FeatureGate feature={FEATURES.ADVANCED_REPORTS} fallback={
        <div className="mb-4">
          <LockedState feature="advanced_reports" message="Advanced reports (trend analysis, cost breakdowns, forecasting) require a higher plan" />
        </div>
      }>
        <div className="mb-4 card p-4">
          <h3 className="text-sm font-semibold mb-2">Advanced Reports</h3>
          <p className="text-xs text-gray-500">Trend analysis, cost breakdowns, and forecasting are available with the advanced reports feature.</p>
        </div>
      </FeatureGate>

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
              emptyMessage="No warehouse stock data"
              rowHeight={34}
            />
          )}
          {tab === 'work_order' && (
            <Datasheet<WorkOrderBalance>
              columns={woColumns}
              rows={woBalances.filter(filterFn) as WorkOrderBalance[]}
              rowKeyGetter={(r) => `${r.work_order_id}-${r.material_id}`}
              emptyMessage="No work order balance data"
              rowHeight={34}
            />
          )}
          {tab === 'contractor' && (
            <Datasheet<ContractorBalance>
              columns={conColumns}
              rows={conBalances.filter(filterFn) as ContractorBalance[]}
              rowKeyGetter={(r) => `${r.contractor_id}-${r.material_id}`}
              emptyMessage="No contractor balance data"
              rowHeight={34}
            />
          )}
          {tab === 'wo_summary' && (
            <Datasheet<WOMaterialSummary>
              columns={summaryColumns}
              rows={woSummary.filter(filterFn) as WOMaterialSummary[]}
              rowKeyGetter={(r) => `${r.work_order_id}-${r.material_id}`}
              emptyMessage="No WO material summary data"
              rowHeight={34}
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
                { key: 'warehouse_code', label: 'Warehouse' },
                { key: 'uom', label: 'UOM' },
                { key: 'current_balance', label: 'Balance', redIfZero: true },
              ]}
              emptyMessage="No warehouse stock data"
            />
          )}
          {tab === 'work_order' && (
            <MobileCardList
              rows={woBalances.filter(filterFn) as unknown as Record<string, unknown>[]}
              rowKey={(r) => `${r.work_order_id}-${r.material_id}`}
              titleKey="item_number"
              subtitleKey="short_description"
              fields={[
                { key: 'uom', label: 'UOM' },
                { key: 'on_hand', label: 'On-Hand' },
                { key: 'consumed', label: 'Consumed' },
              ]}
              emptyMessage="No work order balance data"
            />
          )}
          {tab === 'contractor' && (
            <MobileCardList
              rows={conBalances.filter(filterFn) as unknown as Record<string, unknown>[]}
              rowKey={(r) => `${r.contractor_id}-${r.material_id}`}
              titleKey="item_number"
              subtitleKey="contractor_name"
              fields={[
                { key: 'uom', label: 'UOM' },
                { key: 'current_balance', label: 'Balance' },
              ]}
              emptyMessage="No contractor balance data"
            />
          )}
          {tab === 'wo_summary' && (
            <MobileCardList
              rows={woSummary.filter(filterFn) as unknown as Record<string, unknown>[]}
              rowKey={(r) => `${r.work_order_id}-${r.material_id}`}
              titleKey="work_order_number"
              subtitleKey="short_description"
              fields={[
                { key: 'uom', label: 'UOM' },
                { key: 'boq_quantity', label: 'BOQ' },
                { key: 'remaining_quantity', label: 'On-Hand' },
              ]}
              emptyMessage="No WO material summary data"
            />
          )}
        </div>
        </>
      )}
    </div>
  )
}
