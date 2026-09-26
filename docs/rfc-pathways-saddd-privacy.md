# RFC: SADDD Calculation and Privacy Suppression

**Status:** Locked from confirmed developer policy unless explicitly changed.  
**Last reconciled:** 2026-09-26

## Age Calculation

Age = completed years at reporting-period end date, inclusive, using the business timezone.

## Bands

- 0–9
- 10–14
- 15–17
- 18–24
- 25+
- Unknown

Missing birth date -> Unknown.

Invalid birth date -> reject/flag and exclude until corrected.

## Small Cells

Threshold = 5.

Counts 1–4 are suppressed.

Complementary suppression is required when needed to prevent reconstructing a suppressed value through totals/subtotals.

## Security / Role Interaction

SADDD output remains aggregate. Aggregate-only roles must not use SADDD drilldowns to escape Beneficiary privacy boundaries.

## Tests

- age on boundary dates;
- timezone edge cases;
- missing/invalid DOB;
- each age band;
- counts 0,1,4,5;
- complementary suppression;
- subtotal reconstruction attempts;
- project/org scope.
