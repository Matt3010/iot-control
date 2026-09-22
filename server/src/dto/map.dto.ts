import { Transform, Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Uno che può modificare una mappa, e fin dove. */
export class MapEditorDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "serve un'email valida" })
  @MaxLength(120)
  email!: string;

  /** Assente: tutta la mappa. Con un elenco: solo quei luoghi. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  only?: string[];
}

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
   * Chi può modificarla oltre a chi ce l'ha, e con quali regole. Sono email
   * perché questa è una chiave: un link non dice chi sei.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => MapEditorDto)
  editors?: MapEditorDto[];
}
