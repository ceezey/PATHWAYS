import { PUBLIC_SMALL_CELL_REVIEW_THRESHOLD, type PublicAnalyticsResponse } from '@pathways/shared'

export type SmallCount = { label: string; value: number }

type Cell = { state: string; value: string | null }
// Shown counts from 1 to 4; zero, suppressed and missing values identify no one.
const small = (value: number | null | undefined) =>
  typeof value === 'number' && value > 0 && value < PUBLIC_SMALL_CELL_REVIEW_THRESHOLD
const metric = (cell: Cell) => (cell.state === 'AVAILABLE' ? Number(cell.value) : null)
const pick = (label: string, value: number | null | undefined): SmallCount[] =>
  small(value) ? [{ label, value: value as number }] : []

// Repeated names get a running number, so two activities called Training read Training (1) and Training (2).
const distinct = (names: string[]) => {
  const total = new Map<string, number>()
  for (const name of names) total.set(name, (total.get(name) ?? 0) + 1)
  const seen = new Map<string, number>()
  return names.map((name) => {
    if ((total.get(name) ?? 0) < 2) return name
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return `${name} (${n})`
  })
}

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
    case 'participation': {
      const activityNames = distinct(response.byActivity.map((row) => row.activityName))
      return [
        ...pick('Total participants', response.totalSuppressed ? null : response.total),
        ...response.byActivity.flatMap((row, index) =>
          pick(activityNames[index], row.suppressed ? null : row.count),
        ),
        ...response.byMonth.flatMap((row) => pick(row.month, row.suppressed ? null : row.count)),
        ...response.byAttendanceStatus.flatMap((row) =>
          pick(row.status, row.suppressed ? null : row.count),
        ),
      ]
    }
    case 'map': {
      // The province tells apart towns that share a name, such as San Jose in several provinces.
      const placeNames = distinct(
        response.places.map((place) => `${place.name}, ${place.province}`),
      )
      return response.places.flatMap((place, index) =>
        place.reach
          ? [
              ...pick(`${placeNames[index]}: people reached`, metric(place.reach.total)),
              ...place.reach.sex.flatMap((bucket) =>
                pick(`${placeNames[index]}: ${bucket.label}`, metric(bucket.metric)),
              ),
              ...pick(`${placeNames[index]}: with disability`, metric(place.reach.disability)),
            ]
          : [],
      )
    }
    default:
      return []
  }
}
