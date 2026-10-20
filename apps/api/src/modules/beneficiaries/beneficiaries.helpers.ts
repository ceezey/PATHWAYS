import { BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { type UpdateBeneficiaryRequest, beneficiaryAgeRuleMessages } from '@pathways/shared'
import type { BeneficiaryRow } from './beneficiaries.mapper'
import {
  assertRegistrationAge,
  businessToday,
  exactDate,
  yearsAt,
} from './beneficiary-registration.helpers'

type SadddAgeBand = '0-9' | '10-14' | '15-17' | '18-24' | '25+' | 'Unknown'

function calendarDateParts(value: Date) {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  }
}

function calendarDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)))
}

function yearsBefore(reference: Date, years: number) {
  const parts = calendarDateParts(reference)
  return calendarDate(parts.year - years, parts.month, parts.day)
}

export function ageBandWhere(
  referenceDate: Date,
  band?: SadddAgeBand,
): Prisma.BeneficiaryWhereInput {
  if (!band) return {}

  if (band === 'Unknown') {
    return {
      subjectType: 'INDIVIDUAL',
      birthDate: null,
    }
  }

  if (band === '0-9') {
    const today = businessToday()
    return {
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: yearsBefore(referenceDate, 10),
        lte: referenceDate < today ? referenceDate : today,
      },
    }
  }

  if (band === '10-14') {
    return {
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: yearsBefore(referenceDate, 15),
        lte: yearsBefore(referenceDate, 10),
      },
    }
  }

  if (band === '15-17') {
    return {
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: yearsBefore(referenceDate, 18),
        lte: yearsBefore(referenceDate, 15),
      },
    }
  }

  if (band === '18-24') {
    return {
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: yearsBefore(referenceDate, 25),
        lte: yearsBefore(referenceDate, 18),
      },
    }
  }

  return {
    subjectType: 'INDIVIDUAL',
    birthDate: {
      gte: new Date(Date.UTC(1900, 0, 1)),
      lte: yearsBefore(referenceDate, 25),
    },
  }
}

export function assertSubjectProfile(input: UpdateBeneficiaryRequest, current: BeneficiaryRow) {
  if (input.subjectType === 'INDIVIDUAL') {
    if (!input.firstName?.trim() || !input.lastName?.trim()) {
      throw new BadRequestException('Individual profiles require first and last names.')
    }
    const birthDate = input.birthDate ? exactDate(input.birthDate, 'birthDate') : null
    const enrollmentDate = current.beneficiaryProjectEnrollment_beneficiary[0]?.enrollmentDate
    if (!birthDate && input.ageAtRegistration === undefined) {
      throw new BadRequestException(
        'Individual profiles require a birth date or age at registration.',
      )
    }
    // The minimum-age and future-date rules apply only when the birth date or the recorded
    // age changes, so other edits of existing under-age records stay valid.
    const birthDateChanged =
      (input.birthDate ?? null) !== (current.birthDate?.toISOString().slice(0, 10) ?? null)
    const ageChanged =
      input.ageAtRegistration !== undefined && input.ageAtRegistration !== current.ageAtRegistration
    const today = businessToday()
    if (birthDateChanged && birthDate && birthDate > today) {
      throw new BadRequestException(beneficiaryAgeRuleMessages.futureBirthDate)
    }
    if (birthDate && enrollmentDate && birthDate > enrollmentDate) {
      throw new BadRequestException('Birth date cannot be after enrollment date.')
    }
    if (
      birthDate &&
      enrollmentDate &&
      input.ageAtRegistration !== undefined &&
      yearsAt(birthDate, enrollmentDate) !== input.ageAtRegistration
    ) {
      throw new BadRequestException('Birth date and age at registration are inconsistent.')
    }
    const age =
      birthDate && enrollmentDate
        ? yearsAt(birthDate, enrollmentDate)
        : (input.ageAtRegistration ?? null)
    if (birthDateChanged || ageChanged) assertRegistrationAge(birthDate, age, today)
    if (age !== null && age < 18 !== current.isMinor) {
      throw new BadRequestException(
        'Age changes cannot contradict recorded minor/guardian consent facts.',
      )
    }
  } else if (
    !input.displayName?.trim() ||
    input.firstName ||
    input.middleName ||
    input.lastName ||
    input.birthDate ||
    input.ageAtRegistration !== undefined ||
    input.sex !== 'NOT_SPECIFIED'
  ) {
    throw new BadRequestException(
      'Group/community profiles require a display name and cannot use person-only fields.',
    )
  }
}
