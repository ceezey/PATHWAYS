# Change Record: Performance and Scaling Path

**ID:** `cr-pathways-performance-scaling`  
**Date:** 2026-09-28  
**Status:** Approved; implementation pending

## 1. Trigger

On 2026-09-28 the developer asked for three optimizations: fewer CORS preflight requests, TanStack Query suited to server rendering, and NestJS caching. They asked for the choice that is best for long-term maintainability, sustainability and scalability.

A verification pass on `dev` at `fa0f290` found:
- **Preflight:** partial. Every call sends `Authorization` and the `X-Pathways-*` context headers, so each cross-origin call is preflighted. The preflight cache was 5 minutes.
- **TanStack Query:** already installed (`apps/web/src/providers/query-provider.tsx`). Authorized reads deliberately use `staleTime: 0` and `gcTime: 0`, so every mounted read re-verifies (`apps/web/src/providers/authorized-query-provider.tsx`).
- **Backend caching:** none. Repeated identity, profile and permission lookups inside one request are intentional re-verification before writes.

The safe step, a one-day preflight cache (`apps/api/src/common/network/cors-origins.ts`), ships alongside this record. The items below change security or deployment behavior and need a decision first.

## 2. Current Contract

- The web calls the API directly at `NEXT_PUBLIC_API_BASE_URL` across two Vercel projects (`pathways-web`, `pathways-api`), restricted by `approvedApiBaseUrl` and the API CORS allow-list.
- Authorization is checked server-side on every request, and the client keeps no authorized-data cache.
- Scope is applied before retrieval, and Beneficiary detail is never shared across users (SDD section 6, auth RFC).

## 3. Proposed Change

Adopt in this order. Each item is measured before and after, and the next one starts only if the measurement justifies it.

1. **Measure first.**
   - Record request counts, preflight counts and time to interactive for the dashboard, project workspace and Beneficiaries pages on the development preview.
   - Record API p95 latency per endpoint from existing logs.
   - Measured 2026-10-01 on the local stack with `pnpm perf:dashboards` at 20 projects, 10,000 beneficiaries, 50,000 journey events and 200 indicators with 12 readings: p95 home 394 ms, monitoring 377 ms, SADDD 605 ms warm (cold 530, 358, 381), under the NFR-3 limit of 800 ms. Stale planner statistics after a bulk load pushed the profile query to about 430 ms until ANALYZE ran; production relies on autovacuum.
2. **Short client cache for authorized reads.**
   - Replace `staleTime: 0` with a short window (proposed 30 seconds) for list and summary reads only.
   - Query keys always include organization id, user id, role and project id.
   - Clear the whole query cache on sign-out, workspace change or any 401/403.
   - Do not retry 401 or 403.
   - Beneficiary detail and step-up protected reads keep `staleTime: 0`.
3. **Server-side prefetch where a page is server-rendered.**
   - Use the TanStack `HydrationBoundary` pattern with a per-request `QueryClient`.
   - Server prefetch uses the same authorized API calls. No token or Beneficiary detail is serialized into HTML.
4. **Targeted backend caching, only for an endpoint that measurement shows is hot.**
   - Only for data that is not user-specific, such as the role and permission catalog or published form definitions.
   - In-process short TTL cache, keyed by organization and project, and invalidated on write.
   - Never cache authorization decisions, profiles or Beneficiary data.
5. **Same-origin API proxy: deferred.**
   - A Next.js rewrite would remove preflights entirely. But it adds a hop through the web deployment, changes the two-project topology and the `approvedApiBaseUrl` rules, and moves API load onto web functions.
   - Reconsider only if measurement after steps 1-4 shows preflights still dominate.

## 4. Impact

### Product
Faster repeat navigation. No feature change.

### Data / Migration
None.

### Authorization / Privacy
Step 2 allows client reuse of data for at most 30 seconds within the same organization, user and role. Revocation takes effect on the next read after that window, or immediately on a 401/403. This must be accepted explicitly, because it relaxes the current re-verify-on-every-read behavior.

### API
Step 4 may add cache invalidation to write paths of the chosen endpoint.

### UI
None visible.

### Tests
- Query keys isolate organization, user and role.
- The cache clears on sign-out and workspace change.
- 401/403 are not retried and clear the cache.
- Beneficiary reads are never cached.
- Backend cache invalidation after write.
- Before and after measurements are recorded.

### Documentation
SDD section 6 caching note, DSD data-fetching note, QAD rows.

## 5. Alternatives Considered

- **Restraint option:** keep the current zero-cache policy and only the preflight change. This is the safest, and it remains the default until measurement shows a need.
- **Global backend cache (`@nestjs/cache-manager`) now:** rejected. It adds a dependency without a proven hot path and risks caching per-user data.
- **Same-origin proxy now:** deferred, for the topology and load reasons in section 3.

## 6. Migration / Rollback

Each step is an independent code change behind existing configuration. Rollback means reverting that step's commit. No schema change.

## 7. Verification

- The tests listed in section 4.
- The SAD pipeline.
- Measurements recorded before and after each step on the development preview.

## 8. Approval

Developer decision on 2026-09-28, during audit-remediation planning: "Fold it in", and later "Approve all CRs". The steps are adopted in the order in section 3, each gated by its measurement. Step 5 (same-origin proxy) stays deferred.

## 9. Disposition

The preflight cache change (5 minutes to 1 day) is implemented. Step 2 (short scoped client cache with live Beneficiary, step-up and import reads, denial epoch and write refresh) is implemented on `integration/audit-wave-a`; unit-level request counts are recorded and the development-preview measurement of step 1 is pending. Steps 3-5 are not started; step 5 stays deferred.
