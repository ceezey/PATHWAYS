import type { ReactNode } from 'react'

import type { EditablePageHeadingKey } from '@/constants/display-labels'

import { PageHeadingEditor } from './page-heading-editor'

// Route-level staff framing stays flat with a bottom rule; card surfaces belong to page content.
export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
  editableLabelKey,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  editableLabelKey?: EditablePageHeadingKey
}) => (
  <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0 space-y-2">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.04em] text-primary">{eyebrow}</p>
      ) : null}
      <div className={description ? 'space-y-1' : undefined}>
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="min-w-0 font-heading text-3xl font-normal leading-9 tracking-normal text-foreground">
            {title}
          </h1>
          {editableLabelKey ? (
            <PageHeadingEditor labelKey={editableLabelKey} title={title} />
          ) : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-base leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
    {actions ? (
      <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">{actions}</div>
    ) : null}
  </header>
)
