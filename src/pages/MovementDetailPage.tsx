import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, EmptyState } from '@/components/ui'
import { ArrowLeft } from 'lucide-react'
import { formatDate, formatNumber, formatDateTime } from '@/lib/utils'
import type { MovementDetail } from '@/types'

const typeColors: Record<string, string> = {
  RECEIPT: 'badge-green',
  ISSUE: 'badge-blue',
  USAGE: 'badge-yellow',
  TRANSFER: 'badge-gray',
  RETURN: 'badge-blue',
  ADJUSTMENT: 'badge-red',
}

export function MovementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [lines, setLines] = useState<MovementDetail[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!id) return
      const { data } = await supabase
        .from('v_movement_details')
        .select('*')
        .eq('movement_id', id)
        .order('item_number')
      setLines((data ?? []) as MovementDetail[])
      setLoading(false)
    }
    fetchData()
  }, [id])

  if (loading) return <LoadingSpinner />
  if (lines.length === 0) return <EmptyState message="Movement not found" />

  const m = lines[0]

  return (
    <div>
      <Link to="/movements" className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Movements
      </Link>

      <PageHeader title={m.movement_number} subtitle={`${m.movement_type} — ${formatDate(m.movement_date)}`} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Type</p>
          <p className="mt-1"><span className={`badge ${typeColors[m.movement_type]}`}>{m.movement_type}</span></p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Date</p>
          <p className="font-medium mt-1">{formatDate(m.movement_date)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Responsible</p>
          <p className="font-medium mt-1">{m.responsible_user_name}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Created</p>
          <p className="font-medium mt-1">{formatDateTime(m.created_at)}</p>
        </div>
      </div>

      {/* Source & Destination */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">Source</h3>
          {m.supplier_name && <p>{m.supplier_code} — {m.supplier_name}</p>}
          {m.source_warehouse_name && <p>{m.source_warehouse_code} — {m.source_warehouse_name}</p>}
          {m.source_work_order_number && <p>WO: {m.source_work_order_number} {m.source_site_code && `(${m.source_site_code})`}</p>}
          {m.contractor_name && <p>Contractor: {m.contractor_name}</p>}
          {!m.supplier_name && !m.source_warehouse_name && !m.source_work_order_number && !m.contractor_name && <p className="text-gray-400">—</p>}
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">Destination</h3>
          {m.destination_warehouse_name && <p>{m.destination_warehouse_code} — {m.destination_warehouse_name}</p>}
          {m.destination_work_order_number && <p>WO: {m.destination_work_order_number} {m.destination_site_code && `(${m.destination_site_code})`}</p>}
          {m.contractor_name && <p>Contractor: {m.contractor_name}</p>}
          {m.movement_type === 'USAGE' && <p className="text-gray-500 italic">Consumed (irreversible)</p>}
          {!m.destination_warehouse_name && !m.destination_work_order_number && !m.contractor_name && m.movement_type !== 'USAGE' && <p className="text-gray-400">—</p>}
        </div>
      </div>

      {/* Adjustment info */}
      {m.movement_type === 'ADJUSTMENT' && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Adjustment</h3>
          <p><span className={`badge ${m.adjustment_type === 'increase' ? 'badge-green' : 'badge-red'}`}>{m.adjustment_type}</span></p>
          <p className="mt-2 text-sm text-gray-600">Reason: {m.adjustment_reason}</p>
        </div>
      )}

      {/* Notes */}
      {m.notes && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Notes</h3>
          <p className="text-sm text-gray-600">{m.notes}</p>
        </div>
      )}

      {/* Line items */}
      <h2 className="font-semibold mb-3">Material Lines</h2>
      <div className="card table-container">
        <table className="table">
          <thead><tr><th>Item #</th><th>Description</th><th>UOM</th><th className="text-right">Quantity</th><th>Notes</th></tr></thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.line_id}>
                <td className="font-medium">{l.item_number}</td>
                <td>{l.short_description}</td>
                <td>{l.uom}</td>
                <td className="text-right font-medium">{formatNumber(l.quantity)} {l.uom}</td>
                <td className="text-gray-500">{l.line_notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
