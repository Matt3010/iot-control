import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

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
 * Chi si registra sceglie anche come si chiama: è il nome con cui lo vedono
 * gli altri, e non glielo può dare l'email.
 */
export class RegisterDto extends CredentialsDto {
  @clean()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/, {
    message: 'il nome utente va da 3 a 20 caratteri fra lettere, numeri e trattini',
  })
  handle!: string;
}

/** In casa di chi entrare: il nome di chi tiene le mappe. */
export class ActDto {
  @clean()
  @IsString()
  @MaxLength(80)
  handle!: string;
}

@ValidatorConstraint({ name: 'fusoVero' })
class FusoVero implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !value) return false;
    try {
      new Intl.DateTimeFormat('it', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'quel fuso orario non esiste';
  }
}

/**
 * Quello che si cambia del proprio account: il nome e il fuso orario.
 *
 * Il fuso deve essere uno che esiste, se no ogni orario delle scene si
 * fermerebbe senza dire perché: il controllo lo fa `Intl`, che li conosce
 * tutti, invece di un elenco nostro che invecchierebbe. L'email non si
 * cambia da qui: è la chiave con cui altri ti hanno aperto le loro mappe.
 */
export class AccountDto {
  @IsOptional()
  @clean()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/, {
    message: 'il nome utente va da 3 a 20 caratteri fra lettere, numeri e trattini',
  })
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Validate(FusoVero)
  tz?: string;
}

/** Una password nuova, con quella di adesso per dimostrare che sei tu. */
export class PasswordDto {
  @IsString()
  @MaxLength(200)
  current!: string;

  @IsString()
  @MinLength(8, { message: 'la password deve avere almeno otto caratteri' })
  @MaxLength(200)
  next!: string;
}
