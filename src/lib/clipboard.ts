// ============================================================================
// clipboard.ts — TSV/clipboard parsing + validation for grid paste
// ----------------------------------------------------------------------------
// Parses pasted tab-separated values (from Excel/Sheets) into rows/cells,
// then validates them against a per-grid schema. Returns parsed rows + any
// validation errors so the UI can show them for review BEFORE committing.
//
// Used by: Materials datasheet, BOQ grid, Movement lines grid.
// ============================================================================

export interface ClipboardColumnSchema {
  // Column key in the target row object
  key: string
  // Whether this column is required (non-empty)
  required?: boolean
  // Validator function; returns error string or null if valid
  validate?: (value: string, rowIndex: number) => string | null
  // Transform the raw string into the target type (e.g., parseFloat)
  transform?: (value: string) => unknown
}

export interface ParsedRow {
  [key: string]: unknown
  // Internal: row index from the pasted data (0-based)
  _rowIndex: number
  // Internal: validation errors for this row (keyed by column key)
  _errors: Record<string, string>
}

export interface ParseResult {
  rows: ParsedRow[]
  errors: Array<{ rowIndex: number; columnKey: string; message: string }>
  hasErrors: boolean
}

/**
 * Parse a pasted string (TSV) into rows and validate against a schema.
 * Each line is a row; each tab-separated value is a cell.
 * Empty lines are skipped.
 */
export function parseClipboard(
  text: string,
  schema: ClipboardColumnSchema[]
): ParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  const rows: ParsedRow[] = []
  const errors: ParseResult['errors'] = []

  lines.forEach((line, lineIdx) => {
    const cells = line.split('\t')
    const row: ParsedRow = { _rowIndex: lineIdx, _errors: {} }

    schema.forEach((col, colIdx) => {
      const rawValue = (cells[colIdx] ?? '').trim()
      const key = col.key

      // Required check
      if (col.required && rawValue === '') {
        const msg = `${key} is required`
        row._errors[key] = msg
        errors.push({ rowIndex: lineIdx, columnKey: key, message: msg })
        return
      }

      // Custom validation
      if (col.validate && rawValue !== '') {
        const err = col.validate(rawValue, lineIdx)
        if (err) {
          row._errors[key] = err
          errors.push({ rowIndex: lineIdx, columnKey: key, message: err })
          return
        }
      }

      // Transform
      row[key] = col.transform ? col.transform(rawValue) : rawValue
    })

    rows.push(row)
  })

  return { rows, errors, hasErrors: errors.length > 0 }
}

/**
 * Read clipboard data from a ClipboardEvent (cross-browser).
 * Falls back to window.clipboardData for older browsers.
 */
export function getClipboardText(e: ClipboardEvent): string {
  if (e.clipboardData) {
    return e.clipboardData.getData('text')
  }
  // Fallback for older browsers
  const w = window as Window & { clipboardData?: { getData: (type: string) => string } }
  if (w.clipboardData) {
    return w.clipboardData.getData('Text')
  }
  return ''
}

/**
 * Common validators for reuse across grids.
 */
export const validators = {
  positiveNumber: (value: string): string | null => {
    const num = parseFloat(value)
    if (isNaN(num)) return 'Must be a number'
    if (num <= 0) return 'Must be greater than 0'
    return null
  },
  nonEmpty: (value: string): string | null => {
    if (value.trim() === '') return 'Cannot be empty'
    return null
  },
  maxLength: (max: number) => (value: string): string | null => {
    if (value.length > max) return `Must be ${max} characters or fewer`
    return null
  },
}

/**
 * Common transformers.
 */
export const transformers = {
  toNumber: (value: string): number => parseFloat(value) || 0,
  toNullIfEmpty: (value: string): string | null => (value.trim() === '' ? null : value.trim()),
  toString: (value: string): string => value.trim(),
}
