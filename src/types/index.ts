// ============================================================================
// Database Types — matches the approved schema exactly
// ============================================================================

export type UserRole = 'company_admin' | 'warehouse_man' | 'inspector' | 'project_control' | 'project_manager'

export type MovementType = 'RECEIPT' | 'ISSUE' | 'USAGE' | 'TRANSFER' | 'RETURN' | 'ADJUSTMENT'

export type AdjustmentType = 'increase' | 'decrease'

export type WarehouseType = 'main' | 'sub'

export type WorkOrderStatus = 'active' | 'completed' | 'cancelled' | 'on_hold'

export type ScopeType = 'project' | 'work_location' | 'warehouse' | 'work_order'

// ============================================================================
// Table Row Types
// ============================================================================

export interface Company {
  id: string
  name: string
  created_at: string
}

export interface UserProfile {
  id: string
  company_id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
  preferred_language?: 'en' | 'ar'
}

export interface UserScopeAssignment {
  id: string
  user_id: string
  company_id: string
  project_id: string | null
  work_location_id: string | null
  warehouse_id: string | null
  work_order_id: string | null
  created_at: string
}

export interface Project {
  id: string
  company_id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
}

export interface WorkLocation {
  id: string
  company_id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Warehouse {
  id: string
  company_id: string
  code: string
  name: string
  warehouse_type: WarehouseType
  work_location_id: string | null
  is_active: boolean
  created_at: string
  // Joined fields
  work_location_name?: string
  work_location_code?: string
}

export interface MaterialCategory {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface Material {
  id: string
  company_id: string
  item_number: string
  short_description: string
  long_description: string | null
  category_id: string | null
  uom: string
  is_active: boolean
  created_at: string
  // Joined fields
  category_name?: string
}

export interface Supplier {
  id: string
  company_id: string
  code: string
  name: string
  contact_info: string | null
  is_active: boolean
  created_at: string
}

export interface Contractor {
  id: string
  company_id: string
  name: string
  contact_info: string | null
  is_active: boolean
  created_at: string
}

export interface WorkOrder {
  id: string
  company_id: string
  work_order_number: string
  site_code: string | null
  project_id: string
  work_location_id: string
  supervisor: string
  contractor_id: string | null
  status: WorkOrderStatus
  start_date: string | null
  end_date: string | null
  created_at: string
  // Joined fields
  project_name?: string
  project_code?: string
  work_location_name?: string
  work_location_code?: string
  contractor_name?: string
}

export interface WorkOrderBOQ {
  id: string
  company_id: string
  work_order_id: string
  material_id: string
  planned_quantity: number
  created_at: string
  // Joined fields
  item_number?: string
  short_description?: string
  uom?: string
}

export interface MaterialMovement {
  id: string
  company_id: string
  movement_number: string
  movement_date: string
  movement_type: MovementType
  supplier_id: string | null
  source_warehouse_id: string | null
  source_work_order_id: string | null
  destination_warehouse_id: string | null
  destination_work_order_id: string | null
  contractor_id: string | null
  responsible_user_id: string
  adjustment_type: AdjustmentType | null
  adjustment_reason: string | null
  notes: string | null
  created_at: string
  // Joined fields
  responsible_user_name?: string
  supplier_name?: string
  source_warehouse_name?: string
  source_warehouse_code?: string
  source_work_order_number?: string
  destination_warehouse_name?: string
  destination_warehouse_code?: string
  destination_work_order_number?: string
  contractor_name?: string
}

export interface MaterialMovementLine {
  id: string
  movement_id: string
  company_id: string
  material_id: string
  quantity: number
  notes: string | null
  // Joined fields
  item_number?: string
  short_description?: string
  uom?: string
}

// ============================================================================
// View Types
// ============================================================================

export interface WarehouseBalance {
  company_id: string
  warehouse_id: string
  material_id: string
  received: number
  transfer_in: number
  returned_in: number
  adjustment_positive: number
  issued: number
  transfer_out: number
  adjustment_negative: number
  current_balance: number
  // Joined fields
  warehouse_name?: string
  warehouse_code?: string
  item_number?: string
  short_description?: string
  category_name?: string
  uom?: string
}

export interface WorkOrderBalance {
  company_id: string
  work_order_id: string
  material_id: string
  issued: number
  transfer_in: number
  used: number
  transfer_out: number
  returned_out: number
  on_hand: number
  consumed: number
  // Joined fields
  item_number?: string
  short_description?: string
  uom?: string
}

export interface ContractorBalance {
  company_id: string
  contractor_id: string
  material_id: string
  transferred_in: number
  returned_out: number
  current_balance: number
  // Joined fields
  contractor_name?: string
  item_number?: string
  short_description?: string
  uom?: string
}

export interface MovementDetail {
  company_id: string
  movement_id: string
  movement_number: string
  movement_date: string
  movement_type: MovementType
  adjustment_type: AdjustmentType | null
  adjustment_reason: string | null
  notes: string | null
  created_at: string
  source_warehouse_code: string | null
  source_warehouse_name: string | null
  source_work_order_number: string | null
  source_site_code: string | null
  supplier_code: string | null
  supplier_name: string | null
  destination_warehouse_code: string | null
  destination_warehouse_name: string | null
  destination_work_order_number: string | null
  destination_site_code: string | null
  contractor_name: string | null
  responsible_user_name: string
  line_id: string
  material_id: string
  item_number: string
  short_description: string
  uom: string
  quantity: number
  line_notes: string | null
}

export interface WOMaterialSummary {
  company_id: string
  work_order_id: string
  work_order_number: string
  site_code: string | null
  work_location_id: string
  work_location_name: string
  project_id: string
  project_name: string
  material_id: string
  item_number: string
  short_description: string
  uom: string
  boq_quantity: number
  issued_quantity: number
  used_quantity: number
  transferred_quantity: number
  returned_quantity: number
  remaining_quantity: number
  consumed_quantity: number
}

// ============================================================================
// SaaS Subscription Types
// ============================================================================

export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'expired' | 'cancelled'

export interface Feature {
  feature_key: string
  feature_name: string
  description: string | null
  category: 'core' | 'advanced' | 'addon'
}

export interface SubscriptionPlan {
  id: string
  plan_code: string
  plan_name: string
  description: string | null
  trial_duration_days: number | null
  default_max_users: number
  is_system_plan: boolean
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PlanFeature {
  id: string
  plan_id: string
  feature_key: string
  is_enabled: boolean
}

export interface Subscription {
  id: string
  company_id: string
  plan_id: string
  status: SubscriptionStatus
  trial_started_at: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  max_users_override: boolean
  max_users: number | null
  suspended_at: string | null
  suspended_reason: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptionFeatureOverride {
  id: string
  subscription_id: string
  feature_key: string
  is_enabled: boolean
}

export interface SubscriptionInfo {
  plan_code: string
  plan_name: string
  status: SubscriptionStatus
  max_users: number
  active_users: number
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  suspended_reason: string | null
}

export interface SubscriptionAuditLog {
  id: string
  company_id: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  performed_by: string | null
  performed_at: string
}

// ============================================================================
// Upgrade Request Types
// ============================================================================

export type UpgradeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface SubscriptionUpgradeRequest {
  id: string
  company_id: string
  requested_by: string
  current_plan_id: string
  requested_plan_id: string
  status: UpgradeRequestStatus
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  // Joined fields
  company_name?: string
  current_plan_name?: string
  current_plan_code?: string
  requested_plan_name?: string
  requested_plan_code?: string
  requested_by_email?: string
  reviewed_by_email?: string
}
