import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminMfaCodeDto {
  /** 6-digit TOTP code or a recovery code. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
