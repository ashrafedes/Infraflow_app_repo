import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, EmptyState, SearchInput } from '@/components/ui'
import { Plus, Eye } from 'lucide-react'
import { formatDate, formatNumber } from '@/lib/utils'
import type { MovementDetail, MovementType } from '@/types'

const typeColors: Record<MovementType, string> = {
  RECEIPT: 'badge-green',
  ISSUE: 'badge-blue',
  USAGE: 'badge-yellow',
  TRANSFER: 'badge-gray',
  RETURN: 'badge-blue',
  ADJUSTMENT: 'badge-red',
}

export function MovementsPage() {
  const [items, setItems] = useState<MovementDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  useEffect(() => {
    async function fetchData() {
      let query = supabase.from('v_movement_details').select('*').order('created_at', { ascending: false }).limit(200)
      if (typeFilter) query = query.eq('movement_type', typeFilter)
      const { data } = await query
      setItems((data ?? []) as MovementDetail[])
      setLoading(false)
    }
    fetchData()
  }, [typeFilter])

  const filtered = items.filter(i =>
    i.movement_number.toLowerCase().includes(search.toLowerCase()) ||
    i.item_number.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="Material Movements"
        subtitle="All material movements across warehouses and work orders"
        action={<Link to="/movements/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New Movement</Link>}
      />

      <div className="mb-4 flex gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search movements..." />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input max-w-xs">
          <option value="">All Types</option>
          <option value="RECEIPT">Receipt</option>
          <option value="ISSUE">Issue</option>
          <option value="USAGE">Usage</option>
          <option value="TRANSFER">Transfer</option>
          <option value="RETURN">Return</option>
          <option value="ADJUSTMENT">Adjustment</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No movements found" action={<Link to="/movements/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New Movement</Link>} />
      ) : (
        <div className="card table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Number</th><th>Date</th><th>Type</th><th>Item</th><th>From</th><th>To</th><th className="text-right">Qty</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.line_id}>
                  <td className="font-medium">{m.movement_number}</td>
                  <td>{formatDate(m.movement_date)}</td>
                  <td><span className={`badge ${typeColors[m.movement_type]}`}>{m.movement_type}</span></td>
                  <td className="whitespace-nowrap">{m.item_number}</td>
                  <td className="text-gray-500">{m.source_warehouse_code ?? m.source_work_order_number ?? m.supplier_code ?? '—'}</td>
                  <td className="text-gray-500">{m.destination_warehouse_code ?? m.destination_work_order_number ?? m.contractor_name ?? (m.movement_type === 'USAGE' ? 'Consumed' : '—')}</td>
                  <td className="text-right">{formatNumber(m.quantity)} {m.uom}</td>
                  <td className="text-right">
                    <Link to={`/movements/${m.movement_id}`} className="btn btn-secondary btn-sm"><Eye className="h-3 w-3" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
