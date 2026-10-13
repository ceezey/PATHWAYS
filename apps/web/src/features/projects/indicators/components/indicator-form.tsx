'use client'
import { InlineNotice, OptionSelect } from '../../components/option-select'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { MetricTooltip } from '@/components/pathways/metric-tooltip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { metricGlossary } from '@/constants/metric-glossary'
import type { Activity, DigitalFormDefinition } from '@/types/pathways'
import type { CreateIndicatorDraftRequest } from '@pathways/shared'
import { Loader2, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import {
  type Recipe,
  enabledRecipeOptions,
  enabledRecipes,
  recipeContract,
  recipeTargets,
  recipeTypes,
  typeOptions,
} from '../indicators.copy'
import { generateIndicatorCode, indicatorInputFromForm } from '../indicators.utils'

const allActivities = 'ALL'

function IndicatorForm({
  forms,
  activities,
  period,
  existingCodes,
  busy,
  message,
  onSave,
  onDone,
}: {
  forms: DigitalFormDefinition[]
  activities: Pick<Activity, 'id' | 'title' | 'journeyStageId'>[]
  period: { periodStart: string; periodEnd: string } | null
  existingCodes: string[]
  busy: boolean
  message: string | null
  onSave: (input: CreateIndicatorDraftRequest) => Promise<boolean>
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [indicatorType, setIndicatorType] = useState<string>(
    recipeTypes[enabledRecipes[0]] ?? 'OUTPUT',
  )
  const [recipe, setRecipe] = useState<Recipe>(enabledRecipes[0])
  const [formId, setFormId] = useState('')
  const [fieldId, setFieldId] = useState('')
  const [activityId, setActivityId] = useState(allActivities)
  const [validation, setValidation] = useState<string | null>(null)
  const selectedForm = forms.find((form) => form.id === formId)
  const numericFields =
    selectedForm?.fields.filter(
      (field) => field.id && ['INTEGER', 'DECIMAL'].includes(field.dataType),
    ) ?? []
  const formRecipe = recipe === 'FORM_NUMERIC_SUM' || recipe === 'FORM_NUMERIC_AVERAGE'
  const { kind, unit } = recipeContract[recipe]
  const code = generateIndicatorCode(name, existingCodes)
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const input = indicatorInputFromForm(new FormData(event.currentTarget), forms)
      setValidation(null)
      if (await onSave(input)) onDone()
    } catch {
      setValidation('Check the name, target and recipe inputs, then save again.')
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <input name="mode" type="hidden" value="DERIVED" />
      <input name="direction" type="hidden" value="HIGHER_IS_BETTER" />
      <input name="numericKind" type="hidden" value={kind} />
      {/* Counts must be whole numbers; every other domain rounds to two decimals. */}
      <input name="displayPrecision" type="hidden" value={kind === 'COUNT' ? 0 : 2} />
      {formRecipe ? null : <input name="unitLabel" type="hidden" value={unit} />}
      <input name="code" type="hidden" value={code} />
      <input name="baseline" type="hidden" value="0" />
      <input name="periodStart" type="hidden" value={period?.periodStart ?? ''} />
      <input name="periodEnd" type="hidden" value={period?.periodEnd ?? ''} />
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="indicator-name">Name</label>
          <Input
            id="indicator-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={160}
            aria-describedby="indicator-code-preview"
          />
          <p className="mt-1 text-xs text-muted-foreground" id="indicator-code-preview">
            {code ? `Indicator code: ${code}` : 'The indicator code is generated from the name.'}
          </p>
        </div>
        <div>
          <label htmlFor="indicator-type">Type</label>
          <OptionSelect
            id="indicator-type"
            name="indicatorType"
            value={indicatorType}
            onValueChange={setIndicatorType}
            options={typeOptions}
            describedBy="indicator-type-hint"
          />
          <p className="mt-1 text-xs text-muted-foreground" id="indicator-type-hint">
            How this indicator is classified in reports; it does not change the calculation.
          </p>
        </div>
        <div>
          <label htmlFor="target">Target</label>
          <Input
            id="target"
            key={`target-${recipe}`}
            name="target"
            inputMode="decimal"
            maxLength={21}
            aria-describedby="target-hint"
            defaultValue={recipeTargets[recipe]}
          />
          <p className="mt-1 text-xs text-muted-foreground" id="target-hint">
            Blank means not configured
          </p>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="indicator-recipe">Recipe</label>
          <OptionSelect
            id="indicator-recipe"
            name="recipe"
            value={recipe}
            onValueChange={(value) => {
              setRecipe(value as Recipe)
              setIndicatorType((current) => recipeTypes[value as Recipe] ?? current)
            }}
            options={enabledRecipeOptions}
            describedBy="indicator-recipe-hint"
          />
          <p className="mt-1 text-xs text-muted-foreground" id="indicator-recipe-hint">
            How the value is calculated automatically. Choosing a recipe suggests a matching type.
          </p>
        </div>
        {/* Each recipe's own inputs live in this card. */}
        <div className="grid gap-3 rounded-md border border-border bg-background p-3 md:col-span-2 md:grid-cols-2">
          {formRecipe ? (
            <>
              <div>
                <label htmlFor="indicator-form">Exact published form version</label>
                <OptionSelect
                  id="indicator-form"
                  name="formId"
                  required
                  value={formId}
                  onValueChange={(value) => {
                    setFormId(value)
                    setFieldId('')
                  }}
                  placeholder="Choose a version"
                  options={forms
                    .filter((form) => form.status === 'PUBLISHED')
                    .map((form) => ({ value: form.id, label: `${form.name} · v${form.version}` }))}
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="indicator-unit-label">Unit label</label>
                <Input id="indicator-unit-label" name="unitLabel" required maxLength={80} />
              </div>
              <div>
                <label htmlFor="indicator-field">Stable numeric field</label>
                <OptionSelect
                  id="indicator-field"
                  name="fieldId"
                  required
                  value={fieldId}
                  onValueChange={setFieldId}
                  placeholder="Choose a numeric field"
                  options={numericFields.map((field) => ({
                    value: field.id as string,
                    label: `${field.label} (${field.code})`,
                  }))}
                />
              </div>
            </>
          ) : recipe === 'ACTIVITY_COMPLETION_PERCENTAGE' ? (
            <p className="text-sm text-muted-foreground md:col-span-2">
              Calculated from the share of this project's activities that are completed. No extra
              input is needed.
            </p>
          ) : (
            <div>
              <label htmlFor="indicator-activity">Link Activity</label>
              <input
                type="hidden"
                name="activityId"
                value={activityId === allActivities ? '' : activityId}
              />
              <OptionSelect
                id="indicator-activity"
                value={activityId}
                onValueChange={setActivityId}
                options={[
                  { value: allActivities, label: 'All permitted project activities' },
                  ...activities.map((activity) => ({ value: activity.id, label: activity.title })),
                ]}
              />
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <span className="flex items-center gap-1">
            <label htmlFor="indicator-data-source">Source description</label>
            <MetricTooltip label="Source description">
              {metricGlossary.sourceDescription}
            </MetricTooltip>
          </span>
          <Textarea id="indicator-data-source" name="dataSource" required maxLength={300} />
        </div>
      </fieldset>
      {validation ? <InlineNotice tone="danger">{validation}</InlineNotice> : null}
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      {period ? null : (
        <InlineNotice>Loading the project dates for the reporting period.</InlineNotice>
      )}
      <Button className="gap-2" type="submit" disabled={busy || !period}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {busy ? 'Saving...' : 'Save indicator'}
      </Button>
    </form>
  )
}

export function NewIndicator(props: Omit<Parameters<typeof IndicatorForm>[0], 'onDone'>) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add project indicator
        </Button>
      </DialogTrigger>
      <DialogShell
        title="Add project indicator"
        description="The recipe calculates this indicator automatically over the project period. Type, target and recipe cannot change after creation; create a new indicator instead."
      >
        <IndicatorForm {...props} onDone={() => setOpen(false)} />
      </DialogShell>
    </Dialog>
  )
}
