import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Una riga di una scena: a chi, cosa, e con che valore.
 *
 * Che il valore vada bene per quel dispositivo non si decide qui — dipende da
 * cosa sa fare lui, e quello lo sa il manager.
 */
export class SceneStepDto {
  @IsString()
  @IsNotEmpty({ message: 'serve il dispositivo' })
  @MaxLength(80)
  deviceId!: string;

  @IsString()
  @IsNotEmpty({ message: "serve l'azione" })
  @MaxLength(80)
  code!: string;

  @IsDefined({ message: 'serve il valore' })
  value!: string | number | boolean;
}

/**
 * Una scena: un nome e le righe che parte insieme.
 *
 * Non e' un gruppo di dispositivi che fanno la stessa cosa: ogni riga ha la
 * sua. «Sera» puo' chiudere le tende e accendere l'abat-jour, che sono due
 * azioni diverse su due cose diverse, premute insieme.
 */
export class SceneDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SceneStepDto)
  steps?: SceneStepDto[];
}
