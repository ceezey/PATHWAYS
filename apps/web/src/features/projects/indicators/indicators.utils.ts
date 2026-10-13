import type { DigitalFormDefinition } from '@/types/pathways'
import { type CreateIndicatorDraftRequest, createIndicatorDraftRequest } from '@pathways/shared'

export const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()
export const optional = (form: FormData, name: string) => text(form, name) || undefined
const codeSkipWords = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
])

/** Readable code such as HR-01: name initials plus the first free two-digit number. */
export const generateIndicatorCode = (name: string, existing: string[]) => {
  const words = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word && !codeSkipWords.has(word.toLowerCase()))
  if (words.length === 0) return ''
  const letters = words.length === 1 ? words[0].slice(0, 3) : words.map((word) => word[0]).join('')
  const prefix = /^[A-Z]/.test(letters) ? letters.slice(0, 4) : `I${letters}`.slice(0, 4)
  const used = new Set(existing.map((code) => code.toUpperCase()))
  for (let n = 1; ; n += 1) {
    const code = `${prefix}-${String(n).padStart(2, '0')}`
    if (!used.has(code)) return code
  }
}

/** Suggests a contract-valid code from the indicator name. */
export const suggestIndicatorCode = (name: string) => {
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  if (!code) return ''
  return /^[A-Z][A-Z0-9_-]{1,39}$/.test(code) ? code : `I_${code}`.slice(0, 40)
}

/** Shared client validation is only UX; the API repeats the same contract authoritatively. */
export function indicatorInputFromForm(
  form: FormData,
  forms: DigitalFormDefinition[],
): CreateIndicatorDraftRequest {
  const mode = text(form, 'mode')
  const recipe = text(form, 'recipe')
  const selectedForm = forms.find((item) => item.id === text(form, 'formId'))
  const formRecipe = recipe === 'FORM_NUMERIC_SUM' || recipe === 'FORM_NUMERIC_AVERAGE'
  return createIndicatorDraftRequest.parse({
    code: text(form, 'code'),
    name: text(form, 'name'),
    description: optional(form, 'description'),
    indicatorType: optional(form, 'indicatorType'),
    unitLabel: text(form, 'unitLabel'),
    dataSource: text(form, 'dataSource'),
    mode,
    numericKind: text(form, 'numericKind'),
    direction: text(form, 'direction'),
    displayPrecision: Number(text(form, 'displayPrecision')),
    periodStart: text(form, 'periodStart'),
    periodEnd: text(form, 'periodEnd'),
    baseline: text(form, 'baseline') || null,
    target: text(form, 'target') || null,
    ...(mode === 'DERIVED'
      ? {
          binding: {
            recipe,
            ...(formRecipe
              ? {
                  formId: selectedForm?.id,
                  formVersion: selectedForm?.version,
                  fieldId: optional(form, 'fieldId'),
                }
              : { activityId: optional(form, 'activityId') }),
          },
        }
      : {}),
  })
}

const dayMs = 86_400_000
const isoDay = (value: number) => new Date(value).toISOString().slice(0, 10)
const dayValue = (value: string) => Date.parse(`${value}T00:00:00Z`)

/** Reporting period from the project dates, capped at the 365-day contract limit. */
export const indicatorPeriod = (startDate?: string | null, endDate?: string | null) => {
  const start = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : isoDay(Date.now())
  const cap = dayValue(start) + 365 * dayMs
  const end =
    endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? Math.min(dayValue(endDate), cap) : cap
  return { periodStart: start, periodEnd: isoDay(Math.max(end, dayValue(start))) }
}
