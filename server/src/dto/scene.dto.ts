import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
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
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  value?: string | number | boolean;

  /** Un'altra scena da far partire da qui. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  scene?: string;

  /** Le parole di un avviso. Una riga che ce le ha non muove niente. */
  @trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'un avviso senza parole non avvisa nessuno' })
  @MaxLength(140, { message: "un avviso si legge sulla schermata bloccata, quindi al massimo 140 caratteri" })
  notify?: string;

  /** Quanti secondi aspettare prima di questa riga. Zero vuol dire insieme alla precedente. */
  @IsOptional()
  @IsInt({ message: "l'attesa si conta in secondi interi" })
  @Min(0)
  @Max(21_600, { message: "un'attesa non può superare le sei ore" })
  after?: number;
}

/**
 * Quando una scena parte da sola.
 *
 * L'orario si scrive come si legge — `07:30` — e i giorni sono numeri, da
 * domenica a sabato. Il fuso arriva dal browser di chi la scrive: «le sette»
 * vuol dire le sette dove sta lui, e fra sei mesi vuol dire ancora le sette.
 */
export class TimingDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "l'ora va scritta come 07:30" })
  at!: string;

  /** Un giorno solo, e poi basta. Con questo i giorni della settimana tacciono. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'la data va scritta come 2026-09-25' })
  on?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;

  @IsOptional()
  @IsBoolean()
  off?: boolean;
}

/**
 * Una scena: un nome e le righe che parte insieme.
 *
 * Non è un gruppo di dispositivi che fanno la stessa cosa: ogni riga ha la
 * sua. «Sera» può chiudere le tende e accendere l'abat-jour, che sono due
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

  /** Quando parte da sola. Assente vuol dire che parte solo se la premi. */
  @IsOptional()
  @ValidateNested()
  @Type(() => TimingDto)
  when?: TimingDto | null;
}
