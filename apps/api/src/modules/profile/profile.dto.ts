import { Transform } from 'class-transformer'
import { IsISO8601, IsString, Length, Matches, MaxLength } from 'class-validator'

export class UpdateOwnProfileDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  fullName!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(30)
  @Matches(/^(?:[+()\-\s0-9]{7,30})?$/)
  contactNumber!: string

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}
