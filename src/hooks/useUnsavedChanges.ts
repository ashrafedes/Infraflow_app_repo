import { useEffect, useRef, useCallback, useState } from 'react'

// ============================================================================
// useUnsavedChanges
// ----------------------------------------------------------------------------
// Tracks dirty state and warns the user before navigating away with unsaved
// edits. Wires:
//   - window.beforeunload (browser tab close / refresh)
//   - in-app navigation guard via history state (works with BrowserRouter)
//
// NOTE: We do NOT use react-router's useBlocker because it requires a data
// router (createBrowserRouter). This app uses BrowserRouter, so we use
// beforeunload + a popstate-based approach instead.
//
// Provides:
//   - dirty: boolean (pass this to <DirtyBadge/>)
//   - setDirty: (d: boolean) => void
//   - blocker: a synthetic blocker object with state ('idle' | 'blocked')
//   - saveAndNavigate: () => void  — call after a successful save to unblock
//   - discardAndNavigate: () => void — call to discard and proceed
//   - reset: () => void — manually reset dirty (e.g., after save without nav)
// ============================================================================

export interface UseUnsavedChangesOptions {
  isDirty: boolean
  message?: string
}

export interface SyntheticBlocker {
  state: 'idle' | 'blocked'
  proceed: () => void
  reset: () => void
}

export interface UseUnsavedChangesResult {
  dirty: boolean
  setDirty: (d: boolean) => void
  blocker: SyntheticBlocker | null
  saveAndNavigate: () => void
  discardAndNavigate: () => void
  reset: () => void
}

export function useUnsavedChanges({
  isDirty,
  message = 'You have unsaved changes. Are you sure you want to leave?',
}: UseUnsavedChangesOptions): UseUnsavedChangesResult {
  const [dirty, setDirty] = useState(isDirty)
  const [blocked, setBlocked] = useState(false)
  const skipNextBlock = useRef(false)
  const pendingNavRef = useRef<string | null>(null)

  // Sync external isDirty into local state
  useEffect(() => {
    setDirty(isDirty)
  }, [isDirty])

  // beforeunload — browser tab close / refresh
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = message
      return message
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, message])

  // Popstate guard — intercepts in-app navigation (back/forward)
  useEffect(() => {
    if (!dirty) return

    // Push a dummy state so we can intercept back navigation
    const dummyState = { __unsavedGuard: true }
    window.history.pushState(dummyState, '')

    const handlePopState = () => {
      if (skipNextBlock.current) {
        skipNextBlock.current = false
        return
      }
      // Block the navigation — re-push the dummy state and show confirm
      window.history.pushState(dummyState, '')
      pendingNavRef.current = window.location.pathname
      setBlocked(true)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      // Clean up the dummy state if we unmount while dirty
      if (window.history.state?.__unsavedGuard) {
        window.history.back()
      }
    }
  }, [dirty])

  const proceed = useCallback(() => {
    setBlocked(false)
    setDirty(false)
    skipNextBlock.current = true
    // Navigate back (past our dummy state)
    if (pendingNavRef.current) {
      window.history.back()
      pendingNavRef.current = null
    }
  }, [])

  const resetBlock = useCallback(() => {
    setBlocked(false)
    pendingNavRef.current = null
  }, [])

  const syntheticBlocker: SyntheticBlocker | null = blocked
    ? { state: 'blocked', proceed, reset: resetBlock }
    : null

  const saveAndNavigate = useCallback(() => {
    setDirty(false)
    skipNextBlock.current = true
    if (blocked) {
      proceed()
    }
  }, [blocked, proceed])

  const discardAndNavigate = useCallback(() => {
    setDirty(false)
    skipNextBlock.current = true
    if (blocked) {
      proceed()
    }
  }, [blocked, proceed])

  const reset = useCallback(() => {
    setDirty(false)
  }, [])

  return { dirty, setDirty, blocker: syntheticBlocker, saveAndNavigate, discardAndNavigate, reset }
}
