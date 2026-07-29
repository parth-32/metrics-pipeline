export type SourceSystem = 'stripe' | 'paypal' | 'razorpay' | string;

export interface NormalizedTransaction {
  id: string;
  source_id: SourceSystem;
  external_id: string;
  raw_status: string;
  amount_cents: number;
  currency: string;
  transaction_at: Date;
  metadata?: Record<string, any>;
}

export interface StatusAllowListEntry {
  source_id: SourceSystem;
  raw_status: string;
  is_revenue_collected: boolean;
  description?: string;
}

export interface RevenueFilter {
  start_date?: Date | string;
  end_date?: Date | string;
  source_id?: SourceSystem;
}

export type Granularity = 'day' | 'week' | 'month';

export interface RevenueSummary {
  total_collected_cents: number;
  total_collected_formatted: string;
  total_transactions_count: number;
  currency: string;
  filter: {
    start_date: string | null;
    end_date: string | null;
    source_id: string | null;
  };
  allow_list_used: Array<{ source_id: string; status: string }>;
}

export interface BreakdownBucket {
  period: string; // e.g. "2026-07-28" or "2026-W30"
  start_date: string;
  end_date: string;
  collected_cents: number;
  collected_formatted: string;
  transaction_count: number;
  sources_breakdown: Record<string, { cents: number; count: number }>;
}

export interface RevenueBreakdown {
  granularity: Granularity;
  buckets: BreakdownBucket[];
  total_collected_cents: number; // Sum of buckets
  total_collected_formatted: string;
  currency: string;
  filter: {
    start_date: string | null;
    end_date: string | null;
    source_id: string | null;
  };
  invariant_check: {
    matches_summary: boolean;
    drift_cents: number;
  };
}
