import { type ReactNode, useEffect, useState } from 'react'
import { X, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFeature } from '@/lib/entitlements'

// ============================================================================
// Modal
// ============================================================================
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  if (!open) return null

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={cn('w-full rounded-xl bg-white shadow-xl', sizeClass)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

// ============================================================================
// PageHeader
// ============================================================================
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ============================================================================
// ConfirmDialog
// ============================================================================
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-gray-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn btn-secondary">
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm()
            onClose()
          }}
          className={danger ? 'btn btn-danger' : 'btn btn-primary'}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================================
// LoadingSpinner
// ============================================================================
export function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-gray-500">{message}</div>
    </div>
  )
}

// ============================================================================
// EmptyState
// ============================================================================
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-gray-500 mb-4">{message}</p>
      {action}
    </div>
  )
}

// ============================================================================
// SearchInput
// ============================================================================
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input max-w-xs"
    />
  )
}

// ============================================================================
// Toggle (active/inactive)
// ============================================================================
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'badge badge-green' : 'badge badge-gray'}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ============================================================================
// Alert
// ============================================================================
export function Alert({ type, message }: { type: 'error' | 'success' | 'info'; message: string }) {
  const styles = {
    error: 'bg-red-50 text-red-700',
    success: 'bg-green-50 text-green-700',
    info: 'bg-blue-50 text-blue-700',
  }
  return <div className={cn('rounded-lg p-3 text-sm', styles[type])}>{message}</div>
}

// ============================================================================
// useAsyncData hook
// ============================================================================
export function useAsyncData<T>(
  fetcher: () => Promise<{ data: T[] | null; error: { message: string } | null }>,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setData([])
        } else {
          setData(data ?? [])
          setError(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, refresh: () => setLoading(true) }
}

// ============================================================================
// LockedState — shown when a subscription feature is not available
// ============================================================================
export function LockedState({ feature, message }: { feature: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
      <Lock className="h-8 w-8 text-gray-400 mb-3" />
      <p className="text-sm font-medium text-gray-700">
        {message ?? 'This feature is not available on your current plan'}
      </p>
      <p className="text-xs text-gray-400 mt-1">Feature: {feature}</p>
    </div>
  )
}

// ============================================================================
// FeatureGate — conditionally render children based on subscription feature
// ============================================================================
export function FeatureGate({
  feature,
  fallback,
  children,
}: {
  feature: string
  fallback?: ReactNode
  children: ReactNode
}) {
  const enabled = useFeature(feature)
  if (!enabled) {
    return <>{fallback ?? <LockedState feature={feature} />}</>
  }
  return <>{children}</>
}

// ============================================================================
// DirtyBadge — indicates unsaved changes
// ============================================================================
export function DirtyBadge({ dirty }: { dirty: boolean }) {
  if (!dirty) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      Unsaved changes
    </span>
  )
}

// ============================================================================
// SideDrawer — right-side slide-over panel
// ============================================================================
export function SideDrawer({
  open,
  onClose,
  children,
  title,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  width?: 'md' | 'lg' | 'xl'
}) {
  if (!open) return null

  const widthClass = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }[width]

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className={cn(
          'relative h-full w-full overflow-y-auto bg-white shadow-xl transition-transform',
          widthClass
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
