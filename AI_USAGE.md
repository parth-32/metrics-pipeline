# AI Usage & Prompting Log

## Overview

This repository was developed in collaboration with **Antigravity (powered by DeepMind Gemini 3.6)** operating as an AI pair programmer.

## How AI Was Directed & Reviewed

### 1. Problem Selection & Scope Assessment

- **Human Direction**: Requested a comparative analysis (Revenue Metrics Service) to determine which could be built with higher data correctness guarantees and lower external auth friction.

### 2. Architectural Refinements

- **Refinement 1 (Direct Supabase SDK)**: Initially considered Prisma ORM, but directed the AI to eliminate Prisma in favor of direct `@supabase/supabase-js` SDK to keep the container lightweight and leverage native Postgres SQL views (`v_canonical_collected_revenue`).
- **Refinement 2 (Strict Status Allow-List)**: Instructed the AI to strictly enforce an **allow-list** of positive statuses (`succeeded`, `paid`, `completed`, `captured`) rather than an exclusion list, preventing newly introduced status values from inflating revenue totals.
- **Refinement 3 (Zero-Drift Invariant Enforcement)**: Ensured both the summary total (`GET /api/v1/metrics/revenue/summary`) and period breakdown (`GET /api/v1/metrics/revenue/breakdown`) endpoints invoke the exact same core query engine and run automated invariant checks (`sum(buckets) === summary.total`).

### 3. Code Generation & Verification Workflow

- **Step 1**: Created database migration scripts (`scripts/schema.sql`) and TypeScript types (`src/types/index.ts`).
- **Step 2**: Implemented ingestion components for live Stripe payment intents (`src/ingestion/stripeIngestor.ts`) and simulated multi-source providers (`src/ingestion/multiSourceSeeder.ts`).
- **Step 3**: Built the core revenue service (`src/metrics/revenueService.ts`) and anti-drift guardrail test engine (`src/metrics/driftGuard.ts`).
- **Step 4**: Developed automated Vitest unit tests (`tests/metrics.test.ts`) and CLI verification scripts (`npm run check-drift`).
- **Step 5**: Configured production deployment artifacts (`Dockerfile`, `render.yaml`) and embedded interactive HTML test dashboard.

---

## Prompt Log & Conversation Record

The complete, untruncated AI pair programming conversation transcript and decision log is preserved in the project environment and can be referenced via the IDE conversation history.
