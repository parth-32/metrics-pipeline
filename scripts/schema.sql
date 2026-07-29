-- ============================================================================
-- REVENUE METRICS SERVICE - SUPABASE POSTGRES MIGRATION
-- Uses gen_random_uuid() (Supabase built-in, no extension needed)
-- ============================================================================

-- 1. SOURCES TABLE
CREATE TABLE IF NOT EXISTS sources (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sources (id, name, description) VALUES
  ('stripe', 'Stripe Payments', 'Real/Sandbox Stripe PaymentIntents & Charges'),
  ('paypal', 'PayPal Gateway', 'PayPal Checkout & Subscription Invoices'),
  ('razorpay', 'Razorpay Payments', 'Razorpay Orders & Captures')
ON CONFLICT (id) DO NOTHING;

-- 2. CANONICAL STATUS ALLOW-LIST TABLE
CREATE TABLE IF NOT EXISTS status_allow_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id VARCHAR(50) REFERENCES sources(id) ON DELETE CASCADE,
  raw_status VARCHAR(100) NOT NULL,
  is_revenue_collected BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_source_raw_status UNIQUE (source_id, raw_status)
);

INSERT INTO status_allow_list (source_id, raw_status, is_revenue_collected, description) VALUES
  ('stripe', 'succeeded', TRUE, 'Stripe succeeded payment intent or charge'),
  ('stripe', 'paid', TRUE, 'Stripe paid invoice'),
  ('stripe', 'requires_payment_method', FALSE, 'Stripe payment incomplete'),
  ('stripe', 'pending', FALSE, 'Stripe processing'),
  ('stripe', 'failed', FALSE, 'Stripe failed payment'),
  ('stripe', 'canceled', FALSE, 'Stripe canceled payment'),
  ('paypal', 'completed', TRUE, 'PayPal completed transaction'),
  ('paypal', 'approved', TRUE, 'PayPal approved payment'),
  ('paypal', 'pending', FALSE, 'PayPal hold/review'),
  ('paypal', 'refunded', FALSE, 'PayPal refunded payment'),
  ('paypal', 'denied', FALSE, 'PayPal denied transaction'),
  ('razorpay', 'paid', TRUE, 'Razorpay paid invoice/order'),
  ('razorpay', 'captured', TRUE, 'Razorpay captured payment'),
  ('razorpay', 'created', FALSE, 'Razorpay pending order'),
  ('razorpay', 'failed', FALSE, 'Razorpay failed transaction'),
  ('razorpay', 'authorized', FALSE, 'Razorpay authorized but not captured yet')
ON CONFLICT (source_id, raw_status) DO UPDATE
SET is_revenue_collected = EXCLUDED.is_revenue_collected;

-- 3. NORMALIZED TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS normalized_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id VARCHAR(50) NOT NULL REFERENCES sources(id),
  external_id VARCHAR(255) NOT NULL,
  raw_status VARCHAR(100) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  transaction_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_source_external_id UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_norm_tx_date ON normalized_transactions (transaction_at);
CREATE INDEX IF NOT EXISTS idx_norm_tx_source_status ON normalized_transactions (source_id, raw_status);

-- 4. CANONICAL COLLECTED REVENUE SQL VIEW (SINGLE SOURCE OF TRUTH)
CREATE OR REPLACE VIEW v_canonical_collected_revenue AS
SELECT
  t.id,
  t.source_id,
  t.external_id,
  t.raw_status,
  t.amount_cents,
  t.currency,
  t.transaction_at,
  DATE_TRUNC('day', t.transaction_at AT TIME ZONE 'UTC')::DATE AS transaction_date,
  DATE_TRUNC('week', t.transaction_at AT TIME ZONE 'UTC')::DATE AS transaction_week
FROM normalized_transactions t
INNER JOIN status_allow_list sal
  ON t.source_id = sal.source_id
 AND LOWER(t.raw_status) = LOWER(sal.raw_status)
WHERE sal.is_revenue_collected = TRUE;
