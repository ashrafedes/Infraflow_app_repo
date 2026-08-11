-- ============================================================================
-- INFRAFLOW — SaaS Subscription Layer
-- Migration 011: Schema, Constraints, Indexes, Seed Data
-- ============================================================================

-- ============================================================================
-- FEATURES — Catalog of all available features
-- ============================================================================
CREATE TABLE features (
    feature_key   TEXT        PRIMARY KEY,
    feature_name  TEXT        NOT NULL,
    description   TEXT        NULL,
    category      TEXT        NOT NULL DEFAULT 'core'
                  CHECK (category IN ('core', 'advanced', 'addon')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SUBSCRIPTION_PLANS — Plan definitions
-- ============================================================================
CREATE TABLE subscription_plans (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code           TEXT        NOT NULL UNIQUE,
    plan_name           TEXT        NOT NULL,
    description         TEXT        NULL,
    trial_duration_days INTEGER     NULL,
    default_max_users   INTEGER     NOT NULL DEFAULT 5,
    is_system_plan      BOOLEAN     NOT NULL DEFAULT false,
    sort_order          INTEGER     NOT NULL DEFAULT 0,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PLAN_FEATURES — Default feature entitlements per plan
-- ============================================================================
CREATE TABLE plan_features (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id       UUID        NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    feature_key   TEXT        NOT NULL REFERENCES features(feature_key) ON DELETE RESTRICT,
    is_enabled    BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (plan_id, feature_key)
);

-- ============================================================================
-- SUBSCRIPTIONS — One active subscription per company (1:1)
-- ============================================================================
CREATE TABLE subscriptions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID        NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    plan_id               UUID        NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status                TEXT        NOT NULL DEFAULT 'trial'
                          CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'cancelled')),
    trial_started_at      TIMESTAMPTZ NULL,
    trial_ends_at         TIMESTAMPTZ NULL,
    current_period_start  TIMESTAMPTZ NULL,
    current_period_end    TIMESTAMPTZ NULL,
    max_users_override    BOOLEAN     NOT NULL DEFAULT false,
    max_users             INTEGER     NULL,
    suspended_at          TIMESTAMPTZ NULL,
    suspended_reason      TEXT        NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- When status is 'trial', trial dates must be set
    CONSTRAINT chk_trial_dates CHECK (
        (status <> 'trial') OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL)
    ),
    -- When max_users_override is false, max_users must be NULL
    CONSTRAINT chk_max_users_override CHECK (
        (max_users_override = false AND max_users IS NULL)
        OR (max_users_override = true AND max_users IS NOT NULL AND max_users > 0)
    )
);

CREATE INDEX idx_subscriptions_company ON subscriptions(company_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_trial_ends ON subscriptions(trial_ends_at) WHERE status = 'trial';

-- ============================================================================
-- SUBSCRIPTION_FEATURE_OVERRIDES — Per-company feature toggles
-- ============================================================================
CREATE TABLE subscription_feature_overrides (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   UUID        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    feature_key       TEXT        NOT NULL REFERENCES features(feature_key) ON DELETE RESTRICT,
    is_enabled        BOOLEAN     NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subscription_id, feature_key)
);

-- ============================================================================
-- SUPER_ADMINS — Platform-level admin authorization flags
-- ============================================================================
CREATE TABLE super_admins (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SUBSCRIPTION_AUDIT_LOG — Change tracking
-- ============================================================================
CREATE TABLE subscription_audit_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    action        TEXT        NOT NULL,
    old_value     JSONB       NULL,
    new_value     JSONB       NULL,
    performed_by  UUID        NULL,
    performed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_company ON subscription_audit_log(company_id, performed_at DESC);

-- ============================================================================
-- SEED DATA: Features
-- ============================================================================
INSERT INTO features (feature_key, feature_name, description, category) VALUES
    ('material_movements',  'Material Movements',   'Create and manage material movements',          'core'),
    ('work_orders',         'Work Orders',          'Create and manage work orders',                 'core'),
    ('boq_management',      'BOQ Management',       'Bill of Quantities for work orders',            'core'),
    ('reports',             'Reports',              'View standard inventory and balance reports',   'core'),
    ('multi_warehouse',     'Multi Warehouse',      'Manage multiple warehouses',                    'core'),
    ('contractor_tracking', 'Contractor Tracking',  'Track contractor material balances',            'core'),
    ('advanced_reports',    'Advanced Reports',     'Detailed analytics and custom reports',         'advanced'),
    ('advanced_dashboard',  'Advanced Dashboard',   'Visual dashboard with charts and KPIs',         'advanced'),
    ('advanced_analytics',  'Advanced Analytics',   'Trend analysis and forecasting',                'advanced'),
    ('exports',             'Data Exports',         'Export data to CSV/Excel',                      'advanced')
ON CONFLICT (feature_key) DO NOTHING;

-- ============================================================================
-- SEED DATA: Subscription Plans
-- ============================================================================
INSERT INTO subscription_plans (plan_code, plan_name, description, trial_duration_days, default_max_users, is_system_plan, sort_order) VALUES
    ('free_trial', 'Free Trial',  'Full access for 10 days',       10,  5,  true, 1),
    ('basic',      'Basic',       'Standard plan with core features', NULL, 10, true, 2),
    ('premium',    'Premium',     'Full access with advanced features', NULL, 50, false, 3)
ON CONFLICT (plan_code) DO NOTHING;

-- ============================================================================
-- SEED DATA: Plan Features
-- ============================================================================
-- Free Trial: ALL features enabled
INSERT INTO plan_features (plan_id, feature_key, is_enabled)
SELECT sp.id, f.feature_key, true
FROM subscription_plans sp
CROSS JOIN features f
WHERE sp.plan_code = 'free_trial'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Basic: core features enabled, advanced disabled
INSERT INTO plan_features (plan_id, feature_key, is_enabled)
SELECT sp.id, f.feature_key,
    CASE WHEN f.category = 'core' THEN true ELSE false END
FROM subscription_plans sp
CROSS JOIN features f
WHERE sp.plan_code = 'basic'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Premium: ALL features enabled
INSERT INTO plan_features (plan_id, feature_key, is_enabled)
SELECT sp.id, f.feature_key, true
FROM subscription_plans sp
CROSS JOIN features f
WHERE sp.plan_code = 'premium'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ============================================================================
-- GRANTS — Base table permissions for authenticated role
-- ============================================================================
GRANT SELECT ON features TO authenticated;
GRANT SELECT ON subscription_plans TO authenticated;
GRANT SELECT ON plan_features TO authenticated;
GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT ON subscription_feature_overrides TO authenticated;
GRANT SELECT ON subscription_audit_log TO authenticated;
