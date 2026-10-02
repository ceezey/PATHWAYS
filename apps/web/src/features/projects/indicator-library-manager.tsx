'use client'

import { LibraryBig } from 'lucide-react'
import { type FormEvent, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { ConfirmationDialog, EmptyState, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { indicatorLibraryClient } from '@/lib/services/indicator-library-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import {
  type CreateLibraryEntryInput,
  type LibraryEntry,
  createLibraryEntrySchema,
  libraryRecipes,
  numericKinds,
} from '@pathways/shared'
import { recipeNames } from './indicator-recipes'

const controlClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm'
const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim()

function NewEntry({
  onCreate,
}: { onCreate: (input: CreateLibraryEntryInput) => Promise<boolean> }) {
  const [mode, setMode] = useState('MANUAL')
  const [validation, setValidation] = useState<string | null>(null)
  const retry = useRef<{ signature: string; id: string } | null>(null)
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    const data = new FormData(element)
    const draft = {
      code: field(data, 'code'),
      name: field(data, 'name'),
      description: field(data, 'description') || undefined,
      unitLabel: field(data, 'unitLabel'),
      dataSource: field(data, 'dataSource'),
      mode,
      numericKind: field(data, 'numericKind'),
      direction: field(data, 'direction'),
      displayPrecision: Number(field(data, 'displayPrecision')),
      recipe: mode === 'DERIVED' ? field(data, 'recipe') : undefined,
    }
    // An unchanged retry reuses its request key so the server can replay the same result.
    const signature = JSON.stringify(draft)
    const attempt =
      retry.current?.signature === signature
        ? retry.current
        : { signature, id: crypto.randomUUID() }
    const parsed = createLibraryEntrySchema.safeParse({ ...draft, clientMutationId: attempt.id })
    if (!parsed.success) {
      setValidation(
        'Check the code (capital letters, digits, - or _), the numeric domain and direction. Counts use precision 0; derived entries need a calculation.',
      )
      return
    }
    setValidation(null)
    retry.current = attempt
    if (await onCreate(parsed.data)) {
      retry.current = null
      element.reset()
      setMode('MANUAL')
    }
  }
  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">
        Add library entry
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        An entry is a definition template only. The period, baseline and target are set when a
        project uses it, and later changes to the library never alter existing project indicators.
      </p>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="library-code">Code</label>
            <Input
              id="library-code"
              name="code"
              required
              maxLength={40}
              pattern="[A-Z][A-Z0-9_\-]{1,39}"
            />
          </div>
          <div>
            <label htmlFor="library-name">Name</label>
            <Input id="library-name" name="name" required maxLength={160} />
          </div>
          <div>
            <label htmlFor="library-unit">Unit label</label>
            <Input id="library-unit" name="unitLabel" required maxLength={80} />
          </div>
          <div>
            <label htmlFor="library-source">Source description</label>
            <Input id="library-source" name="dataSource" required maxLength={300} />
          </div>
          <div>
            <label htmlFor="library-mode">Authority</label>
            <select
              id="library-mode"
              className={controlClass}
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="MANUAL">Manual measurement</option>
              <option value="DERIVED">Typed derived calculation</option>
            </select>
          </div>
          <div>
            <label htmlFor="library-kind">Numeric domain</label>
            <select
              id="library-kind"
              name="numericKind"
              className={controlClass}
              defaultValue="COUNT"
            >
              {numericKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="library-direction">Direction</label>
            <select
              id="library-direction"
              name="direction"
              className={controlClass}
              defaultValue="DESCRIPTIVE"
            >
              <option value="DESCRIPTIVE">Descriptive only</option>
              <option value="HIGHER_IS_BETTER">Higher is better</option>
              <option value="LOWER_IS_BETTER">Lower is better</option>
            </select>
          </div>
          <div>
            <label htmlFor="library-precision">Chart-axis decimal places</label>
            <Input
              id="library-precision"
              name="displayPrecision"
              type="number"
              min={0}
              max={4}
              step={1}
              defaultValue={0}
              required
            />
          </div>
          {mode === 'DERIVED' ? (
            <div className="md:col-span-2">
              <label htmlFor="library-recipe">System-owned calculation</label>
              <select id="library-recipe" name="recipe" className={controlClass}>
                {libraryRecipes.map((recipe) => (
                  <option key={recipe} value={recipe}>
                    {recipeNames[recipe]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="md:col-span-2">
            <label htmlFor="library-description">Description</label>
            <textarea
              id="library-description"
              name="description"
              maxLength={2000}
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        {validation ? (
          <p role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        ) : null}
        <Button type="submit">Save entry</Button>
      </form>
    </details>
  )
}

export function IndicatorLibraryManager() {
  const { profile } = useCurrentRole()
  const canCreate = principalHasAtomicPermission(profile, 'indicators.library.create')
  const canArchive = principalHasAtomicPermission(profile, 'indicators.library.archive')
  const read = useAuthorizedRead('indicator-library', null, 'indicators.library.read', () =>
    indicatorLibraryClient.list(),
  )
  const [message, setMessage] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<LibraryEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<unknown>, done: string) => {
    if (busy) return false
    setBusy(true)
    setMessage(null)
    try {
      await action()
      setMessage(done)
      void read.refetch()
      return true
    } catch (failure) {
      setMessage(
        failure instanceof PathwaysClientError
          ? failure.message
          : 'The change could not be confirmed. Reload and try again.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  const entries = read.data
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Indicator library"
        description="Reusable indicator definitions for your organization. Using one copies its definition into a project; it never links back."
      />
      {message ? (
        <output aria-live="polite" className="block rounded-xl border border-border p-3 text-sm">
          {message}
        </output>
      ) : null}
      {canCreate ? (
        <NewEntry
          onCreate={(input) =>
            run(() => indicatorLibraryClient.create(input), 'Library entry saved.')
          }
        />
      ) : null}
      {read.error ? (
        <p role="alert">The library could not be loaded. Reload the page to try again.</p>
      ) : !entries ? (
        <output aria-live="polite">Loading the indicator library...</output>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title="No library entries yet"
          description="Add a definition once, then reuse it in any project of your organization."
        />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg">{entry.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {entry.code} · {entry.unitLabel}
                  </p>
                </div>
                <StatusBadge tone="neutral">
                  {entry.recipe ? recipeNames[entry.recipe] : 'Manual measurement'}
                </StatusBadge>
              </div>
              {entry.description ? <p className="mt-3 text-sm">{entry.description}</p> : null}
              <p className="mt-3 text-sm text-muted-foreground">
                Source: {entry.dataSource} · {entry.numericKind.replaceAll('_', ' ')} ·{' '}
                {entry.direction.replaceAll('_', ' ').toLowerCase()}
              </p>
              {canArchive ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  disabled={busy}
                  onClick={() => setArchiving(entry)}
                >
                  Archive entry
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmationDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archive library entry"
        description={`Archive ${archiving?.code ?? 'this entry'}? It is hidden from the library. Project indicators already created from it are not changed.`}
        confirmLabel="Archive entry"
        onConfirm={() => {
          const target = archiving
          setArchiving(null)
          if (target)
            void run(() => indicatorLibraryClient.archive(target.id), 'Library entry archived.')
        }}
      />
    </section>
  )
}
