// ============================================================================
// Entitlements — Central feature-key constants + hooks
// ----------------------------------------------------------------------------
// Single source of truth for subscription-gated features. The server-side
// authority is the has_feature() RPC; this module mirrors the feature keys
// and provides a convenient client-side hook + gating component.
// ============================================================================

export const FEATURES = {
  MATERIAL_MOVEMENTS: 'material_movements',
  WORK_ORDERS: 'work_orders',
  BOQ_MANAGEMENT: 'boq_management',
  REPORTS: 'reports',
  MULTI_WAREHOUSE: 'multi_warehouse',
  CONTRACTOR_TRACKING: 'contractor_tracking',
  ADVANCED_REPORTS: 'advanced_reports',
  ADVANCED_DASHBOARD: 'advanced_dashboard',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  EXPORTS: 'exports',
  TREND_ANALYSIS: 'trend_analysis',
  COST_BREAKDOWN: 'cost_breakdown',
  FORECASTING: 'forecasting',
} as const

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES]

// Re-export useSubscription for convenience so screens import from one place
export { useSubscription } from '@/contexts/SubscriptionContext'

import { useSubscription } from '@/contexts/SubscriptionContext'

/**
 * Check whether a feature is enabled for the current company.
 * Returns false while the subscription context is loading.
 */
export function useFeature(featureKey: FeatureKey | string): boolean {
  const { hasFeature, loading } = useSubscription()
  if (loading) return false
  return hasFeature(featureKey)
}
