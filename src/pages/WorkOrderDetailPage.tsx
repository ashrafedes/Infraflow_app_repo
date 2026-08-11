import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, Modal, ConfirmDialog, LoadingSpinner, EmptyState, Alert } from '@/components/ui'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import type { WorkOrder, WorkOrderBOQ, Material } from '@/types'

export function WorkOrderDetailPage() {
  const { t } = useTranslation('workOrders')
  const { id } = useParams<{ id: string }>()
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [boq, setBoq] = useState<WorkOrderBOQ[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ material_id: '', planned_quantity: '' })

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    const [woData, boqData, matData] = await Promise.all([
      supabase.from('work_orders').select('*, projects!inner(name, code), work_locations!inner(name, code), contractors(name)').eq('id', id).single(),
      supabase.from('work_order_boq').select('*, materials!inner(item_number, short_description, uom)').eq('work_order_id', id).order('created_at').limit(500),
      supabase.from('materials').select('*').eq('is_active', true).order('item_number').limit(1000),
    ])
    setWo(woData.data as WorkOrder)
    setBoq((boqData.data ?? []) as WorkOrderBOQ[])
    setMaterials((matData.data ?? []) as unknown as Material[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  const handleAddBoq = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('work_order_boq').insert({
      work_order_id: id,
      material_id: form.material_id,
      planned_quantity: parseFloat(form.planned_quantity),
    })
    if (error) { setError(error.message); return }
    setModalOpen(false); setForm({ material_id: '', planned_quantity: '' }); fetchData()
  }

  const handleDeleteBoq = async () => {
    if (!deleteId) return
    await supabase.from('work_order_boq').delete().eq('id', deleteId)
    setDeleteId(null); fetchData()
  }

  if (loading) return <LoadingSpinner />
  if (!wo) return <EmptyState message={t('workOrders:empty.notFound')} />

  return (
    <div>
      <Link to="/work-orders" className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> {t('workOrders:detail.backToWorkOrders')}
      </Link>

      <PageHeader
        title={t('workOrders:detail.woPrefix', { number: wo.work_order_number })}
        subtitle={`${wo.project_name} — ${wo.work_location_name}`}
        action={<button onClick={() => setModalOpen(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> {t('workOrders:boq.addLine')}</button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4"><p className="text-xs text-gray-500">{t('workOrders:detail.siteCode')}</p><p className="font-medium mt-1">{wo.site_code ?? '—'}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">{t('workOrders:detail.supervisor')}</p><p className="font-medium mt-1">{wo.supervisor}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">{t('workOrders:detail.contractor')}</p><p className="font-medium mt-1">{wo.contractor_name ?? '—'}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">{t('workOrders:detail.status')}</p><p className="font-medium mt-1 capitalize">{t(`common:status.${wo.status}`)}</p></div>
      </div>

      <h2 className="font-semibold mb-3">{t('workOrders:boq.title')}</h2>
      {boq.length === 0 ? (
        <EmptyState message={t('workOrders:boq.empty')} action={<button onClick={() => setModalOpen(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> {t('workOrders:boq.addLine')}</button>} />
      ) : (
        <div className="card table-container">
          <table className="table">
            <thead><tr><th>{t('workOrders:boq.itemNumber')}</th><th>{t('workOrders:boq.description')}</th><th>{t('workOrders:boq.uom')}</th><th className="text-right">{t('workOrders:boq.plannedQty')}</th><th className="text-right">{t('common:labels.actions')}</th></tr></thead>
            <tbody>
              {boq.map(b => (
                <tr key={b.id}>
                  <td className="font-medium">{b.item_number}</td>
                  <td>{b.short_description}</td>
                  <td>{b.uom}</td>
                  <td className="text-right">{formatNumber(b.planned_quantity)}</td>
                  <td className="text-right"><button onClick={() => setDeleteId(b.id)} className="btn btn-danger btn-sm"><Trash2 className="h-3 w-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('workOrders:boq.addLine')}>
        <form onSubmit={handleAddBoq} className="space-y-4">
          <div>
            <label className="label">{t('workOrders:boq.material')}</label>
            <select value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })} className="input" required>
              <option value="">{t('workOrders:boq.selectMaterial')}</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.item_number} — {m.short_description}</option>)}
            </select>
          </div>
          <div><label className="label">{t('workOrders:boq.plannedQuantity')}</label><input type="number" step="0.001" value={form.planned_quantity} onChange={e => setForm({ ...form, planned_quantity: e.target.value })} className="input" required /></div>
          {error && <Alert type="error" message={error} />}
          <div className="flex justify-end gap-3"><button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary">{t('common:buttons.cancel')}</button><button type="submit" className="btn btn-primary">{t('common:buttons.add')}</button></div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDeleteBoq} title={t('workOrders:boq.deleteTitle')} message={t('workOrders:boq.deleteMessage')} confirmLabel={t('common:buttons.remove')} danger />
    </div>
  )
}
