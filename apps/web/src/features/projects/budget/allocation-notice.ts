'use client'

import { toast } from 'sonner'

import { financeClient } from '@/lib/api/finance'

import { allocationNotice } from './budget.utils'

/** Reads the saved budget lines and toasts how much of the planned total is now allocated. */
export const notifyAllocation = async (projectId: string, amount: number) => {
  try {
    const notice = allocationNotice(await financeClient.budgets(projectId), amount)
    if (!notice) return
    const show = notice.tone === 'danger' ? toast.error : toast[notice.tone]
    show(notice.title, { description: notice.description })
  } catch {
    // The notice is advisory, so a failed read shows nothing instead of an error.
  }
}
