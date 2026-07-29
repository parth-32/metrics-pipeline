import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { metricsRouter } from './routes/metrics';
import { swaggerSpec } from './swagger';
import { StripeIngestor } from '../ingestion/stripeIngestor';
import { MultiSourceSeeder } from '../ingestion/multiSourceSeeder';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/v1/metrics', metricsRouter);
app.use('/api/v1', metricsRouter);

// Swagger OpenAPI Documentation UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root JSON Status Redirect to Swagger Docs
app.get('/', (req, res) => {
  res.json({
    service: 'Revenue Metrics Service',
    status: 'online',
    version: '1.0.0',
    assignment: 'Problem Statement 2 — Revenue Metrics Service',
    swagger_docs: '/docs',
    endpoints: {
      summary: '/api/v1/metrics/revenue/summary',
      breakdown: '/api/v1/metrics/revenue/breakdown?granularity=day',
      allow_list: '/api/v1/metrics/allow-list',
      drift_check: '/api/v1/metrics/audit/drift-check'
    }
  });
});

// Auto-seed sample data on startup
async function bootstrap() {
  if (process.env.VERCEL) {
    console.log('Running on Vercel. Skipping startup seeding and listener.');
    return;
  }

  console.log('Bootstrapping Revenue Metrics Service...');
  const stripeIngestor = new StripeIngestor();
  const seeder = new MultiSourceSeeder();

  await stripeIngestor.ingestStripeTransactions();
  await seeder.seedMultiSourceData();

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Revenue Metrics Service listening on port ${PORT}`);
    console.log(`📚 Interactive Swagger API Docs: http://localhost:${PORT}/docs`);
    console.log(`====================================================`);
  });
}

bootstrap().catch(err => {
  console.error('Bootstrapping error:', err);
});

export default app;
