import { StatusAllowListEntry, SourceSystem } from '../types';

/**
 * CANONICAL ALLOW-LIST CONFIGURATION
 * 
 * Problem Statement Requirement:
 * "using one canonical definition of 'collected' and an allow-list of statuses
 *  that count, NOT an exclusion list of statuses that don't, since exclusion lists
 *  silently let new or unexpected statuses through as revenue."
 */
export const DEFAULT_STATUS_ALLOW_LIST: StatusAllowListEntry[] = [
  // Stripe
  { source_id: 'stripe', raw_status: 'succeeded', is_revenue_collected: true, description: 'Stripe succeeded payment intent or charge' },
  { source_id: 'stripe', raw_status: 'paid', is_revenue_collected: true, description: 'Stripe paid invoice' },
  { source_id: 'stripe', raw_status: 'requires_payment_method', is_revenue_collected: false },
  { source_id: 'stripe', raw_status: 'pending', is_revenue_collected: false },
  { source_id: 'stripe', raw_status: 'failed', is_revenue_collected: false },
  { source_id: 'stripe', raw_status: 'canceled', is_revenue_collected: false },

  // PayPal
  { source_id: 'paypal', raw_status: 'completed', is_revenue_collected: true, description: 'PayPal completed transaction' },
  { source_id: 'paypal', raw_status: 'approved', is_revenue_collected: true, description: 'PayPal approved payment' },
  { source_id: 'paypal', raw_status: 'pending', is_revenue_collected: false },
  { source_id: 'paypal', raw_status: 'refunded', is_revenue_collected: false },
  { source_id: 'paypal', raw_status: 'denied', is_revenue_collected: false },

  // Razorpay
  { source_id: 'razorpay', raw_status: 'paid', is_revenue_collected: true, description: 'Razorpay paid invoice/order' },
  { source_id: 'razorpay', raw_status: 'captured', is_revenue_collected: true, description: 'Razorpay captured payment' },
  { source_id: 'razorpay', raw_status: 'created', is_revenue_collected: false },
  { source_id: 'razorpay', raw_status: 'failed', is_revenue_collected: false },
  { source_id: 'razorpay', raw_status: 'authorized', is_revenue_collected: false }
];

export class StatusAllowListManager {
  private entries: Map<string, boolean> = new Map();

  constructor(initialEntries: StatusAllowListEntry[] = DEFAULT_STATUS_ALLOW_LIST) {
    this.loadEntries(initialEntries);
  }

  private getKey(source_id: SourceSystem, raw_status: string): string {
    return `${source_id.toLowerCase()}::${raw_status.toLowerCase()}`;
  }

  public loadEntries(entries: StatusAllowListEntry[]): void {
    for (const entry of entries) {
      const key = this.getKey(entry.source_id, entry.raw_status);
      this.entries.set(key, entry.is_revenue_collected);
    }
  }

  /**
   * Strictly evaluates whether a transaction status counts as collected revenue.
   * STRICT ALLOW-LIST GUARANTEE: Returns false if status is unknown or not explicitly allow-listed as true.
   */
  public isRevenueCollected(source_id: SourceSystem, raw_status: string): boolean {
    const key = this.getKey(source_id, raw_status);
    const result = this.entries.get(key);
    // Strict positive match required! Default to FALSE if key does not exist or value is false.
    return result === true;
  }

  /**
   * Returns all active allow-listed statuses for auditing/metadata.
   */
  public getActiveAllowList(): Array<{ source_id: string; status: string }> {
    const active: Array<{ source_id: string; status: string }> = [];
    for (const [key, isCollected] of this.entries.entries()) {
      if (isCollected) {
        const [source_id, status] = key.split('::');
        active.push({ source_id, status });
      }
    }
    return active;
  }
}

export const globalAllowList = new StatusAllowListManager();
