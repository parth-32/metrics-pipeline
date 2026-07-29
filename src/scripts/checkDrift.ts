import { driftGuard } from '../metrics/driftGuard';
import { StripeIngestor } from '../ingestion/stripeIngestor';
import { MultiSourceSeeder } from '../ingestion/multiSourceSeeder';

async function runCheckDrift() {
  console.log('🔍 Running Zero-Drift Architectural Verification...');

  // Ensure database has records
  const stripeIngestor = new StripeIngestor();
  const seeder = new MultiSourceSeeder();
  await stripeIngestor.ingestStripeTransactions();
  await seeder.seedMultiSourceData();

  const driftReport = await driftGuard.verifyZeroDrift();
  console.log('\n--- ZERO DRIFT REPORT ---');
  console.log(`Summary Total Revenue: $${(driftReport.summaryTotalCents / 100).toFixed(2)} (${driftReport.summaryTotalCents} cents)`);
  console.log(`Sum of Daily Buckets:  $${(driftReport.dayBreakdownSumCents / 100).toFixed(2)} (${driftReport.dayBreakdownSumCents} cents)`);
  console.log(`Sum of Weekly Buckets: $${(driftReport.weekBreakdownSumCents / 100).toFixed(2)} (${driftReport.weekBreakdownSumCents} cents)`);
  console.log(`Sum of Monthly Buckets:$${(driftReport.monthBreakdownSumCents / 100).toFixed(2)} (${driftReport.monthBreakdownSumCents} cents)`);
  console.log(`Day Drift:   ${driftReport.driftDayCents} cents`);
  console.log(`Week Drift:  ${driftReport.driftWeekCents} cents`);
  console.log(`Month Drift: ${driftReport.driftMonthCents} cents`);

  if (!driftReport.isZeroDrift) {
    console.error('❌ FAIL: Metric drift detected between summary and breakdown views!');
    process.exit(1);
  }
  console.log('✅ PASS: Perfect zero-drift alignment across all views!');

  console.log('\n--- ALLOW-LIST RESILIENCE TEST ---');
  const allowListReport = await driftGuard.verifyAllowListResilience();
  console.log(`Initial Total:       $${(allowListReport.initialTotal / 100).toFixed(2)}`);
  console.log(`Total After Noise:   $${(allowListReport.totalAfterNoise / 100).toFixed(2)}`);
  console.log(`Noisy Records Added: ${allowListReport.noiseIgnoredCount}`);

  if (!allowListReport.passed) {
    console.error('❌ FAIL: Allow-list failed! Unexpected status values inflated revenue total.');
    process.exit(1);
  }
  console.log('✅ PASS: Allow-list successfully blocked unexpected status values from metric inflation!');

  console.log('\n🎉 ALL ARCHITECTURAL DRIFT CHECKS PASSED PERFECTLY!');
}

runCheckDrift().catch(err => {
  console.error('❌ Verification script error:', err);
  process.exit(1);
});
