import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

const canonical = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value

export class JourneyStageInputDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/, {
    message: 'Stage codes use capital letters, digits, dots, dashes or underscores.',
  })
  @Transform(canonical)
  code!: string

  @IsString()
  @Length(2, 160)
  name!: string

  @IsInt()
  @Min(1)
  @Max(500)
  order!: number

  @IsIn(['ENTRY', 'CORE', 'BRANCH', 'FOLLOW_UP'])
  type!: 'ENTRY' | 'CORE' | 'BRANCH' | 'FOLLOW_UP'

  @IsOptional()
  @IsUUID()
  parentStageId?: string

  @IsOptional()
  @IsBoolean()
  terminal = false

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string

  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mappedActivityIds!: string[]

  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string
}

export class SaveJourneyConfigurationDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => JourneyStageInputDto)
  stages!: JourneyStageInputDto[]
}
