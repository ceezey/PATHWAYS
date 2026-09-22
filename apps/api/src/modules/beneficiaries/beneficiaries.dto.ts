import { Transform } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator'

export class BeneficiaryListQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'])
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | 'NOT_SPECIFIED'

  @IsOptional()
  @IsIn(['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'])
  disabilityStatus?: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY' | 'NOT_SPECIFIED'

  @IsOptional()
  @IsIn(['0-9', '10-14', '15-17', '18-24', '25+', 'Unknown'])
  ageBand?: '0-9' | '10-14' | '15-17' | '18-24' | '25+' | 'Unknown'

  @IsOptional()
  @IsIn(['ACTIVE', 'COMPLETED', 'EXITED'])
  enrollmentStatus?: 'ACTIVE' | 'COMPLETED' | 'EXITED'

  @IsOptional()
  @IsUUID()
  cursor?: string

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 25 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25
}

export class RegisterBeneficiaryDto {
  @IsUUID()
  formId!: string

  @IsUUID()
  clientRegistrationId!: string

  @IsObject()
  values!: Record<string, unknown>
}

export class UpdateBeneficiaryDto {
  @IsIn(['INDIVIDUAL', 'GROUP', 'COMMUNITY'])
  subjectType!: 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY'

  @IsOptional()
  @IsString()
  @Length(1, 160)
  displayName?: string

  @IsOptional()
  @IsString()
  @Length(1, 120)
  firstName?: string

  @IsOptional()
  @IsString()
  @Length(1, 120)
  middleName?: string

  @IsOptional()
  @IsString()
  @Length(1, 120)
  lastName?: string

  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'])
  sex!: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | 'NOT_SPECIFIED'

  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  ageAtRegistration?: number

  @IsIn(['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'])
  disabilityStatus!: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY' | 'NOT_SPECIFIED'

  @IsOptional()
  @IsString()
  @Length(1, 160)
  locationBarangay?: string

  @IsOptional()
  @IsString()
  @Length(1, 160)
  locationCityMunicipality?: string

  @IsOptional()
  @IsString()
  @Length(1, 160)
  locationProvince?: string

  @IsDateString()
  expectedUpdatedAt!: string
}

export class ArchiveBeneficiaryDto {
  @IsDateString()
  expectedUpdatedAt!: string
}

export class EnrollBeneficiaryDto {
  @IsDateString({ strict: true })
  enrollmentDate!: string
}

export const registrationCodePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/
export const externalIdentifierTypePattern = /^[A-Z][A-Z0-9_]{1,31}$/

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
