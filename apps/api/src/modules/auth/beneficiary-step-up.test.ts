import 'reflect-metadata'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { STEP_UP_REQUIRED_CODE } from '@pathways/shared'
import { describe, expect, it, vi } from 'vitest'

import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
import { BeneficiariesController } from '../beneficiaries/beneficiaries.controller'
import { BeneficiaryMediaController } from '../beneficiary-media/beneficiary-media.controller'
import { BeneficiaryJourneyController } from '../participants/beneficiary-journey.controller'
import { JourneyStagesController } from '../participants/journey-stages.controller'
import { AuthorizedDataController } from './authorized-data.controller'
import type { PrismaService } from '../../prisma/prisma.service'
import { STEP_UP_WINDOW_SECONDS, evaluateBeneficiaryStepUp } from './beneficiary-step-up'
import { BeneficiaryStepUpService } from './beneficiary-step-up.service'

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

describe('BeneficiaryStepUpService.isFresh', () => {
  const service = new BeneficiaryStepUpService({} as PrismaService)
  const args = [{}, {}, 'op', 'project', 'session'] as unknown as Parameters<
    BeneficiaryStepUpService['isFresh']
  >

  it('answers true when enforce admits and false only for STEP_UP_REQUIRED', async () => {
    const enforce = vi.spyOn(service, 'enforce').mockResolvedValueOnce(undefined)
    await expect(service.isFresh(...args)).resolves.toBe(true)
    expect(enforce).toHaveBeenCalledWith(...args)
    enforce.mockRejectedValueOnce(new ForbiddenException({ code: STEP_UP_REQUIRED_CODE }))
    await expect(service.isFresh(...args)).resolves.toBe(false)
  })

  it('rethrows every other failure', async () => {
    const enforce = vi.spyOn(service, 'enforce')
    enforce.mockRejectedValueOnce(new NotFoundException('Project unavailable.'))
    await expect(service.isFresh(...args)).rejects.toBeInstanceOf(NotFoundException)
    enforce.mockRejectedValueOnce(new ForbiddenException('Other denial.'))
    await expect(service.isFresh(...args)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
