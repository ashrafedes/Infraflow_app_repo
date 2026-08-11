-- ============================================================================
-- Migration 027: Add pricing columns to subscription_plans
--
-- Adds price_amount, price_currency, and billing_period so plans can carry
-- their renewal price. Sets:
--   premium  = 1000 SAR / year
--   basic    =  500 SAR / year
--   free_trial =  0 SAR / year
-- ============================================================================

ALTER TABLE subscription_plans
    ADD COLUMN IF NOT EXISTS price_amount    NUMERIC(14, 2) NULL,
    ADD COLUMN IF NOT EXISTS price_currency  TEXT           NULL DEFAULT 'SAR',
    ADD COLUMN IF NOT EXISTS billing_period  TEXT           NULL DEFAULT 'yearly'
        CHECK (billing_period IS NULL OR billing_period IN ('monthly', 'yearly'));

-- Set prices per plan_code
UPDATE subscription_plans
SET price_amount = 1000, price_currency = 'SAR', billing_period = 'yearly', updated_at = now()
WHERE plan_code = 'premium';

UPDATE subscription_plans
SET price_amount = 500, price_currency = 'SAR', billing_period = 'yearly', updated_at = now()
WHERE plan_code = 'basic';

UPDATE subscription_plans
SET price_amount = 0, price_currency = 'SAR', billing_period = 'yearly', updated_at = now()
WHERE plan_code = 'free_trial';
