import { supabase, isLiveSupabaseAvailable, inMemoryDb } from '../db/supabase';
import { RevenueFilter, RevenueSummary, RevenueBreakdown, BreakdownBucket, Granularity, NormalizedTransaction } from '../types';
import { globalAllowList } from './allowList';

export class RevenueService {
  /**
   * Helper to format cents into clean currency string ($100.50)
   */
  public static formatCurrency(amountCents: number, currency: string = 'USD'): string {
    const symbol = currency.toUpperCase() === 'USD' ? '$' : `${currency} `;
    return `${symbol}${(amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Normalizes incoming filter params (handles string dates -> Date objects)
   */
  private parseFilter(filter?: RevenueFilter): { startDate: Date | null; endDate: Date | null; sourceId: string | null } {
    const startDate = filter?.start_date ? new Date(filter.start_date) : null;
    const endDate = filter?.end_date ? new Date(filter.end_date) : null;
    const sourceId = filter?.source_id ? String(filter.source_id).toLowerCase() : null;

    return { startDate, endDate, sourceId };
  }

  /**
   * CANONICAL QUERY PROVIDER
   * Single Source of Truth fetching canonical collected revenue records.
   * Leverages Supabase Postgres View v_canonical_collected_revenue or in-memory equivalent.
   */
  private async fetchCanonicalRecords(filter?: RevenueFilter): Promise<NormalizedTransaction[]> {
    const { startDate, endDate, sourceId } = this.parseFilter(filter);

    if (isLiveSupabaseAvailable && supabase) {
      let query = supabase.from('v_canonical_collected_revenue').select('*');

      if (startDate) {
        query = query.gte('transaction_at', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('transaction_at', endDate.toISOString());
      }
      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase view query error, using in-memory fallback:', error.message);
      } else if (data) {
        return data.map((item: any) => ({
          id: item.id,
          source_id: item.source_id,
          external_id: item.external_id,
          raw_status: item.raw_status,
          amount_cents: Number(item.amount_cents),
          currency: item.currency,
          transaction_at: new Date(item.transaction_at)
        }));
      }
    }

    // In-Memory Fallback (Guaranteed to execute identical canonical filtering)
    return inMemoryDb.getCanonicalCollectedRevenue({
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      source_id: sourceId || undefined
    });
  }

  /**
   * VIEW 1: SINGLE SUMMARY TOTAL ENDPOINT
   * Computes aggregate total revenue collected for arbitrary date range across all sources.
   */
  public async getSummary(filter?: RevenueFilter): Promise<RevenueSummary> {
    const records = await this.fetchCanonicalRecords(filter);
    const { startDate, endDate, sourceId } = this.parseFilter(filter);

    const totalCents = records.reduce((sum, tx) => sum + tx.amount_cents, 0);

    return {
      total_collected_cents: totalCents,
      total_collected_formatted: RevenueService.formatCurrency(totalCents),
      total_transactions_count: records.length,
      currency: 'USD',
      filter: {
        start_date: startDate ? startDate.toISOString() : null,
        end_date: endDate ? endDate.toISOString() : null,
        source_id: sourceId || null
      },
      allow_list_used: globalAllowList.getActiveAllowList()
    };
  }

  /**
   * VIEW 2: PERIOD BREAKDOWN ENDPOINT (DAY / WEEK / MONTH)
   * Computes period breakdown while asserting ZERO DRIFT against the summary total.
   */
  public async getBreakdown(filter?: RevenueFilter, granularity: Granularity = 'day'): Promise<RevenueBreakdown> {
    const records = await this.fetchCanonicalRecords(filter);
    const summary = await this.getSummary(filter);
    const { startDate, endDate, sourceId } = this.parseFilter(filter);

    // Group records by period bucket
    const bucketsMap = new Map<string, { cents: number; count: number; sources: Record<string, { cents: number; count: number }>; start: string; end: string }>();

    for (const tx of records) {
      const date = tx.transaction_at;
      let periodKey = '';
      let startStr = '';
      let endStr = '';

      if (granularity === 'day') {
        periodKey = date.toISOString().split('T')[0]; // "YYYY-MM-DD"
        startStr = `${periodKey}T00:00:00.000Z`;
        endStr = `${periodKey}T23:59:59.999Z`;
      } else if (granularity === 'week') {
        // Compute ISO week start (Monday)
        const dayOfWeek = date.getUTCDay();
        const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        const monday = new Date(date);
        monday.setUTCDate(date.getUTCDate() + diffToMonday);
        monday.setUTCHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);
        sunday.setUTCHours(23, 59, 59, 999);

        periodKey = `Week of ${monday.toISOString().split('T')[0]}`;
        startStr = monday.toISOString();
        endStr = sunday.toISOString();
      } else {
        // Month
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        periodKey = `${year}-${month}`;
        startStr = `${year}-${month}-01T00:00:00.000Z`;
        const lastDay = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        endStr = lastDay.toISOString();
      }

      if (!bucketsMap.has(periodKey)) {
        bucketsMap.set(periodKey, { cents: 0, count: 0, sources: {}, start: startStr, end: endStr });
      }

      const bucket = bucketsMap.get(periodKey)!;
      bucket.cents += tx.amount_cents;
      bucket.count += 1;

      if (!bucket.sources[tx.source_id]) {
        bucket.sources[tx.source_id] = { cents: 0, count: 0 };
      }
      bucket.sources[tx.source_id].cents += tx.amount_cents;
      bucket.sources[tx.source_id].count += 1;
    }

    // Convert map to sorted array of buckets
    const buckets: BreakdownBucket[] = Array.from(bucketsMap.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([period, data]) => ({
        period,
        start_date: data.start,
        end_date: data.end,
        collected_cents: data.cents,
        collected_formatted: RevenueService.formatCurrency(data.cents),
        transaction_count: data.count,
        sources_breakdown: data.sources
      }));

    // Calculate sum across all buckets
    const breakdownTotalCents = buckets.reduce((sum, b) => sum + b.collected_cents, 0);

    // ZERO DRIFT INVARIANT ASSERTION
    const driftCents = Math.abs(breakdownTotalCents - summary.total_collected_cents);
    const matchesSummary = driftCents === 0;

    if (!matchesSummary) {
      console.error(`CRITICAL INVARIANT BREACH: Breakdown total (${breakdownTotalCents}) does not match Summary total (${summary.total_collected_cents}). Drift: ${driftCents} cents.`);
    }

    return {
      granularity,
      buckets,
      total_collected_cents: breakdownTotalCents,
      total_collected_formatted: RevenueService.formatCurrency(breakdownTotalCents),
      currency: 'USD',
      filter: {
        start_date: startDate ? startDate.toISOString() : null,
        end_date: endDate ? endDate.toISOString() : null,
        source_id: sourceId || null
      },
      invariant_check: {
        matches_summary: matchesSummary,
        drift_cents: driftCents
      }
    };
  }
}

export const revenueService = new RevenueService();
