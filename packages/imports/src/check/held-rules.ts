import { fittingDateOrders } from '../date-order'
import type { ImportRowNormalizationResult } from '../normalization'
import type { ColumnMapping } from '../validation/validate-rows'

/** Choice answers are mapped once per column after upload, and so is the order of a text date column that several orders fit. */
export const fixedOnce = (code: string, dataType: string | undefined, orderChoice: boolean) =>
  (code === 'AMBIGUOUS_DATE' && orderChoice) ||
  (code === 'invalid_value' && (dataType === 'SELECT' || dataType === 'MULTIPLE_SELECT'))

/** The date fields whose column several orders fit, where the reviewer's one choice settles every row. */
export const dateOrderChoices = (
  mappings: readonly ColumnMapping[],
  raws: readonly Record<string, unknown>[],
  referenceYear: number,
) =>
  new Set(
    mappings.flatMap((mapping) => {
      const target = mapping.status === 'MAPPED' ? mapping.targetField : null
      if (!target || (mapping.dataType ?? target.dataType) !== 'DATE') return []
      const values = raws.map((raw) => raw[mapping.sourceFieldName])
      return fittingDateOrders(values, referenceYear).length > 1 ? [target.code] : []
    }),
  )

/** The registration service holds an imported row without both consents. */
export const consentHeld = (formType: string, result: ImportRowNormalizationResult) =>
  formType === 'BENEFICIARY_REGISTRATION' &&
  result.valid &&
  (result.values.consent_recorded !== true ||
    result.values.data_processing_consent_recorded !== true)
