import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const clean = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class CredentialsDto {
  @clean()
  @IsEmail({}, { message: "serve un'email valida" })
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'la password deve avere almeno otto caratteri' })
  @MaxLength(200)
  password!: string;
}
