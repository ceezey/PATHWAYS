'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { useEffect, useState } from 'react'

type Props = {
  projectId: string
  formId: string
  value: string
  locked: boolean
  onChange: (value: string) => void
}
export function SurveySubjectPicker(props: Props) {
  const { profile } = useCurrentRole()
  const owner = useSensitiveDraftOwner(
    profile,
    'survey-contributor',
    'beneficiaries.records.read',
    props.projectId,
    props.formId,
  )
  if (!owner)
    return (
      <p className="text-sm text-muted-foreground">
        {props.value
          ? 'Current contributor authority is unavailable. The existing identified submission is unchanged.'
          : 'An anonymous response is available. Current beneficiary access is required to identify a contributor.'}
      </p>
    )
  return (
    <OwnedSurveySubjectPicker
      key={owner.key + owner.generation}
      {...props}
      isCurrent={owner.isCurrent}
    />
  )
}
function OwnedSurveySubjectPicker({
  projectId,
  value,
  locked,
  onChange,
  isCurrent,
}: Props & { isCurrent: () => boolean }) {
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  const [page, setPage] = useState<{
    items: Array<{ id: string; code: string; displayName: string }>
    nextCursor: string | null
  } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry revision restarts the same scoped request.
  useEffect(() => {
    if (locked) {
      setPage(null)
      return
    }
    const controller = new AbortController()
    let active = true
    setPage(null)
    setState('loading')
    pathwaysClient
      .getSurveySubjectPage(projectId, query, cursor, controller.signal)
      .then((result) => {
        if (active && isCurrent()) {
          setPage(result)
          setState('ready')
        }
      })
      .catch(() => {
        if (active && isCurrent()) {
          setPage(null)
          setState('error')
        }
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [projectId, query, cursor, isCurrent, locked, revision])
  if (locked)
    return (
      <p className="text-sm text-muted-foreground">
        {value
          ? 'An identified contributor is fixed for this submission.'
          : 'This submission is anonymous.'}
      </p>
    )
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Survey contributor">
      <label htmlFor="survey-contributor">Contributor (optional)</label>
      <p className="text-sm text-muted-foreground">
        Anonymous responses are saved but excluded from identified-person aggregates. A contributor
        cannot be changed after saving or an uncertain save response.
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="Search current project contributors"
          maxLength={80}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => {
            if (isCurrent()) {
              setCursor(undefined)
              setQuery(search.trim())
            }
          }}
        >
          Search
        </Button>
      </div>
      {state === 'ready' && page ? (
        <>
          <select
            id="survey-contributor"
            className="w-full rounded-md border p-2"
            value={value}
            onChange={(event) => {
              if (isCurrent()) onChange(event.target.value)
            }}
          >
            <option value="">Anonymous</option>
            {value && !page.items.some((item) => item.id === value) ? (
              <option value={value}>Selected contributor</option>
            ) : null}
            {page.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} — {item.displayName}
              </option>
            ))}
          </select>
          {page.nextCursor ? (
            <Button
              variant="outline"
              onClick={() => {
                if (isCurrent()) setCursor(page.nextCursor ?? undefined)
              }}
            >
              Next 25 contributors
            </Button>
          ) : null}
        </>
      ) : (
        <output>
          {state === 'loading'
            ? 'Loading current project contributors…'
            : 'Contributors unavailable. Reload or choose an anonymous response.'}
        </output>
      )}
      {state === 'error' ? (
        <Button
          variant="outline"
          onClick={() => {
            if (isCurrent()) setRevision((current) => current + 1)
          }}
        >
          Retry contributors
        </Button>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => {
          if (isCurrent()) onChange('')
        }}
      >
        Use anonymous response
      </Button>
    </section>
  )
}
