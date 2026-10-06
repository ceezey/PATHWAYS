// Pure helpers for the defense restore: pre-run summary, shift refusal and psql failure messages.

/** Lines describing exactly what the irreversible restore is about to do. */
export function summaryLines({ manifest, restoreDay, delta, identities }) {
  const rows = manifest.tables.reduce((sum, entry) => sum + entry.rows, 0)
  return [
    `Seed day ${manifest.seedDay}, restore day ${restoreDay}, delta ${delta} day(s).`,
    `Migration ${manifest.migration}; ${manifest.tables.length} tables, ${rows} rows.`,
    `${manifest.storage.length} storage object(s); ${identities.users.length} identities captured ${identities.capturedAt}.`,
  ]
}

/** Refuses a restore that shifts dates or raised warnings unless --allow-shift was passed. */
export function assertShiftAllowed({ warnings, delta, allowShift }) {
  if (allowShift || (delta === 0 && warnings.length === 0)) return
  throw new Error(
    `Restore shifts dates by ${delta} day(s) with ${warnings.length} warning(s); rerun with --allow-shift to accept.`,
  )
}

/** Wraps a SQL runner so psql exit codes 3 and 2 print what they mean before rethrowing. */
export function guardRun(run, log = console.error) {
  return (sql) => {
    try {
      return run(sql)
    } catch (error) {
      if (error?.status === 3) log('Restore rolled back; devV2 unchanged.')
      else if (error?.status === 2)
        log(
          'Connection lost; if it happened during COMMIT, check with the wipe dry-run (runbook section 4 step 2).',
        )
      throw error
    }
  }
}
