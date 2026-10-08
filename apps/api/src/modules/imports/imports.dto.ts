import { IMPORT_ENGINEERING_LIMITS, IMPORT_VALUE_MAP_LIMITS } from '@pathways/imports/server'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class UploadImportDto {
  @IsUUID()
  formId!: string

  @IsUUID()
  clientImportId!: string
}

export const IMPORT_DATA_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'INTEGER',
  'DECIMAL',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTIPLE_SELECT',
] as const

// No control characters, and no leading formula trigger (= + @ or a minus that is not a number).
const SAFE_MAP_TEXT = /^(?![=+@\t\r]|-(?!\d))\P{Cc}*$/u

class ImportValueMapEntryDto {
  @IsString()
  @Length(1, IMPORT_VALUE_MAP_LIMITS.maxTextLength)
  @Matches(SAFE_MAP_TEXT, { message: 'Control characters and formula prefixes are not allowed.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  from!: string

  @IsString()
  @Length(0, IMPORT_VALUE_MAP_LIMITS.maxTextLength)
  @Matches(SAFE_MAP_TEXT, { message: 'Control characters and formula prefixes are not allowed.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  to!: string
}

export class ImportMappingItemDto {
  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  sourceFieldName!: string

  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  targetFieldCode?: string

  @IsBoolean()
  ignored!: boolean

  @IsOptional()
  @IsIn(IMPORT_DATA_TYPES)
  dataType?: (typeof IMPORT_DATA_TYPES)[number]

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_VALUE_MAP_LIMITS.maxEntries)
  @ValidateNested({ each: true })
  @Type(() => ImportValueMapEntryDto)
  valueMap?: ImportValueMapEntryDto[]
}

export class SaveImportMappingDto {
  @IsInt()
  @Min(0)
  expectedMappingRevision!: number

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ENGINEERING_LIMITS.maxSourceColumns)
  @ValidateNested({ each: true })
  @Type(() => ImportMappingItemDto)
  mappings!: ImportMappingItemDto[]
}

export class ValidateImportDto {
  @IsInt()
  @Min(1)
  expectedMappingRevision!: number
}

export class ProcessImportDto {
  @IsInt()
  @Min(1)
  expectedValidationRevision!: number
}

export class ImportRowsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50_000)
  offset = 0

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take = 50
}

export class AutomaticImportMappingDto {
  @IsInt()
  @IsIn([0, 1])
  expectedMappingRevision!: 0 | 1
}
