# Supabase Human Setup Placeholders

These steps still require a real person because they depend on dashboard access, credentials, or security decisions.

## Auth
- Use `http://127.0.0.1:3000` as the local Site URL. Do not substitute
  `localhost`, a LAN address, or a wildcard.
- Before using password recovery, confirm the exact allowed redirect is
  `http://127.0.0.1:3000/auth/recovery/callback`. Adding or changing this
  hosted Auth setting is a separate human action; local validation must not
  mutate it.
- Request and open a recovery message in the same browser profile while the
  loopback server remains running. PKCE cookies do not move between
  `localhost` and `127.0.0.1`, browsers, devices, or profiles. Never paste a
  recovery URL, code, password, session, or email contents into a terminal,
  chat, screenshot, or issue. The local one-use completion grant expires after
  ten minutes and is intentionally lost when the web server restarts; request a
  fresh message instead of weakening or bypassing that check.
- Enable email/password auth for internal staff accounts.
- Do not create, invite, activate or elevate real users. SOT section 6.1 prohibits onboarding until leaked-password protection is available, enabled and verified, with separate onboarding authorization. Do not upgrade billing as a workaround.

## Database
- Read `docs/SOURCE_OF_TRUTH.md` and `docs/PHASE_TODO.md` before any database command.
- Set `DATABASE_URL` only for the NestJS runtime identity and `DIRECT_URL` only for the migration/owner identity. Do not reuse the migration owner as the runtime identity.
- Both approved PATHWAYS-dev connections use Supavisor Session Pooler port `5432`; do not infer network mode from the variable name `DIRECT_URL`.
- Keep the migration connection's default schema as `public`. Do not append `?schema=pathways` and do not create a second Prisma ledger.
- Set `SHADOW_DATABASE_URL` only to a disposable local PostgreSQL database. Never use PATHWAYS-dev or production as a shadow database.
- Run `pnpm --filter @pathways/api prisma:generate`.
- Run migrations only through the exact authorization sequence in `docs/PHASE_TODO.md`.
- The current seed is intentionally a no-op. Canonical security/reference seeding is deferred to Phase 5.
- Never run `prisma migrate reset` or use `prisma db push` as a migration shortcut.

## Storage
Preserve the existing private `pathways-private` bucket and its object. Historical environment bucket names are not authorization to create new buckets. Storage objects and identities must remain unchanged during Phase 4.

## Secrets
Do not commit real Supabase keys. Keep them only in local `.env` files or your chosen secret manager.

Use the protected Windows runtime launcher described in `security-adapter/README.md`. It supplies runtime `DATABASE_URL` in the child process; migration `DIRECT_URL` stays separate. Never launch the API using the migration owner.
