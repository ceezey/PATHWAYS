'use client'

import { Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState } from '@/components/pathways'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'

import { BudgetActions } from './budget-actions'
import { BudgetLedger, hashedExpenseId } from './budget-ledger'
import { BudgetOverview } from './budget-overview'
import { BudgetTransparency } from './budget-transparency'
import { useBudgetModule } from './use-budget-module'

/** Budget tab: overview, expense ledger and transparency, derived from existing finance reads. */
export const BudgetModule = ({ projectId }: { projectId: string }) => {
  const { profile } = useCurrentRole()
  const module = useBudgetModule(projectId)
  const [tab, setTab] = useState('overview')
  const [activityKey, setActivityKey] = useState<string | null>(null)
  const canTransparency = principalHasAtomicPermission(profile, 'budgets.update')
  // A dashboard approval link opens the ledger on the hashed expense.
  useEffect(() => {
    if (hashedExpenseId()) setTab('ledger')
  }, [])

  if (module.isError)
    return (
      <AsyncState
        description="Budget data could not be loaded. Try again."
        icon={Wallet}
        onRetry={() => void module.refresh()}
        status="error"
        title="Budget unavailable"
      />
    )
  if (module.isPending)
    return (
      <AsyncState
        description="Loading budget and expenses."
        icon={Wallet}
        status="loading"
        title="Loading budget"
      />
    )

  return (
    <div className="space-y-6">
      <PageHeader
        actions={<BudgetActions onDone={module.refresh} projectId={projectId} />}
        description="Allocations, approved spending and expense review for this project."
        title="Budget"
      />
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ledger">Expense ledger</TabsTrigger>
          {canTransparency ? <TabsTrigger value="transparency">Transparency</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="overview">
          <BudgetOverview
            module={module}
            onOpenLedger={(key) => {
              setActivityKey(key)
              setTab('ledger')
            }}
          />
        </TabsContent>
        <TabsContent value="ledger">
          <BudgetLedger
            activityKey={activityKey}
            module={module}
            onClearFilter={() => setActivityKey(null)}
            projectId={projectId}
          />
        </TabsContent>
        {canTransparency ? (
          <TabsContent value="transparency">
            <BudgetTransparency module={module} projectId={projectId} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
