import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert, DirtyBadge, ConfirmDialog } from '@/components/ui'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Datasheet, textCellEditor, checkboxCell, readOnlyCell } from '@/components/grid/Datasheet'
import { MobileCardList } from '@/components/grid/MobileCardList'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { Column } from 'react-data-grid'
import type { Supplier } from '@/types'

interface SupplierRow extends Supplier {
  _isNew?: boolean
  _dirty?: boolean
  _tempId?: string
}

let tempIdCounter = 0
function nextTempId(): string {
  return `_new_${++tempIdCounter}`
}

export function SuppliersPage() {
  const { t } = useTranslation('masterData')
  const [rows, setRows] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('name').limit(1000)
    setRows((data ?? []) as SupplierRow[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const dirtyRowIds = useMemo(() => {
    const ids = new Set<string>()
    rows.forEach((r) => {
      if (r._dirty) ids.add(r._isNew ? (r._tempId ?? '') : r.id)
    })
    return ids
  }, [rows])

  const isDirty = dirtyRowIds.size > 0

  const rowKeyGetter = useCallback(
    (row: SupplierRow) => (row._isNew ? (row._tempId ?? '') : row.id),
    []
  )

  const saveRow = useCallback(async (row: SupplierRow) => {
    setError(null)
    if (!row.code?.trim()) { setError(t('common:validation.codeRequired')); return false }
    if (!row.name?.trim()) { setError(t('common:validation.nameRequired')); return false }

    const payload = {
      code: row.code.trim(),
      name: row.name.trim(),
      contact_info: row.contact_info?.trim() || null,
      is_active: row.is_active,
    }

    if (row._isNew) {
      const { data, error: err } = await supabase.from('suppliers').insert(payload).select('*').single()
      if (err) { setError(err.message); return false }
      setRows((prev) => prev.map((r) => (r._tempId === row._tempId ? (data as SupplierRow) : r)))
    } else {
      const { data, error: err } = await supabase.from('suppliers').update(payload).eq('id', row.id).select('*').single()
      if (err) { setError(err.message); return false }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...(data as SupplierRow) } : r)))
    }
    return true
  }, [])

  const saveAll = useCallback(async () => {
    const dirtyRows = rows.filter((r) => r._dirty)
    if (dirtyRows.length === 0) return
    setError(null)
    let allOk = true
    for (const row of dirtyRows) {
      const ok = await saveRow(row)
      if (!ok) { allOk = false; break }
    }
    if (allOk) {
      setSuccess(t('masterData:suppliers.saved', { count: dirtyRows.length }))
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [rows, saveRow])

  const addNewRow = useCallback(() => {
    const tempId = nextTempId()
    const newRow: SupplierRow = {
      id: tempId,
      company_id: '',
      code: '',
      name: '',
      contact_info: null,
      is_active: true,
      created_at: new Date().toISOString(),
      _isNew: true,
      _dirty: true,
      _tempId: tempId,
    }
    setRows((prev) => [...prev, newRow])
  }, [])

  const handleRowsChange = useCallback((newRows: SupplierRow[]) => {
    setRows((prev) => {
      return newRows.map((nr) => {
        const prevRow = prev.find((pr) => rowKeyGetter(pr) === rowKeyGetter(nr))
        if (prevRow && JSON.stringify(stripFlags(prevRow)) !== JSON.stringify(stripFlags(nr))) {
          return { ...nr, _dirty: true }
        }
        return nr
      })
    })
  }, [rowKeyGetter])

  const handleDelete = async () => {
    if (!deleteId) return
    const row = rows.find((r) => r.id === deleteId)
    if (row?._isNew) {
      setRows((prev) => prev.filter((r) => r._tempId !== row._tempId))
    } else {
      await supabase.from('suppliers').delete().eq('id', deleteId)
      setRows((prev) => prev.filter((r) => r.id !== deleteId))
    }
    setDeleteId(null)
  }

  useKeyboardShortcuts({
    onNew: addNewRow,
    onSave: saveAll,
    onCancel: () => { if (isDirty) fetchData() },
  }, [isDirty, rows, saveAll])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    )
  }, [rows, search])

  const columns: readonly Column<SupplierRow>[] = useMemo(() => [
    { key: 'code', name: t('common:labels.code'), width: 120, resizable: true, editable: true, renderEditCell: textCellEditor<SupplierRow>(), cellClass: 'font-medium' },
    { key: 'name', name: t('common:labels.name'), width: 240, resizable: true, editable: true, renderEditCell: textCellEditor<SupplierRow>() },
    { key: 'contact_info', name: t('common:labels.contactPerson'), width: 280, resizable: true, editable: true, renderEditCell: textCellEditor<SupplierRow>(), renderCell: readOnlyCell<SupplierRow>((v) => (v as string) || '—') },
    { key: 'is_active', name: t('common:labels.isActive'), width: 70, renderCell: checkboxCell<SupplierRow>() },
    {
      key: '_actions', name: '', width: 50, sortable: false, resizable: false,
      renderCell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteId(row._isNew ? (row._tempId ?? row.id) : row.id) }}
          className="text-gray-400 hover:text-red-600"
          title={t('common:buttons.delete')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ], [t])

  if (loading) return <LoadingSpinner />

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('masterData:suppliers.title')}
        subtitle={t('masterData:suppliers.subtitle')}
        action={<button onClick={addNewRow} className="btn btn-primary"><Plus className="h-4 w-4" /> {t('common:buttons.addRow')}</button>}
      />

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('masterData:suppliers.search')} className="input max-w-xs" />
        <button onClick={saveAll} disabled={!isDirty} className="btn btn-primary" title={t('common:buttons.saveAll')}>
          <Save className="h-4 w-4" /> {t('common:buttons.saveAll')}
        </button>
        <DirtyBadge dirty={isDirty} />
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div ref={gridContainerRef} className="card flex-1 overflow-hidden p-0 hidden lg:block">
        <Datasheet<SupplierRow>
          columns={columns}
          rows={filteredRows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={rowKeyGetter}
          dirtyRowIds={dirtyRowIds}
          emptyMessage={t('masterData:suppliers.empty')}
          rowHeight={38}
        />
      </div>

      <div className="lg:hidden">
        <MobileCardList
          rows={filteredRows as unknown as Record<string, unknown>[]}
          titleKey="name"
          fields={[
            { key: 'contact_person', label: t('common:labels.contactPerson') },
            { key: 'phone', label: t('common:labels.phone') },
            { key: 'is_active', label: t('common:labels.isActive'), format: (v) => (v ? t('common:labels.yes') : t('common:labels.no')) },
          ]}
          emptyMessage={t('masterData:suppliers.empty')}
        />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('masterData:suppliers.deleteTitle')}
        message={t('masterData:suppliers.deleteMessage')}
        confirmLabel={t('common:buttons.delete')}
        danger
      />
    </div>
  )
}

function stripFlags(row: SupplierRow): Record<string, unknown> {
  const { _isNew, _dirty, _tempId, ...rest } = row
  void _isNew; void _dirty; void _tempId
  return rest as Record<string, unknown>
}
