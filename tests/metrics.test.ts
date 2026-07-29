import { describe, it, expect, beforeEach } from 'vitest';
import { revenueService } from '../src/metrics/revenueService';
import { globalAllowList } from '../src/metrics/allowList';
import { driftGuard } from '../src/metrics/driftGuard';
import { inMemoryDb } from '../src/db/supabase';
import { StripeIngestor } from '../src/ingestion/stripeIngestor';
import { MultiSourceSeeder } from '../src/ingestion/multiSourceSeeder';

describe('Revenue Metrics Service & Zero-Drift Engine', () => {
  beforeEach(async () => {
    inMemoryDb.clear();
    const stripeIngestor = new StripeIngestor();
    const seeder = new MultiSourceSeeder();
    await stripeIngestor.ingestStripeTransactions();
    await seeder.seedMultiSourceData();
  });

  it('1. Idempotency Test: Duplicate webhook / job execution should NOT create duplicate rows', async () => {
    const initialSummary = await revenueService.getSummary();

    // Re-run seeder & ingestion back-to-back
    const stripeIngestor = new StripeIngestor();
    const seeder = new MultiSourceSeeder();
    await stripeIngestor.ingestStripeTransactions();
    await seeder.seedMultiSourceData();

    const secondSummary = await revenueService.getSummary();

    expect(secondSummary.total_collected_cents).toBe(initialSummary.total_collected_cents);
    expect(secondSummary.total_transactions_count).toBe(initialSummary.total_transactions_count);
  });

  it('2. Strict Allow-List Test: Un-allowlisted statuses must NOT inflate revenue metrics', async () => {
    const initialSummary = await revenueService.getSummary();

    // Inject un-allowlisted transactions
    inMemoryDb.upsertTransaction({
      source_id: 'stripe',
      external_id: 'TEST-UNALLOWED-01',
      raw_status: 'failed', // Uncollected
      amount_cents: 99000,
      currency: 'USD',
      transaction_at: new Date()
    });

    inMemoryDb.upsertTransaction({
      source_id: 'paypal',
      external_id: 'TEST-UNALLOWED-02',
      raw_status: 'refunded', // Uncollected
      amount_cents: 45000,
      currency: 'USD',
      transaction_at: new Date()
    });

    inMemoryDb.upsertTransaction({
      source_id: 'razorpay',
      external_id: 'TEST-UNALLOWED-03',
      raw_status: 'new_unknown_status', // Completely unexpected status
      amount_cents: 120000,
      currency: 'USD',
      transaction_at: new Date()
    });

    const newSummary = await revenueService.getSummary();

    expect(newSummary.total_collected_cents).toBe(initialSummary.total_collected_cents);
  });

  it('3. Zero-Drift Invariant Test: Summary total MUST equal sum of breakdown buckets', async () => {
    const summary = await revenueService.getSummary();
    const dayBreakdown = await revenueService.getBreakdown(undefined, 'day');
    const weekBreakdown = await revenueService.getBreakdown(undefined, 'week');
    const monthBreakdown = await revenueService.getBreakdown(undefined, 'month');

    const daySum = dayBreakdown.buckets.reduce((acc, b) => acc + b.collected_cents, 0);
    const weekSum = weekBreakdown.buckets.reduce((acc, b) => acc + b.collected_cents, 0);
    const monthSum = monthBreakdown.buckets.reduce((acc, b) => acc + b.collected_cents, 0);

    expect(daySum).toBe(summary.total_collected_cents);
    expect(weekSum).toBe(summary.total_collected_cents);
    expect(monthSum).toBe(summary.total_collected_cents);

    expect(dayBreakdown.invariant_check.matches_summary).toBe(true);
    expect(dayBreakdown.invariant_check.drift_cents).toBe(0);
  });

  it('4. Multi-Source Status Vocabularies: Ingests & maps Stripe, PayPal, and Razorpay statuses correctly', async () => {
    const activeAllowList = globalAllowList.getActiveAllowList();
    const sourceIds = activeAllowList.map(a => a.source_id);

    expect(sourceIds).toContain('stripe');
    expect(sourceIds).toContain('paypal');
    expect(sourceIds).toContain('razorpay');

    // Confirm that Stripe succeeded, PayPal completed, Razorpay paid/captured count
    expect(globalAllowList.isRevenueCollected('stripe', 'succeeded')).toBe(true);
    expect(globalAllowList.isRevenueCollected('paypal', 'completed')).toBe(true);
    expect(globalAllowList.isRevenueCollected('razorpay', 'paid')).toBe(true);
    expect(globalAllowList.isRevenueCollected('razorpay', 'captured')).toBe(true);

    // Confirm uncollected statuses return false
    expect(globalAllowList.isRevenueCollected('stripe', 'failed')).toBe(false);
    expect(globalAllowList.isRevenueCollected('paypal', 'pending')).toBe(false);
    expect(globalAllowList.isRevenueCollected('razorpay', 'created')).toBe(false);
  });
});
