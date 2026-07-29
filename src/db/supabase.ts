import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { NormalizedTransaction, SourceSystem } from '../types';
import { globalAllowList } from '../metrics/allowList';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

export const isLiveSupabaseAvailable = Boolean(supabaseUrl && supabaseKey && !supabaseUrl.includes('your-supabase'));

export let supabase: SupabaseClient | null = null;

if (isLiveSupabaseAvailable) {
  supabase = createClient(supabaseUrl!, supabaseKey!);
}

/**
 * IN-MEMORY DATABASE BACKING STORE & FALLBACK ENGINE
 * Provides identical semantics to Postgres schema & v_canonical_collected_revenue view
 * for offline, CI, and local testing.
 */
class InMemoryDatabaseStore {
  private transactions: Map<string, NormalizedTransaction> = new Map();

  /**
   * Idempotent Upsert for transactions by (source_id, external_id)
   */
  public upsertTransaction(tx: Omit<NormalizedTransaction, 'id'> & { id?: string }): { tx: NormalizedTransaction; isNew: boolean } {
    const compositeKey = `${tx.source_id.toLowerCase()}::${tx.external_id}`;
    const existing = this.transactions.get(compositeKey);

    const fullTx: NormalizedTransaction = {
      id: existing ? existing.id : tx.id || `tx_${Math.random().toString(36).substr(2, 9)}`,
      source_id: tx.source_id,
      external_id: tx.external_id,
      raw_status: tx.raw_status,
      amount_cents: Number(tx.amount_cents),
      currency: tx.currency || 'USD',
      transaction_at: tx.transaction_at instanceof Date ? tx.transaction_at : new Date(tx.transaction_at),
      metadata: tx.metadata || {}
    };

    this.transactions.set(compositeKey, fullTx);
    return { tx: fullTx, isNew: !existing };
  }

  public getAllTransactions(): NormalizedTransaction[] {
    return Array.from(this.transactions.values());
  }

  /**
   * Simulates Postgres SQL view: v_canonical_collected_revenue
   * Filters transactions strictly by globalAllowList.isRevenueCollected(source_id, raw_status)
   */
  public getCanonicalCollectedRevenue(filter?: { start_date?: Date; end_date?: Date; source_id?: SourceSystem }): NormalizedTransaction[] {
    return Array.from(this.transactions.values()).filter(tx => {
      // 1. Strict Allow-List Filter
      const isAllowed = globalAllowList.isRevenueCollected(tx.source_id, tx.raw_status);
      if (!isAllowed) return false;

      // 2. Source Filter
      if (filter?.source_id && tx.source_id.toLowerCase() !== filter.source_id.toLowerCase()) {
        return false;
      }

      // 3. Date Range Filter (inclusive)
      const txTime = tx.transaction_at.getTime();
      if (filter?.start_date && txTime < filter.start_date.getTime()) return false;
      if (filter?.end_date && txTime > filter.end_date.getTime()) return false;

      return true;
    });
  }

  public clear(): void {
    this.transactions.clear();
  }
}

export const inMemoryDb = new InMemoryDatabaseStore();
