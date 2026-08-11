import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, Modal, ConfirmDialog, LoadingSpinner, Alert, DirtyBadge } from '@/components/ui'
import { Plus, Save, Trash2, Search } from 'lucide-react'
import { BoqGrid } from '@/components/grid/BoqGrid'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { cn } from '@/lib/utils'
import type { WorkOrder, WorkOrderStatus, Project, WorkLocation, Contractor, Material } from '@/types'

const statusColors: Record<string, string> = {
  active: 'badge-green',
  completed: 'badge-blue',
  cancelled: 'badge-red',
  on_hold: 'badge-yellow',
}

const STATUS_OPTIONS: { value: WorkOrderStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface WorkOrderRow extends WorkOrder {
  _dirty?: boolean
}

export function WorkOrdersPage() {
  const [rows, setRows] = useState<WorkOrderRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [locations, setLocations] = useState<WorkLocation[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [boqDirty, setBoqDirty] = useState(false)

  // Selected WO for detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Create WO modal (immutable fields only)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    work_order_number: '', site_code: '', project_id: '', work_location_id: '',
    supervisor: '', contractor_id: '', start_date: '', end_date: '',
  })

  const listRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    setLoading(true)
    const [wo, pr, wl, con, mat] = await Promise.all([
      supabase.from('work_orders').select('*, projects!inner(name, code), work_locations!inner(name, code), contractors(name)').order('work_order_number'),
      supabase.from('projects').select('*').eq('is_active', true).order('name'),
      supabase.from('work_locations').select('*').eq('is_active', true).order('name'),
      supabase.from('contractors').select('*').eq('is_active', true).order('name'),
      supabase.from('materials').select('*').eq('is_active', true).order('item_number'),
    ])
    setRows((wo.data ?? []) as WorkOrderRow[])
    setProjects((pr.data ?? []) as Project[])
    setLocations((wl.data ?? []) as WorkLocation[])
    setContractors((con.data ?? []) as Contractor[])
    setMaterials((mat.data ?? []) as unknown as Material[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Auto-select first WO if none selected
  useEffect(() => {
    if (!selectedId && rows.length > 0) {
      setSelectedId(rows[0].id)
    }
  }, [rows, selectedId])

  const selectedWo = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  const dirtyRowIds = useMemo(() => {
    const ids = new Set<string>()
    rows.forEach((r) => { if (r._dirty) ids.add(r.id) })
    return ids
  }, [rows])

  const isHeaderDirty = dirtyRowIds.size > 0
  const isDirty = isHeaderDirty || boqDirty

  useUnsavedChanges({ isDirty })

  // ============================================================================
  // Save header changes (inline edits to supervisor, status, dates, contractor)
  // ============================================================================
  const saveHeader = useCallback(async () => {
    const dirtyRows = rows.filter((r) => r._dirty)
    if (dirtyRows.length === 0) return
    setError(null)
    let allOk = true
    for (const row of dirtyRows) {
      const payload = {
        supervisor: row.supervisor,
        status: row.status,
        contractor_id: row.contractor_id || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
      }
      const { error: err } = await supabase.from('work_orders').update(payload).eq('id', row.id)
      if (err) { setError(err.message); allOk = false; break }
    }
    if (allOk) {
      setRows((prev) => prev.map((r) => ({ ...r, _dirty: false })))
      setSuccess(`${dirtyRows.length} work order(s) updated`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [rows])

  // ============================================================================
  // Handle header field changes
  // ============================================================================
  const handleHeaderFieldChange = useCallback((field: keyof WorkOrder, value: unknown) => {
    if (!selectedId) return
    setRows((prev) => prev.map((r) => {
      if (r.id !== selectedId) return r
      const updated = { ...r, [field]: value }
      // Check if actually changed
      const prevRow = prev.find((p) => p.id === selectedId)
      if (prevRow && prevRow[field] === value) return r
      return { ...updated, _dirty: true }
    }))
  }, [selectedId])

  // ============================================================================
  // Create new WO (modal for immutable fields)
  // ============================================================================
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!createForm.work_order_number.trim()) { setError('WO Number is required'); return }
    if (!createForm.project_id) { setError('Project is required'); return }
    if (!createForm.work_location_id) { setError('Work Location is required'); return }
    if (!createForm.supervisor.trim()) { setError('Supervisor is required'); return }

    const payload = {
      work_order_number: createForm.work_order_number.trim(),
      site_code: createForm.site_code || null,
      project_id: createForm.project_id,
      work_location_id: createForm.work_location_id,
      supervisor: createForm.supervisor.trim(),
      contractor_id: createForm.contractor_id || null,
      status: 'active' as WorkOrderStatus,
      start_date: createForm.start_date || null,
      end_date: createForm.end_date || null,
    }
    const { data, error: err } = await supabase.from('work_orders').insert(payload).select('*').single()
    if (err) { setError(err.message); return }
    setCreateModalOpen(false)
    setCreateForm({ work_order_number: '', site_code: '', project_id: '', work_location_id: '', supervisor: '', contractor_id: '', start_date: '', end_date: '' })
    fetchData()
    // Select the new WO
    if (data) setSelectedId((data as WorkOrder).id)
  }

  // ============================================================================
  // Delete WO
  // ============================================================================
  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('work_orders').delete().eq('id', deleteId)
    if (selectedId === deleteId) setSelectedId(null)
    setDeleteId(null)
    fetchData()
  }

  // ============================================================================
  // Keyboard shortcuts
  // ============================================================================
  useKeyboardShortcuts({
    onNew: () => setCreateModalOpen(true),
    onSave: saveHeader,
    onCancel: () => { if (isDirty) fetchData() },
  }, [isDirty, rows, saveHeader])

  const filteredRows = useMemo(() => {
    let result = rows
    if (projectFilter) {
      result = result.filter((r) => r.project_id === projectFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.work_order_number.toLowerCase().includes(q) ||
          (r.site_code ?? '').toLowerCase().includes(q) ||
          (r.project_name ?? '').toLowerCase().includes(q) ||
          (r.work_location_name ?? '').toLowerCase().includes(q)
      )
    }
    return result
  }, [rows, search, projectFilter])

  if (loading) return <LoadingSpinner />

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Work Orders"
        subtitle="Master-detail — select a WO to edit header + BOQ. Ctrl+N for new, Ctrl+S to save."
        action={<button onClick={() => setCreateModalOpen(true)} className="btn btn-primary"><Plus className="h-4 w-4" /> Add Work Order</button>}
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left: WO List */}
        <div className="w-80 flex-shrink-0 flex flex-col">
          <div className="mb-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work orders..."
              className="input pl-10"
            />
          </div>
          <div className="mb-3">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="input"
            >
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div ref={listRef} className="card flex-1 overflow-y-auto p-0">
            {filteredRows.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">No work orders found</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredRows.map((wo) => (
                  <li key={wo.id}>
                    <button
                      onClick={() => setSelectedId(wo.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors',
                        selectedId === wo.id && 'bg-brand-50 border-l-4 border-brand-600'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{wo.work_order_number}</span>
                        <span className={cn('badge text-xs', statusColors[wo.status])}>{wo.status.replace('_', ' ')}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{wo.project_name}</div>
                      <div className="text-xs text-gray-400">{wo.work_location_name}</div>
                      {wo._dirty && <DirtyBadge dirty />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="flex-1 overflow-y-auto">
          {selectedWo ? (
            <div className="space-y-6">
              {/* Header card with inline-editable fields */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedWo.work_order_number}</h2>
                    <p className="text-sm text-gray-500">{selectedWo.project_name} — {selectedWo.work_location_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={saveHeader} disabled={!isHeaderDirty} className="btn btn-primary btn-sm" title="Save header (Ctrl+S)">
                      <Save className="h-3 w-3" /> Save Header
                    </button>
                    <button onClick={() => setDeleteId(selectedWo.id)} className="btn btn-danger btn-sm" title="Delete WO">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  {/* Immutable fields (read-only) */}
                  <div>
                    <label className="label">WO Number</label>
                    <p className="text-sm font-medium">{selectedWo.work_order_number}</p>
                  </div>
                  <div>
                    <label className="label">Site Code</label>
                    <p className="text-sm font-medium">{selectedWo.site_code ?? '—'}</p>
                  </div>
                  <div>
                    <label className="label">Project</label>
                    <p className="text-sm font-medium">{selectedWo.project_name}</p>
                  </div>
                  <div>
                    <label className="label">Work Location</label>
                    <p className="text-sm font-medium">{selectedWo.work_location_name}</p>
                  </div>

                  {/* Editable fields */}
                  <div>
                    <label className="label">Supervisor</label>
                    <input
                      type="text"
                      value={selectedWo.supervisor}
                      onChange={(e) => handleHeaderFieldChange('supervisor', e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Contractor</label>
                    <select
                      value={selectedWo.contractor_id ?? ''}
                      onChange={(e) => handleHeaderFieldChange('contractor_id', e.target.value || null)}
                      className="input"
                    >
                      <option value="">No contractor</option>
                      {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select
                      value={selectedWo.status}
                      onChange={(e) => handleHeaderFieldChange('status', e.target.value as WorkOrderStatus)}
                      className="input"
                    >
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Start Date</label>
                    <input
                      type="date"
                      value={selectedWo.start_date ?? ''}
                      onChange={(e) => handleHeaderFieldChange('start_date', e.target.value || null)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">End Date</label>
                    <input
                      type="date"
                      value={selectedWo.end_date ?? ''}
                      onChange={(e) => handleHeaderFieldChange('end_date', e.target.value || null)}
                      className="input"
                    />
                  </div>
                </div>

                {isHeaderDirty && <div className="mt-3"><DirtyBadge dirty /></div>}
              </div>

              {/* BOQ Grid */}
              <div className="card p-6">
                <BoqGrid
                  workOrderId={selectedWo.id}
                  materials={materials}
                  onDirtyChange={setBoqDirty}
                />
              </div>
            </div>
          ) : (
            <div className="card flex h-full items-center justify-center">
              <p className="text-gray-500">Select a work order from the list, or create a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create WO Modal (immutable fields) */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Add Work Order" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">WO Number</label>
              <input value={createForm.work_order_number} onChange={(e) => setCreateForm({ ...createForm, work_order_number: e.target.value })} className="input" required autoFocus />
            </div>
            <div>
              <label className="label">Site Code</label>
              <input value={createForm.site_code} onChange={(e) => setCreateForm({ ...createForm, site_code: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Project</label>
              <select value={createForm.project_id} onChange={(e) => setCreateForm({ ...createForm, project_id: e.target.value })} className="input" required>
                <option value="">Select project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Work Location</label>
              <select value={createForm.work_location_id} onChange={(e) => setCreateForm({ ...createForm, work_location_id: e.target.value })} className="input" required>
                <option value="">Select location...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supervisor</label>
              <input value={createForm.supervisor} onChange={(e) => setCreateForm({ ...createForm, supervisor: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="label">Contractor</label>
              <select value={createForm.contractor_id} onChange={(e) => setCreateForm({ ...createForm, contractor_id: e.target.value })} className="input">
                <option value="">No contractor</option>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input type="date" value={createForm.start_date} onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" value={createForm.end_date} onChange={(e) => setCreateForm({ ...createForm, end_date: e.target.value })} className="input" />
            </div>
          </div>
          {error && <Alert type="error" message={error} />}
          <p className="text-xs text-gray-500">Status defaults to "Active". You can change it later from the detail panel.</p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCreateModalOpen(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Work Order"
        message="Are you sure? This will also delete associated BOQ items."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
