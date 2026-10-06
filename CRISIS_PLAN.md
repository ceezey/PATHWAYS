> We will be having a feature development sprint. Before oct 5 we need to finish all our feature to practice our tool defense on oct 6. 

### Here's my planned approach with our remaining time window and to the old demo-state, mocks, tests, and backendNotConfigured stubs.

- We should not delete any stale codes right now since it may cause risks of breaking hidden dependencies. Just bypass it.
- Do not refactor or fix the stale code files to make space for new features.

## Isolate via "Greenfield Parallelism"
- Keep the scope narrow, if implementing any prd, write codes in a highly isolated nestjs modules and hook it straight to the root app module to bypass any messy middleware or older, unverified endpoints. This is to avoid editing massive, multi-purpose legacy files.

## Bulletproofing Incremental Deployments
- Validate builds before pushing as also instructed in the /docs suite
- If encountered any typescript or next.js compilation error caused by a stale code file. Do not refactor, simply append // @ts-nocheck to the top of it so the Vercel build can pass."
- Commit early, commit often, do micro-sprints and finish one specific endpoint or UI view, test it locally, then deploy it to a vercel preview branch, and I'll verify.

## Code-Gen the Missing Backend Logic
- For features listed as Integration verification pending or Local API only, this is my plan to rapidly stitch the layers together.
- Generate the exact service methods needed to query.
- For UI Hand-offs, write the @tanstack/react-query hooks in Next.js application that consume those new NestJS endpoints, binding them cleanly to your existing ECharts components for PRD-F8/F9.

## Zero-Migration Sync Strategy
- Introspect the Live Database, pull the active schema state directly from the deployed Supabase/PostgreSQL instance straight into the repository
- Then rebuild the type definitions so NestJS and Next.js know exactly what fields exist
- Look at the active schema.prisma file. Do not write any new database migrations or change any tables. Using the existing tables, write the Prisma service methods required to fetch data for features to be implemented.

# Single-Agent Assembly Line
This would be the plan a "Single-Agent Assembly Line" a sequence workflow; I pick one feature to implement -> a sonnet agent implements in isolation -> local QA -> if passes, deploy preview to vercel -> I test the live link -> merge PR to master
