'use client'

import { Loader2, Plus } from 'lucide-react'
import { type FormEvent, useRef, useState } from 'react'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  type CreateIndicatorLibraryEntryRequest,
  createIndicatorLibraryEntryRequest,
  libraryRecipes,
  numericKinds,
} from '@pathways/shared'
import { InlineNotice, OptionSelect } from '../../components/option-select'
import { recipeNames } from '../indicators.copy'

// Only recipes the database computes today (see deferred-features.md), matching the add form.
const offeredRecipes = libraryRecipes.filter(
  (recipe) => recipe === 'ACTIVITY_COMPLETION_PERCENTAGE',
)

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim()

function EntryForm({
  busy,
  message,
  onCreate,
  onDone,
}: {
  busy: boolean
  message: string | null
  onCreate: (input: CreateIndicatorLibraryEntryRequest) => Promise<boolean>
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
    const parsed = createIndicatorLibraryEntryRequest.safeParse({
      ...draft,
      clientMutationId: attempt.id,
    })
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
          <label htmlFor="library-precision">Decimal Place</label>
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
            <label htmlFor="library-recipe">Recipe</label>
            <OptionSelect
              id="library-recipe"
              name="recipe"
              defaultValue={offeredRecipes[0]}
              options={offeredRecipes.map((recipe) => ({
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
      <Button className="gap-2" disabled={busy} type="submit">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {busy ? 'Saving...' : 'Save entry'}
      </Button>
    </form>
  )
}

export function NewEntry(props: Omit<Parameters<typeof EntryForm>[0], 'onDone'>) {
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
