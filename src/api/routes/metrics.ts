import { Router, Request, Response } from 'express';
import { revenueService } from '../../metrics/revenueService';
import { globalAllowList } from '../../metrics/allowList';
import { driftGuard } from '../../metrics/driftGuard';
import { StripeIngestor } from '../../ingestion/stripeIngestor';
import { MultiSourceSeeder } from '../../ingestion/multiSourceSeeder';

export const metricsRouter = Router();

/**
 * GET /api/v1/metrics/revenue/summary
 * Single summary total endpoint for arbitrary date range across sources.
 */
metricsRouter.get('/revenue/summary', async (req: Request, res: Response) => {
  try {
    const filter = {
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      source_id: req.query.source as string
    };

    const summary = await revenueService.getSummary(filter);
    return res.json({ success: true, data: summary });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/v1/metrics/revenue/breakdown
 * Period breakdown endpoint (day / week / month) with zero-drift assertion.
 */
metricsRouter.get('/revenue/breakdown', async (req: Request, res: Response) => {
  try {
    const filter = {
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      source_id: req.query.source as string
    };

    const granularity = (req.query.granularity as 'day' | 'week' | 'month') || 'day';

    if (!['day', 'week', 'month'].includes(granularity)) {
      return res.status(400).json({
        success: false,
        error: "Invalid granularity. Allowed values: 'day', 'week', 'month'"
      });
    }

    const breakdown = await revenueService.getBreakdown(filter, granularity);
    return res.json({ success: true, data: breakdown });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/v1/metrics/allow-list
 * Exposes canonical status allow-list definitions.
 */
metricsRouter.get('/allow-list', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      active_allow_list: globalAllowList.getActiveAllowList(),
      rule: "ONLY statuses explicitly allow-listed with is_revenue_collected = true are included in revenue calculation. Unknown or excluded statuses are ignored."
    }
  });
});

/**
 * GET /api/v1/metrics/audit/drift-check
 * Triggers architectural anti-drift verification on live dataset.
 */
metricsRouter.get('/audit/drift-check', async (req: Request, res: Response) => {
  try {
    const filter = {
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      source_id: req.query.source as string
    };

    const driftReport = await driftGuard.verifyZeroDrift(filter);
    const allowListReport = await driftGuard.verifyAllowListResilience();

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      audit: {
        zero_drift_check: driftReport,
        status_allow_list_resilience: allowListReport
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/v1/ingest/seed
 * Triggers multi-source ingestion & Stripe sync on demand.
 */
metricsRouter.post('/ingest/seed', async (req: Request, res: Response) => {
  try {
    const stripeIngestor = new StripeIngestor();
    const seeder = new MultiSourceSeeder();

    const stripeRes = await stripeIngestor.ingestStripeTransactions();
    const seederRes = await seeder.seedMultiSourceData();

    return res.json({
      success: true,
      message: "Multi-source transactions ingested & synced successfully",
      details: {
        stripe_records_ingested: stripeRes.ingestedCount,
        multi_source_records_seeded: seederRes.totalSeeded
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});
