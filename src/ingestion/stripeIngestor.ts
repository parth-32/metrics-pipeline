import Stripe from 'stripe';
import { supabase, isLiveSupabaseAvailable, inMemoryDb } from '../db/supabase';
import { NormalizedTransaction } from '../types';

export class StripeIngestor {
  private stripeClient: Stripe | null = null;

  constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (apiKey && apiKey.startsWith('sk_test_')) {
      this.stripeClient = new Stripe(apiKey, { apiVersion: '2024-06-20' });
    }
  }

  /**
   * Ingests real Stripe payment intents / charges or fallback mock dataset.
   * Ensures IDEMPOTENT UPSERT using (source_id, external_id) composite key.
   */
  public async ingestStripeTransactions(): Promise<{ ingestedCount: number; transactions: NormalizedTransaction[] }> {
    let rawTransactions: Array<{
      external_id: string;
      raw_status: string;
      amount_cents: number;
      currency: string;
      transaction_at: Date;
      metadata: Record<string, any>;
    }> = [];

    if (this.stripeClient) {
      try {
        const paymentIntents = await this.stripeClient.paymentIntents.list({ limit: 50 });
        rawTransactions = paymentIntents.data.map(pi => ({
          external_id: pi.id,
          raw_status: pi.status, // e.g. 'succeeded', 'requires_payment_method', 'processing'
          amount_cents: pi.amount,
          currency: pi.currency.toUpperCase(),
          transaction_at: new Date(pi.created * 1000),
          metadata: pi.metadata || {}
        }));
      } catch (err) {
        console.warn('Stripe API fetch failed, falling back to mock Stripe dataset:', (err as Error).message);
        rawTransactions = this.generateMockStripeData();
      }
    } else {
      rawTransactions = this.generateMockStripeData();
    }

    const saved: NormalizedTransaction[] = [];

    for (const raw of rawTransactions) {
      if (isLiveSupabaseAvailable && supabase) {
        const { data, error } = await supabase
          .from('normalized_transactions')
          .upsert(
            {
              source_id: 'stripe',
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
          console.error('Supabase Stripe upsert error:', error.message);
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

      // Always write to in-memory store as well for zero-drift view evaluation
      const res = inMemoryDb.upsertTransaction({
        source_id: 'stripe',
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

    return { ingestedCount: saved.length, transactions: saved };
  }

  private generateMockStripeData() {
    const now = new Date('2026-07-28T12:00:00Z');
    const day = 24 * 60 * 60 * 1000;

    return [
      {
        external_id: 'pi_3Mtw2eLkdIwHu7ix0Aa11111',
        raw_status: 'succeeded',
        amount_cents: 4999, // $49.99
        currency: 'USD',
        transaction_at: new Date(now.getTime() - 1 * day),
        metadata: { customer_email: 'user1@example.com' }
      },
      {
        external_id: 'pi_3Mtw2eLkdIwHu7ix0Aa22222',
        raw_status: 'succeeded',
        amount_cents: 12000, // $120.00
        currency: 'USD',
        transaction_at: new Date(now.getTime() - 2 * day),
        metadata: { customer_email: 'user2@example.com' }
      },
      {
        external_id: 'pi_3Mtw2eLkdIwHu7ix0Aa33333',
        raw_status: 'requires_payment_method', // Uncollected
        amount_cents: 8500,
        currency: 'USD',
        transaction_at: new Date(now.getTime() - 2 * day),
        metadata: { failure_reason: 'card_declined' }
      },
      {
        external_id: 'in_1Mtw2eLkdIwHu7ix0Aa44444',
        raw_status: 'paid',
        amount_cents: 29900, // $299.00
        currency: 'USD',
        transaction_at: new Date(now.getTime() - 5 * day),
        metadata: { invoice_id: 'inv_101' }
      },
      {
        external_id: 'pi_3Mtw2eLkdIwHu7ix0Aa55555',
        raw_status: 'failed', // Uncollected
        amount_cents: 1500,
        currency: 'USD',
        transaction_at: new Date(now.getTime() - 6 * day),
        metadata: { error: 'insufficient_funds' }
      }
    ];
  }
}
