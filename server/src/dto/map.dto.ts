import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class MapDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(40)
  name!: string;

  /** L'indirizzo pubblico, se vuoi sceglierlo tu. */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, { message: "l'indirizzo può avere lettere minuscole, numeri e trattini" })
  slug?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  /**
   * Chi puo' modificarla oltre a chi ce l'ha. Sono email perche' questa e' la
   * chiave della mappa intera: un link non dice chi sei.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((one) => String(one).trim().toLowerCase()) : value,
  )
  @IsEmail({}, { each: true, message: "serve un'email valida" })
  @MaxLength(120, { each: true })
  editors?: string[];
}
