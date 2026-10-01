import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

// Shape only; the password is never logged, audited or echoed.
export class SignInDto {
  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string
}
