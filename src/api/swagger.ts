import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Zero-Drift Revenue Metrics Service API',
      version: '1.0.0',
      description:
        'Backend assignment submission for Problem Statement 2. Ingests normalized transaction data from multiple sources (Stripe, PayPal, Razorpay), resolves status vocabularies using a strict allow-list, and guarantees zero drift between summary and breakdown views.',
      contact: {
        name: 'Backend API Developer'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server'
      }
    ],
    paths: {
      '/api/v1/metrics/revenue/summary': {
        get: {
          summary: 'Get Total Collected Revenue Summary',
          description: 'Calculates total collected revenue across all source systems for an arbitrary date range using one canonical allow-list definition.',
          parameters: [
            {
              name: 'start_date',
              in: 'query',
              description: 'Filter start date (ISO string e.g. 2026-01-01)',
              required: false,
              schema: { type: 'string', format: 'date-time' }
            },
            {
              name: 'end_date',
              in: 'query',
              description: 'Filter end date (ISO string e.g. 2026-12-31)',
              required: false,
              schema: { type: 'string', format: 'date-time' }
            },
            {
              name: 'source',
              in: 'query',
              description: 'Filter by specific source system (stripe, paypal, razorpay)',
              required: false,
              schema: { type: 'string' }
            }
          ],
          responses: {
            200: {
              description: 'Successful summary calculation',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: {
                      total_collected_cents: 127898,
                      total_collected_formatted: '$1,278.98',
                      total_transactions_count: 10,
                      currency: 'USD',
                      filter: { start_date: null, end_date: null, source_id: null },
                      allow_list_used: [
                        { source_id: 'stripe', status: 'succeeded' },
                        { source_id: 'paypal', status: 'completed' },
                        { source_id: 'razorpay', status: 'paid' }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/metrics/revenue/breakdown': {
        get: {
          summary: 'Get Period-by-Period Revenue Breakdown (Zero Drift)',
          description: 'Returns time bucketed revenue (day, week, or month) and asserts zero mathematical drift against the summary total.',
          parameters: [
            {
              name: 'granularity',
              in: 'query',
              description: 'Time bucket size',
              required: false,
              schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' }
            },
            {
              name: 'start_date',
              in: 'query',
              description: 'Filter start date',
              required: false,
              schema: { type: 'string' }
            },
            {
              name: 'end_date',
              in: 'query',
              description: 'Filter end date',
              required: false,
              schema: { type: 'string' }
            },
            {
              name: 'source',
              in: 'query',
              description: 'Filter by source system',
              required: false,
              schema: { type: 'string' }
            }
          ],
          responses: {
            200: {
              description: 'Successful breakdown with zero-drift assertion',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: {
                      granularity: 'day',
                      buckets: [
                        {
                          period: '2026-07-28',
                          start_date: '2026-07-28T00:00:00.000Z',
                          end_date: '2026-07-28T23:59:59.999Z',
                          collected_cents: 48399,
                          collected_formatted: '$483.99',
                          transaction_count: 4,
                          sources_breakdown: { stripe: { cents: 48399, count: 4 } }
                        }
                      ],
                      total_collected_cents: 127898,
                      total_collected_formatted: '$1,278.98',
                      currency: 'USD',
                      invariant_check: {
                        matches_summary: true,
                        drift_cents: 0
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/metrics/allow-list': {
        get: {
          summary: 'Get Status Allow-List Configuration',
          description: 'Returns the active canonical status allow-list definitions used for revenue normalization.',
          responses: {
            200: {
              description: 'Active status allow-list rules',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    data: {
                      active_allow_list: [
                        { source_id: 'stripe', status: 'succeeded' },
                        { source_id: 'paypal', status: 'completed' },
                        { source_id: 'razorpay', status: 'paid' }
                      ],
                      rule: 'ONLY statuses explicitly allow-listed with is_revenue_collected = true are included in revenue calculation.'
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/metrics/audit/drift-check': {
        get: {
          summary: 'Run Automated Zero-Drift & Status Resilience Audit',
          description: 'Executes automated property tests verifying 0 cents drift across daily, weekly, and monthly views, along with status allow-list noise injection tests.',
          responses: {
            200: {
              description: 'Audit verification report',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    timestamp: '2026-07-28T12:00:00.000Z',
                    audit: {
                      zero_drift_check: {
                        isZeroDrift: true,
                        summaryTotalCents: 127898,
                        dayBreakdownSumCents: 127898,
                        weekBreakdownSumCents: 127898,
                        monthBreakdownSumCents: 127898,
                        driftDayCents: 0
                      },
                      status_allow_list_resilience: {
                        passed: true,
                        initialTotal: 127898,
                        totalAfterNoise: 127898,
                        noiseIgnoredCount: 3
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/ingest/seed': {
        post: {
          summary: 'Trigger Multi-Source Ingestion & Stripe Sync',
          description: 'Pulls live test payment intents from Stripe API and seeds sample PayPal and Razorpay records into Supabase Postgres.',
          responses: {
            200: {
              description: 'Ingestion completed',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Multi-source transactions ingested & synced successfully',
                    details: {
                      stripe_records_ingested: 5,
                      multi_source_records_seeded: 8
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: []
};

export const swaggerSpec = swaggerJsdoc(options);
