'use client'

import { LibraryBig, Plus } from 'lucide-react'
import { type FormEvent, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  ConfirmationDialog,
  DialogShell,
  EmptyState,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { InlineNotice, OptionSelect } from './option-select'

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim()
const headClass =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'

function EntryForm({
  message,
  onCreate,
  onDone,
}: {
  message: string | null
  onCreate: (input: CreateLibraryEntryInput) => Promise<boolean>
  onDone: () => void
}) {
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
      onDone()
    }
  }
  return (
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
          <OptionSelect
            id="library-mode"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'MANUAL', label: 'Manual measurement' },
              { value: 'DERIVED', label: 'Typed derived calculation' },
            ]}
          />
        </div>
        <div>
          <label htmlFor="library-kind">Numeric domain</label>
          <OptionSelect
            id="library-kind"
            name="numericKind"
            defaultValue="COUNT"
            options={numericKinds.map((kind) => ({
              value: kind,
              label: kind.replaceAll('_', ' '),
            }))}
          />
        </div>
        <div>
          <label htmlFor="library-direction">Direction</label>
          <OptionSelect
            id="library-direction"
            name="direction"
            defaultValue="DESCRIPTIVE"
            options={[
              { value: 'DESCRIPTIVE', label: 'Descriptive only' },
              { value: 'HIGHER_IS_BETTER', label: 'Higher is better' },
              { value: 'LOWER_IS_BETTER', label: 'Lower is better' },
            ]}
          />
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
            <OptionSelect
              id="library-recipe"
              name="recipe"
              defaultValue={libraryRecipes[0]}
              options={libraryRecipes.map((recipe) => ({
                value: recipe,
                label: recipeNames[recipe],
              }))}
            />
          </div>
        ) : null}
        <div className="md:col-span-2">
          <label htmlFor="library-description">Description</label>
          <Textarea id="library-description" name="description" maxLength={2000} />
        </div>
      </div>
      {validation ? <InlineNotice tone="danger">{validation}</InlineNotice> : null}
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      <Button type="submit">Save entry</Button>
    </form>
  )
}

function NewEntry(props: Omit<Parameters<typeof EntryForm>[0], 'onDone'>) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add library entry
        </Button>
      </DialogTrigger>
      <DialogShell
        title="Add library entry"
        description="An entry is a definition template only. The period, baseline and target are set when a project uses it, and later changes to the library never alter existing project indicators."
      >
        <EntryForm {...props} onDone={() => setOpen(false)} />
      </DialogShell>
    </Dialog>
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
      {canCreate ? (
        <div className="flex justify-end">
          <NewEntry
            message={message}
            onCreate={(input) =>
              run(() => indicatorLibraryClient.create(input), 'Library entry saved.')
            }
          />
        </div>
      ) : null}
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      {read.error ? (
        <AsyncState
          status="error"
          title="Library unavailable"
          description="The library could not be loaded. Reload the page to try again."
          onRetry={() => void read.refetch()}
        />
      ) : !entries ? (
        <AsyncState
          status="loading"
          title="Loading the indicator library"
          description="Verifying current access."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title="No library entries yet"
          description="Add a definition once, then reuse it in any project of your organization."
        />
      ) : (
        <SectionCard
          title="Library entries"
          description={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · definitions only, never linked back to projects`}
        >
          <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  <th className={headClass}>Code</th>
                  <th className={headClass}>Entry</th>
                  <th className={headClass}>Authority</th>
                  <th className={headClass}>Domain and direction</th>
                  <th className={headClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    aria-label={`Library entry: ${entry.name}`}
                    className="border-b border-border align-top last:border-0 hover:bg-muted"
                    key={entry.id}
                  >
                    <td className="px-4 py-3 text-muted-foreground">{entry.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.unitLabel} · Source: {entry.dataSource}
                      </p>
                      {entry.description ? (
                        <p className="mt-1 text-sm">{entry.description}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone="neutral">
                        {entry.recipe ? recipeNames[entry.recipe] : 'Manual measurement'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.numericKind.replaceAll('_', ' ')} ·{' '}
                      {entry.direction.replaceAll('_', ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canArchive ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setArchiving(entry)}
                        >
                          Archive entry
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
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
