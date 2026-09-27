'use client'

import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import Link from 'next/link'
import { useState } from 'react'

export function ProjectRulesPanel({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const [alertPage, setAlertPage] = useState<{ projectId: string; cursor: string } | null>(null)
  const [recommendationPage, setRecommendationPage] = useState<{
    projectId: string
    cursor: string
  } | null>(null)
  const alertCursor = alertPage?.projectId === projectId ? alertPage.cursor : undefined
  const recommendationCursor =
    recommendationPage?.projectId === projectId ? recommendationPage.cursor : undefined
  const alerts = useAuthorizedRead(
    `project-alerts:${alertCursor ?? 'first'}`,
    projectId,
    'alerts.read',
    async (signal) => {
      const page = await rulesHumanClient.listAlerts(
        { projectId, limit: '25', ...(alertCursor ? { cursor: alertCursor } : {}) },
        signal,
      )
      if (page.items.some((item) => item.projectId !== projectId))
        throw Error('Project scope changed.')
      return page
    },
  )
  const recommendations = useAuthorizedRead(
    `project-recommendations:${recommendationCursor ?? 'first'}`,
    projectId,
    'recommendations.read',
    async (signal) => {
      const page = await rulesHumanClient.listRecommendations(
        {
          projectId,
          limit: '25',
          ...(recommendationCursor ? { cursor: recommendationCursor } : {}),
        },
        signal,
      )
      if (page.items.some((item) => item.projectId !== projectId))
        throw Error('Project scope changed.')
      return page
    },
  )
  return (
    <section className="grid gap-4 xl:grid-cols-2" aria-label="Project alerts and recommendations">
      <SectionCard
        title="Project alerts"
        description="Alerts from configured rules for this project. Up to 25 records per page."
      >
        {!alerts.eligible ? (
          <p className="text-sm text-muted-foreground">
            Project alerts are unavailable for your current access.
          </p>
        ) : alerts.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Project alerts could not be loaded. Try again.
          </p>
        ) : !alerts.data ? (
          <output className="text-sm text-muted-foreground">Loading project alerts.</output>
        ) : (
          <div className="space-y-3">
            {alerts.data.items.length ? (
              alerts.data.items.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">{alert.title}</p>
                    <StatusBadge
                      tone={
                        alert.severity === 'HIGH' || alert.severity === 'CRITICAL'
                          ? 'danger'
                          : alert.severity === 'MEDIUM'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {alert.severity}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.lifecycle}</p>
                  <Link
                    className="mt-2 inline-block text-sm font-medium text-primary underline"
                    href={`/alerts?alert=${alert.id}`}
                  >
                    Review alert
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No project alerts are available.</p>
            )}
            <div className="flex gap-2">
              {alertCursor ? (
                <Button type="button" variant="outline" onClick={() => setAlertPage(null)}>
                  First alerts page
                </Button>
              ) : null}
              {alerts.data.nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const cursor = alerts.data?.nextCursor
                    if (cursor) setAlertPage({ projectId, cursor })
                  }}
                >
                  Next alerts page
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {alerts.eligible && alerts.isError ? (
          <Button type="button" variant="outline" onClick={() => void alerts.refetch()}>
            Retry project alerts
          </Button>
        ) : null}
      </SectionCard>
      <SectionCard
        title="Recommendation prompts"
        description="Predefined recommendations for this project. Up to 25 records per page."
      >
        {!recommendations.eligible ? (
          <p className="text-sm text-muted-foreground">
            Project recommendations are unavailable for your current access.
          </p>
        ) : recommendations.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Project recommendations could not be loaded. Try again.
          </p>
        ) : !recommendations.data ? (
          <output className="text-sm text-muted-foreground">
            Loading project recommendations.
          </output>
        ) : (
          <div className="space-y-3">
            {recommendations.data.items.length ? (
              recommendations.data.items.map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <p className="font-medium text-foreground">{recommendation.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{recommendation.text}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge
                      tone={recommendation.status === 'RESOLVED' ? 'success' : 'warning'}
                    >
                      {recommendation.status}
                    </StatusBadge>
                    {principalHasAtomicPermission(profile, 'recommendations.read') ? (
                      <Link
                        className="text-sm font-medium text-primary underline"
                        href={`/recommendations/${recommendation.id}`}
                      >
                        Review recommendation
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No project recommendations are available.
              </p>
            )}
            <div className="flex gap-2">
              {recommendationCursor ? (
                <Button type="button" variant="outline" onClick={() => setRecommendationPage(null)}>
                  First recommendations page
                </Button>
              ) : null}
              {recommendations.data.nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const cursor = recommendations.data?.nextCursor
                    if (cursor) setRecommendationPage({ projectId, cursor })
                  }}
                >
                  Next recommendations page
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {recommendations.eligible && recommendations.isError ? (
          <Button type="button" variant="outline" onClick={() => void recommendations.refetch()}>
            Retry project recommendations
          </Button>
        ) : null}
      </SectionCard>
    </section>
  )
}
