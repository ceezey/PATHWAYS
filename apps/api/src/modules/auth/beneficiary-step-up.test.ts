import 'reflect-metadata'
import { describe, expect, it } from 'vitest'

import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
import { BeneficiariesController } from '../beneficiaries/beneficiaries.controller'
import { BeneficiaryMediaController } from '../beneficiary-media/beneficiary-media.controller'
import {
  BeneficiaryJourneyController,
  JourneyStagesController,
} from '../participants/participants.controller'
import { AuthorizedDataController } from './authorized-data.controller'
import { STEP_UP_WINDOW_SECONDS, evaluateBeneficiaryStepUp } from './beneficiary-step-up'

const now = 1_800_000_000

describe('evaluateBeneficiaryStepUp', () => {
  it('uses the approved 15-minute window', () => {
    expect(STEP_UP_WINDOW_SECONDS).toBe(900)
  })

  it.each([
    [now, true],
    [now - 900, true],
    [now - 901, false],
    [now + 30, true],
  ])('evaluates a factor verified at %i as fresh=%s', (verifiedAt, fresh) => {
    expect(evaluateBeneficiaryStepUp(verifiedAt, now).fresh).toBe(fresh)
  })

  it('returns the expiry of a fresh factor', () => {
    expect(evaluateBeneficiaryStepUp(now - 60, now)).toEqual({
      fresh: true,
      verifiedAt: now - 60,
      expiresAt: now - 60 + 900,
    })
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, now + 31])(
    'treats %s as a missing factor',
    (verifiedAt) => {
      expect(evaluateBeneficiaryStepUp(verifiedAt, now)).toEqual({
        fresh: false,
        reason: 'MISSING',
      })
    },
  )

  it('reports a stale factor', () => {
    expect(evaluateBeneficiaryStepUp(now - 5_000, now)).toEqual({ fresh: false, reason: 'STALE' })
  })
})

describe('approved Beneficiary step-up route list', () => {
  const required = (target: object, handler: string) =>
    Reflect.getMetadata(
      BENEFICIARY_STEP_UP_KEY,
      (target as Record<string, object>)[handler] as object,
    ) === true

  it('requires step-up on every identifying-detail handler', () => {
    for (const handler of ['list', 'register', 'get', 'update', 'archive', 'enroll']) {
      expect(required(BeneficiariesController.prototype, handler), handler).toBe(true)
    }
    for (const handler of ['history', 'transition', 'correct']) {
      expect(required(BeneficiaryJourneyController.prototype, handler), handler).toBe(true)
    }
    for (const handler of ['list', 'limits', 'reserve', 'finalize', 'content']) {
      expect(required(BeneficiaryMediaController.prototype, handler), handler).toBe(true)
    }
    expect(required(AuthorizedDataController.prototype, 'beneficiaries')).toBe(true)
  })

  it('leaves aggregate and non-identifying handlers unchanged', () => {
    expect(required(AuthorizedDataController.prototype, 'aggregate')).toBe(false)
    expect(required(AuthorizedDataController.prototype, 'projects')).toBe(false)
    expect(required(BeneficiariesController.prototype, 'registrationContext')).toBe(false)
    expect(required(JourneyStagesController.prototype, 'list')).toBe(false)
  })
})
