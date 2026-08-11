import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// SearchableCombobox
// ----------------------------------------------------------------------------
// Replaces native <select> for entity selection. Supports type-ahead search,
// keyboard navigation (Up/Down/Enter/Esc), auto-focus, and renders a dropdown
// portal. Designed to be used both standalone and as a react-data-grid cell
// editor.
//
// Keyboard priority (highest in the grid):
//   Enter  = select highlighted option
//   Esc    = close/cancel combobox (does NOT bubble to grid row-commit)
//   Up/Down= navigate options
//   Tab    = move to next field (combobox closes)
// ============================================================================

export interface ComboboxItem {
  id: string
  // Primary label shown in the dropdown and when selected
  label: string
  // Optional secondary text (e.g., code)
  code?: string
  // Optional sub-label (e.g., description)
  subLabel?: string
}

export interface SearchableComboboxProps {
  items: ComboboxItem[]
  value: string // selected item id
  onChange: (id: string) => void
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  className?: string
  // When used inside react-data-grid, these help stop event propagation
  onCloseEditor?: () => void
}

export function SearchableCombobox({
  items,
  value,
  onChange,
  placeholder = 'Search...',
  autoFocus = false,
  disabled = false,
  className,
  onCloseEditor,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Compute dropdown position relative to viewport for portal rendering
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    })
  }, [open])

  const selectedItem = useMemo(() => items.find((i) => i.id === value), [items, value])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.code ?? '').toLowerCase().includes(q) ||
        (i.subLabel ?? '').toLowerCase().includes(q)
    )
  }, [items, query])

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Auto-focus + auto-open dropdown (important for cell editor usage)
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
      setOpen(true)
    }
  }, [autoFocus])

  const openDropdown = () => {
    if (disabled) return
    setOpen(true)
    setQuery('')
    setHighlightIdx(0)
    // Focus input on next tick
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const selectItem = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
    onCloseEditor?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        openDropdown()
      }
      return
    }

    // Combobox is open — it owns these keys (do not bubble to grid)
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (filtered[highlightIdx]) {
        selectItem(filtered[highlightIdx].id)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      setQuery('')
      onCloseEditor?.()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightIdx((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Tab') {
      // Tab closes the combobox and lets the grid move focus
      setOpen(false)
      setQuery('')
    }
  }

  const displayText = open ? query : selectedItem ? formatItem(selectedItem) : ''

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
          disabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : 'cursor-text hover:border-gray-400'
        )}
        onClick={openDropdown}
      >
        {!open && !selectedItem && <Search className="h-4 w-4 text-gray-400" />}
        <input
          ref={inputRef}
          type="text"
          value={displayText}
          disabled={disabled}
          placeholder={selectedItem ? '' : placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={openDropdown}
          onKeyDown={handleKeyDown}
          className="flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-gray-400"
        />
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </div>

      {open && createPortal(
        <div
          style={dropdownStyle}
          className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-gray-400">No matches found</div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectItem(item.id)
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm',
                  idx === highlightIdx ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.label}</span>
                  {item.code && <span className="text-xs text-gray-400">{item.code}</span>}
                </div>
                {item.subLabel && <div className="text-xs text-gray-400 mt-0.5">{item.subLabel}</div>}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

function formatItem(item: ComboboxItem): string {
  if (item.code) return `${item.code} — ${item.label}`
  return item.label
}
