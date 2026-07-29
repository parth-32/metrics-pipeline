import { supabase, isLiveSupabaseAvailable, inMemoryDb } from '../db/supabase';
import { NormalizedTransaction } from '../types';

export class MultiSourceSeeder {
  /**
   * Seeds sample multi-source transactions (PayPal, Razorpay, Legacy Invoices)
   * into Supabase / In-Memory store with explicit status vocabulary mapping.
   */
  public async seedMultiSourceData(): Promise<{ totalSeeded: number; transactions: NormalizedTransaction[] }> {
    const mockMultiSourceData = [
      // ----------------------------------------------------------------------
      // PAYPAL SOURCE
      // ----------------------------------------------------------------------
      {
        source_id: 'paypal',
        external_id: 'PAYPAL-TX-9001',
        raw_status: 'completed', // Allow-listed: Collected
        amount_cents: 7500, // $75.00
        currency: 'USD',
        transaction_at: new Date('2026-07-27T10:30:00Z'),
        metadata: { payer_email: 'paypal_user1@example.com' }
      },
      {
        source_id: 'paypal',
        external_id: 'PAYPAL-TX-9002',
        raw_status: 'completed', // Allow-listed: Collected
        amount_cents: 15000, // $150.00
        currency: 'USD',
        transaction_at: new Date('2026-07-26T14:15:00Z'),
        metadata: { payer_email: 'paypal_user2@example.com' }
      },
      {
        source_id: 'paypal',
        external_id: 'PAYPAL-TX-9003',
        raw_status: 'pending', // Uncollected
        amount_cents: 22000,
        currency: 'USD',
        transaction_at: new Date('2026-07-25T09:00:00Z'),
        metadata: { reason: 'echeck_pending' }
      },
      {
        source_id: 'paypal',
        external_id: 'PAYPAL-TX-9004',
        raw_status: 'refunded', // Uncollected
        amount_cents: 5000,
        currency: 'USD',
        transaction_at: new Date('2026-07-24T16:20:00Z'),
        metadata: { dispute_id: 'DISP-882' }
      },

      // ----------------------------------------------------------------------
      // RAZORPAY SOURCE
      // ----------------------------------------------------------------------
      {
        source_id: 'razorpay',
        external_id: 'pay_RZP_88192001',
        raw_status: 'paid', // Allow-listed: Collected
        amount_cents: 5000, // $50.00 equivalent
        currency: 'USD',
        transaction_at: new Date('2026-07-27T18:00:00Z'),
        metadata: { payment_method: 'upi' }
      },
      {
        source_id: 'razorpay',
        external_id: 'pay_RZP_88192002',
        raw_status: 'captured', // Allow-listed: Collected
        amount_cents: 35000, // $350.00 equivalent
        currency: 'USD',
        transaction_at: new Date('2026-07-23T11:45:00Z'),
        metadata: { payment_method: 'card' }
      },
      {
        source_id: 'razorpay',
        external_id: 'pay_RZP_88192003',
        raw_status: 'authorized', // Uncollected
        amount_cents: 12500,
        currency: 'USD',
        transaction_at: new Date('2026-07-22T08:10:00Z'),
        metadata: { auto_capture: false }
      },
      {
        source_id: 'razorpay',
        external_id: 'pay_RZP_88192004',
        raw_status: 'failed', // Uncollected
        amount_cents: 8000,
        currency: 'USD',
        transaction_at: new Date('2026-07-21T15:30:00Z'),
        metadata: { error_code: 'BAD_REQUEST_ERROR' }
      }
    ];

    const saved: NormalizedTransaction[] = [];

    for (const raw of mockMultiSourceData) {
      if (isLiveSupabaseAvailable && supabase) {
        const { data, error } = await supabase
          .from('normalized_transactions')
          .upsert(
            {
              source_id: raw.source_id,
              external_id: raw.external_id,
              raw_status: raw.raw_status,
              amount_cents: raw.amount_cents,
              currency: raw.currency,
              transaction_at: raw.transaction_at.toISOString(),
              metadata: raw.metadata
            },
            { onConflict: 'source_id,external_id' }
          )
          .select()
          .single();

        if (error) {
          console.error(`Supabase seeding error for ${raw.source_id}:`, error.message);
        } else if (data) {
          saved.push({
            id: data.id,
            source_id: data.source_id,
            external_id: data.external_id,
            raw_status: data.raw_status,
            amount_cents: Number(data.amount_cents),
            currency: data.currency,
            transaction_at: new Date(data.transaction_at),
            metadata: data.metadata
          });
        }
      }

      // Write to in-memory store for offline view evaluation
      const res = inMemoryDb.upsertTransaction({
        source_id: raw.source_id,
        external_id: raw.external_id,
        raw_status: raw.raw_status,
        amount_cents: raw.amount_cents,
        currency: raw.currency,
        transaction_at: raw.transaction_at,
        metadata: raw.metadata
      });
      if (!isLiveSupabaseAvailable) {
        saved.push(res.tx);
      }
    }

    return { totalSeeded: saved.length, transactions: saved };
  }
}
