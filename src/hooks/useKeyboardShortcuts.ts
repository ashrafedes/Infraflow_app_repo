import { useEffect, useCallback } from 'react'

// ============================================================================
// useKeyboardShortcuts
// ----------------------------------------------------------------------------
// Registers app-level keyboard shortcuts (Ctrl+N new, Ctrl+S save, Esc cancel)
// on a container element. Implements STRICT event priority:
//
//   Global shortcuts (Ctrl+N, Ctrl+S) are SUPPRESSED when the active element
//   is an input, textarea, select, [contenteditable], or inside an open
//   combobox/cell editor. This prevents interference with text entry,
//   combobox navigation, and normal browser behavior.
//
//   Esc is handled by the innermost open context (combobox → cell editor →
//   row edit) first; this hook only fires Esc cancel when no input is focused.
//
// Priority table:
//   1. SearchableCombobox open   → Enter/Esc/Arrows handled by combobox
//   2. Cell editor active        → Enter/Esc/Tab handled by editor
//   3. Grid focused, no editor   → arrows navigate; Ctrl+N/Ctrl+S fire here
//   4. Page-level, no grid       → Ctrl+N/Ctrl+S fire only if not in input
// ============================================================================

export interface KeyboardShortcutHandlers {
  onNew?: () => void
  onSave?: () => void
  onCancel?: () => void
}

/**
 * Returns true if the current active element is a text-input-like element
 * where global shortcuts should be suppressed.
 */
function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type
    // Allow shortcuts on checkboxes/radios, suppress on text-like inputs
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'image'].includes(type)
  }
  if (tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  // Inside a combobox dropdown or cell editor
  if (el.closest('[data-combobox]') || el.closest('.rdg-editor-container')) return true
  return false
}

export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  deps: unknown[] = []
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+N — new record/row (suppressed when typing in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        if (isInputFocused()) return
        e.preventDefault()
        e.stopPropagation()
        handlers.onNew?.()
        return
      }

      // Ctrl+S — save current transaction/form (suppressed when typing in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (isInputFocused()) return
        e.preventDefault()
        e.stopPropagation()
        handlers.onSave?.()
        return
      }

      // Esc — cancel current unsaved edit (only when no input is focused,
      // so combobox/cell editors handle their own Esc first)
      if (e.key === 'Escape') {
        if (isInputFocused()) return
        handlers.onCancel?.()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])
}
