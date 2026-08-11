import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { PageHeader, LoadingSpinner, Alert, DirtyBadge, ConfirmDialog, Modal } from '@/components/ui'
import { Plus, Save, ClipboardPaste, Trash2 } from 'lucide-react'
import { Datasheet, comboboxEditor, textCellEditor, checkboxCell, readOnlyCell } from '@/components/grid/Datasheet'
import { MobileCardList } from '@/components/grid/MobileCardList'
import type { ComboboxItem } from '@/components/combobox/SearchableCombobox'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { parseClipboard, transformers, type ClipboardColumnSchema } from '@/lib/clipboard'
import type { Column } from 'react-data-grid'
import type { Material, MaterialCategory } from '@/types'

// ============================================================================
// MaterialRow — extends Material with internal tracking flags
// ============================================================================
interface MaterialRow extends Material {
  _isNew?: boolean
  _dirty?: boolean
  _tempId?: string
}

let tempIdCounter = 0
function nextTempId(): string {
  return `_new_${++tempIdCounter}`
}

export function MaterialsPage() {
  const { t } = useTranslation('materials')
  const [rows, setRows] = useState<MaterialRow[]>([])
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [pasteErrors, setPasteErrors] = useState<string | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // Category combobox items
  const categoryItems: ComboboxItem[] = useMemo(
    () => categories.map((c) => ({ id: c.id, label: c.name })),
    [categories]
  )

  const categoryLabel = useCallback(
    (id: string) => categories.find((c) => c.id === id)?.name ?? '',
    [categories]
  )

  const fetchData = async () => {
    setLoading(true)
    const [mat, cat] = await Promise.all([
      supabase.from('materials').select('*, material_categories!inner(name)').order('item_number').limit(1000),
      supabase.from('material_categories').select('*').order('name').limit(100),
    ])
    setRows((mat.data ?? []) as MaterialRow[])
    setCategories((cat.data ?? []) as MaterialCategory[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // ============================================================================
  // Dirty tracking
  // ============================================================================
  const dirtyRowIds = useMemo(() => {
    const ids = new Set<string>()
    rows.forEach((r) => {
      if (r._dirty) {
        ids.add(r._isNew ? (r._tempId ?? '') : r.id)
      }
    })
    return ids
  }, [rows])

  const isDirty = dirtyRowIds.size > 0

  const rowKeyGetter = useCallback(
    (row: MaterialRow) => (row._isNew ? (row._tempId ?? '') : row.id),
    []
  )

  // ============================================================================
  // Row save (upsert)
  // ============================================================================
  const saveRow = useCallback(async (row: MaterialRow) => {
    setError(null)
    // Validate required fields
    if (!row.item_number?.trim()) {
      setError(t('materials:errors.itemNumberRequired'))
      return false
    }
    if (!row.short_description?.trim()) {
      setError(t('materials:errors.shortDescriptionRequired'))
      return false
    }
    if (!row.uom?.trim()) {
      setError(t('materials:errors.uomRequired'))
      return false
    }

    const payload = {
      item_number: row.item_number.trim(),
      short_description: row.short_description.trim(),
      long_description: row.long_description?.trim() || null,
      category_id: row.category_id || null,
      uom: row.uom.trim(),
      is_active: row.is_active,
    }

    if (row._isNew) {
      const { data, error: err } = await supabase.from('materials').insert(payload).select('*, material_categories!inner(name)').single()
      if (err) { setError(err.message); return false }
      // Replace the temp row with the real one
      setRows((prev) => prev.map((r) => (r._tempId === row._tempId ? (data as MaterialRow) : r)))
    } else {
      const { data, error: err } = await supabase.from('materials').update(payload).eq('id', row.id).select('*, material_categories!inner(name)').single()
      if (err) { setError(err.message); return false }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...(data as MaterialRow) } : r)))
    }
    return true
  }, [])

  // ============================================================================
  // Save all dirty rows
  // ============================================================================
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
      setSuccess(t('materials:saved', { count: dirtyRows.length }))
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [rows, saveRow])

  // ============================================================================
  // Add new row (Ctrl+N or button)
  // ============================================================================
  const addNewRow = useCallback(() => {
    const tempId = nextTempId()
    const newRow: MaterialRow = {
      id: tempId,
      company_id: '',
      item_number: '',
      short_description: '',
      long_description: null,
      category_id: null,
      uom: '',
      is_active: true,
      created_at: new Date().toISOString(),
      category_name: undefined,
      _isNew: true,
      _dirty: true,
      _tempId: tempId,
    }
    setRows((prev) => [...prev, newRow])
    // Focus will be handled by the grid after render
  }, [])

  // ============================================================================
  // Handle row changes (from inline editing)
  // ============================================================================
  const handleRowsChange = useCallback((newRows: MaterialRow[]) => {
    // Mark changed rows as dirty
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

  // ============================================================================
  // Delete / deactivate
  // ============================================================================
  const handleDelete = async () => {
    if (!deleteId) return
    // Find the row — could be a real id or temp id
    const row = rows.find((r) => r.id === deleteId)
    if (row?._isNew) {
      // Just remove the unsaved temp row
      setRows((prev) => prev.filter((r) => r._tempId !== row._tempId))
    } else {
      await supabase.from('materials').delete().eq('id', deleteId)
      setRows((prev) => prev.filter((r) => r.id !== deleteId))
    }
    setDeleteId(null)
  }

  // ============================================================================
  // Add category
  // ============================================================================
  const handleAddCategory = async () => {
    if (!newCat.trim()) return
    const { error: err } = await supabase.from('material_categories').insert({ name: newCat.trim() })
    if (err) { setError(err.message); return }
    setNewCat('')
    setCatModalOpen(false)
    fetchData()
  }

  // ============================================================================
  // Copy/paste from Excel
  // ============================================================================
  const pasteSchema: ClipboardColumnSchema[] = useMemo(() => [
    { key: 'item_number', required: true, transform: transformers.toString },
    { key: 'short_description', required: true, transform: transformers.toString },
    { key: 'uom', required: true, transform: transformers.toString },
    { key: 'long_description', transform: transformers.toNullIfEmpty },
  ], [])

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) return
      const result = parseClipboard(text, pasteSchema)
      if (result.hasErrors) {
        const errorLines = result.errors.map((e) => `Row ${e.rowIndex + 1}: ${e.message}`).join('\n')
        setPasteErrors(errorLines)
        return
      }
      setPasteErrors(null)
      // Add parsed rows as new materials
      const newRows: MaterialRow[] = result.rows.map((r) => {
        const tempId = nextTempId()
        return {
          id: tempId,
          company_id: '',
          item_number: String(r.item_number ?? ''),
          short_description: String(r.short_description ?? ''),
          long_description: (r.long_description as string) ?? null,
          category_id: null,
          uom: String(r.uom ?? ''),
          is_active: true,
          created_at: new Date().toISOString(),
          _isNew: true,
          _dirty: true,
          _tempId: tempId,
        }
      })
      setRows((prev) => [...prev, ...newRows])
      setSuccess(t('materials:pasted', { count: newRows.length }))
      setTimeout(() => setSuccess(null), 4000)
    } catch {
      setError(t('materials:clipboardReadError'))
    }
  }

  // ============================================================================
  // Keyboard shortcuts
  // ============================================================================
  useKeyboardShortcuts({
    onNew: addNewRow,
    onSave: saveAll,
    onCancel: () => {
      // Discard dirty new rows, reload
      if (isDirty) fetchData()
    },
  }, [isDirty, rows, saveAll])

  // ============================================================================
  // Filtered rows for display
  // ============================================================================
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        r.item_number.toLowerCase().includes(q) ||
        r.short_description.toLowerCase().includes(q)
    )
  }, [rows, search])

  // ============================================================================
  // Column definitions
  // ============================================================================
  const columns: readonly Column<MaterialRow>[] = useMemo(() => [
    {
      key: 'item_number',
      name: t('materials:columns.itemNumber'),
      width: 140,
      resizable: true,
      editable: true,
      renderEditCell: textCellEditor<MaterialRow>(),
      cellClass: 'font-medium',
    },
    {
      key: 'short_description',
      name: t('materials:columns.shortDescription'),
      width: 220,
      resizable: true,
      editable: true,
      renderEditCell: textCellEditor<MaterialRow>(),
    },
    {
      key: 'long_description',
      name: t('materials:columns.longDescription'),
      width: 240,
      resizable: true,
      editable: true,
      renderEditCell: textCellEditor<MaterialRow>(),
      renderCell: readOnlyCell<MaterialRow>(),
    },
    {
      key: 'category_id',
      name: t('materials:columns.category'),
      width: 160,
      resizable: true,
      ...comboboxEditor<MaterialRow>(categoryItems, categoryLabel),
    },
    {
      key: 'uom',
      name: t('materials:columns.uom'),
      width: 80,
      editable: true,
      renderEditCell: textCellEditor<MaterialRow>(),
    },
    {
      key: 'is_active',
      name: t('materials:columns.isActive'),
      width: 70,
      renderCell: checkboxCell<MaterialRow>(),
    },
    {
      key: '_actions',
      name: '',
      width: 50,
      sortable: false,
      resizable: false,
      renderCell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setDeleteId(row._isNew ? (row._tempId ?? row.id) : row.id)
          }}
          className="text-gray-400 hover:text-red-600"
          title={t('common:buttons.delete')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ], [categoryItems, categoryLabel, t])

  if (loading) return <LoadingSpinner />

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('materials:title')}
        subtitle={t('materials:subtitle')}
        action={
          <button onClick={addNewRow} className="btn btn-primary">
            <Plus className="h-4 w-4" /> {t('materials:buttons.addRow')}
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('materials:search')}
          className="input max-w-xs"
        />
        <button onClick={handlePaste} className="btn btn-secondary" title={t('materials:buttons.paste')}>
          <ClipboardPaste className="h-4 w-4" /> {t('materials:buttons.paste')}
        </button>
        <button onClick={saveAll} disabled={!isDirty} className="btn btn-primary" title={t('materials:buttons.saveAll')}>
          <Save className="h-4 w-4" /> {t('materials:buttons.saveAll')}
        </button>
        <button onClick={() => setCatModalOpen(true)} className="btn btn-secondary">
          <Plus className="h-4 w-4" /> {t('materials:buttons.category')}
        </button>
        <DirtyBadge dirty={isDirty} />
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}
      {pasteErrors && (
        <div className="mb-4">
          <Alert type="error" message={`${t('materials:pasteValidationErrors')}\n${pasteErrors}`} />
        </div>
      )}

      <div ref={gridContainerRef} className="card flex-1 overflow-hidden p-0 hidden lg:block">
        <Datasheet<MaterialRow>
          columns={columns}
          rows={filteredRows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={rowKeyGetter}
          dirtyRowIds={dirtyRowIds}
          emptyMessage={t('materials:empty')}
          rowHeight={38}
        />
      </div>

      <div className="lg:hidden">
        <MobileCardList
          rows={filteredRows as unknown as Record<string, unknown>[]}
          titleKey="item_number"
          subtitleKey="short_description"
          fields={[
            { key: 'category_name', label: t('materials:columns.category'), badge: true },
            { key: 'uom', label: t('materials:columns.uom') },
            { key: 'is_active', label: t('materials:columns.isActive'), format: (v) => (v ? t('common:labels.yes') : t('common:labels.no')) },
          ]}
          emptyMessage={t('materials:empty')}
        />
      </div>

      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title={t('materials:categoryModal.title')} size="sm">
        <div className="space-y-4">
          <div><label className="label">{t('materials:categoryModal.categoryName')}</label><input value={newCat} onChange={(e) => setNewCat(e.target.value)} className="input" autoFocus /></div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setCatModalOpen(false)} className="btn btn-secondary">{t('common:buttons.cancel')}</button>
            <button onClick={handleAddCategory} className="btn btn-primary">{t('materials:categoryModal.add')}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('materials:delete.title')}
        message={t('materials:delete.message')}
        confirmLabel={t('common:buttons.delete')}
        danger
      />
    </div>
  )
}

// Strip internal flags for comparison
function stripFlags(row: MaterialRow): Record<string, unknown> {
  const { _isNew, _dirty, _tempId, ...rest } = row
  void _isNew; void _dirty; void _tempId
  return rest as Record<string, unknown>
}
