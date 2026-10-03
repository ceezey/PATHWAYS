'use client'

import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type LibraryEntry,
  type UseLibraryEntryInput,
  useLibraryEntrySchema,
} from '@pathways/shared'
import { recipeNames } from './indicator-recipes'

type Draft = Omit<UseLibraryEntryInput, 'clientMutationId'>
const draftSchema = useLibraryEntrySchema.omit({ clientMutationId: true })
const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim()

/** Copies a library definition into this project; only the project-specific values are typed here. */
export function UseFromLibrary({
  entries,
  busy,
  onUse,
}: {
  entries: LibraryEntry[]
  busy: boolean
  onUse: (input: Draft) => Promise<boolean>
}) {
  const [validation, setValidation] = useState<string | null>(null)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    const data = new FormData(element)
    const parsed = draftSchema.safeParse({
      libraryEntryId: field(data, 'libraryEntryId'),
      periodStart: field(data, 'periodStart'),
      periodEnd: field(data, 'periodEnd'),
      baseline: field(data, 'baseline') || null,
      target: field(data, 'target') || null,
    })
    if (!parsed.success) {
      setValidation('Choose an entry, a real period, and exact decimal values or leave them blank.')
      return
    }
    setValidation(null)
    if (await onUse(parsed.data)) element.reset()
  }
  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">
        Use from library
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        The definition is copied into this project and is not linked to the library afterwards. Set
        this project's reporting period, baseline and target.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="use-library-entry">Library entry</label>
            <select
              id="use-library-entry"
              name="libraryEntryId"
              required
              defaultValue=""
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose an entry</option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name} ·{' '}
                  {entry.recipe ? recipeNames[entry.recipe] : 'Manual measurement'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="use-library-start">Period start</label>
            <Input id="use-library-start" name="periodStart" type="date" required />
          </div>
          <div>
            <label htmlFor="use-library-end">Period end (inclusive)</label>
            <Input id="use-library-end" name="periodEnd" type="date" required />
          </div>
          <div>
            <label htmlFor="use-library-baseline">Baseline</label>
            <Input
              id="use-library-baseline"
              name="baseline"
              inputMode="decimal"
              maxLength={21}
              aria-describedby="use-library-baseline-hint"
            />
            <p className="mt-1 text-xs text-muted-foreground" id="use-library-baseline-hint">
              Blank means not configured
            </p>
          </div>
          <div>
            <label htmlFor="use-library-target">Target</label>
            <Input
              id="use-library-target"
              name="target"
              inputMode="decimal"
              maxLength={21}
              aria-describedby="use-library-target-hint"
            />
            <p className="mt-1 text-xs text-muted-foreground" id="use-library-target-hint">
              Blank means not configured
            </p>
          </div>
        </fieldset>
        {validation ? (
          <p role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        ) : null}
        <Button className="gap-2" type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Saving...' : 'Create indicator from entry'}
        </Button>
      </form>
    </details>
  )
}
