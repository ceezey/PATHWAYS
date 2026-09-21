import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports/server'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
