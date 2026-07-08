import { NextResponse } from 'next/server'

import { isPrototypeRoleValue } from '@/lib/auth/prototype-credentials.server'
import { canAny } from '@/lib/rbac/can'

const maxAttempts = 5
const attempts = new Map<string, number>()
const expirySeconds = 15 * 60

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pin?: string; role?: string } | null

  if (
    !isPrototypeRoleValue(body?.role) ||
    !canAny(body.role, ['beneficiaries.scoped_view', 'beneficiaries.full_view'])
  ) {
    return NextResponse.json({ message: 'This role cannot access beneficiaries.' }, { status: 403 })
  }

  const key = body.role
  const currentAttempts = attempts.get(key) ?? 0

  if (currentAttempts >= maxAttempts) {
    return NextResponse.json({ message: 'Maximum verification attempts reached.' }, { status: 429 })
  }

  const expectedPin = process.env.DEMO_BENEFICIARY_PIN ?? '2468'

  if (body?.pin !== expectedPin) {
    attempts.set(key, currentAttempts + 1)
    return NextResponse.json({ message: 'Invalid beneficiary access PIN.' }, { status: 401 })
  }

  attempts.delete(key)

  return NextResponse.json({
    ok: true,
    expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString(),
  })
}
