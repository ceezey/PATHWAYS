'use client'

import { CheckCircle2, Send } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Front-end only for now: the form validates and confirms but does not send or store anything.
const topics = ['Partnership', 'Pilot', 'Research collaboration', 'General question'] as const

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(100, 'Use 100 characters or fewer.'),
  email: z.string().trim().email('Enter a valid email address.'),
  organization: z.string().trim().max(150, 'Use 150 characters or fewer.'),
  topic: z.enum(topics, { errorMap: () => ({ message: 'Choose a topic.' }) }),
  message: z
    .string()
    .trim()
    .min(20, 'Tell us a little more (at least 20 characters).')
    .max(2000, 'Use 2,000 characters or fewer.'),
  consent: z.literal('on', { errorMap: () => ({ message: 'Please confirm before sending.' }) }),
})

type Field = keyof z.infer<typeof contactSchema>
type Errors = Partial<Record<Field, string>>

const fieldClass = 'h-12 rounded-xl border-slate-200 bg-white/80 backdrop-blur'

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} className="text-sm text-danger">
      {message}
    </p>
  ) : null

export const ContactForm = () => {
  const [errors, setErrors] = useState<Errors>({})
  const [sent, setSent] = useState(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = contactSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (result.success) return setSent(true)
    const next: Errors = {}
    for (const issue of result.error.issues) next[issue.path[0] as Field] ??= issue.message
    setErrors(next)
  }

  const describe = (field: Field) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  })

  if (sent)
    return (
      <output className="flex flex-col items-start gap-4 py-10">
        <CheckCircle2 className="h-10 w-10 text-teal-500" aria-hidden="true" />
        <h3 className="text-2xl text-neutral-900">Thank you for reaching out.</h3>
        <p className="max-w-md text-base leading-7 text-gray-500">
          Your message is ready for the PATHWAYS team. This form is in preview, so it was not sent;
          nothing you entered was stored.
        </p>
        <button
          type="button"
          className="text-sm font-semibold text-sky-700 hover:text-sky-900"
          onClick={() => {
            setSent(false)
            setErrors({})
          }}
        >
          Write another message
        </button>
      </output>
    )

  return (
    <form noValidate className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          className={fieldClass}
          {...describe('name')}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className={fieldClass}
          {...describe('email')}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="organization">
          Organization <span className="font-normal text-gray-400">(optional)</span>
        </Label>
        <Input
          id="organization"
          name="organization"
          autoComplete="organization"
          className={fieldClass}
          {...describe('organization')}
        />
        <FieldError id="organization-error" message={errors.organization} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="topic">Topic</Label>
        <select
          id="topic"
          name="topic"
          defaultValue=""
          className={`${fieldClass} w-full border px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-danger`}
          {...describe('topic')}
        >
          <option value="" disabled>
            Choose a topic
          </option>
          {topics.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
        <FieldError id="topic-error" message={errors.topic} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="message">How can we help?</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          className="rounded-xl border-slate-200 bg-white/80 backdrop-blur"
          placeholder="Your context, the workflows you care about, and any privacy requirements."
          {...describe('message')}
        />
        <FieldError id="message-error" message={errors.message} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <label className="flex items-start gap-3 text-sm leading-6 text-gray-600">
          <input
            type="checkbox"
            name="consent"
            className="mt-1 h-4 w-4 shrink-0"
            {...describe('consent')}
          />
          I have not included beneficiary names, case details, or other sensitive personal
          information.
        </label>
        <FieldError id="consent-error" message={errors.consent} />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-400">Preview form: messages are not sent or stored yet.</p>
        <button
          type="submit"
          className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-navy to-sky-700 px-7 text-sm font-semibold text-white shadow-lg shadow-sky-900/20 transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Send message
          <Send
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </div>
    </form>
  )
}
