import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('movements')
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

  const filtered = items.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      i.movement_number?.toLowerCase().includes(q) ||
      i.item_number?.toLowerCase().includes(q) ||
      i.source_work_order_number?.toLowerCase().includes(q) ||
      i.destination_work_order_number?.toLowerCase().includes(q) ||
      i.source_site_code?.toLowerCase().includes(q) ||
      i.destination_site_code?.toLowerCase().includes(q) ||
      i.source_warehouse_code?.toLowerCase().includes(q) ||
      i.destination_warehouse_code?.toLowerCase().includes(q) ||
      i.short_description?.toLowerCase().includes(q)
    )
  })

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title={t('movements:title')}
        subtitle={t('movements:subtitle')}
        action={<Link to="/movements/new" className="btn btn-primary"><Plus className="h-4 w-4" /> {t('movements:newMovement')}</Link>}
      />

      <div className="mb-4 flex gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder={t('movements:search')} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input max-w-xs">
          <option value="">{t('movements:allTypes')}</option>
          <option value="RECEIPT">{t('common:movementTypes.RECEIPT')}</option>
          <option value="ISSUE">{t('common:movementTypes.ISSUE')}</option>
          <option value="USAGE">{t('common:movementTypes.USAGE')}</option>
          <option value="TRANSFER">{t('common:movementTypes.TRANSFER')}</option>
          <option value="RETURN">{t('common:movementTypes.RETURN')}</option>
          <option value="ADJUSTMENT">{t('common:movementTypes.ADJUSTMENT')}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message={t('movements:empty')} action={<Link to="/movements/new" className="btn btn-primary"><Plus className="h-4 w-4" /> {t('movements:newMovement')}</Link>} />
      ) : (
        <div className="card table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('movements:columns.number')}</th><th>{t('movements:columns.date')}</th><th>{t('movements:columns.type')}</th><th>{t('movements:columns.item')}</th><th>{t('movements:columns.from')}</th><th>{t('movements:columns.to')}</th><th className="text-right">{t('movements:columns.qty')}</th><th className="text-right">{t('movements:columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.line_id}>
                  <td className="font-medium">{m.movement_number}</td>
                  <td>{formatDate(m.movement_date)}</td>
                  <td><span className={`badge ${typeColors[m.movement_type]}`}>{t(`common:movementTypes.${m.movement_type}`)}</span></td>
                  <td className="whitespace-nowrap">{m.item_number}</td>
                  <td className="text-gray-500">{m.source_warehouse_code ?? m.source_work_order_number ?? m.supplier_code ?? '—'}</td>
                  <td className="text-gray-500">{m.destination_warehouse_code ?? m.destination_work_order_number ?? m.contractor_name ?? (m.movement_type === 'USAGE' ? t('movements:consumed') : '—')}</td>
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
