import { createHash } from 'node:crypto'
import { type ProjectSections, stableSections } from './report-project-status'

type Source = {
  projectId: string
  formId: string | null
  kind: string
  evaluationId?: string | null
  columns: string[]
  rows: string[][]
  sections?: ProjectSections
  unavailableReasons: string[]
}

// Project summaries compare calendar-independent sections instead of the derived flat rows.
export const sourceContent = (source: Source) => ({
  columns: source.columns,
  ...(source.sections ? { sections: stableSections(source.sections) } : { rows: source.rows }),
  unavailableReasons: source.unavailableReasons,
})

export const sourceFingerprint = (source: Source) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        projectId: source.projectId,
        formId: source.formId,
        ...(source.evaluationId ? { evaluationId: source.evaluationId } : {}),
        kind: source.kind,
        ...sourceContent(source),
      }),
    )
    .digest('hex')
