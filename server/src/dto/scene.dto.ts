import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
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

  /**
   * Le parole di un avviso. Una riga che ce le ha non muove niente.
   *
   * Può essere vuota: una riga appena aggiunta non ha ancora niente da dire,
   * e rifiutarla vorrebbe dire non poterla nemmeno creare. Quando la scena
   * parte, una riga senza parole non avvisa nessuno e si salta.
   */
  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(140, { message: 'un avviso si legge sulla schermata bloccata, quindi al massimo 140 caratteri' })
  notify?: string;

  /** Quanti secondi aspettare prima di questa riga. Zero vuol dire insieme alla precedente. */
  @IsOptional()
  @IsInt({ message: "l'attesa si conta in secondi interi" })
  @Min(0)
  @Max(21_600, { message: "un'attesa non può superare le sei ore" })
  after?: number;
}

/**
 * Quando una scena parte da sola.
 *
 * L'orario si scrive come si legge — `07:30` — e i giorni sono numeri, da
 * domenica a sabato. Il fuso non si manda: è quello dell'account, e «le
 * sette» vuol dire le sette di chi ha la scena, anche fra sei mesi.
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
/**
 * Un dispositivo e come guardarlo, per quello che fa partire una scena e per
 * quello che deve essere vero. La forma sola: se quel dispositivo esiste, è
 * tuo e sa fare quella cosa lo decide il manager.
 */
class DeviceTestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'serve il dispositivo' })
  @MaxLength(80)
  deviceId!: string;

  @IsString()
  @IsNotEmpty({ message: 'serve la cosa da guardare' })
  @MaxLength(80)
  code!: string;

  @IsIn(['is', 'above', 'below'], { message: 'si guarda un valore preciso, o sopra, o sotto' })
  op!: 'is' | 'above' | 'below';

  @IsDefined({ message: 'serve il valore' })
  value!: string | number;
}

export class SceneTriggerDto extends DeviceTestDto {}

/**
 * Una condizione. I campi che valgono dipendono dal genere: un dispositivo,
 * dei giorni, una fascia oraria, un periodo. Quali servono a quale lo
 * controlla il manager, che sa anche dire cosa manca.
 */
export class SceneConditionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;

  @IsIn(['device', 'days', 'hours', 'dates', 'group'], {
    message: 'una condizione è su un dispositivo, dei giorni, delle ore, delle date, o un gruppo di condizioni',
  })
  kind!: 'device' | 'days' | 'hours' | 'dates' | 'group';

  /** Per un gruppo, se devono valere tutte o ne basta una. */
  @IsOptional()
  @IsIn(['all', 'any'])
  match?: 'all' | 'any';

  /** Per un gruppo, quello che ci sta dentro. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => SceneConditionDto)
  items?: SceneConditionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsIn(['is', 'above', 'below'])
  op?: 'is' | 'above' | 'below';

  @IsOptional()
  value?: string | number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;
}

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SceneTriggerDto)
  triggers?: SceneTriggerDto[];

  /** Tutte le condizioni, come un gruppo solo che può contenerne altri. */
  @IsOptional()
  @IsObject({ message: 'le condizioni arrivano come un gruppo' })
  @ValidateNested()
  @Type(() => SceneConditionDto)
  only?: SceneConditionDto;
}
