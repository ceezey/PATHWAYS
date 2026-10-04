# Page load performance options (on hold)

Status: On hold since 2026-10-03, post-defense. Nothing here is implemented.

## Why pages load slowly

- Most screens fetch several resources in parallel on mount, then render only when all resolve. Examples:
  - The journey stages loader calls getProject, getActivityContext or getActivities, and getJourneyStages.
  - The project review and delivery workspaces each make about 6 client calls.
  - The activities workspace adds officers, budget references and expenses.
- Authorized reads default to `live` freshness in `authorized-query-provider.tsx`: `staleTime: 0`, `gcTime: 0` and `refetchOnMount: 'always'`. Every tab switch refetches everything, and nothing is reused between tabs.
- Many legacy components fetch with raw `pathwaysClient` calls in `useEffect`, outside react-query. The same project is fetched again by each tab.
- Each API call re-runs auth, permission resolution and `withAuthorizedOperation` (one transaction with RLS context), so per-call overhead adds up.

## Options, cheapest first

1. **Mark non-sensitive reads as `summary`.** This applies to project detail, activities, journey stages, officers and budget references. They are then cached for 30s and shared across tabs.
   - Beneficiary, step-up and import reads stay live through `LIVE_ONLY_RESOURCE`.
   - Needs a privacy review of which resources qualify.
2. **Fetch the project once per project route.** Read the project in the project layout and pass it down, or share one query key, instead of each tab calling `getProject`.
3. **Render progressively.** Show each section when its own read resolves instead of waiting on `Promise.all`. Secondary panels (budget references, officers) load after the main list.
4. **Prefetch on intent.** Prefetch a tab's queries on hover or focus of the tab link, and prefetch the project on project card hover.
5. **Bundle endpoints for hot screens.** For example, one `GET /projects/:id/workspace` returns project, activities and stages in one authorized transaction. This cuts round trips and auth overhead, but adds API surface and needs an org-isolation review.
6. **Measure first.** Add server timing per route (auth vs query time) and check slow Prisma queries before larger changes.

## Constraints

- Keep the least-privilege caching rules: beneficiary and step-up data are never cached.
- No new tables. Options 1 to 4 are web-only; option 5 is API-only, with no migration.
