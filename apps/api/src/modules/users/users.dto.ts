import { Transform } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator'

import { roleNames } from '../auth/authorization-policy'

const roleCodes = Object.keys(roleNames)

export class AuthorizeExistingUserDto {
  @IsUUID()
  authUserId!: string

  @IsString()
  @Length(1, 120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string

  @IsIn(roleCodes)
  role!: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  projectIds: string[] = []
}

export class UpdateAuthorizedUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName?: string

  @IsIn(roleCodes)
  role!: string

  @IsIn(['ACTIVE', 'DEACTIVATED'])
  accountStatus!: 'ACTIVE' | 'DEACTIVATED'

  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  projectIds!: string[]
}
