import { useRef, useCallback, createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import DataGrid, {
  type Column,
  type CellClickArgs,
  type CellMouseEvent,
  type RenderCellProps,
  type RenderEditCellProps,
  textEditor,
  SelectColumn,
} from 'react-data-grid'

// ============================================================================
// Type helpers for "auto-add row on Tab/Enter from last cell"
// ----------------------------------------------------------------------------
// When the user presses Tab or Enter while editing the last editable cell of
// the last row, the parent can decide whether to append a new blank row. The
// Datasheet calls `onAddRow` with the row that was just committed and the
// column key; the parent returns `true` to suppress the default Tab/Enter
// navigation (so focus stays in the grid for the new row), or `false`/`void`
// to let react-data-grid's default behavior proceed.
// ============================================================================
export type AddRowDecision = (row: unknown, columnKey: string) => boolean

// Context so cell editors (defined as standalone helpers below) can ask the
// Datasheet whether to auto-add a row when the user presses Tab/Enter on the
// last editable cell of the last row.
const AddRowContext = createContext<AddRowDecision | null>(null)
export function useAddRowHandler(): AddRowDecision | null {
  return useContext(AddRowContext)
}
import { SearchableCombobox, type ComboboxItem } from '@/components/combobox/SearchableCombobox'
import { cn } from '@/lib/utils'

// ============================================================================
// Datasheet — thin wrapper over react-data-grid
// ----------------------------------------------------------------------------
// Configures react-data-grid with:
//   - Inline text/number/select/combobox editors
//   - onRowsChange for local state management
//   - Row selection (optional)
//   - Tailwind-themed columns
//   - Empty state + loading overlay
//   - Dirty row highlighting
//
// Keyboard priority (handled by react-data-grid + SearchableCombobox):
//   - When combobox editor open: Enter=select, Esc=close combobox
//   - When cell editor active: Enter=commit/move, Tab=next cell
//   - When grid focused: arrows navigate, Ctrl+N/Ctrl+S via useKeyboardShortcuts
// ============================================================================

export interface DatasheetColumn<R> extends Column<R> {
  // Marker for our wrapper; react-data-grid's Column is the base
}

export interface DatasheetProps<R> {
  columns: readonly DatasheetColumn<R>[]
  rows: readonly R[]
  onRowsChange?: (rows: R[]) => void
  rowKeyGetter?: (row: R) => string
  // Set of row keys that have unsaved changes
  dirtyRowIds?: Set<string>
  // Called when a row is selected (clicked)
  onRowSelect?: (row: R | null) => void
  // Enable row selection checkboxes
  enableRowSelection?: boolean
  selectedRowKeys?: Set<string>
  onSelectedRowKeysChange?: (keys: Set<string>) => void
  // Empty state
  emptyMessage?: string
  // Loading overlay
  loading?: boolean
  // Additional class for the container
  className?: string
  // Height of rows
  rowHeight?: number
  // Called when the user presses Tab/Enter from the last editable cell of the
  // last row. Return `true` to indicate a new row was added (Datasheet will
  // swallow the keypress so focus stays in the grid).
  onAddRow?: AddRowDecision
}

export function Datasheet<R>({
  columns,
  rows,
  onRowsChange,
  rowKeyGetter,
  dirtyRowIds,
  onRowSelect,
  enableRowSelection = false,
  selectedRowKeys,
  onSelectedRowKeysChange,
  emptyMessage,
  loading = false,
  className,
  rowHeight = 36,
  onAddRow,
}: DatasheetProps<R>) {
  const { t } = useTranslation()
  const emptyMsg = emptyMessage ?? t('common:messages.noData')
  const gridRef = useRef<HTMLDivElement>(null)

  // Build final columns, optionally prepending select column
  const finalColumns = enableRowSelection
    ? ([SelectColumn, ...columns] as readonly Column<R>[])
    : (columns as readonly Column<R>[])

  const rowClass = useCallback(
    (row: R, _rowIdx: number): string => {
      if (!dirtyRowIds || !rowKeyGetter) return ''
      const key = rowKeyGetter(row)
      return dirtyRowIds.has(key) ? 'rdg-row-dirty' : ''
    },
    [dirtyRowIds, rowKeyGetter]
  )

  const handleRowsChange = useCallback(
    (newRows: R[]) => {
      onRowsChange?.(newRows)
    },
    [onRowsChange]
  )

  const handleCellClick = useCallback(
    (args: CellClickArgs<R, unknown>, event: CellMouseEvent) => {
      onRowSelect?.(args.row)
      const isEditable =
        args.column.renderEditCell != null &&
        (typeof args.column.editable === 'function'
          ? args.column.editable(args.row) !== false
          : args.column.editable !== false)
      if (isEditable) {
        args.selectCell(true)
        event.preventGridDefault()
      }
    },
    [onRowSelect]
  )

  return (
    <AddRowContext.Provider value={onAddRow ?? null}>
      <div className={cn('relative datasheet-container', className)}>
        <DataGrid<R>
          ref={gridRef as never}
          columns={finalColumns}
          rows={rows}
          onRowsChange={onRowsChange ? handleRowsChange : undefined}
          rowKeyGetter={rowKeyGetter}
          rowClass={rowClass}
          onCellClick={handleCellClick as never}
          selectedRows={selectedRowKeys as never}
          onSelectedRowsChange={onSelectedRowKeysChange as never}
          rowHeight={rowHeight}
          enableVirtualization
          renderers={{
            noRowsFallback: (
              <div className="flex items-center justify-center py-16 text-center text-sm text-gray-400">
                {emptyMsg}
              </div>
            ),
          }}
          style={{ height: '100%' }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="text-sm text-gray-500">Loading...</div>
          </div>
        )}
      </div>
    </AddRowContext.Provider>
  )
}

// ============================================================================
// Cell editor helpers — reusable editors for Datasheet columns
// ============================================================================

// ----------------------------------------------------------------------------
// ComboboxCellEditor — for entity-reference columns (item, warehouse, WO, etc.)
// ----------------------------------------------------------------------------
export function comboboxEditor<R>(
  items: ComboboxItem[],
  getLabel: (id: string) => string
) {
  function editor({ row, column, onRowChange, onClose }: RenderEditCellProps<R>) {
    const currentValue = String((row as Record<string, unknown>)[column.key] ?? '')
    return (
      <SearchableCombobox
        items={items}
        value={currentValue}
        onChange={(id) => {
          onRowChange({ ...row, [column.key]: id } as R, true)
        }}
        onCloseEditor={() => onClose(true, false)}
        autoFocus
        className="h-full w-full"
      />
    )
  }
  // Provide a renderCell that shows the label instead of the raw id
  function renderCell({ row, column }: RenderCellProps<R>) {
    const value = String((row as Record<string, unknown>)[column.key] ?? '')
    if (!value) return <span className="text-gray-400">Select…</span>
    return <>{getLabel(value)}</>
  }
  return { renderEditCell: editor, renderCell }
}

// ----------------------------------------------------------------------------
// NumberCellEditor — for numeric columns with validation
// ----------------------------------------------------------------------------
export function numberEditor<R>(opts?: { min?: number; step?: string }) {
  const { min = 0, step = '0.001' } = opts ?? {}
  function editor({ row, column, onRowChange, onClose }: RenderEditCellProps<R>) {
    const currentValue = String((row as Record<string, unknown>)[column.key] ?? '')
    const addRowHandler = useAddRowHandler()
    const commitAndMaybeAddRow = (rawValue: string, key: 'Enter' | 'Tab') => {
      const num = parseFloat(rawValue)
      if (!isNaN(num) && num >= min) {
        onRowChange({ ...row, [column.key]: num } as R, true)
      }
      if (addRowHandler && addRowHandler(row, column.key)) {
        // Parent added a new row; swallow the keypress so focus stays in grid
        if (key === 'Enter') {
          onClose(true, false)
        }
        // For Tab, returning true from addRowHandler tells the parent to refocus;
        // we still call onClose so react-data-grid doesn't try to navigate.
        onClose(true, false)
        return
      }
      onClose(true, false)
    }
    return (
      <input
        type="number"
        step={step}
        min={min}
        defaultValue={currentValue}
        autoFocus
        className="h-full w-full border-0 bg-white px-2 text-sm outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitAndMaybeAddRow((e.target as HTMLInputElement).value, 'Enter')
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            onClose(false, false)
          } else if (e.key === 'Tab') {
            commitAndMaybeAddRow((e.target as HTMLInputElement).value, 'Tab')
          }
        }}
        onBlur={(e) => {
          const num = parseFloat(e.target.value)
          if (!isNaN(num) && num >= min) {
            onRowChange({ ...row, [column.key]: num } as R, true)
          }
          onClose(true, false)
        }}
      />
    )
  }
  return editor
}

// ----------------------------------------------------------------------------
// TextCellEditor — wraps react-data-grid's textEditor with autoFocus
// ----------------------------------------------------------------------------
export function textCellEditor<R>() {
  return textEditor as (props: RenderEditCellProps<R>) => ReactNode
}

// ----------------------------------------------------------------------------
// CheckboxCell — for boolean toggle columns (e.g., is_active)
// ----------------------------------------------------------------------------
export function checkboxCell<R>(opts?: { disabled?: (row: R) => boolean }) {
  function renderCell({ row, column, onRowChange }: RenderCellProps<R>) {
    const checked = Boolean((row as Record<string, unknown>)[column.key])
    const isDisabled = opts?.disabled?.(row) ?? false
    return (
      <input
        type="checkbox"
        checked={checked}
        disabled={isDisabled}
        onChange={(e) => {
          onRowChange({ ...row, [column.key]: e.target.checked } as R)
        }}
        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
    )
  }
  return renderCell
}

// ----------------------------------------------------------------------------
// BadgeCell — for status columns with color mapping
// ----------------------------------------------------------------------------
export function badgeCell<R>(
  colorMap: Record<string, string>,
  formatter?: (value: string) => string
) {
  function renderCell({ row, column }: RenderCellProps<R>) {
    const value = String((row as Record<string, unknown>)[column.key] ?? '')
    if (!value) return <span className="text-gray-400">—</span>
    const colorClass = colorMap[value] ?? 'badge-gray'
    const label = formatter ? formatter(value) : value
    return <span className={cn('badge', colorClass)}>{label}</span>
  }
  return renderCell
}

// ----------------------------------------------------------------------------
// ReadOnlyCell — displays value as-is (for derived/auto fields)
// ----------------------------------------------------------------------------
export function readOnlyCell<R>(formatter?: (value: unknown, row: R) => string) {
  function renderCell({ row, column }: RenderCellProps<R>) {
    const value = (row as Record<string, unknown>)[column.key]
    if (value == null || value === '') return <span className="text-gray-400">—</span>
    return <>{formatter ? formatter(value, row) : String(value)}</>
  }
  return renderCell
}

export type { ReactNode }
