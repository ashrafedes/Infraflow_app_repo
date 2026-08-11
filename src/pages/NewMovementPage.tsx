import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner, Alert, DirtyBadge } from '@/components/ui'
import { SearchableCombobox, type ComboboxItem } from '@/components/combobox/SearchableCombobox'
import { Datasheet, comboboxEditor, numberEditor, textCellEditor, readOnlyCell } from '@/components/grid/Datasheet'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { parseClipboard, transformers, validators, type ClipboardColumnSchema } from '@/lib/clipboard'
import { Plus, Save, Trash2, ArrowLeft, ClipboardPaste, Copy } from 'lucide-react'
import type { Column } from 'react-data-grid'
import type { MovementType, Warehouse, WorkOrder, Supplier, Contractor, Material } from '@/types'

// ============================================================================
// Types
// ============================================================================
interface MovementLineRow {
  _id: string // temp key for react-data-grid
  material_id: string
  quantity: number | null
  notes: string
  // Auto-derived (read-only)
  short_description: string
  uom: string
  available_balance: number | null
}

let lineIdCounter = 0
function nextLineId(): string {
  return `_line_${++lineIdCounter}`
}

function emptyLine(): MovementLineRow {
  return {
    _id: nextLineId(),
    material_id: '',
    quantity: null,
    notes: '',
    short_description: '',
    uom: '',
    available_balance: null,
  }
}

export function NewMovementPage() {
  const { t } = useTranslation('movements')
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteErrors, setPasteErrors] = useState<string | null>(null)

  // Header fields
  const [movementType, setMovementType] = useState<MovementType>('RECEIPT')
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  // Source/destination selections
  const [supplierId, setSupplierId] = useState('')
  const [sourceWarehouseId, setSourceWarehouseId] = useState('')
  const [sourceWorkOrderId, setSourceWorkOrderId] = useState('')
  const [destWarehouseId, setDestWarehouseId] = useState('')
  const [destWorkOrderId, setDestWorkOrderId] = useState('')
  const [contractorId, setContractorId] = useState('')

  // Transfer sub-type
  const [transferSubType, setTransferSubType] = useState<'wh_to_wh' | 'wo_to_wo' | 'wo_to_contractor'>('wh_to_wh')

  // Adjustment fields
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase')
  const [adjustmentReason, setAdjustmentReason] = useState('')

  // Lines
  const [lines, setLines] = useState<MovementLineRow[]>([emptyLine()])

  // Reference data
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})

  // ============================================================================
  // Fetch reference data
  // ============================================================================
  useEffect(() => {
    async function fetchRefData() {
      const [wh, wo, sup, con, mat] = await Promise.all([
        supabase.from('warehouses').select('*').eq('is_active', true).order('name'),
        supabase.from('work_orders').select('*, projects!inner(name, code), work_locations!inner(name, code), contractors(name)').eq('status', 'active').order('work_order_number'),
        supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
        supabase.from('contractors').select('*').eq('is_active', true).order('name'),
        supabase.from('materials').select('*').eq('is_active', true).order('item_number'),
      ])
      setWarehouses((wh.data ?? []) as unknown as Warehouse[])
      setWorkOrders((wo.data ?? []) as unknown as WorkOrder[])
      setSuppliers((sup.data ?? []) as unknown as Supplier[])
      setContractors((con.data ?? []) as unknown as Contractor[])
      setMaterials((mat.data ?? []) as unknown as Material[])
      setLoading(false)
    }
    fetchRefData()
  }, [])

  // ============================================================================
  // Combobox items
  // ============================================================================
  const warehouseItems: ComboboxItem[] = useMemo(
    () => warehouses.map((w) => ({ id: w.id, label: w.name, code: w.code })),
    [warehouses]
  )
  const workOrderItems: ComboboxItem[] = useMemo(
    () => workOrders.map((w) => ({ id: w.id, label: w.work_order_number, subLabel: w.site_code ?? w.project_name })),
    [workOrders]
  )
  const supplierItems: ComboboxItem[] = useMemo(
    () => suppliers.map((s) => ({ id: s.id, label: s.name, code: s.code })),
    [suppliers]
  )
  const contractorItems: ComboboxItem[] = useMemo(
    () => contractors.map((c) => ({ id: c.id, label: c.name })),
    [contractors]
  )
  const materialItems: ComboboxItem[] = useMemo(
    () => materials.map((m) => ({ id: m.id, label: m.short_description, code: m.item_number, subLabel: m.uom })),
    [materials]
  )

  // ============================================================================
  // Context inheritance — derive info from selected Work Order
  // ============================================================================
  const selectedSourceWO = useMemo(
    () => workOrders.find((w) => w.id === sourceWorkOrderId),
    [workOrders, sourceWorkOrderId]
  )
  const selectedDestWO = useMemo(
    () => workOrders.find((w) => w.id === destWorkOrderId),
    [workOrders, destWorkOrderId]
  )

  // ============================================================================
  // Available balance — fetch when source context changes
  // ============================================================================
  const sourceContextId = useMemo(() => {
    if (movementType === 'ISSUE' || movementType === 'ADJUSTMENT') return sourceWarehouseId
    if (movementType === 'TRANSFER' && transferSubType === 'wh_to_wh') return sourceWarehouseId
    if (movementType === 'RETURN' && sourceWorkOrderId) return sourceWorkOrderId
    if (movementType === 'USAGE') return sourceWorkOrderId
    if (movementType === 'TRANSFER' && transferSubType !== 'wh_to_wh') return sourceWorkOrderId
    return ''
  }, [movementType, transferSubType, sourceWarehouseId, sourceWorkOrderId])

  const sourceIsWarehouse = useMemo(() => {
    return movementType === 'ISSUE' || movementType === 'ADJUSTMENT' ||
      (movementType === 'TRANSFER' && transferSubType === 'wh_to_wh')
  }, [movementType, transferSubType])

  useEffect(() => {
    if (!sourceContextId) {
      setBalances({})
      return
    }
    async function fetchBalances() {
      if (sourceIsWarehouse) {
        const { data } = await supabase
          .from('v_warehouse_balance')
          .select('material_id, current_balance')
          .eq('warehouse_id', sourceContextId)
        const map: Record<string, number> = {}
        ;(data ?? []).forEach((b: { material_id: string; current_balance: number }) => {
          map[b.material_id] = Number(b.current_balance)
        })
        setBalances(map)
      } else {
        const { data } = await supabase
          .from('v_work_order_balance')
          .select('material_id, on_hand')
          .eq('work_order_id', sourceContextId)
        const map: Record<string, number> = {}
        ;(data ?? []).forEach((b: { material_id: string; on_hand: number }) => {
          map[b.material_id] = Number(b.on_hand)
        })
        setBalances(map)
      }
    }
    fetchBalances()
  }, [sourceContextId, sourceIsWarehouse])

  // Update available_balance on lines when balances change
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        available_balance: l.material_id ? (balances[l.material_id] ?? 0) : null,
      }))
    )
  }, [balances])

  // ============================================================================
  // Line management
  // ============================================================================
  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()])
  }, [])

  const removeLine = useCallback((id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l._id !== id) : prev))
  }, [])

  const duplicateLine = useCallback((id: string) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._id === id)
      if (idx < 0) return prev
      const dup = { ...prev[idx], _id: nextLineId() }
      const newLines = [...prev]
      newLines.splice(idx + 1, 0, dup)
      return newLines
    })
  }, [])

  const handleRowsChange = useCallback((newRows: MovementLineRow[]) => {
    // Auto-derive description/UOM/available when material_id changes
    setLines(newRows.map((nr) => {
      if (!nr.material_id) return nr
      const mat = materials.find((m) => m.id === nr.material_id)
      if (!mat) return nr
      return {
        ...nr,
        short_description: mat.short_description,
        uom: mat.uom,
        available_balance: balances[nr.material_id] ?? 0,
      }
    }))
  }, [materials, balances])

  // ============================================================================
  // Dirty state + unsaved changes guard
  // ============================================================================
  const isDirty = useMemo(() => {
    return Boolean(
      lines.some((l) => l.material_id && l.quantity) ||
      supplierId || sourceWarehouseId || sourceWorkOrderId ||
      destWarehouseId || destWorkOrderId || contractorId ||
      notes.trim() || adjustmentReason.trim()
    )
  }, [lines, supplierId, sourceWarehouseId, sourceWorkOrderId, destWarehouseId, destWorkOrderId, contractorId, notes, adjustmentReason])

  const { blocker } = useUnsavedChanges({ isDirty })

  // ============================================================================
  // Copy/paste
  // ============================================================================
  const pasteSchema: ClipboardColumnSchema[] = useMemo(() => [
    { key: 'material_id', required: true, transform: transformers.toString },
    { key: 'quantity', required: true, validate: validators.positiveNumber, transform: transformers.toNumber },
    { key: 'notes', transform: transformers.toNullIfEmpty },
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
      // Map material_id (could be item_number) to actual material id
      const newLines: MovementLineRow[] = result.rows.map((r) => {
        const itemNo = String(r.material_id ?? '')
        // Try to find by item_number first, then by id
        const mat = materials.find((m) => m.item_number.toLowerCase() === itemNo.toLowerCase()) ??
          materials.find((m) => m.id === itemNo)
        return {
          _id: nextLineId(),
          material_id: mat?.id ?? '',
          quantity: r.quantity as number,
          notes: (r.notes as string) ?? '',
          short_description: mat?.short_description ?? '',
          uom: mat?.uom ?? '',
          available_balance: mat ? (balances[mat.id] ?? 0) : null,
        }
      })
      // Replace empty lines or append
      setLines((prev) => {
        const hasData = prev.some((l) => l.material_id || l.quantity)
        return hasData ? [...prev, ...newLines] : newLines
      })
    } catch {
      setError(t('movements:new.clipboardReadFailed'))
    }
  }

  // ============================================================================
  // Keyboard shortcuts
  // ============================================================================
  useKeyboardShortcuts({
    onNew: addLine,
    onSave: () => handleSubmit(),
  }, [lines, movementType, movementDate, supplierId, sourceWarehouseId, sourceWorkOrderId, destWarehouseId, destWorkOrderId, contractorId, notes, adjustmentType, adjustmentReason])

  // ============================================================================
  // Material label for combobox editor in grid
  // ============================================================================
  const materialLabel = useCallback(
    (id: string) => {
      const mat = materials.find((m) => m.id === id)
      return mat ? `${mat.item_number} — ${mat.short_description}` : ''
    },
    [materials]
  )

  // ============================================================================
  // Column definitions for the line grid
  // ============================================================================
  const columns: readonly Column<MovementLineRow>[] = useMemo(() => [
    {
      key: 'material_id',
      name: t('movements:new.item'),
      width: 220,
      resizable: true,
      ...comboboxEditor<MovementLineRow>(materialItems, materialLabel),
    },
    {
      key: 'short_description',
      name: t('movements:new.description'),
      width: 280,
      resizable: true,
      renderCell: readOnlyCell<MovementLineRow>(),
    },
    {
      key: 'uom',
      name: t('movements:new.uom'),
      width: 70,
      renderCell: readOnlyCell<MovementLineRow>(),
    },
    {
      key: 'available_balance',
      name: t('movements:new.available'),
      width: 100,
      renderCell: ({ row }) => {
        if (row.available_balance == null) return <span className="text-gray-400">—</span>
        const isInsufficient = row.quantity != null && row.quantity > row.available_balance
        return (
          <span className={isInsufficient ? 'font-medium text-red-600' : 'text-gray-600'}>
            {row.available_balance.toLocaleString()}
          </span>
        )
      },
    },
    {
      key: 'quantity',
      name: t('movements:new.quantity'),
      width: 100,
      editable: true,
      renderEditCell: numberEditor<MovementLineRow>({ min: 0 }),
      renderCell: ({ row }) => (
        <span className={row.quantity != null ? 'font-medium' : 'text-gray-400'}>
          {row.quantity ?? '0'}
        </span>
      ),
    },
    {
      key: 'notes',
      name: t('movements:new.notes'),
      width: 220,
      editable: true,
      renderEditCell: textCellEditor<MovementLineRow>(),
      renderCell: readOnlyCell<MovementLineRow>(),
    },
    {
      key: '_actions',
      name: '',
      width: 80,
      sortable: false,
      resizable: false,
      renderCell: ({ row }) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); duplicateLine(row._id) }}
            className="text-gray-400 hover:text-gray-600"
            title={t('movements:new.duplicate')}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {lines.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); removeLine(row._id) }}
              className="text-gray-400 hover:text-red-600"
              title={t('movements:new.delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ], [materialItems, materialLabel, balances, lines.length, duplicateLine, removeLine])

  // ============================================================================
  // Reset contextual fields when type changes
  // ============================================================================
  const handleTypeChange = (type: MovementType) => {
    setMovementType(type)
    setSupplierId(''); setSourceWarehouseId(''); setSourceWorkOrderId('')
    setDestWarehouseId(''); setDestWorkOrderId(''); setContractorId('')
    setTransferSubType('wh_to_wh')
    setAdjustmentReason('')
  }

  // ============================================================================
  // Submit — atomic save via RPC
  // ============================================================================
  const handleSubmit = useCallback(async () => {
    setError(null)

    // Validate lines
    const validLines = lines.filter((l) => l.material_id && l.quantity && l.quantity > 0)
    if (validLines.length === 0) {
      setError(t('movements:new.materialRequired'))
      return
    }

    // Build header payload (NO company_id, responsible_user_id, movement_number — server derives)
    const header: Record<string, unknown> = {
      movement_date: movementDate,
      movement_type: movementType,
      notes: notes || null,
    }

    switch (movementType) {
      case 'RECEIPT':
        if (!supplierId || !destWarehouseId) { setError(t('movements:new.supplierAndDestRequired')); return }
        header.supplier_id = supplierId
        header.destination_warehouse_id = destWarehouseId
        break
      case 'ISSUE':
        if (!sourceWarehouseId || !destWorkOrderId) { setError(t('movements:new.sourceWhAndDestWoRequired')); return }
        header.source_warehouse_id = sourceWarehouseId
        header.destination_work_order_id = destWorkOrderId
        break
      case 'USAGE':
        if (!sourceWorkOrderId) { setError(t('movements:new.sourceWoRequired')); return }
        header.source_work_order_id = sourceWorkOrderId
        break
      case 'TRANSFER':
        if (transferSubType === 'wh_to_wh') {
          if (!sourceWarehouseId || !destWarehouseId) { setError(t('movements:new.sourceAndDestWhRequired')); return }
          header.source_warehouse_id = sourceWarehouseId
          header.destination_warehouse_id = destWarehouseId
        } else if (transferSubType === 'wo_to_wo') {
          if (!sourceWorkOrderId || !destWorkOrderId) { setError(t('movements:new.sourceAndDestWoRequired')); return }
          header.source_work_order_id = sourceWorkOrderId
          header.destination_work_order_id = destWorkOrderId
        } else {
          if (!sourceWorkOrderId || !contractorId) { setError(t('movements:new.sourceWoAndContractorRequired')); return }
          header.source_work_order_id = sourceWorkOrderId
          header.contractor_id = contractorId
        }
        break
      case 'RETURN':
        if (!destWarehouseId) { setError(t('movements:new.destWhRequired')); return }
        header.destination_warehouse_id = destWarehouseId
        if (sourceWorkOrderId) header.source_work_order_id = sourceWorkOrderId
        else if (contractorId) header.contractor_id = contractorId
        else { setError(t('movements:new.sourceWoOrContractorRequired')); return }
        break
      case 'ADJUSTMENT':
        if (!sourceWarehouseId || !adjustmentReason.trim()) { setError(t('movements:new.whAndReasonRequired')); return }
        header.source_warehouse_id = sourceWarehouseId
        header.adjustment_type = adjustmentType
        header.adjustment_reason = adjustmentReason.trim()
        break
    }

    // Client-side stock validation for ISSUE/USAGE/TRANSFER/RETURN
    if (['ISSUE', 'USAGE', 'TRANSFER', 'RETURN'].includes(movementType)) {
      for (const line of validLines) {
        const available = balances[line.material_id] ?? 0
        if (line.quantity! > available) {
          const mat = materials.find((m) => m.id === line.material_id)
          setError(t('movements:new.quantityExceedsAvailable', { quantity: line.quantity, item: mat?.item_number ?? 'item', available }))
          return
        }
      }
    }

    setSubmitting(true)
    try {
      const linePayload = validLines.map((l) => ({
        material_id: l.material_id,
        quantity: l.quantity,
        notes: l.notes || null,
      }))

      const { data, error: rpcError } = await supabase.rpc('create_movement_with_lines', {
        p_header: header,
        p_lines: linePayload,
      })

      if (rpcError) throw rpcError
      // Navigate to the new movement detail page
      navigate(`/movements/${data}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('movements:new.createFailed')
      setError(msg)
    }
    setSubmitting(false)
  }, [lines, movementType, movementDate, notes, supplierId, sourceWarehouseId, sourceWorkOrderId, destWarehouseId, destWorkOrderId, contractorId, transferSubType, adjustmentType, adjustmentReason, balances, materials, navigate])

  // ============================================================================
  // Derived context display
  // ============================================================================
  const contextWO = selectedSourceWO ?? selectedDestWO

  if (loading) return <LoadingSpinner />

  const filledLineCount = lines.filter(l => l.material_id).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Compact header bar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/movements')} className="text-gray-400 hover:text-gray-700" title={t('movements:detail.backToMovements')}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">{t('movements:new.title')}</h1>
          <DirtyBadge dirty={isDirty} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/movements')} className="btn btn-secondary btn-sm">{t('common:buttons.cancel')}</button>
          <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary btn-sm">
            <Save className="h-3.5 w-3.5" /> {submitting ? t('movements:new.saving') : t('movements:new.save')}
          </button>
        </div>
      </div>

      {/* ── Alerts ── */}
      {(error || pasteErrors) && (
        <div className="shrink-0 space-y-1 px-4 pt-2">
          {error && <Alert type="error" message={error} />}
          {pasteErrors && <Alert type="error" message={`${t('movements:new.pasteErrors')}:\n${pasteErrors}`} />}
        </div>
      )}

      {/* ── Compact movement header form ── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.movementType')}</label>
            <select
              value={movementType}
              onChange={(e) => handleTypeChange(e.target.value as MovementType)}
              className="input-compact"
            >
              <option value="RECEIPT">{t('common:movementTypes.RECEIPT')}</option>
              <option value="ISSUE">{t('common:movementTypes.ISSUE')}</option>
              <option value="USAGE">{t('common:movementTypes.USAGE')}</option>
              <option value="TRANSFER">{t('common:movementTypes.TRANSFER')}</option>
              <option value="RETURN">{t('common:movementTypes.RETURN')}</option>
              <option value="ADJUSTMENT">{t('common:movementTypes.ADJUSTMENT')}</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.movementDate')}</label>
            <input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} className="input-compact" required />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.movementNo')}</label>
            <div className="flex h-[34px] items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 text-xs text-gray-400">{t('movements:new.autoGenerated')}</div>
          </div>

          {movementType === 'RECEIPT' && (
            <>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.supplier')}</label>
                <SearchableCombobox items={supplierItems} value={supplierId} onChange={setSupplierId} placeholder={t('movements:new.selectContractor')} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.toWarehouse')}</label>
                <SearchableCombobox items={warehouseItems} value={destWarehouseId} onChange={setDestWarehouseId} placeholder={t('movements:new.selectWarehouse')} />
              </div>
            </>
          )}

          {movementType === 'ISSUE' && (
            <>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.fromWarehouse')}</label>
                <SearchableCombobox items={warehouseItems} value={sourceWarehouseId} onChange={setSourceWarehouseId} placeholder={t('movements:new.selectWarehouse')} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.workOrder')}</label>
                <SearchableCombobox items={workOrderItems} value={destWorkOrderId} onChange={setDestWorkOrderId} placeholder={t('movements:new.selectWorkOrder')} />
              </div>
            </>
          )}

          {movementType === 'USAGE' && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-3">
              <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.sourceWorkOrder')}</label>
              <SearchableCombobox items={workOrderItems} value={sourceWorkOrderId} onChange={setSourceWorkOrderId} placeholder={t('movements:new.selectWorkOrder')} />
            </div>
          )}

          {movementType === 'TRANSFER' && (
            <>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.transferType')}</label>
                <select value={transferSubType} onChange={(e) => {
                  setTransferSubType(e.target.value as typeof transferSubType)
                  setSourceWarehouseId(''); setSourceWorkOrderId(''); setDestWarehouseId(''); setDestWorkOrderId(''); setContractorId('')
                }} className="input-compact">
                  <option value="wh_to_wh">{t('movements:new.whToWh')}</option>
                  <option value="wo_to_wo">{t('movements:new.woToWo')}</option>
                  <option value="wo_to_contractor">{t('movements:new.woToContractor')}</option>
                </select>
              </div>
              {transferSubType === 'wh_to_wh' && (
                <>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.fromWarehouse')}</label>
                    <SearchableCombobox items={warehouseItems} value={sourceWarehouseId} onChange={setSourceWarehouseId} placeholder={t('movements:new.selectWarehouse')} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.toWarehouse')}</label>
                    <SearchableCombobox items={warehouseItems.filter((w) => w.id !== sourceWarehouseId)} value={destWarehouseId} onChange={setDestWarehouseId} placeholder={t('movements:new.selectWarehouse')} />
                  </div>
                </>
              )}
              {transferSubType === 'wo_to_wo' && (
                <>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.fromWorkOrder')}</label>
                    <SearchableCombobox items={workOrderItems} value={sourceWorkOrderId} onChange={setSourceWorkOrderId} placeholder={t('movements:new.selectWorkOrder')} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.toWorkOrder')}</label>
                    <SearchableCombobox items={workOrderItems.filter((w) => w.id !== sourceWorkOrderId)} value={destWorkOrderId} onChange={setDestWorkOrderId} placeholder={t('movements:new.selectWorkOrder')} />
                  </div>
                </>
              )}
              {transferSubType === 'wo_to_contractor' && (
                <>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.fromWorkOrder')}</label>
                    <SearchableCombobox items={workOrderItems} value={sourceWorkOrderId} onChange={setSourceWorkOrderId} placeholder={t('movements:new.selectWorkOrder')} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.contractor')}</label>
                    <SearchableCombobox items={contractorItems} value={contractorId} onChange={setContractorId} placeholder={t('movements:new.selectContractor')} />
                  </div>
                </>
              )}
            </>
          )}

          {movementType === 'RETURN' && (
            <>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.fromWorkOrder')}</label>
                <SearchableCombobox items={workOrderItems} value={sourceWorkOrderId} onChange={(id) => { setSourceWorkOrderId(id); if (id) setContractorId('') }} placeholder={t('movements:new.selectWorkOrder')} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.orFromContractor')}</label>
                <SearchableCombobox items={contractorItems} value={contractorId} onChange={(id) => { setContractorId(id); if (id) setSourceWorkOrderId('') }} placeholder={t('movements:new.selectContractor')} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.toWarehouse')}</label>
                <SearchableCombobox items={warehouseItems} value={destWarehouseId} onChange={setDestWarehouseId} placeholder={t('movements:new.selectWarehouse')} />
              </div>
            </>
          )}

          {movementType === 'ADJUSTMENT' && (
            <>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.warehouse')}</label>
                <SearchableCombobox items={warehouseItems} value={sourceWarehouseId} onChange={setSourceWarehouseId} placeholder={t('movements:new.selectWarehouse')} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.adjustment')}</label>
                <select value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value as 'increase' | 'decrease')} className="input-compact">
                  <option value="increase">{t('movements:new.increase')}</option>
                  <option value="decrease">{t('movements:new.decrease')}</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-3 lg:col-span-3">
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{t('movements:new.reason')}</label>
                <input value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} className="input-compact" placeholder={t('movements:new.reasonPlaceholder')} required />
              </div>
            </>
          )}
        </div>

        {/* Context inheritance — compact inline */}
        {contextWO && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-gray-50 px-3 py-1.5 text-xs">
            <span className="font-medium text-gray-400">{t('movements:new.woContext')}:</span>
            <span><span className="text-gray-400">{t('movements:new.project')}</span> <span className="font-medium text-gray-700">{contextWO.project_name}</span></span>
            <span><span className="text-gray-400">{t('movements:new.location')}</span> <span className="font-medium text-gray-700">{contextWO.work_location_name}</span></span>
            <span><span className="text-gray-400">{t('movements:new.site')}</span> <span className="font-medium text-gray-700">{contextWO.site_code ?? '—'}</span></span>
            <span><span className="text-gray-400">{t('movements:new.supervisor')}</span> <span className="font-medium text-gray-700">{contextWO.supervisor}</span></span>
            {contextWO.contractor_name && (
              <span><span className="text-gray-400">{t('movements:new.contractor')}</span> <span className="font-medium text-gray-700">{contextWO.contractor_name}</span></span>
            )}
          </div>
        )}

        {/* Notes — compact inline */}
        <div className="mt-2 flex items-center gap-2">
          <label className="whitespace-nowrap text-xs font-medium text-gray-500">{t('movements:new.notes')}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-compact" placeholder={t('movements:new.notesPlaceholder')} />
        </div>
      </div>

      {/* ── Material Lines — primary content, fills remaining viewport ── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">{t('movements:new.lines')}</h2>
            <span className="text-xs text-gray-400">{t('movements:new.lineCount', { filled: filledLineCount, total: lines.length })}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePaste} className="btn btn-secondary btn-sm" title={t('movements:new.pasteFromExcel')}>
              <ClipboardPaste className="h-3 w-3" /> {t('movements:new.paste')}
            </button>
            <button onClick={addLine} className="btn btn-secondary btn-sm" title={t('movements:new.addLineShortcut')}>
              <Plus className="h-3 w-3" /> {t('movements:new.addLine')}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-white">
          <Datasheet<MovementLineRow>
            columns={columns}
            rows={lines}
            onRowsChange={handleRowsChange}
            rowKeyGetter={(row) => row._id}
            emptyMessage={t('movements:new.emptyLines')}
            rowHeight={36}
            className="h-full"
          />
        </div>
      </div>

      {/* Unsaved changes blocker dialog */}
      {blocker?.state === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => blocker.reset?.()}>
          <div className="rounded-xl bg-white p-6 shadow-xl max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">{t('movements:new.unsavedChanges')}</h3>
            <p className="text-sm text-gray-600 mb-4">{t('movements:new.unsavedChangesMessage')}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => blocker.reset?.()} className="btn btn-secondary">{t('movements:new.stay')}</button>
              <button onClick={() => blocker.proceed()} className="btn btn-danger">{t('movements:new.leave')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
