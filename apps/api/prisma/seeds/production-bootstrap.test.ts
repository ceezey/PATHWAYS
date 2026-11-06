import { describe, expect, it } from 'vitest'

import { assertProductionTarget, unappliedCheckoutMigrations } from './production-bootstrap'

const prod = 'mvzxitlbtkkyvubgbcmx'
const dev = 'klbtoqdalmcsfjqophty'

describe('assertProductionTarget', () => {
  it('accepts the production project on its direct host or pooler', () => {
    const supabase = `https://${prod}.supabase.co`
    expect(() =>
      assertProductionTarget({
        SUPABASE_URL: supabase,
        DIRECT_URL: `postgresql://prisma:x@db.${prod}.supabase.co:5432/postgres`,
      }),
    ).not.toThrow()
    expect(() =>
      assertProductionTarget({
        SUPABASE_URL: supabase,
        DIRECT_URL: `postgresql://prisma.${prod}:x@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
      }),
    ).not.toThrow()
  })

  it('refuses the development project', () => {
    expect(() =>
      assertProductionTarget({
        SUPABASE_URL: `https://${dev}.supabase.co`,
        DIRECT_URL: `postgresql://prisma:x@db.${dev}.supabase.co:5432/postgres`,
      }),
    ).toThrow('Refusing any target other than the production project')
  })

  it('refuses a production Supabase URL paired with a development database', () => {
    expect(() =>
      assertProductionTarget({
        SUPABASE_URL: `https://${prod}.supabase.co`,
        DIRECT_URL: `postgresql://prisma.${dev}:x@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
      }),
    ).toThrow('Refusing any target other than the production project')
  })

  it('allows loopback only in test-local mode', () => {
    const local = {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
    }
    expect(() => assertProductionTarget(local)).toThrow()
    expect(() =>
      assertProductionTarget({ ...local, PATHWAYS_HOSTED_SEED_MODE: 'test-local' }),
    ).not.toThrow()
    expect(() =>
      assertProductionTarget({
        PATHWAYS_HOSTED_SEED_MODE: 'test-local',
        SUPABASE_URL: `https://${prod}.supabase.co`,
        DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
      }),
    ).toThrow('test-local mode requires loopback')
  })
})

describe('unappliedCheckoutMigrations', () => {
  const finished = (name: string) => ({ migration_name: name, finished: true })

  it('lists checkout migrations the database has not finished', () => {
    expect(
      unappliedCheckoutMigrations(
        ['0075_a', '0076_b', '0080_c'],
        [finished('0075_a'), { migration_name: '0076_b', finished: false }],
      ),
    ).toEqual(['0076_b', '0080_c'])
  })

  it('accepts a database at or past the checkout', () => {
    expect(
      unappliedCheckoutMigrations(['0075_a'], [finished('0075_a'), finished('0076_b')]),
    ).toEqual([])
  })
})
