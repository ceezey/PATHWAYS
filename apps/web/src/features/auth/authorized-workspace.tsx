'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  type AuthorizedProject,
  clearWorkspaceContext,
  requestAuthorizedProjects,
  workspacePermissions,
} from './workspace-access'

export function AuthorizedWorkspace() {
  const { profile, role, access, refreshAccess } = useCurrentRole()
  const { session } = useSession()
  const token = session?.access_token
  const [result, setResult] = useState<{
    token: string
    profile: typeof profile
    projects: AuthorizedProject[]
    denied: boolean
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    if (!token || !profile || access !== 'ready' || !workspacePermissions(profile).readProjects)
      return
    void requestAuthorizedProjects(
      webEnv.NEXT_PUBLIC_API_BASE_URL,
      token,
      profile,
      controller.signal,
    )
      .then((projects) => {
        if (!controller.signal.aborted) setResult({ token, profile, projects, denied: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          clearWorkspaceContext()
          setResult({ token, profile, projects: [], denied: true })
        }
      })
    return () => controller.abort()
  }, [access, profile, token])
  const current = result?.token === token && result?.profile === profile ? result : null
  const allowed = access === 'ready' && profile && workspacePermissions(profile).readProjects
  if (access === 'loading') return <output>Verifying your current workspace access...</output>
  if (!allowed || current?.denied) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Verify your access</CardTitle>
          <CardDescription>
            Your current account and organization access must be verified before opening this
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/auth/mfa">Review access</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {profile.fullName}</CardTitle>
          <CardDescription>{role}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your workspace shows the projects available to your account.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your projects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!current ? (
            <output>Loading your projects...</output>
          ) : current.projects.length === 0 ? (
            <p>No projects are available in your workspace yet.</p>
          ) : (
            <ul className="space-y-3">
              {current.projects.map((project) => (
                <li key={project.id} className="rounded-md border p-4">
                  <p className="font-medium">{project.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {project.code} · {project.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" onClick={refreshAccess}>
            Refresh access
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/auth/mfa">Account security</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
