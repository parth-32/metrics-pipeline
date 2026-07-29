import { StripeIngestor } from '../ingestion/stripeIngestor';
import { MultiSourceSeeder } from '../ingestion/multiSourceSeeder';

async function runSeed() {
  console.log('🌱 Starting Multi-Source Revenue Data Seeder...');

  const stripeIngestor = new StripeIngestor();
  const seeder = new MultiSourceSeeder();

  const stripeResult = await stripeIngestor.ingestStripeTransactions();
  console.log(`✅ Ingested ${stripeResult.ingestedCount} Stripe transactions.`);

  const multiResult = await seeder.seedMultiSourceData();
  console.log(`✅ Seeded ${multiResult.totalSeeded} alternative multi-source records (PayPal, Razorpay).`);

  console.log('🎉 Seeding complete successfully!');
}

runSeed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
