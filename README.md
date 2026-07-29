# Zero-Drift Revenue Metrics Service — Backend Assignment (Problem Statement 2)

A production-ready, backend-focused Revenue Metrics Service built with **Node.js, TypeScript, Express, and Supabase (Postgres)**. This service ingests normalized transaction data across multiple source systems with varying status vocabularies (e.g. Stripe, PayPal, Razorpay), computes total collected revenue using a strict **canonical status allow-list**, and guarantees **zero drift** between summary total and period breakdown endpoints.

---

## 🌟 Key Architectural Features

1. **Strict Canonical Status Allow-List**:
   - Computes collected revenue using an explicit **ALLOW-LIST** of statuses (`succeeded`, `paid`, `completed`, `captured`), **NEVER an exclusion list**.
   - Unknown, un-mapped, or new status values (e.g., `refund_pending`, `settled_unconfirmed`) are ignored by default, preventing silent revenue inflation.

2. **Single Source of Truth & Zero-Drift Guarantee**:
   - Both `GET /api/v1/metrics/revenue/summary` and `GET /api/v1/metrics/revenue/breakdown` query the exact same underlying SQL View (`v_canonical_collected_revenue`) / core domain engine.
   - The breakdown endpoint computes an automated invariant check (`sum(buckets) === summary.total_collected`) on every query.

3. **Idempotent Ingestion**:
   - Database level `UNIQUE(source_id, external_id)` constraint prevents duplicate transaction records when webhooks replay or ingestion jobs re-run back-to-back.

4. **Architectural Anti-Drift Guardrails**:
   - Includes a automated verification script (`npm run check-drift`) and property-based test suite that runs runtime checks enforcing zero-drift mathematical equality.

---

## 🚀 Quick Start & Local Run

### Prerequisites
- Node.js 18+ or 20+
- npm

### 1. Installation
```bash
git clone <repository-url>
cd revenue-metrics-service
npm install
```

### 2. Environment Setup (Optional for Live Supabase)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials if using live Supabase and Stripe Test Mode:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=sk_test_...
```
*(Note: If `SUPABASE_URL` is omitted, the service automatically runs in high-performance local in-memory fallback mode with full Postgres view emulation).*

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the interactive test dashboard!

### 4. Run Automated Test Suite
```bash
npm test
```

### 5. Run Zero-Drift Audit Script
```bash
npm run check-drift
```

---

## 📡 API Reference & Swagger UI

### Interactive Swagger OpenAPI Documentation
When the service is running, navigate to **[http://localhost:3000/docs](http://localhost:3000/docs)** to test all API endpoints directly in your browser with full OpenAPI 3.0 specs and request/response schemas.

---

### Endpoints Overview

#### 1. `GET /api/v1/metrics/revenue/summary`
Calculates total collected revenue across all sources for an arbitrary date range.

**Query Parameters:**
- `start_date` (optional): ISO timestamp e.g. `2026-01-01`
- `end_date` (optional): ISO timestamp e.g. `2026-12-31`
- `source` (optional): `stripe`, `paypal`, or `razorpay`

**Example Response:**
```json
{
  "success": true,
  "data": {
    "total_collected_cents": 109899,
    "total_collected_formatted": "$1,098.99",
    "total_transactions_count": 7,
    "currency": "USD",
    "filter": {
      "start_date": "2026-01-01T00:00:00.000Z",
      "end_date": "2026-12-31T23:59:59.999Z",
      "source_id": null
    }
  }
}
```

### 2. `GET /api/v1/metrics/revenue/breakdown`
Returns period-by-period breakdown (day, week, or month) with an invariant check verifying 0 drift against the summary total.

**Query Parameters:**
- `granularity`: `day` | `week` | `month` (default: `day`)
- `start_date` (optional)
- `end_date` (optional)
- `source` (optional)

**Example Invariant Field in Response:**
```json
"invariant_check": {
  "matches_summary": true,
  "drift_cents": 0
}
```

### 3. `GET /api/v1/metrics/audit/drift-check`
Runs automated zero-drift check across daily, weekly, and monthly views, along with status allow-list resilience verification.

---

## ⚖️ Trade-offs & Design Choices

1. **Supabase Direct Client vs. ORM**:
   - **Choice**: Used `@supabase/supabase-js` directly rather than Prisma or TypeORM.
   - **Trade-off**: Lower overhead, zero schema compilation step, smaller Docker container size, and native support for Postgres SQL views.

2. **Allow-List vs. Exclusion List**:
   - **Choice**: Implemented explicit positive allow-listing (`is_revenue_collected = true`).
   - **Trade-off**: Any newly introduced source status (e.g. `processing_auth`) will not count towards revenue until explicitly mapped. This trades manual configuration for 100% data correctness and zero silent revenue leaks.

3. **Dual Execution Engine (Supabase + In-Memory Fallback)**:
   - **Choice**: Provided an in-memory SQL view emulator alongside Supabase Postgres.
   - **Trade-off**: Allows local developer environments and CI build pipelines to execute instantly without mandatory cloud credentials while maintaining exact DB semantics.

---

## 📚 Sources & References

- [Supabase JavaScript Client Docs](https://supabase.com/docs/reference/javascript/introduction)
- [Stripe API Reference — PaymentIntents](https://stripe.com/docs/api/payment_intents)
- [PostgreSQL Documentation — Date/Time Functions & Truncation](https://www.postgresql.org/docs/current/functions-datetime.html)
- [Express.js API Reference](https://expressjs.com/en/4x/api.html)
- [Vitest Documentation](https://vitest.dev/)

---

## 🤖 AI Usage Disclosure

Full details on AI prompting, direction, and review decisions can be found in [AI_USAGE.md](./AI_USAGE.md).
