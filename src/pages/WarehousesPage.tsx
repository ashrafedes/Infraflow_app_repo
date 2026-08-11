import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert, DirtyBadge, ConfirmDialog } from '@/components/ui'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Datasheet, textCellEditor, checkboxCell, comboboxEditor } from '@/components/grid/Datasheet'
import { MobileCardList } from '@/components/grid/MobileCardList'
import type { ComboboxItem } from '@/components/combobox/SearchableCombobox'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { Column, RenderEditCellProps, RenderCellProps } from 'react-data-grid'
import type { Warehouse, WorkLocation, WarehouseType } from '@/types'

interface WarehouseRow extends Warehouse {
  _isNew?: boolean
  _dirty?: boolean
  _tempId?: string
}

let tempIdCounter = 0
function nextTempId(): string {
  return `_new_${++tempIdCounter}`
}

// ----------------------------------------------------------------------------
// SelectCellEditor — for enum columns (warehouse_type: main/sub)
// ----------------------------------------------------------------------------
function selectEditor<R>(options: { value: string; label: string }[]) {
  function editor({ row, column, onRowChange, onClose }: RenderEditCellProps<R>) {
    const currentValue = String((row as Record<string, unknown>)[column.key] ?? '')
    return (
      <select
        autoFocus
        defaultValue={currentValue}
        className="h-full w-full border-0 bg-white px-2 text-sm outline-none"
        onChange={(e) => {
          onRowChange({ ...row, [column.key]: e.target.value } as R, true)
          onClose(true, false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(false, false) }
        }}
        onBlur={() => onClose(true, false)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }
  return editor
}

function selectCell<R>(options: { value: string; label: string }[]) {
  function renderCell({ row, column }: RenderCellProps<R>) {
    const value = String((row as Record<string, unknown>)[column.key] ?? '')
    const opt = options.find((o) => o.value === value)
    return <span className="badge badge-blue">{opt?.label ?? value}</span>
  }
  return renderCell
}

const TYPE_OPTIONS = [
  { value: 'main', label: 'Main' },
  { value: 'sub', label: 'Sub' },
]

export function WarehousesPage() {
  const [rows, setRows] = useState<WarehouseRow[]>([])
  const [locations, setLocations] = useState<WorkLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    setLoading(true)
    const [wh, loc] = await Promise.all([
      supabase.from('warehouses').select('*, work_locations(name, code)').order('name'),
      supabase.from('work_locations').select('*').eq('is_active', true).order('name'),
    ])
    // Flatten the joined work_locations into work_location_name/code
    const flatRows = ((wh.data ?? []) as Array<Warehouse & { work_locations: { name: string; code: string } | null }>).map((r) => ({
      ...r,
      work_location_name: r.work_locations?.name ?? undefined,
      work_location_code: r.work_locations?.code ?? undefined,
    })) as WarehouseRow[]
    setRows(flatRows)
    setLocations((loc.data ?? []) as WorkLocation[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const locationItems: ComboboxItem[] = useMemo(
    () => locations.map((l) => ({ id: l.id, label: `${l.code} — ${l.name}` })),
    [locations]
  )

  const locationLabel = useCallback(
    (id: string) => {
      const loc = locations.find((l) => l.id === id)
      return loc ? `${loc.code} — ${loc.name}` : ''
    },
    [locations]
  )

  const dirtyRowIds = useMemo(() => {
    const ids = new Set<string>()
    rows.forEach((r) => {
      if (r._dirty) ids.add(r._isNew ? (r._tempId ?? '') : r.id)
    })
    return ids
  }, [rows])

  const isDirty = dirtyRowIds.size > 0

  const rowKeyGetter = useCallback(
    (row: WarehouseRow) => (row._isNew ? (row._tempId ?? '') : row.id),
    []
  )

  const saveRow = useCallback(async (row: WarehouseRow) => {
    setError(null)
    if (!row.code?.trim()) { setError('Code is required'); return false }
    if (!row.name?.trim()) { setError('Name is required'); return false }
    if (row.warehouse_type === 'sub' && !row.work_location_id) {
      setError('Sub warehouses require a work location'); return false
    }

    const payload = {
      code: row.code.trim(),
      name: row.name.trim(),
      warehouse_type: row.warehouse_type,
      work_location_id: row.warehouse_type === 'sub' ? row.work_location_id : null,
      is_active: row.is_active,
    }

    if (row._isNew) {
      const { data, error: err } = await supabase.from('warehouses').insert(payload).select('*, work_locations(name, code)').single()
      if (err) { setError(err.message); return false }
      const flat = { ...(data as Warehouse & { work_locations: { name: string; code: string } | null }), work_location_name: (data as Warehouse & { work_locations: { name: string; code: string } | null }).work_locations?.name ?? undefined, work_location_code: (data as Warehouse & { work_locations: { name: string; code: string } | null }).work_locations?.code ?? undefined }
      setRows((prev) => prev.map((r) => (r._tempId === row._tempId ? (flat as WarehouseRow) : r)))
    } else {
      const { data, error: err } = await supabase.from('warehouses').update(payload).eq('id', row.id).select('*, work_locations(name, code)').single()
      if (err) { setError(err.message); return false }
      const flat = { ...(data as Warehouse & { work_locations: { name: string; code: string } | null }), work_location_name: (data as Warehouse & { work_locations: { name: string; code: string } | null }).work_locations?.name ?? undefined, work_location_code: (data as Warehouse & { work_locations: { name: string; code: string } | null }).work_locations?.code ?? undefined }
      setRows((prev) => prev.map((r) => (r.id === row.id ? (flat as WarehouseRow) : r)))
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
    const newRow: WarehouseRow = {
      id: tempId,
      company_id: '',
      code: '',
      name: '',
      warehouse_type: 'main' as WarehouseType,
      work_location_id: null,
      is_active: true,
      created_at: new Date().toISOString(),
      _isNew: true,
      _dirty: true,
      _tempId: tempId,
    }
    setRows((prev) => [...prev, newRow])
  }, [])

  const handleRowsChange = useCallback((newRows: WarehouseRow[]) => {
    setRows((prev) => {
      return newRows.map((nr) => {
        const prevRow = prev.find((pr) => rowKeyGetter(pr) === rowKeyGetter(nr))
        if (prevRow && JSON.stringify(stripFlags(prevRow)) !== JSON.stringify(stripFlags(nr))) {
          // If warehouse_type changed to main, clear work_location_id
          const updated = { ...nr, _dirty: true } as WarehouseRow
          if (nr.warehouse_type === 'main') {
            updated.work_location_id = null
          }
          return updated
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
      await supabase.from('warehouses').delete().eq('id', deleteId)
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

  const columns: readonly Column<WarehouseRow>[] = useMemo(() => [
    { key: 'code', name: 'Code', width: 120, resizable: true, editable: true, renderEditCell: textCellEditor<WarehouseRow>(), cellClass: 'font-medium' },
    { key: 'name', name: 'Name', width: 240, resizable: true, editable: true, renderEditCell: textCellEditor<WarehouseRow>() },
    { key: 'warehouse_type', name: 'Type', width: 90, editable: true, renderEditCell: selectEditor<WarehouseRow>(TYPE_OPTIONS), renderCell: selectCell<WarehouseRow>(TYPE_OPTIONS) },
    { key: 'work_location_id', name: 'Work Location', width: 220, resizable: true, ...comboboxEditor<WarehouseRow>(locationItems, locationLabel) },
    { key: 'is_active', name: 'Active', width: 70, renderCell: checkboxCell<WarehouseRow>() },
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
  ], [locationItems, locationLabel])

  if (loading) return <LoadingSpinner />

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Warehouses"
        subtitle="Manage warehouse master data — inline editing, Ctrl+N for new row, Ctrl+S to save"
        action={<button onClick={addNewRow} className="btn btn-primary"><Plus className="h-4 w-4" /> Add Row</button>}
      />

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search warehouses..." className="input max-w-xs" />
        <button onClick={saveAll} disabled={!isDirty} className="btn btn-primary" title="Save all changes (Ctrl+S)">
          <Save className="h-4 w-4" /> Save All
        </button>
        <DirtyBadge dirty={isDirty} />
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div ref={gridContainerRef} className="card flex-1 overflow-hidden p-0 hidden lg:block">
        <Datasheet<WarehouseRow>
          columns={columns}
          rows={filteredRows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={rowKeyGetter}
          dirtyRowIds={dirtyRowIds}
          emptyMessage="No warehouses found. Press Ctrl+N or click Add Row to start."
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
          emptyMessage="No warehouses found. Click Add Row to start."
        />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Warehouse"
        message="Are you sure? This action cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

function stripFlags(row: WarehouseRow): Record<string, unknown> {
  const { _isNew, _dirty, _tempId, ...rest } = row
  void _isNew; void _dirty; void _tempId
  return rest as Record<string, unknown>
}
