import { PUBLIC_SMALL_CELL_REVIEW_THRESHOLD, type PublicAnalyticsResponse } from '@pathways/shared'

export type SmallCount = { label: string; value: number }

type Cell = { state: string; value: string | null }
// Shown counts from 1 to 4; zero, suppressed and missing values identify no one.
const small = (value: number | null | undefined) =>
  typeof value === 'number' && value > 0 && value < PUBLIC_SMALL_CELL_REVIEW_THRESHOLD
const metric = (cell: Cell) => (cell.state === 'AVAILABLE' ? Number(cell.value) : null)
const pick = (label: string, value: number | null | undefined): SmallCount[] =>
  small(value) ? [{ label, value: value as number }] : []

/** Every people count under the review threshold in one chart, for the approver's marker; the public page is unchanged. */
export const smallCounts = (response: PublicAnalyticsResponse): SmallCount[] => {
  switch (response.view) {
    case 'saddd':
      return [
        ...pick('Total people reached', metric(response.total)),
        ...[...response.sex, ...response.age, ...response.disability].flatMap((bucket) =>
          pick(bucket.label, metric(bucket.metric)),
        ),
      ]
    case 'participation':
      return [
        ...pick('Total participants', response.totalSuppressed ? null : response.total),
        ...response.byActivity.flatMap((row) =>
          pick(row.activityName, row.suppressed ? null : row.count),
        ),
        ...response.byMonth.flatMap((row) => pick(row.month, row.suppressed ? null : row.count)),
        ...response.byAttendanceStatus.flatMap((row) =>
          pick(row.status, row.suppressed ? null : row.count),
        ),
      ]
    case 'map':
      return response.places.flatMap((place) =>
        place.reach
          ? [
              ...pick(`${place.name}: people reached`, metric(place.reach.total)),
              ...place.reach.sex.flatMap((bucket) =>
                pick(`${place.name}: ${bucket.label}`, metric(bucket.metric)),
              ),
              ...pick(`${place.name}: with disability`, metric(place.reach.disability)),
            ]
          : [],
      )
    default:
      return []
  }
}
