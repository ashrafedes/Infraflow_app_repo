import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// ============================================================================
// MobileCardList — responsive fallback for react-data-grid on small screens
// ----------------------------------------------------------------------------
// react-data-grid is desktop-first and doesn't render well below the lg
// breakpoint. This component renders a card-list layout for mobile/tablet,
// showing the most critical fields per row. It's shown below lg and the
// Datasheet is hidden; above lg the Datasheet is shown and this is hidden.
//
// Usage:
//   <div className="hidden lg:block"><Datasheet ... /></div>
//   <div className="lg:hidden"><MobileCardList ... /></div>
// ============================================================================

export interface MobileCardField {
  key: string
  label: string
  // Optional formatter function
  format?: (value: unknown, row: Record<string, unknown>) => string
  // Show as badge
  badge?: boolean
  // Highlight in red if value is falsy/zero
  redIfZero?: boolean
}

interface MobileCardListProps {
  rows: Record<string, unknown>[]
  fields: MobileCardField[]
  // Optional title field (shown as the card header)
  titleKey?: string
  // Optional subtitle field (shown below title)
  subtitleKey?: string
  // Optional action button per row
  actionLabel?: string
  onAction?: (row: Record<string, unknown>) => void
  emptyMessage?: string
  // Key getter for React
  rowKey?: string | ((row: Record<string, unknown>) => string)
}

export function MobileCardList({
  rows,
  fields,
  titleKey,
  subtitleKey,
  actionLabel,
  onAction,
  emptyMessage,
  rowKey = 'id',
}: MobileCardListProps) {
  const { t } = useTranslation()
  const emptyMsg = emptyMessage ?? t('common:messages.noData')
  if (rows.length === 0) {
    return <div className="p-4 text-center text-sm text-gray-500">{emptyMsg}</div>
  }

  const getKey = (row: Record<string, unknown>): string => {
    if (typeof rowKey === 'function') return rowKey(row)
    return String(row[rowKey] ?? '')
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={getKey(row)} className="card p-4">
          {titleKey && (
            <div className="mb-2">
              <p className="font-medium text-sm">{String(row[titleKey] ?? '—')}</p>
              {subtitleKey && (
                <p className="text-xs text-gray-500">{String(row[subtitleKey] ?? '')}</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {fields.map((field) => {
              const value = row[field.key]
              const formatted = field.format ? field.format(value, row) : String(value ?? '—')
              const isRed = field.redIfZero && (!value || Number(value) <= 0)
              return (
                <div key={field.key}>
                  <p className="text-xs text-gray-400">{field.label}</p>
                  {field.badge ? (
                    <span className="badge badge-blue text-xs mt-0.5">{formatted}</span>
                  ) : (
                    <p className={cn('text-sm font-medium mt-0.5', isRed && 'text-red-600')}>{formatted}</p>
                  )}
                </div>
              )
            })}
          </div>
          {actionLabel && onAction && (
            <button
              onClick={() => onAction(row)}
              className="btn btn-secondary btn-sm mt-3 w-full"
            >
              {actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
