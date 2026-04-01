# Supabase Human Setup Placeholders

These steps still require a real person because they depend on dashboard access, credentials, or security decisions.

## Auth
- Set the Site URL to `http://localhost:3000` during local development.
- Add a redirect URL for `http://localhost:3000/auth/callback`.
- Enable email/password auth for internal staff accounts.
- Create at least one development admin user.

## Database
- Copy the Supabase Postgres connection string into `DATABASE_URL` and `DIRECT_URL`.
- Run `pnpm --filter @pathways/api prisma:generate`.
- Run `pnpm --filter @pathways/api prisma:migrate`.
- Run `pnpm --filter @pathways/api prisma:seed`.

## Storage
Create these private buckets:
- `uploads`
- `reports`
- `participant-cards`
- `assets` (optional)

Then decide the final signed URL and deletion policies for each bucket.

## Secrets
Do not commit real Supabase keys. Keep them only in local `.env` files or your chosen secret manager.
