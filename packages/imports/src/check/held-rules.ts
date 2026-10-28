import type { ImportRowNormalizationResult } from '../normalization'

/** Choice answers are mapped once per column after upload, and so is the order of a text date column with no single fitting order. */
export const fixedOnce = (code: string, dataType: string | undefined, hasDateOrder: boolean) =>
  (code === 'AMBIGUOUS_DATE' && !hasDateOrder) ||
  (code === 'invalid_value' && (dataType === 'SELECT' || dataType === 'MULTIPLE_SELECT'))

/** The registration service holds an imported row without both consents. */
export const consentHeld = (formType: string, result: ImportRowNormalizationResult) =>
  formType === 'BENEFICIARY_REGISTRATION' &&
  result.valid &&
  (result.values.consent_recorded !== true ||
    result.values.data_processing_consent_recorded !== true)
