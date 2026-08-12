import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, EmptyState, ConfirmDialog, Alert } from '@/components/ui'
import { AttachmentList } from '@/components/AttachmentList'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { formatDate, formatNumber, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
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
  const { t } = useTranslation('movements')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isCompanyAdmin = profile?.role === 'company_admin'
  const [lines, setLines] = useState<MovementDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!id) return
      const { data } = await supabase
        .from('v_movement_details')
        .select('*')
        .eq('movement_id', id)
        .order('item_number')
        .limit(1000)
      setLines((data ?? []) as MovementDetail[])
      setLoading(false)
    }
    fetchData()
  }, [id])

  const handleDelete = async () => {
    if (!id) return
    setDeleting(true)
    setError(null)
    // Delete lines first, then the movement (RLS requires company_admin)
    const { error: linesErr } = await supabase
      .from('material_movement_lines')
      .delete()
      .eq('movement_id', id)
    if (linesErr) { setError(linesErr.message); setDeleting(false); return }
    const { error: movErr } = await supabase
      .from('material_movements')
      .delete()
      .eq('id', id)
    if (movErr) { setError(movErr.message); setDeleting(false); return }
    setDeleting(false)
    setDeleteOpen(false)
    navigate('/movements')
  }

  if (loading) return <LoadingSpinner />
  if (lines.length === 0) return <EmptyState message={t('movements:detail.notFound')} />

  const m = lines[0]

  return (
    <div>
      <Link to="/movements" className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> {t('movements:detail.backToMovements')}
      </Link>

      <PageHeader
        title={m.movement_number}
        subtitle={`${t(`common:movementTypes.${m.movement_type}`)} — ${formatDate(m.movement_date)}`}
        action={isCompanyAdmin && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="btn btn-danger"
          >
            <Trash2 className="h-4 w-4" /> {t('movements:detail.delete')}
          </button>
        )}
      />

      {error && <Alert type="error" message={error} />}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500">{t('movements:detail.type')}</p>
          <p className="mt-1"><span className={`badge ${typeColors[m.movement_type]}`}>{t(`common:movementTypes.${m.movement_type}`)}</span></p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">{t('movements:detail.date')}</p>
          <p className="font-medium mt-1">{formatDate(m.movement_date)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">{t('movements:detail.responsible')}</p>
          <p className="font-medium mt-1">{m.responsible_user_name}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">{t('movements:detail.created')}</p>
          <p className="font-medium mt-1">{formatDateTime(m.created_at)}</p>
        </div>
      </div>

      {/* Source & Destination */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">{t('movements:detail.source')}</h3>
          {m.supplier_name && <p>{m.supplier_code} — {m.supplier_name}</p>}
          {m.source_warehouse_name && <p>{m.source_warehouse_code} — {m.source_warehouse_name}</p>}
          {m.source_work_order_number && <p>{t('movements:detail.wo')}: {m.source_work_order_number} {m.source_site_code && `(${m.source_site_code})`}</p>}
          {m.contractor_name && <p>{t('movements:detail.contractor')}: {m.contractor_name}</p>}
          {!m.supplier_name && !m.source_warehouse_name && !m.source_work_order_number && !m.contractor_name && <p className="text-gray-400">—</p>}
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">{t('movements:detail.destination')}</h3>
          {m.destination_warehouse_name && <p>{m.destination_warehouse_code} — {m.destination_warehouse_name}</p>}
          {m.destination_work_order_number && <p>{t('movements:detail.wo')}: {m.destination_work_order_number} {m.destination_site_code && `(${m.destination_site_code})`}</p>}
          {m.contractor_name && <p>{t('movements:detail.contractor')}: {m.contractor_name}</p>}
          {m.movement_type === 'USAGE' && <p className="text-gray-500 italic">{t('movements:detail.consumed')}</p>}
          {!m.destination_warehouse_name && !m.destination_work_order_number && !m.contractor_name && m.movement_type !== 'USAGE' && <p className="text-gray-400">—</p>}
        </div>
      </div>

      {/* Adjustment info */}
      {m.movement_type === 'ADJUSTMENT' && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">{t('movements:detail.adjustment')}</h3>
          <p><span className={`badge ${m.adjustment_type === 'increase' ? 'badge-green' : 'badge-red'}`}>{t(`movements:detail.${m.adjustment_type}`)}</span></p>
          <p className="mt-2 text-sm text-gray-600">{t('movements:detail.reason')}: {m.adjustment_reason}</p>
        </div>
      )}

      {/* Notes */}
      {m.notes && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">{t('movements:detail.notes')}</h3>
          <p className="text-sm text-gray-600">{m.notes}</p>
        </div>
      )}

      {/* Line items */}
      <h2 className="font-semibold mb-3">{t('movements:detail.lines')}</h2>
      <div className="card table-container">
        <table className="table">
          <thead><tr><th>{t('movements:detail.itemNo')}</th><th>{t('movements:detail.description')}</th><th>{t('movements:detail.uom')}</th><th className="text-right">{t('movements:detail.quantity')}</th><th>{t('movements:detail.notes')}</th></tr></thead>
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

      {/* Attachments */}
      {id && <div className="mt-6"><AttachmentList entityType="movement" entityId={id} /></div>}

      {isCompanyAdmin && (
        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title={t('movements:detail.deleteTitle')}
          message={t('movements:detail.deleteConfirm', { number: m.movement_number })}
          confirmLabel={deleting ? t('movements:detail.deleting') : t('movements:detail.delete')}
          danger
        />
      )}
    </div>
  )
}
