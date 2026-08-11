-- ============================================================================
-- INFRAFLOW — Add Premium features: Trend Analysis, Cost Breakdown, Forecasting
-- Migration 026
-- ============================================================================
--
-- Adds three new advanced features to the Premium plan:
--   * trend_analysis     — تحليل الاتجاهات (Trend Analysis)
--   * cost_breakdown     — تفصيل التكاليف (Cost Breakdown)
--   * forecasting        — التنبؤ (Forecasting)
--
-- These are described in Arabic as:
--   "تحليل الاتجاهات وتفصيل التكاليف والتنبؤ متاح مع ميزة التقارير المتقدمة"
--
-- All three are categorized as 'advanced' and are enabled on:
--   * free_trial  (full access during trial)
--   * premium     (full access on paid premium plan)
-- They are NOT enabled on the basic plan.
-- ============================================================================

-- ============================================================================
-- 1. Add new features to the catalog
-- ============================================================================
INSERT INTO features (feature_key, feature_name, description, category) VALUES
    ('trend_analysis', 'Trend Analysis',
     'تحليل الاتجاهات — Analyze movement trends over time with visual charts',
     'advanced'),
    ('cost_breakdown', 'Cost Breakdown',
     'تفصيل التكاليف — Detailed cost breakdown by project, work order, and material',
     'advanced'),
    ('forecasting', 'Forecasting',
     'التنبؤ — Forecast future material needs based on historical usage patterns',
     'advanced')
ON CONFLICT (feature_key) DO NOTHING;

-- ============================================================================
-- 2. Enable new features on free_trial plan (trial = full access)
-- ============================================================================
INSERT INTO plan_features (plan_id, feature_key, is_enabled)
SELECT sp.id, f.feature_key, true
FROM subscription_plans sp
CROSS JOIN features f
WHERE sp.plan_code = 'free_trial'
  AND f.feature_key IN ('trend_analysis', 'cost_breakdown', 'forecasting')
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ============================================================================
-- 3. Enable new features on premium plan
-- ============================================================================
INSERT INTO plan_features (plan_id, feature_key, is_enabled)
SELECT sp.id, f.feature_key, true
FROM subscription_plans sp
CROSS JOIN features f
WHERE sp.plan_code = 'premium'
  AND f.feature_key IN ('trend_analysis', 'cost_breakdown', 'forecasting')
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ============================================================================
-- 4. Explicitly DISABLE new features on basic plan
--    (defensive — ensures basic users cannot access these features)
-- ============================================================================
INSERT INTO plan_features (plan_id, feature_key, is_enabled)
SELECT sp.id, f.feature_key, false
FROM subscription_plans sp
CROSS JOIN features f
WHERE sp.plan_code = 'basic'
  AND f.feature_key IN ('trend_analysis', 'cost_breakdown', 'forecasting')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET is_enabled = false;

-- ============================================================================
-- 5. Update Premium plan description to mention the new features
-- ============================================================================
UPDATE subscription_plans
SET description = 'Full access with advanced features: trend analysis, cost breakdown, and forecasting',
    updated_at = now()
WHERE plan_code = 'premium';
