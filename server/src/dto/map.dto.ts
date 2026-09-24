import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmpty,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class MapDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(40)
  name!: string;

  /**
   * Prima qui dentro c'erano le email di chi poteva modificarla. Non vale
   * più, e lo si dice invece di ignorarlo in silenzio: chi manda ancora
   * quella forma crederebbe di aver dato una chiave che non esiste.
   */
  @IsEmpty({ message: 'chi può modificare la mappa non si scrive più qui, si crea un link d’invito' })
  editors?: unknown;
}

/** Un link d'invito nuovo: basta, se si vuole, un promemoria di a chi lo si manda. */
export class InviteDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60, { message: 'il promemoria sta in 60 caratteri' })
  label?: string;
}

/** Fin dove arriva un editor: `null` vuol dire tutta la mappa, un elenco solo quei luoghi. */
export class EditorDto {
  @ValidateIf((_dto, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  only!: string[] | null;
}
