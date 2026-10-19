import { businessCalendarDate, indicatorProgress, numericMetric } from '../../metrics/metric-math'
import type { MetricObservation } from '../rule-contract'
import type { SeverityFacts } from './severity-criteria'

/** Planning facts the classifier needs, read only from an observation's own calculation inputs. */
export function severityFactsFromObservation(observation: MetricObservation): SeverityFacts {
  const value = observation.cell.value
  if (value === null) throw new Error('Severity facts need a visible metric value.')
  const calculation = observation.calculation
  const base = {
    metric: observation.metric,
    value,
    reportingDate:
      calculation && 'reportingDate' in calculation
        ? calculation.reportingDate
        : businessCalendarDate(new Date(observation.asOf), 'Asia/Manila'),
  }
  switch (calculation?.kind) {
    case 'INDICATOR':
      return {
        ...base,
        progress: calculation.direction
          ? indicatorProgress(
              numericMetric(calculation.current),
              calculation.baseline,
              calculation.target,
              calculation.direction,
            ).value
          : null,
        targetDate: calculation.targetDate ?? null,
        periodEnd: calculation.periodEnd ?? null,
      }
    case 'PROJECT_TIMELINE':
      return { ...base, startDate: calculation.startDate, endDate: calculation.endDate }
    case 'ACTIVITY_POPULATION': {
      const { members, reportingDate } = calculation
      const bound = observation.metric === 'ACTIVITY_OVERDUE_DAYS' ? members[0] : undefined
      return {
        ...base,
        included: members.length,
        dueByDate: members.filter(
          (member) => member.plannedEndDate !== null && member.plannedEndDate <= reportingDate,
        ).length,
        missingEnd: members.filter((member) => member.plannedEndDate === null).length,
        ...(bound
          ? { activityStart: bound.plannedStartDate ?? null, activityEnd: bound.plannedEndDate }
          : {}),
      }
    }
    default:
      return base
  }
}
