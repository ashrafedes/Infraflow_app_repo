import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert, DirtyBadge, ConfirmDialog } from '@/components/ui'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Datasheet, textCellEditor, checkboxCell } from '@/components/grid/Datasheet'
import { MobileCardList } from '@/components/grid/MobileCardList'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { Column } from 'react-data-grid'
import type { WorkLocation } from '@/types'

interface WorkLocationRow extends WorkLocation {
  _isNew?: boolean
  _dirty?: boolean
  _tempId?: string
}

let tempIdCounter = 0
function nextTempId(): string {
  return `_new_${++tempIdCounter}`
}

export function WorkLocationsPage() {
  const [rows, setRows] = useState<WorkLocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase.from('work_locations').select('*').order('name')
    setRows((data ?? []) as WorkLocationRow[])
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
    (row: WorkLocationRow) => (row._isNew ? (row._tempId ?? '') : row.id),
    []
  )

  const saveRow = useCallback(async (row: WorkLocationRow) => {
    setError(null)
    if (!row.code?.trim()) { setError('Code is required'); return false }
    if (!row.name?.trim()) { setError('Name is required'); return false }

    const payload = { code: row.code.trim(), name: row.name.trim(), is_active: row.is_active }

    if (row._isNew) {
      const { data, error: err } = await supabase.from('work_locations').insert(payload).select('*').single()
      if (err) { setError(err.message); return false }
      setRows((prev) => prev.map((r) => (r._tempId === row._tempId ? (data as WorkLocationRow) : r)))
    } else {
      const { data, error: err } = await supabase.from('work_locations').update(payload).eq('id', row.id).select('*').single()
      if (err) { setError(err.message); return false }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...(data as WorkLocationRow) } : r)))
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
      setSuccess(`${dirtyRows.length} row(s) saved`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [rows, saveRow])

  const addNewRow = useCallback(() => {
    const tempId = nextTempId()
    const newRow: WorkLocationRow = {
      id: tempId,
      company_id: '',
      code: '',
      name: '',
      is_active: true,
      created_at: new Date().toISOString(),
      _isNew: true,
      _dirty: true,
      _tempId: tempId,
    }
    setRows((prev) => [...prev, newRow])
  }, [])

  const handleRowsChange = useCallback((newRows: WorkLocationRow[]) => {
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
      await supabase.from('work_locations').delete().eq('id', deleteId)
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

  const columns: readonly Column<WorkLocationRow>[] = useMemo(() => [
    { key: 'code', name: 'Code', width: 140, resizable: true, editable: true, renderEditCell: textCellEditor<WorkLocationRow>(), cellClass: 'font-medium' },
    { key: 'name', name: 'Name', width: 300, resizable: true, editable: true, renderEditCell: textCellEditor<WorkLocationRow>() },
    { key: 'is_active', name: 'Active', width: 70, renderCell: checkboxCell<WorkLocationRow>() },
    {
      key: '_actions', name: '', width: 50, sortable: false, resizable: false,
      renderCell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteId(row._isNew ? (row._tempId ?? row.id) : row.id) }}
          className="text-gray-400 hover:text-red-600"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ], [])

  if (loading) return <LoadingSpinner />

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Work Locations"
        subtitle="Manage work location master data — inline editing, Ctrl+N for new row, Ctrl+S to save"
        action={<button onClick={addNewRow} className="btn btn-primary"><Plus className="h-4 w-4" /> Add Row</button>}
      />

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search locations..." className="input max-w-xs" />
        <button onClick={saveAll} disabled={!isDirty} className="btn btn-primary" title="Save all changes (Ctrl+S)">
          <Save className="h-4 w-4" /> Save All
        </button>
        <DirtyBadge dirty={isDirty} />
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div ref={gridContainerRef} className="card flex-1 overflow-hidden p-0 hidden lg:block">
        <Datasheet<WorkLocationRow>
          columns={columns}
          rows={filteredRows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={rowKeyGetter}
          dirtyRowIds={dirtyRowIds}
          emptyMessage="No work locations found. Press Ctrl+N or click Add Row to start."
          rowHeight={38}
        />
      </div>

      <div className="lg:hidden">
        <MobileCardList
          rows={filteredRows as unknown as Record<string, unknown>[]}
          titleKey="code"
          subtitleKey="name"
          fields={[
            { key: 'is_active', label: 'Active', format: (v) => (v ? 'Yes' : 'No') },
          ]}
          emptyMessage="No work locations found. Click Add Row to start."
        />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Work Location"
        message="Are you sure? This action cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

function stripFlags(row: WorkLocationRow): Record<string, unknown> {
  const { _isNew, _dirty, _tempId, ...rest } = row
  void _isNew; void _dirty; void _tempId
  return rest as Record<string, unknown>
}
