export const LEGACY_SEED_DISABLED_MESSAGE =
  'Implicit bootstrap seed is disabled. Current RBAC reference changes require reviewed forward Prisma migrations; the historical Phase 5 runner is not a seed for the current database.'

export async function main() {
  console.info(LEGACY_SEED_DISABLED_MESSAGE)
}

if (require.main === module) {
  void main().catch(() => {
    console.error('The disabled seed entry point failed unexpectedly.')
    process.exitCode = 1
  })
}
