const registrationCodePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/
const externalIdentifierTypePattern = /^[A-Z][A-Z0-9_]{1,31}$/

export function canonicalCode(value: unknown) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return registrationCodePattern.test(code) ? code : null
}

export function canonicalIdentifierType(value: unknown) {
  if (typeof value !== 'string') return null
  const type = value.trim().toUpperCase()
  if (!externalIdentifierTypePattern.test(type)) return null
  if (['PATHWAYS_CODE', 'EMAIL', 'NAME', 'BIRTH_DATE'].includes(type)) return null
  return type
}

export function canonicalIdentifierValue(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized.length >= 1 && normalized.length <= 160 ? normalized : null
}

// Supporting output allowlist, independently authorized from collection/form access.
export interface RegistrationContextDto {
  projectId: string
  businessDate: string
  definitions: {
    id: string
    code: string
    version: number
    name: string
    formType: 'BENEFICIARY_REGISTRATION'
    status: 'PUBLISHED'
    fields: (import('@pathways/shared').FormFieldValidationContract & {
      id: string
      metadataKey: boolean
      sadddField: boolean
      sequence: number
    })[]
  }[]
}
