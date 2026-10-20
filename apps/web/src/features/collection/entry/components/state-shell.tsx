'use client'

import type { ReactNode } from 'react'

import { PageHeader } from '@/components/layout/page-header'

export const StateShell = ({
  eyebrow,
  title = 'Direct form entry',
  children,
}: {
  eyebrow?: string
  title?: string
  children: ReactNode
}) => (
  <div className="space-y-6">
    <PageHeader eyebrow={eyebrow} title={title} />
    {children}
  </div>
)
