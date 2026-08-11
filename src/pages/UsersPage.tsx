import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { PageHeader, Modal, ConfirmDialog, LoadingSpinner, Alert, SideDrawer, DirtyBadge } from '@/components/ui'
import { Plus, Save, Trash2, X } from 'lucide-react'
import { Datasheet, checkboxCell, readOnlyCell } from '@/components/grid/Datasheet'
import { MobileCardList } from '@/components/grid/MobileCardList'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { formatDate } from '@/lib/utils'
import type { Column, RenderEditCellProps, RenderCellProps } from 'react-data-grid'
import type { UserProfile, UserRole, Project, WorkLocation, Warehouse, WorkOrder, UserScopeAssignment } from '@/types'

const roleLabels: Record<UserRole, string> = {
  company_admin: 'Company Admin',
  warehouse_man: 'Warehouse Man',
  inspector: 'Inspector',
  project_control: 'Project Control',
  project_manager: 'Project Manager',
}

const ROLE_OPTIONS = Object.entries(roleLabels).map(([value, label]) => ({ value, label }))

// ----------------------------------------------------------------------------
// SelectCellEditor — for role column
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

function badgeCell<R>(options: { value: string; label: string }[]) {
  function renderCell({ row, column }: RenderCellProps<R>) {
    const value = String((row as Record<string, unknown>)[column.key] ?? '')
    const opt = options.find((o) => o.value === value)
    return <span className="badge badge-blue">{opt?.label ?? value}</span>
  }
  return renderCell
}

interface UserRow extends UserProfile {
  _dirty?: boolean
}

export function UsersPage() {
  const { profile } = useAuth()
  const { info: subInfo } = useSubscription()
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // Create User modal (controlled — calls Edge Function)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', role: 'warehouse_man' as UserRole })

  // SideDrawer for user detail + scope management
  const [drawerUser, setDrawerUser] = useState<UserProfile | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scopes, setScopes] = useState<UserScopeAssignment[]>([])
  const [scopeProjects, setScopeProjects] = useState<Project[]>([])
  const [scopeLocations, setScopeLocations] = useState<WorkLocation[]>([])
  const [scopeWarehouses, setScopeWarehouses] = useState<Warehouse[]>([])
  const [scopeWorkOrders, setScopeWorkOrders] = useState<WorkOrder[]>([])
  const [scopeType, setScopeType] = useState<'project' | 'work_location' | 'warehouse' | 'work_order'>('warehouse')
  const [scopeEntityId, setScopeEntityId] = useState('')
  const [scopeError, setScopeError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase.from('user_profiles').select('*').order('full_name')
    setRows((data ?? []) as UserRow[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const dirtyRowIds = useMemo(() => {
    const ids = new Set<string>()
    rows.forEach((r) => { if (r._dirty) ids.add(r.id) })
    return ids
  }, [rows])

  const isDirty = dirtyRowIds.size > 0

  const rowKeyGetter = useCallback((row: UserRow) => row.id, [])

  // ============================================================================
  // Save all dirty rows (inline role/status edits)
  // ============================================================================
  const saveAll = useCallback(async () => {
    const dirtyRows = rows.filter((r) => r._dirty)
    if (dirtyRows.length === 0) return
    setError(null)
    let allOk = true
    for (const row of dirtyRows) {
      const { error: err } = await supabase
        .from('user_profiles')
        .update({ role: row.role, is_active: row.is_active })
        .eq('id', row.id)
      if (err) { setError(err.message); allOk = false; break }
    }
    if (allOk) {
      setRows((prev) => prev.map((r) => ({ ...r, _dirty: false })))
      setSuccess(`${dirtyRows.length} user(s) updated`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [rows])

  const handleRowsChange = useCallback((newRows: UserRow[]) => {
    setRows((prev) => {
      return newRows.map((nr) => {
        const prevRow = prev.find((pr) => pr.id === nr.id)
        if (prevRow && JSON.stringify(stripFlags(prevRow)) !== JSON.stringify(stripFlags(nr))) {
          return { ...nr, _dirty: true }
        }
        return nr
      })
    })
  }, [])

  // ============================================================================
  // Create User (RPC — replaces Edge Function to avoid CORS issues)
  // ============================================================================
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setCreating(true)

    try {
      const { data, error: rpcError } = await supabase.rpc('create_company_user', {
        p_email: createForm.email,
        p_full_name: createForm.full_name,
        p_role: createForm.role,
      })

      if (rpcError) throw new Error(rpcError.message)

      const result = data as { success: boolean; user_id: string; error: string | null }
      if (!result.success) throw new Error(result.error || 'Failed to create user')

      // Send password setup email via Supabase Auth (client-side, no CORS issue)
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        createForm.email,
        { redirectTo: `${window.location.origin}/` }
      )

      if (resetErr) {
        // User was created but email failed — still report success with a note
        setSuccess(`User created. Password setup email could not be sent (${resetErr.message}). Please ask the user to use "Forgot Password".`)
      } else {
        setSuccess(`User created. Password setup email sent to ${createForm.email}.`)
      }
      setCreateModalOpen(false)
      setCreateForm({ full_name: '', email: '', role: 'warehouse_man' })
      fetchData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create user'
      setError(msg)
    }
    setCreating(false)
  }

  // ============================================================================
  // Delete user
  // ============================================================================
  const handleDelete = async () => {
    if (!deleteId) return
    await supabase.from('user_profiles').delete().eq('id', deleteId)
    setDeleteId(null)
    fetchData()
  }

  // ============================================================================
  // Open drawer for user detail + scopes
  // ============================================================================
  const openDrawer = async (user: UserProfile) => {
    setDrawerUser(user)
    setDrawerOpen(true)
    setScopeError(null)
    const [sc, pr, wl, wh, wo] = await Promise.all([
      supabase.from('user_scope_assignments').select('*').eq('user_id', user.id),
      supabase.from('projects').select('*').eq('is_active', true).order('name'),
      supabase.from('work_locations').select('*').eq('is_active', true).order('name'),
      supabase.from('warehouses').select('*').eq('is_active', true).order('name'),
      supabase.from('work_orders').select('*').eq('status', 'active').order('work_order_number'),
    ])
    setScopes((sc.data ?? []) as UserScopeAssignment[])
    setScopeProjects((pr.data ?? []) as unknown as Project[])
    setScopeLocations((wl.data ?? []) as unknown as WorkLocation[])
    setScopeWarehouses((wh.data ?? []) as unknown as Warehouse[])
    setScopeWorkOrders((wo.data ?? []) as unknown as WorkOrder[])
  }

  const handleAddScope = async () => {
    if (!drawerUser || !scopeEntityId) return
    setScopeError(null)
    const payload: Record<string, unknown> = {
      user_id: drawerUser.id,
      [`${scopeType}_id`]: scopeEntityId,
    }
    const { error: err } = await supabase.from('user_scope_assignments').insert(payload)
    if (err) { setScopeError(err.message); return }
    // Refresh scopes
    const { data } = await supabase.from('user_scope_assignments').select('*').eq('user_id', drawerUser.id)
    setScopes((data ?? []) as UserScopeAssignment[])
    setScopeEntityId('')
  }

  const handleDeleteScope = async (scopeId: string) => {
    await supabase.from('user_scope_assignments').delete().eq('id', scopeId)
    if (drawerUser) {
      const { data } = await supabase.from('user_scope_assignments').select('*').eq('user_id', drawerUser.id)
      setScopes((data ?? []) as UserScopeAssignment[])
    }
  }

  const scopeLabel = (scope: UserScopeAssignment): string => {
    if (scope.warehouse_id) {
      const w = scopeWarehouses.find((x) => x.id === scope.warehouse_id)
      return w ? `Warehouse: ${w.code} — ${w.name}` : 'Warehouse (deleted)'
    }
    if (scope.work_order_id) {
      const wo = scopeWorkOrders.find((x) => x.id === scope.work_order_id)
      return wo ? `Work Order: ${wo.work_order_number}` : 'Work Order (deleted)'
    }
    if (scope.project_id) {
      const p = scopeProjects.find((x) => x.id === scope.project_id)
      return p ? `Project: ${p.code} — ${p.name}` : 'Project (deleted)'
    }
    if (scope.work_location_id) {
      const l = scopeLocations.find((x) => x.id === scope.work_location_id)
      return l ? `Location: ${l.code} — ${l.name}` : 'Location (deleted)'
    }
    return 'Unknown scope'
  }

  const activeCount = rows.filter((u) => u.is_active).length
  const maxUsers = subInfo?.max_users ?? 0
  const canAddUser = activeCount < maxUsers

  // ============================================================================
  // Keyboard shortcuts — Ctrl+N opens Create User modal
  // ============================================================================
  useKeyboardShortcuts({
    onNew: () => {
      if (profile?.role === 'company_admin' && canAddUser) {
        setCreateModalOpen(true)
      }
    },
    onSave: saveAll,
    onCancel: () => { if (isDirty) fetchData() },
  }, [isDirty, rows, saveAll, profile, canAddUser])

  const columns: readonly Column<UserRow>[] = useMemo(() => [
    {
      key: 'full_name', name: 'Name', width: 200, resizable: true,
      renderCell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); openDrawer(row) }}
          className="text-left font-medium text-brand-600 hover:underline"
        >
          {row.full_name}
        </button>
      ),
    },
    { key: 'email', name: 'Email', width: 260, resizable: true, renderCell: readOnlyCell<UserRow>() },
    { key: 'role', name: 'Role', width: 150, editable: true, renderEditCell: selectEditor<UserRow>(ROLE_OPTIONS), renderCell: badgeCell<UserRow>(ROLE_OPTIONS) },
    { key: 'is_active', name: 'Active', width: 70, renderCell: checkboxCell<UserRow>() },
    { key: 'created_at', name: 'Created', width: 120, renderCell: readOnlyCell<UserRow>((v) => formatDate(v as string)) },
    {
      key: '_actions', name: '', width: 50, sortable: false, resizable: false,
      renderCell: ({ row }) => (
        row.id !== profile?.id ? (
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="text-gray-400 hover:text-red-600"
            title="Delete user"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null
      ),
    },
  ], [profile])

  if (loading) return <LoadingSpinner />

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Users"
        subtitle="Manage users and roles — inline editing, Ctrl+N for new user, click name for scopes"
        action={
          profile?.role === 'company_admin' && (
            <button
              onClick={() => setCreateModalOpen(true)}
              disabled={!canAddUser}
              className="btn btn-primary"
              title={!canAddUser ? `User limit reached (${activeCount}/${maxUsers})` : 'Add user (Ctrl+N)'}
            >
              <Plus className="h-4 w-4" /> Add User
            </button>
          )
        }
      />

      {/* Subscription info banner */}
      {subInfo && (
        <div className="card p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm text-gray-500">Plan</span>
              <p className="font-semibold">{subInfo.plan_name}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Users</span>
              <p className="font-semibold">
                {activeCount} / {maxUsers}
                {activeCount >= maxUsers && <span className="text-red-600 ml-1">Limit reached</span>}
              </p>
            </div>
            {subInfo.status === 'trial' && subInfo.trial_ends_at && (
              <div>
                <span className="text-sm text-gray-500">Trial ends</span>
                <p className="font-semibold">{formatDate(subInfo.trial_ends_at)}</p>
              </div>
            )}
          </div>
          <span className={`badge ${
            subInfo.status === 'trial' ? 'badge-blue' :
            subInfo.status === 'active' ? 'badge-green' :
            'badge-gray'
          }`}>
            {subInfo.status}
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <button onClick={saveAll} disabled={!isDirty} className="btn btn-primary" title="Save all changes (Ctrl+S)">
          <Save className="h-4 w-4" /> Save All
        </button>
        <DirtyBadge dirty={isDirty} />
      </div>

      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}
      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div ref={gridContainerRef} className="card flex-1 overflow-hidden p-0 hidden lg:block">
        <Datasheet<UserRow>
          columns={columns}
          rows={rows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={rowKeyGetter}
          dirtyRowIds={dirtyRowIds}
          emptyMessage="No users found. Click Add User to create one."
          rowHeight={38}
        />
      </div>

      <div className="lg:hidden">
        <MobileCardList
          rows={rows as unknown as Record<string, unknown>[]}
          titleKey="full_name"
          subtitleKey="email"
          fields={[
            { key: 'role', label: 'Role', badge: true },
            { key: 'is_active', label: 'Active', format: (v) => (v ? 'Yes' : 'No') },
          ]}
          actionLabel="Manage Scopes"
          onAction={(row) => openDrawer(row as unknown as UserProfile)}
          emptyMessage="No users found. Click Add User to create one."
        />
      </div>

      {/* Create User Modal (controlled — Edge Function) */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Add User">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} className="input" required autoFocus />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="label">Role</label>
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })} className="input">
              {Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            A temporary password will be generated and a password setup email will be sent to the user.
          </p>
          {error && <Alert type="error" message={error} />}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCreateModalOpen(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* User Detail + Scope SideDrawer */}
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={drawerUser?.full_name} width="lg">
        {drawerUser && (
          <div className="space-y-6">
            {/* User info */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">User Details</h3>
              <div className="card p-4 space-y-2">
                <div className="flex justify-between"><span className="text-sm text-gray-500">Email</span><span className="text-sm font-medium">{drawerUser.email}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-500">Role</span><span className="badge badge-blue">{roleLabels[drawerUser.role]}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-500">Status</span><span className="text-sm font-medium">{drawerUser.is_active ? 'Active' : 'Inactive'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-500">Created</span><span className="text-sm font-medium">{formatDate(drawerUser.created_at)}</span></div>
              </div>
            </div>

            {/* Scope management */}
            {drawerUser.role !== 'company_admin' && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-500">Scope Assignments</h3>
                <p className="text-xs text-gray-400">Control which data this user can access.</p>

                {/* Add scope form */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Scope Type</label>
                    <select value={scopeType} onChange={(e) => { setScopeType(e.target.value as typeof scopeType); setScopeEntityId('') }} className="input">
                      <option value="warehouse">Warehouse</option>
                      <option value="work_order">Work Order</option>
                      <option value="project">Project</option>
                      <option value="work_location">Work Location</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Entity</label>
                    <select value={scopeEntityId} onChange={(e) => setScopeEntityId(e.target.value)} className="input">
                      <option value="">Select...</option>
                      {scopeType === 'warehouse' && scopeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                      {scopeType === 'work_order' && scopeWorkOrders.map((w) => <option key={w.id} value={w.id}>{w.work_order_number}</option>)}
                      {scopeType === 'project' && scopeProjects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                      {scopeType === 'work_location' && scopeLocations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={handleAddScope} disabled={!scopeEntityId} className="btn btn-primary btn-sm">
                  <Plus className="h-3 w-3" /> Add Scope
                </button>
                {scopeError && <Alert type="error" message={scopeError} />}

                {/* Existing scopes */}
                <div className="space-y-2">
                  {scopes.length === 0 ? (
                    <p className="text-sm text-gray-400">No scope assignments yet.</p>
                  ) : (
                    scopes.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                        <span className="text-sm">{scopeLabel(s)}</span>
                        <button onClick={() => handleDeleteScope(s.id)} className="text-gray-400 hover:text-red-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </SideDrawer>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message="Are you sure? This will remove the user and all their scope assignments."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

function stripFlags(row: UserRow): Record<string, unknown> {
  const { _dirty, ...rest } = row
  void _dirty
  return rest as Record<string, unknown>
}
