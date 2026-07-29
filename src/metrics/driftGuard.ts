import { revenueService } from './revenueService';
import { inMemoryDb } from '../db/supabase';
import { globalAllowList } from './allowList';
import { NormalizedTransaction } from '../types';

export class DriftGuardEngine {
  /**
   * RUNTIME INVARIANT VERIFICATION
   * Evaluates if Summary total equals Breakdown totals for all granularities (day, week, month).
   */
  public async verifyZeroDrift(filter?: { start_date?: string; end_date?: string; source_id?: string }) {
    const summary = await revenueService.getSummary(filter);
    const dayBreakdown = await revenueService.getBreakdown(filter, 'day');
    const weekBreakdown = await revenueService.getBreakdown(filter, 'week');
    const monthBreakdown = await revenueService.getBreakdown(filter, 'month');

    const daySum = dayBreakdown.buckets.reduce((acc, b) => acc + b.collected_cents, 0);
    const weekSum = weekBreakdown.buckets.reduce((acc, b) => acc + b.collected_cents, 0);
    const monthSum = monthBreakdown.buckets.reduce((acc, b) => acc + b.collected_cents, 0);

    const isDayValid = daySum === summary.total_collected_cents;
    const isWeekValid = weekSum === summary.total_collected_cents;
    const isMonthValid = monthSum === summary.total_collected_cents;

    const isZeroDrift = isDayValid && isWeekValid && isMonthValid;

    return {
      isZeroDrift,
      summaryTotalCents: summary.total_collected_cents,
      dayBreakdownSumCents: daySum,
      weekBreakdownSumCents: weekSum,
      monthBreakdownSumCents: monthSum,
      driftDayCents: Math.abs(daySum - summary.total_collected_cents),
      driftWeekCents: Math.abs(weekSum - summary.total_collected_cents),
      driftMonthCents: Math.abs(monthSum - summary.total_collected_cents)
    };
  }

  /**
   * UNEXPECTED STATUS RESILIENCE TEST
   * Verifies that adding transactions with un-allowlisted or unexpected statuses
   * produces ZERO inflation of collected revenue metrics.
   */
  public async verifyAllowListResilience(): Promise<{ passed: boolean; initialTotal: number; totalAfterNoise: number; noiseIgnoredCount: number }> {
    const initialSummary = await revenueService.getSummary();

    // Inject noisy transactions with unexpected or non-allowlisted statuses
    const noisyTransactions: Array<Omit<NormalizedTransaction, 'id'>> = [
      {
        source_id: 'stripe',
        external_id: 'NOISE-STRIPE-001',
        raw_status: 'unconfirmed_draft_status', // Unknown status
        amount_cents: 999999, // Large amount ($9,999.99)
        currency: 'USD',
        transaction_at: new Date()
      },
      {
        source_id: 'paypal',
        external_id: 'NOISE-PAYPAL-002',
        raw_status: 'disputed_in_review', // Uncollected status
        amount_cents: 500000,
        currency: 'USD',
        transaction_at: new Date()
      },
      {
        source_id: 'razorpay',
        external_id: 'NOISE-RZP-003',
        raw_status: 'settlement_failed', // Uncollected status
        amount_cents: 120000,
        currency: 'USD',
        transaction_at: new Date()
      }
    ];

    for (const noise of noisyTransactions) {
      inMemoryDb.upsertTransaction(noise);
    }

    const summaryAfterNoise = await revenueService.getSummary();

    const passed = initialSummary.total_collected_cents === summaryAfterNoise.total_collected_cents;

    return {
      passed,
      initialTotal: initialSummary.total_collected_cents,
      totalAfterNoise: summaryAfterNoise.total_collected_cents,
      noiseIgnoredCount: noisyTransactions.length
    };
  }
}

export const driftGuard = new DriftGuardEngine();
