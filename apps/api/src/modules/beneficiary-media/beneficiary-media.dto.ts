import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  type ActivityEvidenceContentType,
  MAX_ACTIVITY_EVIDENCE_FILES,
  activityEvidenceContentTypes,
} from '../activities/activities.dto'

/** Beneficiary media allows the activity-proof types except documents. */
export const beneficiaryMediaContentTypes: readonly string[] = activityEvidenceContentTypes.filter(
  (type) => type !== 'application/pdf',
)
export const MAX_BENEFICIARY_MEDIA_FILES = MAX_ACTIVITY_EVIDENCE_FILES
const MAX_BENEFICIARY_MEDIA_NOTE = 500

class BeneficiaryMediaFileDto {
  @IsString()
  @Length(1, 128)
  @Matches(/^[^\/]+$/)
  fileName!: string

  @IsIn(beneficiaryMediaContentTypes)
  contentType!: ActivityEvidenceContentType

  // Structural ceiling only; the service enforces the configured EVIDENCE_MAX_FILE_BYTES.
  @IsInt()
  @Min(1)
  @Max(104_857_600)
  byteSize!: number

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string
}

export class ReserveBeneficiaryMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BENEFICIARY_MEDIA_FILES)
  @ValidateNested({ each: true })
  @Type(() => BeneficiaryMediaFileDto)
  files!: BeneficiaryMediaFileDto[]

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BENEFICIARY_MEDIA_NOTE)
  note?: string
}
