import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Alert, DirtyBadge, ConfirmDialog } from '@/components/ui'
import { Plus, Save, Trash2, ClipboardPaste } from 'lucide-react'
import { Datasheet, comboboxEditor, numberEditor, readOnlyCell } from '@/components/grid/Datasheet'
import type { ComboboxItem } from '@/components/combobox/SearchableCombobox'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { parseClipboard, transformers, type ClipboardColumnSchema } from '@/lib/clipboard'
import type { Column } from 'react-data-grid'
import type { WorkOrderBOQ, Material } from '@/types'

// ============================================================================
// BoqGrid — spreadsheet-style BOQ editor for Work Orders
// ----------------------------------------------------------------------------
// Features:
//   - Item Number via SearchableCombobox (auto-fills Description, Category, UOM)
//   - Estimated Quantity (editable number)
//   - Ctrl+S saves all dirty lines (bulk upsert)
//   - Ctrl+N adds new line
//   - Copy/paste from Excel (validates item_number + qty)
//   - Delete row with confirm
//   - Respects unique (work_order_id, material_id) constraint
// ============================================================================

interface BoqRow extends WorkOrderBOQ {
  _isNew?: boolean
  _dirty?: boolean
  _tempId?: string
  // Auto-derived display fields (from materials reference)
  item_number?: string
  short_description?: string
  uom?: string
  category_name?: string
}

let tempIdCounter = 0
function nextTempId(): string {
  return `_boq_${++tempIdCounter}`
}

interface BoqGridProps {
  workOrderId: string
  materials: Material[]
  // Notify parent when dirty state changes (for unsaved-changes guard)
  onDirtyChange?: (dirty: boolean) => void
}

export function BoqGrid({ workOrderId, materials, onDirtyChange }: BoqGridProps) {
  const { t } = useTranslation('workOrders')
  const [rows, setRows] = useState<BoqRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [pasteErrors, setPasteErrors] = useState<string | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // Material combobox items
  const materialItems: ComboboxItem[] = useMemo(
    () => materials.map((m) => ({ id: m.id, label: `${m.item_number} — ${m.short_description}` })),
    [materials]
  )

  const materialLabel = useCallback(
    (id: string) => {
      const m = materials.find((x) => x.id === id)
      return m ? `${m.item_number} — ${m.short_description}` : ''
    },
    [materials]
  )

  // Flatten joined material fields onto the row object used by the grid
  const withMaterialFields = useCallback((row: BoqRow) => {
    if (!row.material_id) return row
    const mat = materials.find((m) => m.id === row.material_id)
    const joined = ((row as unknown) as Record<string, unknown>).materials as { item_number?: string; short_description?: string; uom?: string } | undefined
    return {
      ...row,
      item_number: mat?.item_number ?? joined?.item_number,
      short_description: mat?.short_description ?? joined?.short_description,
      uom: mat?.uom ?? joined?.uom,
    }
  }, [materials])

  // Fetch BOQ data
  const fetchData = useCallback(async () => {
    if (!workOrderId) return
    setLoading(true)
    const { data } = await supabase
      .from('work_order_boq')
      .select('*, materials!inner(item_number, short_description, uom, category_id)')
      .eq('work_order_id', workOrderId)
      .order('created_at')
    setRows((data ?? []).map((r) => withMaterialFields(r as BoqRow)) as BoqRow[])
    setLoading(false)
  }, [workOrderId, withMaterialFields])

  useEffect(() => { fetchData() }, [fetchData])

  // ============================================================================
  // Dirty tracking
  // ============================================================================
  const dirtyRowIds = useMemo(() => {
    const ids = new Set<string>()
    rows.forEach((r) => {
      if (r._dirty) ids.add(r._isNew ? (r._tempId ?? '') : r.id)
    })
    return ids
  }, [rows])

  const isDirty = dirtyRowIds.size > 0

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const rowKeyGetter = useCallback(
    (row: BoqRow) => (row._isNew ? (row._tempId ?? '') : row.id),
    []
  )

  // ============================================================================
  // Save all dirty rows (bulk upsert)
  // ============================================================================
  const saveAll = useCallback(async () => {
    const dirtyRows = rows.filter((r) => r._dirty)
    if (dirtyRows.length === 0) return
    setError(null)

    // Validate
    for (const row of dirtyRows) {
      if (!row.material_id) { setError(t('workOrders:boq.errors.materialRequired')); return }
      if (!row.planned_quantity || row.planned_quantity <= 0) {
        setError(t('workOrders:boq.errors.quantityPositive')); return
      }
      // Check for duplicate material_id within the same WO
      const dupCount = rows.filter((r) => r.material_id === row.material_id).length
      if (dupCount > 1) {
        const m = materials.find((x) => x.id === row.material_id)
        setError(t('workOrders:boq.errors.duplicateMaterial', { item: m?.item_number ?? '' }))
        return
      }
    }

    let allOk = true
    for (const row of dirtyRows) {
      const payload = {
        work_order_id: workOrderId,
        material_id: row.material_id,
        planned_quantity: row.planned_quantity,
      }

      if (row._isNew) {
        const { data, error: err } = await supabase
          .from('work_order_boq')
          .insert(payload)
          .select('*, materials!inner(item_number, short_description, uom, category_id)')
          .single()
        if (err) { setError(err.message); allOk = false; break }
        const flat = withMaterialFields(data as BoqRow)
        setRows((prev) => prev.map((r) => (r._tempId === row._tempId ? flat : r)))
      } else {
        const { data, error: err } = await supabase
          .from('work_order_boq')
          .update({ planned_quantity: row.planned_quantity })
          .eq('id', row.id)
          .select('*, materials!inner(item_number, short_description, uom, category_id)')
          .single()
        if (err) { setError(err.message); allOk = false; break }
        const flat = withMaterialFields(data as BoqRow)
        setRows((prev) => prev.map((r) => (r.id === row.id ? flat : r)))
      }
    }

    if (allOk) {
      setSuccess(t('workOrders:boq.saveSuccess', { count: dirtyRows.length }))
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [rows, workOrderId, materials])

  // ============================================================================
  // Add new row (Ctrl+N or button)
  // ============================================================================
  const addNewRow = useCallback(() => {
    const tempId = nextTempId()
    const newRow: BoqRow = {
      id: tempId,
      company_id: '',
      work_order_id: workOrderId,
      material_id: '',
      planned_quantity: 0,
      created_at: new Date().toISOString(),
      _isNew: true,
      _dirty: true,
      _tempId: tempId,
    }
    setRows((prev) => [...prev, newRow])
  }, [workOrderId])

  // ============================================================================
  // Handle row changes — auto-derive fields from material selection
  // ============================================================================
  const handleRowsChange = useCallback((newRows: BoqRow[]) => {
    setRows((prev) => {
      return newRows.map((nr) => {
        const prevRow = prev.find((pr) => rowKeyGetter(pr) === rowKeyGetter(nr))
        // Auto-derive display fields from material
        if (nr.material_id) {
          const mat = materials.find((m) => m.id === nr.material_id)
          if (mat) {
            nr.item_number = mat.item_number
            nr.short_description = mat.short_description
            nr.uom = mat.uom
          }
        }
        if (prevRow && JSON.stringify(stripFlags(prevRow)) !== JSON.stringify(stripFlags(nr))) {
          return { ...nr, _dirty: true }
        }
        return nr
      })
    })
  }, [rowKeyGetter, materials])

  // ============================================================================
  // Delete row
  // ============================================================================
  const handleDelete = async () => {
    if (!deleteId) return
    const row = rows.find((r) => r.id === deleteId)
    if (row?._isNew) {
      setRows((prev) => prev.filter((r) => r._tempId !== row._tempId))
    } else {
      await supabase.from('work_order_boq').delete().eq('id', deleteId)
      setRows((prev) => prev.filter((r) => r.id !== deleteId))
    }
    setDeleteId(null)
  }

  // ============================================================================
  // Copy/paste from Excel
  // ============================================================================
  const pasteSchema: ClipboardColumnSchema[] = useMemo(() => [
    { key: 'item_number', required: true, transform: transformers.toString },
    { key: 'planned_quantity', required: true, transform: transformers.toNumber },
  ], [])

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) return
      const result = parseClipboard(text, pasteSchema)
      if (result.hasErrors) {
        const errorLines = result.errors.map((e) => t('workOrders:boq.pasteErrorRow', { row: e.rowIndex + 1, message: e.message })).join('\n')
        setPasteErrors(errorLines)
        return
      }
      setPasteErrors(null)
      // Match item_number to materials
      const newRows: BoqRow[] = []
      for (const r of result.rows) {
        const itemNumber = String(r.item_number ?? '')
        const mat = materials.find((m) => m.item_number.toLowerCase() === itemNumber.toLowerCase())
        if (!mat) {
          setPasteErrors(t('workOrders:boq.errors.materialNotFound', { item: itemNumber }))
          continue
        }
        const tempId = nextTempId()
        newRows.push({
          id: tempId,
          company_id: '',
          work_order_id: workOrderId,
          material_id: mat.id,
          planned_quantity: Number(r.planned_quantity),
          created_at: new Date().toISOString(),
          item_number: mat.item_number,
          short_description: mat.short_description,
          uom: mat.uom,
          _isNew: true,
          _dirty: true,
          _tempId: tempId,
        })
      }
      if (newRows.length > 0) {
        setRows((prev) => [...prev, ...newRows])
        setSuccess(t('workOrders:boq.pasteSuccess', { count: newRows.length }))
        setTimeout(() => setSuccess(null), 4000)
      }
    } catch {
      setError(t('workOrders:boq.errors.clipboardFailed'))
    }
  }

  // ============================================================================
  // Keyboard shortcuts
  // ============================================================================
  useKeyboardShortcuts({
    onNew: addNewRow,
    onSave: saveAll,
    onCancel: () => { if (isDirty) fetchData() },
  }, [isDirty, rows, saveAll])

  // ============================================================================
  // Column definitions
  // ============================================================================
  const columns: readonly Column<BoqRow>[] = useMemo(() => [
    {
      key: 'material_id',
      name: t('workOrders:boq.item'),
      width: 240,
      resizable: true,
      ...comboboxEditor<BoqRow>(materialItems, materialLabel),
    },
    {
      key: 'short_description',
      name: t('workOrders:boq.description'),
      width: 220,
      resizable: true,
      renderCell: readOnlyCell<BoqRow>(),
    },
    {
      key: 'uom',
      name: t('workOrders:boq.uom'),
      width: 70,
      renderCell: readOnlyCell<BoqRow>(),
    },
    {
      key: 'planned_quantity',
      name: t('workOrders:boq.estQty'),
      width: 100,
      editable: true,
      renderEditCell: numberEditor<BoqRow>({ min: 0, step: '0.001' }),
      renderCell: ({ row }) => <span className="text-right">{row.planned_quantity || '—'}</span>,
    },
    {
      key: '_actions',
      name: '',
      width: 50,
      sortable: false,
      resizable: false,
      renderCell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteId(row._isNew ? (row._tempId ?? row.id) : row.id) }}
          className="text-gray-400 hover:text-red-600"
          title={t('workOrders:boq.deleteLine')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ], [materialItems, materialLabel, t])

  if (loading) return <div className="p-4 text-sm text-gray-500">{t('workOrders:boq.loading')}</div>

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold">{t('workOrders:boq.title')}</h3>
        <button onClick={addNewRow} className="btn btn-secondary btn-sm" title={t('workOrders:boq.addLineTitle')}>
          <Plus className="h-3 w-3" /> {t('workOrders:boq.addLine')}
        </button>
        <button onClick={handlePaste} className="btn btn-secondary btn-sm" title={t('workOrders:boq.pasteTitle')}>
          <ClipboardPaste className="h-3 w-3" /> {t('workOrders:boq.paste')}
        </button>
        <button onClick={saveAll} disabled={!isDirty} className="btn btn-primary btn-sm" title={t('workOrders:boq.saveTitle')}>
          <Save className="h-3 w-3" /> {t('workOrders:boq.save')}
        </button>
        <DirtyBadge dirty={isDirty} />
      </div>

      {error && <div className="mb-3"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-3"><Alert type="success" message={success} /></div>}
      {pasteErrors && <div className="mb-3"><Alert type="error" message={`${t('workOrders:boq.pasteErrors')}\n${pasteErrors}`} /></div>}

      <div ref={gridContainerRef} className="card overflow-hidden p-0" style={{ height: '300px' }}>
        <Datasheet<BoqRow>
          columns={columns}
          rows={rows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={rowKeyGetter}
          dirtyRowIds={dirtyRowIds}
          emptyMessage={t('workOrders:boq.empty')}
          rowHeight={34}
        />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('workOrders:boq.deleteTitle')}
        message={t('workOrders:boq.deleteMessage')}
        confirmLabel={t('common:buttons.remove')}
        danger
      />
    </div>
  )
}

function stripFlags(row: BoqRow): Record<string, unknown> {
  const { _isNew, _dirty, _tempId, ...rest } = row
  void _isNew; void _dirty; void _tempId
  return rest as Record<string, unknown>
}
