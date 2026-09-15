/** System-owned contracts, not tenant-editable formulas or a semantic inference engine. */
export const dashboardContracts = {
  activityStates: {
    population: 'Non-archived project activities with planned_end_date in the inclusive reporting period.',
    countingUnit: 'Activity ID, once; all five persisted states including CANCELLED are displayed.',
    denominator: 'None for state counts. ACTIVITY_COMPLETION_PERCENTAGE excludes CANCELLED from its denominator.',
    historicalBasis: 'Current persisted state, not historical state at period end. Undated activities are outside this population.',
  },
  milestoneStates: {
    population: 'Non-archived milestones with target_date in the inclusive reporting period.',
    countingUnit: 'Milestone ID, once; current persisted status.',
    denominator: 'None; undated milestones are not assigned a guessed date.',
  },
  participationRecords: {
    population: 'Committed participation rows with VALIDATED/processed, non-dummy source submissions; non-archived non-dummy Beneficiary and non-cancelled/non-archived activity.',
    countingUnit: 'Participation row ID (unique enrollment/activity/date); all attendance states. Repeated import delivery cannot create another row for that same unit.',
    period: 'participation_date inclusive; journey corrections do not rewrite this date or attendance.',
    denominator: 'None; this is a record count, not people or evidence of learning.',
  },
  attendingIndividuals: {
    population: 'Same accepted participation population, subject_type=INDIVIDUAL, attendance PRESENT or COMPLETED.',
    countingUnit: 'DISTINCT Beneficiary ID across the entire authorized project set.',
    denominator: 'None; no sum of overlapping project enrollments.',
  },
  enrolledBeneficiaryRecords: {
    population: 'Non-archived, non-dummy Beneficiaries with at least one authorized enrollment where enrollment_date<=periodEnd and ended_date is absent or >=periodStart; all enrollment status values.',
    countingUnit: 'DISTINCT Beneficiary ID, including separately recorded groups/communities. Not a count of people.',
    denominator: 'None; an enrollment with no date does not satisfy the period contract.',
  },
  saddd: {
    population: 'INDIVIDUAL subset of enrolledBeneficiaryRecords; no registration-age substitution. Missing DOB is Unknown; invalid DOB is excluded from all three demographic marginals until valid.',
    age: 'Completed calendar years at periodEnd inclusive; timestamp boundaries use BUSINESS_TIME_ZONE.',
    countingUnit: 'DISTINCT Beneficiary ID at portfolio level.',
    denominator: 'Eligible individuals after invalid-date exclusion; missing dimensions remain explicit Unknown.',
    privacy: 'G4 threshold 5. Any 1-4 cell, completeness count or total suppresses the entire single-release table, including other cells and totals. No values are computed from raw Beneficiaries in JavaScript.',
    filters: 'Only server-authorized project/program scope and a bounded period. Demographic intersections, location/activity filters and arbitrary drill-through are unavailable pending their query-release policy.',
    historicalBasis: 'Current demographic profile at read time, not a historical demographic snapshot.',
  },
  shared: {
    refresh: 'Read-time database queries, no materialized current-value cache, HTTP private/no-store, no browser persistence.',
    consistency: 'Each aggregate SQL statement uses one database statement snapshot. Later accepted corrections restate the next read; separate endpoints are not one historical snapshot.',
    testRecords: 'Exclude is_dummy_record on Beneficiary/submission. Fixtures use synthetic records with both excluded-test and accepted-operational flags to exercise this distinction.',
    bounds: 'Maximum 100 authorized projects, 100 matching indicators and 366 inclusive days; a 3-second statement timeout inside the existing bounded transaction. These are limits, not measured latency claims.',
    unknown: 'No universal KPI score, success threshold, finance estimate or ethics judgment is generated.',
  },
} as const

/** G4 is confirmed. The permitted releases across overlapping scopes/periods are not. */
export const sensitiveReleaseContract = {
  state: 'UNAVAILABLE_PENDING_RELEASE_REVIEW',
  reason: 'Within-table suppression does not prevent subtraction across separate overlapping queries.',
  affected: 'SADDD, beneficiary-based monitoring totals, and non-activity derived indicator values.',
  unaffected: 'Indicator definitions, manual measurements, activity/milestone state counts and activity completion percentage.',
  enforcement: 'Database wrappers return MISSING/null; private calculators have no runtime/PUBLIC/API-role EXECUTE grant.',
  resume: 'Approve an explicit cross-query release policy and implement/test it in a new forward migration before granting any sensitive release.',
} as const

export const journeyCorrectionContract = {
  unit: 'Original journey event plus zero or one single-level correction; effective date is correction.event_date when unique.',
  ambiguity: 'More than one correction for a root makes the metric MISSING / AMBIGUOUS_JOURNEY_CORRECTIONS; no latest-wins rule is invented.',
  nonEffect: 'Journey corrections do not alter participation_date, attendance_status, progress_status or enrollment lifecycle.',
} as const
