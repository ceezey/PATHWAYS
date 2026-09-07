export const LEGACY_SEED_DISABLED_MESSAGE =
  'Implicit bootstrap seed is disabled. Use the reviewed, target-guarded Phase 5 runner for canonical reference data only.'

export async function main() {
  console.info(LEGACY_SEED_DISABLED_MESSAGE)
}

if (require.main === module) {
  void main().catch(() => {
    console.error('The disabled seed entry point failed unexpectedly.')
    process.exitCode = 1
  })
}
