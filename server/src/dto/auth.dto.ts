import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

/**
 * Chi si registra sceglie anche come si chiama: è il suo indirizzo pubblico,
 * /u/<handle>, e non glielo può dare l'email.
 */
export class RegisterDto extends CredentialsDto {
  @clean()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/, {
    message: 'il nome utente va da 3 a 20 caratteri: lettere, numeri e trattini',
  })
  handle!: string;
}
