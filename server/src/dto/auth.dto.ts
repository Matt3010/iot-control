import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

/**
 * Chi può modificare il tuo indice come te. Sono email perché queste sono le
 * chiavi di casa: un link non dice chi sei, un accesso sì.
 */
export class CollaboratorsDto {
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((one) => String(one).trim().toLowerCase()) : value,
  )
  @IsArray()
  @ArrayMaxSize(24)
  @IsEmail({}, { each: true, message: "serve un'email valida" })
  @MaxLength(120, { each: true })
  emails!: string[];
}

/** In quale indice entrare: il nome di chi ce l'ha. */
export class ActDto {
  @clean()
  @IsString()
  @MaxLength(80)
  handle!: string;
}
