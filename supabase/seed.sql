-- ============================================================================
-- SUPABASE LOCAL CLI SEED FILE (supabase/seed.sql)
-- ============================================================================

-- Seed Sources
INSERT INTO sources (id, name, description) VALUES
  ('stripe', 'Stripe Payments', 'Real/Sandbox Stripe PaymentIntents & Charges'),
  ('paypal', 'PayPal Gateway', 'PayPal Checkout & Subscription Invoices'),
  ('razorpay', 'Razorpay Payments', 'Razorpay Orders & Captures')
ON CONFLICT (id) DO NOTHING;

-- Seed Allow-list mappings
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

-- Seed Sample Normalized Transactions
INSERT INTO normalized_transactions (source_id, external_id, raw_status, amount_cents, currency, transaction_at, metadata) VALUES
  ('stripe', 'pi_3Mtw2eLkdIwHu7ix0Aa11111', 'succeeded', 4999, 'USD', '2026-07-27T12:00:00Z', '{"customer": "user1@example.com"}'),
  ('stripe', 'pi_3Mtw2eLkdIwHu7ix0Aa22222', 'succeeded', 12000, 'USD', '2026-07-26T12:00:00Z', '{"customer": "user2@example.com"}'),
  ('stripe', 'pi_3Mtw2eLkdIwHu7ix0Aa33333', 'requires_payment_method', 8500, 'USD', '2026-07-26T12:00:00Z', '{"error": "card_declined"}'),
  ('paypal', 'PAYPAL-TX-9001', 'completed', 7500, 'USD', '2026-07-27T10:30:00Z', '{"payer": "paypal1@example.com"}'),
  ('paypal', 'PAYPAL-TX-9002', 'completed', 15000, 'USD', '2026-07-26T14:15:00Z', '{"payer": "paypal2@example.com"}'),
  ('paypal', 'PAYPAL-TX-9003', 'pending', 22000, 'USD', '2026-07-25T09:00:00Z', '{"reason": "echeck"}'),
  ('razorpay', 'pay_RZP_88192001', 'paid', 5000, 'USD', '2026-07-27T18:00:00Z', '{"method": "upi"}'),
  ('razorpay', 'pay_RZP_88192002', 'captured', 35000, 'USD', '2026-07-23T11:45:00Z', '{"method": "card"}'),
  ('razorpay', 'pay_RZP_88192004', 'failed', 8000, 'USD', '2026-07-21T15:30:00Z', '{"error": "BAD_REQUEST"}')
ON CONFLICT (source_id, external_id) DO NOTHING;
